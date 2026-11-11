#!/bin/bash
# User-level SessionStart refresh for Claude Code on the web (wired in
# web/settings.web.json, so it fires in multi-repo sessions too).
#
# Why: the env Setup script (web/env-setup-script.sh) runs once and its result
# is cached as an environment snapshot. Every later session boots that frozen
# ~/.claude — stale skills included — until the snapshot is rebuilt. This
# re-syncs the profile from ~/.claude-src each session, fast and bounded.
#
# Skips the wisdom step (slow; already in the snapshot). Always exits 0.
set -uo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

SRC="$HOME/.claude-src"
TIMEOUT=""
command -v timeout >/dev/null 2>&1 && TIMEOUT="timeout 30"

updated=""
if [ -d "$SRC/.git" ]; then
  if GIT_TERMINAL_PROMPT=0 $TIMEOUT git -C "$SRC" pull --ff-only --quiet 2>&1; then
    updated=1
  fi
fi

# No usable .git in $SRC (the snapshot came from a checkout export or the public
# mirror): fresh clone of the private repo — works once the session is up.
if [ -z "$updated" ]; then
  TMP="$(mktemp -d)"
  if GIT_TERMINAL_PROMPT=0 $TIMEOUT git clone --depth 1 --quiet \
      "https://github.com/Takazudo/claude-settings" "$TMP/src" 2>/dev/null \
      && [ -f "$TMP/src/scripts/setup-web.sh" ]; then
    rm -rf "$SRC"
    mv "$TMP/src" "$SRC"
    updated=1
  fi
  rm -rf "$TMP"
fi

# The session's own claude-settings checkout (committed HEAD only).
if [ -z "$updated" ]; then
  WORKSPACE="${CLAUDE_PROJECT_DIR:-/home/user}"
  for d in "$WORKSPACE"/*/; do
    url="$(git -C "$d" config --get remote.origin.url 2>/dev/null || true)"
    case "$(printf '%s' "$url" | tr '[:upper:]' '[:lower:]')" in
      *github.com/takazudo/claude-settings | *github.com/takazudo/claude-settings.git) ;;
      *) continue ;;
    esac
    TMP="$(mktemp -d)"
    if git -C "$d" archive HEAD | tar -x -C "$TMP" 2>/dev/null \
        && [ -f "$TMP/scripts/setup-web.sh" ]; then
      rm -rf "$SRC"
      mv "$TMP" "$SRC"
      updated=1
      break
    fi
    rm -rf "$TMP"
  done
fi

# Last resort: public claude-resources mirror (as fresh as its last sync).
if [ -z "$updated" ]; then
  TMP="$(mktemp -d)"
  if curl -fsSL --max-time 30 \
      "https://github.com/Takazudo/claude-resources/archive/refs/heads/main.tar.gz" \
      | tar -xz -C "$TMP" --strip-components=1 2>/dev/null \
      && [ -f "$TMP/scripts/setup-web.sh" ]; then
    rm -rf "$SRC"
    mv "$TMP" "$SRC"
    updated=1
  else
    rm -rf "$TMP"
  fi
fi

if [ -z "$updated" ]; then
  echo "web-refresh-profile: no source reachable — keeping snapshot profile" >&2
  exit 0
fi

CLAUDE_WEB_SKIP_WISDOM=1 bash "$SRC/scripts/setup-web.sh" >/dev/null 2>&1 \
  || echo "web-refresh-profile: setup-web.sh failed — keeping snapshot profile" >&2
exit 0
