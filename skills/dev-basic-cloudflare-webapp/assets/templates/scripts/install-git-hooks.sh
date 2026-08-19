#!/usr/bin/env bash
set -euo pipefail

# Installs hooks that must survive `lefthook install --reset-hooks-path` —
# notably the worktree push guard. Run from both `prepare` (pnpm install) and
# `init-worktree` (a fresh worktree has its own hooks path).

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="$(git rev-parse --git-path hooks)"

mkdir -p "$HOOKS_DIR"
install -m 0755 "$REPO_ROOT/scripts/hooks/pre-push" "$HOOKS_DIR/pre-push"
echo "Installed pre-push guard to $HOOKS_DIR/pre-push"
