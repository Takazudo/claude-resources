#!/usr/bin/env bash
set -euo pipefail

# sync-force-to: Overwrite a remote target branch with the current branch.
# Before overwriting, creates a backup PR for the old branch state so it can be
# restored via GitHub's "Restore branch" button on the closed PR.
# Avoids git push --force by using delete + push instead.
# Usage: sync-force-to.sh <target-branch>

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  echo "Error: No target branch specified."
  echo "Usage: sync-force-to <target-branch>"
  exit 1
fi

# Save current branch
SOURCE=$(git rev-parse --abbrev-ref HEAD)
if [[ "$SOURCE" == "HEAD" ]]; then
  echo "Error: Detached HEAD state. Please checkout a branch first."
  exit 1
fi

if [[ "$SOURCE" == "$TARGET" ]]; then
  echo "Error: Already on '$TARGET'. Nothing to sync."
  exit 1
fi

# 1. Check for uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: You have uncommitted changes. Please commit or stash them first."
  git status --short
  exit 1
fi

# 2. Find remote that has the target branch
REMOTE_NAME=""
for remote in $(git remote 2>/dev/null); do
  if git ls-remote --exit-code --heads "$remote" "$TARGET" >/dev/null 2>&1; then
    REMOTE_NAME="$remote"
    break
  fi
done

# Fall back to origin if target doesn't exist remotely yet (will be created)
TARGET_EXISTS=false
if [[ -z "$REMOTE_NAME" ]]; then
  REMOTE_NAME="origin"
  echo "Branch '$TARGET' not found on any remote. Will create it on '$REMOTE_NAME'."
else
  TARGET_EXISTS=true
fi

# 3. Backup the old target branch via PR before overwriting
if [[ "$TARGET_EXISTS" == "true" ]]; then
  echo ""
  echo "=== Creating backup PR for old '$TARGET' state ==="

  # Fetch the target branch to get its current SHA
  git fetch "$REMOTE_NAME" "$TARGET"
  OLD_SHA=$(git rev-parse "refs/remotes/$REMOTE_NAME/$TARGET")
  SHORT_SHA="${OLD_SHA:0:7}"

  # Create backup branch name: backup/YYYYMMDDHHMM-<target>
  TIMESTAMP=$(date +%Y%m%d%H%M)
  BACKUP_BRANCH="backup/${TIMESTAMP}-${TARGET}"

  echo "Pushing backup branch '$BACKUP_BRANCH' (at $SHORT_SHA)..."
  git push "$REMOTE_NAME" "refs/remotes/$REMOTE_NAME/$TARGET:refs/heads/$BACKUP_BRANCH"

  # Get default branch for PR base
  DEFAULT_BRANCH=$(gh repo view --json defaultBranchRef -q '.defaultBranchRef.name')

  # Create PR
  PR_TITLE="Backup: ${TARGET} @ ${SHORT_SHA} (before sync from ${SOURCE})"
  PR_BODY="Backup of \`${TARGET}\` branch state before being overwritten by \`${SOURCE}\`.

- **Old target branch**: \`${TARGET}\` at \`${OLD_SHA}\`
- **Source branch**: \`${SOURCE}\`
- **Timestamp**: ${TIMESTAMP}

Use GitHub's **Restore branch** button on this PR to recover the old state if needed."

  # Ensure "backup" label exists (create with dim color if missing)
  if ! gh label list --search "backup" --json name -q '.[].name' | grep -qx "backup"; then
    echo "Creating 'backup' label..."
    gh label create "backup" --description "Branch backup before force-sync" --color "c2c2c2"
  fi

  echo "Creating backup PR..."
  PR_URL=$(gh pr create \
    --head "$BACKUP_BRANCH" \
    --base "$DEFAULT_BRANCH" \
    --title "$PR_TITLE" \
    --body "$PR_BODY" \
    --label "backup")

  echo "Closing backup PR..."
  gh pr close "$PR_URL"

  echo "Deleting backup branch '$BACKUP_BRANCH' from remote..."
  git push "$REMOTE_NAME" --delete "$BACKUP_BRANCH"

  echo "Backup PR created and closed: $PR_URL"
  echo "=== Backup complete ==="
  echo ""
fi

# 4. Delete remote target branch (if it exists)
DELETED=false
if git ls-remote --exit-code --heads "$REMOTE_NAME" "$TARGET" >/dev/null 2>&1; then
  echo "Deleting remote branch '$REMOTE_NAME/$TARGET'..."
  if git push "$REMOTE_NAME" --delete "$TARGET"; then
    DELETED=true
  else
    echo "Error: Failed to delete remote branch '$REMOTE_NAME/$TARGET'."
    exit 1
  fi
fi

# 5. Push current branch to remote as the target branch
echo "Pushing '$SOURCE' to '$REMOTE_NAME/$TARGET'..."
if ! git push "$REMOTE_NAME" "$SOURCE:$TARGET"; then
  echo "Error: Failed to push '$SOURCE' as '$REMOTE_NAME/$TARGET'."
  exit 1
fi

# 6. Update local target branch if it exists
if git show-ref --verify --quiet "refs/heads/$TARGET"; then
  git branch -f "$TARGET" "$SOURCE"
fi

# 7. Summary
if [[ "$DELETED" == "true" ]]; then
  echo "Synced $SOURCE -> $REMOTE_NAME/$TARGET (deleted and re-pushed)"
else
  echo "Synced $SOURCE -> $REMOTE_NAME/$TARGET (created new remote branch)"
fi
