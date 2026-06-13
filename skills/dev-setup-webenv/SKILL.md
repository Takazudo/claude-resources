---
name: dev-setup-webenv
description: "Bootstrap a project so Claude Code on the web loads your shared config (skills/agents/commands from the public claude-resources mirror). Use when: (1) User says '/dev-setup-webenv', 'set up web env', 'enable my skills on web' for a project, (2) A repo should pull the web profile at SessionStart. Runs LOCALLY (Mac/terminal) — it only writes/commits a bootstrap into the target project; the actual loading happens later inside the web container. Offers two targets: a committed .claude/settings.json hook (solo repos) or an env-setup-script snippet to paste into the web UI (team repos, commits nothing). Defaults to the non-intrusive choice."
argument-hint: "[--committed] [--env-script] [--self-only]"
---

# Dev: Set up Web Environment

Make a project's **Claude Code on the web** sessions boot with your shared config
(skills, agents, commands) by fetching the public `claude-resources` mirror at
SessionStart and running its web loader (`scripts/setup-web.sh`).

This skill runs on the **local terminal**, not on web. Its only output is a small
bootstrap committed into (or described for) the target project — the cloning and
profile install happen later, inside the web container.

## !! Team-repo safety !!

A committed `.claude/settings.json` is shared with **everyone** in the repo. On a
teammate's **web** session it would overwrite their `~/.claude/settings.json`,
inject your skills, and disable their permission prompts (the web settings run in
auto mode). On the Mac terminal it no-ops (`$CLAUDE_CODE_REMOTE` is unset), so
teammates there are unaffected — but **do not commit the hook to a shared repo
without the owner's agreement.**

Pick the target accordingly:

| Repo | Target | Commits to repo? |
|------|--------|------------------|
| Solo / personal | **Committed hook** (`--committed`) | yes — `.claude/` |
| Team / shared | **Env-script snippet** (`--env-script`, default) | no — you paste it into the web UI |

When neither flag is passed, **ask** which applies and default to `--env-script`.
For `--committed` on a shared repo, prefer also passing `--self-only` (see below).

## Prerequisites

- The public mirror must already contain the web profile (`web/` +
  `scripts/setup-web.sh`). Publish it with `/claude-resources-share` first.
- The project's web **network policy must allow `github.com`** egress, or the
  clone fails (the bootstrap degrades to a no-op in that case).

## Workflow

### Step 1: Determine target

Resolve the target from the flag, or ask the user (default `--env-script`).
Confirm the source URL — `https://github.com/Takazudo/claude-resources`.

### Step 2a: Committed hook (`--committed`)

Write these two files into the target project. If `.claude/settings.json` already
exists, **merge** the `SessionStart` hook into it rather than overwriting.

`.claude/settings.json`:

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/bin/bash \"$CLAUDE_PROJECT_DIR/.claude/web-bootstrap.sh\""
          }
        ]
      }
    ]
  }
}
```

`.claude/web-bootstrap.sh` (`chmod +x`):

```bash
#!/bin/bash
# Web-only: load the author's shared Claude config into this web session by
# cloning the public claude-resources mirror and running its web loader.
# No-ops on the local terminal; degrades gracefully if github.com is unreachable.
set -euo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
# --self-only gate (uncomment + set address to limit to one user on a shared repo):
# [ "$(git config user.email 2>/dev/null)" = "takatsudo@pxgrid.com" ] || exit 0

SRC="$HOME/.claude-src"
URL="https://github.com/Takazudo/claude-resources"

if [ -d "$SRC/.git" ]; then
  git -C "$SRC" pull --ff-only 2>/dev/null || true
else
  git clone --depth 1 "$URL" "$SRC" 2>/dev/null || {
    echo "claude-resources unreachable (network policy?) — skipping web profile"
    exit 0
  }
fi

bash "$SRC/scripts/setup-web.sh"
```

If `--self-only` is passed, uncomment the email gate and set the address to the
user's git email. Then commit both files (use `/commits`) and push.

### Step 2b: Env-script snippet (`--env-script`, default)

Do **not** write into the repo. Print the block below for the user to paste into
their web environment's **setup script** field (Claude Code on the web → env
settings). It only affects that user's sessions and is not tracked in git:

```bash
set -euo pipefail
SRC="$HOME/.claude-src"
URL="https://github.com/Takazudo/claude-resources"
if [ -d "$SRC/.git" ]; then
  git -C "$SRC" pull --ff-only 2>/dev/null || true
else
  git clone --depth 1 "$URL" "$SRC" 2>/dev/null || { echo "claude-resources unreachable — skipping"; exit 0; }
fi
bash "$SRC/scripts/setup-web.sh"
```

### Step 3: Report

State which target was applied, the files written (committed mode) or where to
paste (env-script mode), and the two prerequisites (mirror must carry `web/`;
network policy must allow `github.com`).

## Notes

- `settings.local.json` is **not** an option — it is git-ignored and never
  reaches the web container, which clones from the remote.
- The bootstrap is plain bash and needs no skills pre-installed, so the first web
  session self-populates `~/.claude`.
- `setup-web.sh` sources from its own location, so it correctly copies the
  cloned mirror's config (not the consumer project) into `~/.claude`.
