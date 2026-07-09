#!/bin/bash
# SessionStart loader for Claude Code on the web.
#
# This repo IS the user's ~/.claude on macOS. Web containers clone the repo but
# never see the local ~/.claude, so this script mirrors the portable config
# trees into the container's $HOME/.claude and overlays a web-safe settings.json
# (web/settings.web.json) in place of the macOS one. Result: web sessions boot
# with the same skills / agents / commands as the local terminal.
#
# Web-only: no-ops outside Claude Code on the web (see $CLAUDE_CODE_REMOTE) so it
# is safe to leave wired up when editing this repo from the Mac terminal.
# Idempotent: safe to run every session; copies overwrite in place.
set -euo pipefail

# The Mac terminal already lives in ~/.claude — only the web container needs this.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Source from the script's own location — works both when this repo is the web
# session's own checkout AND when it has been cloned elsewhere (e.g. the public
# claude-resources mirror fetched by a consumer project's bootstrap). Do NOT use
# $CLAUDE_PROJECT_DIR: in fetch mode that points at the consumer project, not here.
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$HOME/.claude"
mkdir -p "$DEST"

# Mirror the portable config trees. cp -a, not rsync — rsync is not installed in
# the web container. `web` is included so the skills' ../../web/*.md banner links
# resolve under ~/.claude.
for dir in skills agents commands scripts hooks web; do
  if [ -d "$REPO/$dir" ]; then
    mkdir -p "$DEST/$dir"
    cp -a "$REPO/$dir/." "$DEST/$dir/"
  fi
done
[ -f "$REPO/CLAUDE.md" ] && cp -a "$REPO/CLAUDE.md" "$DEST/CLAUDE.md"

# Overlay the web-safe settings: no IFTTT/statusline/plugins, no Mac-absolute
# paths. deny-check.sh reads this file, so it must land before the next session.
cp -a "$REPO/web/settings.web.json" "$DEST/settings.json"

# Pre-set the committer identity the web container's commit-verification hook
# (~/.claude/stop-hook-git-check.sh, platform-injected — NOT shipped by this repo)
# expects, so the agent never has to run `git config` itself. NOTE: the container
# has no signing key, so commits stay unsigned and GitHub shows them "Unverified"
# regardless — this only normalizes the email/name half of that check. See
# web/web-mode.md §5 "Commit identity & the Unverified-commit hook".
git config --global user.email "noreply@anthropic.com"
git config --global user.name "Claude"

# Dropbox dirs do not exist in the container; stub the env vars to a temp dir so
# skills that reference them degrade gracefully instead of erroring. $CLAUDE_ENV_FILE
# persists exports for the session (provided by the web harness during SessionStart).
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  mkdir -p /tmp/cclogs /tmp/screenshots
  {
    echo "export DROPBOX_CCLOGS_DIR=/tmp/cclogs"
    echo "export DROPBOX_SCREENSHOTS_DIR=/tmp/screenshots"
  } >> "$CLAUDE_ENV_FILE"
fi

# Wisdom repos LAST: this is the slow, networked step (five clones + npm), so
# everything session-critical above (settings overlay, git identity, env stubs)
# is already in place if it times out or the container kills the setup.
# Runs AFTER the cp -a mirror so wisdom skill names (which are gitignored on Mac
# and therefore absent from the public mirror) cannot collide with mirrored skills.
bash "$REPO/scripts/setup-web-wisdom.sh"

echo "web profile installed into $DEST"
