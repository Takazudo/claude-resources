#!/bin/sh
# Install repo-scoped git hooks. Idempotent.
#
# Called by:
#   - `<INSTALL_COMMAND>` (via the `prepare` lifecycle script, after lefthook install)
#   - `<INIT_WORKTREE_COMMAND>` (explicit re-install, e.g. after manually wiring
#     a worktree outside the normal flow)
#
# lefthook manages pre-commit (via lefthook.yml). This script installs the
# pre-push worktree guard directly to .git/hooks/pre-push — it is deliberately
# NOT in lefthook.yml because lefthook reads config from the worktree's
# toplevel, so it would silently skip the guard when invoked from inside a
# worktree. Direct install to the shared .git/hooks/ directory ensures the
# guard always fires regardless of where `git push` is called from.

set -e

HOOK_MARKER="# x-wt-teams-push-guard v2"

# Skip silently when not in a git repo (e.g. extracted tarball).
GIT_COMMON_DIR=$(git rev-parse --git-common-dir 2>/dev/null) || {
  echo "install-git-hooks: not a git repo, skipping"
  exit 0
}

# Normalize to absolute path; git-common-dir is relative when run from a
# regular checkout in some git versions.
case "$GIT_COMMON_DIR" in
  /*) ;;
  *) GIT_COMMON_DIR="$(git rev-parse --show-toplevel)/$GIT_COMMON_DIR" ;;
esac

HOOKS_DIR="$GIT_COMMON_DIR/hooks"
TARGET="$HOOKS_DIR/pre-push"
SOURCE="$(git rev-parse --show-toplevel)/scripts/hooks/pre-push"

if [ ! -f "$SOURCE" ]; then
  echo "install-git-hooks: $SOURCE missing, skipping"
  exit 0
fi

# Refuse to clobber a foreign pre-push hook (one without our marker).
if [ -f "$TARGET" ] && ! grep -q "$HOOK_MARKER" "$TARGET"; then
  echo "install-git-hooks: $TARGET exists but isn't ours (missing marker)."
  echo "  Move it aside or merge scripts/hooks/pre-push into it manually,"
  echo "  then re-run \`<INIT_WORKTREE_COMMAND>\`."
  exit 1
fi

mkdir -p "$HOOKS_DIR"
cp "$SOURCE" "$TARGET"
chmod +x "$TARGET"
echo "install-git-hooks: installed $TARGET"
