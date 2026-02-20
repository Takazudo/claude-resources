#!/usr/bin/env bash
set -euo pipefail

# sync-force-to: Overwrite a remote target branch with the current branch.
# Deletes the remote target branch and pushes the current branch as the target.
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
if [[ -z "$REMOTE_NAME" ]]; then
  REMOTE_NAME="origin"
  echo "Branch '$TARGET' not found on any remote. Will create it on '$REMOTE_NAME'."
fi

# 3. Delete remote target branch (if it exists)
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

# 4. Push current branch to remote as the target branch
echo "Pushing '$SOURCE' to '$REMOTE_NAME/$TARGET'..."
if ! git push "$REMOTE_NAME" "$SOURCE:$TARGET"; then
  echo "Error: Failed to push '$SOURCE' as '$REMOTE_NAME/$TARGET'."
  exit 1
fi

# 5. Update local target branch if it exists
if git show-ref --verify --quiet "refs/heads/$TARGET"; then
  git branch -f "$TARGET" "$SOURCE"
fi

# 6. Summary
if [[ "$DELETED" == "true" ]]; then
  echo "Synced $SOURCE -> $REMOTE_NAME/$TARGET (deleted and re-pushed)"
else
  echo "Synced $SOURCE -> $REMOTE_NAME/$TARGET (created new remote branch)"
fi
