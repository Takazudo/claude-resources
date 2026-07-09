#!/bin/bash
# Canonical "Setup script" for Claude Code on the web environments.
# Paste this file's contents into: claude.ai/code → Environment → Setup script.
# skills/dev-setup-webenv prints this file verbatim — NEVER embed a copy of it
# in a SKILL.md (skill argument substitution mangles $-positionals).
#
# Runs BEFORE Claude Code launches, so the profile (skills / agents / commands /
# settings) is in place at boot. This is the PRIMARY web loader: committed
# .claude/settings.json SessionStart hooks do NOT register in multi-repo
# sessions (the project dir is /home/user with repos as subdirectories, so
# repo-level hooks never fire) — this script is per-environment and always
# runs, whatever the repo mix.
#
# Environments are per-account, so this is inherently self-only — no
# CLAUDE_WEB_PROFILE_OPT_IN gate needed here (that gate belongs to the
# committed single-repo hook, .claude/web-bootstrap.sh).
set -uo pipefail

[ -n "${HOME:-}" ] || { echo "claude-profile: \$HOME unset — skipping"; exit 0; }

# setup-web.sh gates on CLAUDE_CODE_REMOTE=true. The web harness sets it for
# the Claude Code process, but this pre-launch script may run without it —
# export explicitly or the loader silently no-ops after a successful download.
export CLAUDE_CODE_REMOTE=true

SRC="$HOME/.claude-src"
rm -rf "$SRC"

TIMEOUT=""
command -v timeout >/dev/null 2>&1 && TIMEOUT="timeout 120"

# Tier 1: clone the private source repo — full, freshest config. Works when
# Takazudo/claude-settings is within the environment's allowed GitHub repos.
# GIT_TERMINAL_PROMPT=0 fails fast instead of hanging on a credential prompt.
if GIT_TERMINAL_PROMPT=0 $TIMEOUT git clone --depth 1 \
    "https://github.com/Takazudo/claude-settings" "$SRC" 2>&1; then
  echo "claude-profile: cloned claude-settings"
else
  # Tier 2: public claude-resources mirror as a plain-HTTPS tarball — no git
  # involved, so it works even where the git proxy rejects the clone.
  rm -rf "$SRC"; mkdir -p "$SRC"
  TARBALL="$(mktemp)"
  # Loop, not a fetch() helper taking a positional param — this script gets
  # printed into docs/skills where $-positionals can be mangled by skill
  # argument substitution.
  fetched=""
  for ref in main master; do
    if curl -fsSL --max-time 120 \
        "https://github.com/Takazudo/claude-resources/archive/refs/heads/$ref.tar.gz" \
        -o "$TARBALL"; then
      fetched=1
      break
    fi
  done
  if [ -n "$fetched" ]; then
    # tar can fail on a 200-but-not-a-tarball response (proxy block page) or a
    # partial write — an unchecked failure here would mis-report success and
    # leak a nonzero exit into the pre-launch environment.
    if ! tar -xzf "$TARBALL" -C "$SRC" --strip-components=1; then
      rm -f "$TARBALL"; rm -rf "$SRC"
      echo "claude-profile: tarball extract failed — session boots without the profile"
      exit 0
    fi
    rm -f "$TARBALL"
    echo "claude-profile: fetched claude-resources tarball"
  else
    rm -f "$TARBALL"; rm -rf "$SRC"
    echo "claude-profile: no source reachable — session boots without the profile"
    exit 0
  fi
fi

# Dropbox stand-ins. setup-web.sh only exports the DROPBOX_* vars when
# $CLAUDE_ENV_FILE exists (SessionStart context), which this pre-launch script
# may lack — so also add DROPBOX_CCLOGS_DIR=/tmp/cclogs and
# DROPBOX_SCREENSHOTS_DIR=/tmp/screenshots to the environment's env-vars field.
mkdir -p /tmp/cclogs /tmp/screenshots

# Guarded: a loader failure must not leak a nonzero exit into the pre-launch
# environment — the session should boot (profile-less at worst), never block.
if bash "$SRC/scripts/setup-web.sh"; then
  # Sentinel for committed consumer-repo hooks: profile already installed
  # pre-launch — don't clobber a tier-1 private install with the public mirror.
  echo "installed pre-launch from $SRC ($(date -u 2>/dev/null || echo unknown))" \
    > "$HOME/.claude/.web-profile-source" 2>/dev/null || true
else
  echo "claude-profile: install failed (see output above) — continuing without the full profile"
fi
exit 0
