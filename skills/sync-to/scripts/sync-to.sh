#!/usr/bin/env bash
set -euo pipefail

# sync-to: Merge current branch into a target branch, then return.
# Usage: sync-to.sh <target-branch>

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  echo "Error: No target branch specified."
  echo "Usage: sync-to <target-branch>"
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

# Helper: always return to source branch on exit
return_to_source() {
  local current
  current=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)
  if [[ "$current" != "$SOURCE" ]]; then
    git checkout "$SOURCE" --quiet 2>/dev/null || echo "Warning: Could not return to '$SOURCE'."
  fi
}
trap return_to_source EXIT

# 1. Check for uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: You have uncommitted changes. Please commit or stash them first."
  git status --short
  exit 1
fi

# Also check for untracked files that might interfere
# (not blocking, just informational — git merge won't touch untracked files)

# 2. Check target branch exists (locally or remotely)
TARGET_EXISTS_LOCAL=false
TARGET_EXISTS_REMOTE=false
REMOTE_NAME=""

if git show-ref --verify --quiet "refs/heads/$TARGET"; then
  TARGET_EXISTS_LOCAL=true
fi

# Find remote for target branch
for remote in $(git remote 2>/dev/null); do
  if git ls-remote --exit-code --heads "$remote" "$TARGET" >/dev/null 2>&1; then
    TARGET_EXISTS_REMOTE=true
    REMOTE_NAME="$remote"
    break
  fi
done

if [[ "$TARGET_EXISTS_LOCAL" == "false" && "$TARGET_EXISTS_REMOTE" == "false" ]]; then
  echo "Error: Branch '$TARGET' does not exist locally or remotely."
  exit 1
fi

# 3. Checkout target branch
if [[ "$TARGET_EXISTS_LOCAL" == "true" ]]; then
  git checkout "$TARGET" --quiet
  # Pull latest if remote tracking exists
  TRACKING=$(git config "branch.$TARGET.remote" 2>/dev/null || true)
  if [[ -n "$TRACKING" ]]; then
    git pull --ff-only --quiet 2>/dev/null || git pull --quiet 2>/dev/null || true
  fi
else
  # Branch exists only on remote — create local tracking branch
  git checkout -b "$TARGET" "$REMOTE_NAME/$TARGET" --quiet
fi

# 4. Count commits to merge
COMMIT_COUNT=$(git rev-list --count "$TARGET".."$SOURCE" 2>/dev/null || echo "0")

# 5. Merge source into target
if ! git merge "$SOURCE" --no-edit 2>/tmp/sync-to-merge-err; then
  # Merge conflict — abort and report
  CONFLICTED=$(git diff --name-only --diff-filter=U 2>/dev/null || true)
  git merge --abort 2>/dev/null || true
  echo "Error: Merge conflicts detected. Merge aborted."
  if [[ -n "$CONFLICTED" ]]; then
    echo "Conflicting files:"
    echo "$CONFLICTED" | sed 's/^/  - /'
  fi
  echo ""
  echo "Use /sync-force-to $TARGET to force-overwrite the target branch."
  exit 1
fi

# 6. Push to remote if tracking branch exists
PUSHED=false
PUSH_REMOTE=""
TRACKING=$(git config "branch.$TARGET.remote" 2>/dev/null || true)
if [[ -n "$TRACKING" ]]; then
  if git push --quiet 2>/dev/null; then
    PUSHED=true
    PUSH_REMOTE="$TRACKING"
  else
    echo "Warning: Push to '$TRACKING/$TARGET' failed. Merge is local only."
  fi
fi

# 7. Return to source branch (handled by trap, but do it explicitly for clean flow)
trap - EXIT
git checkout "$SOURCE" --quiet

# 8. Summary
PUSH_INFO=""
if [[ "$PUSHED" == "true" ]]; then
  PUSH_INFO=", pushed to $PUSH_REMOTE/$TARGET"
fi

COMMIT_WORD="commit"
if [[ "$COMMIT_COUNT" -ne 1 ]]; then
  COMMIT_WORD="commits"
fi

echo "Synced $SOURCE -> $TARGET ($COMMIT_COUNT $COMMIT_WORD$PUSH_INFO)"
