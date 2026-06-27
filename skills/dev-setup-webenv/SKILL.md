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
bootstrap committed into (or described for) the target project — the download and
profile install happen later, inside the web container.

> **Why not `git clone`?** Claude Code on the web rewrites `git` through a scoped
> proxy (`gitConfigInjection`) that only permits the session's *in-scope* repo, so
> cloning/`ls-remote` of any other repo — even a public one like
> `claude-resources` — returns **403**. Plain HTTPS egress still works, so the
> bootstrap fetches a **tarball over HTTPS** instead of cloning. This needs no
> per-repo scope change and works in every web session.

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

- The project's web **network policy must allow plain HTTPS egress to

  `github.com`** (and its redirect target `codeload.github.com`), or the tarball
  fetch fails (the bootstrap degrades to a no-op in that case). Note: on web `git`
  is routed through a scoped proxy that only permits the session's in-scope repo,
  so `git clone` of `claude-resources` returns **403** — that is why the bootstrap
  fetches a tarball over HTTPS instead of cloning.

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
# DOWNLOADING the public claude-resources mirror (HTTPS tarball) and running its
# web loader. We do NOT `git clone`: Claude Code on the web routes git through a
# scoped proxy that only permits the session's in-scope repo, so cloning any other
# repo — even a public one — returns 403. Plain HTTPS egress still works, so a
# tarball fetch bypasses the proxy. No-ops on the local terminal; degrades
# gracefully if github.com is unreachable.
set -euo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
[ -n "${HOME:-}" ] || { echo "web-bootstrap: \$HOME unset — skipping" >&2; exit 0; }
# --self-only gate (uncomment to limit loading to YOUR web sessions on a shared
# repo) WITHOUT committing any personal identifier. Opt in by setting
# CLAUDE_WEB_PROFILE_OPT_IN=1 in your per-user web env (Claude Code on the web →
# Environment variables — per-account, not tracked in git). Other accounts that
# never set it no-op; it supports multiple accounts (each opts in), survives
# account switches (set the var in the new account's env — no source change), and
# fails loudly, not silently.
# [ "${CLAUDE_WEB_PROFILE_OPT_IN:-}" = "1" ] || {
#   echo "web-bootstrap: CLAUDE_WEB_PROFILE_OPT_IN not set — skipping" >&2
#   exit 0
# }

SRC="$HOME/.claude-src"
REPO="Takazudo/claude-resources"
TARBALL="$(mktemp)"

# Fetch over plain HTTPS (curl -f fails on 404). Try the default branch, then master.
fetch() { curl -fsSL "https://github.com/$REPO/archive/refs/heads/$1.tar.gz" -o "$TARBALL"; }

if fetch main || fetch master; then
  rm -rf "$SRC"; mkdir -p "$SRC"
  tar -xzf "$TARBALL" -C "$SRC" --strip-components=1
  rm -f "$TARBALL"
  bash "$SRC/scripts/setup-web.sh"
else
  rm -f "$TARBALL"
  echo "claude-resources unreachable (network policy?) — skipping web profile"
  exit 0
fi
```

If `--self-only` is passed, uncomment the marker gate above. It gates on a marker
env var the user sets in their **per-user web environment** (Claude Code on the
web → Environment variables), e.g. `CLAUDE_WEB_PROFILE_OPT_IN=1` — never on a
committed email/identity. This keeps any personal identifier out of the repo, is
**deterministic** (no dependency on the harness-supplied `$CLAUDE_CODE_USER_EMAIL`,
which can be unset or wrong on web), supports **multiple accounts** (each opts in
independently) and **survives account switches** (set the var in the new account's
env — no source change), and **fails loudly**. Tell the user to add
`CLAUDE_WEB_PROFILE_OPT_IN=1` to each repo's web env vars once. Then commit both
files (use `/commits`) and push.

> Avoid an email/hash-literal gate (`$CLAUDE_CODE_USER_EMAIL == you@example.com`):
> it bakes identity into source, breaks on account switch, and depends on the
> harness email var being populated on web — a silent-failure trap.

### Step 2b: Env-script snippet (`--env-script`, default)

Do **not** write into the repo. Print the block below for the user to paste into
their web environment's **setup script** field (Claude Code on the web → env
settings). It only affects that user's sessions and is not tracked in git:

```bash
set -euo pipefail
[ -n "${HOME:-}" ] || { echo "claude-resources: \$HOME unset — skipping"; exit 0; }
SRC="$HOME/.claude-src"
REPO="Takazudo/claude-resources"
TARBALL="$(mktemp)"
# Web routes git through a scoped proxy (clone of out-of-scope repos = 403), but
# plain HTTPS egress works — so fetch a tarball instead of cloning.
fetch() { curl -fsSL "https://github.com/$REPO/archive/refs/heads/$1.tar.gz" -o "$TARBALL"; }
if fetch main || fetch master; then
  rm -rf "$SRC"; mkdir -p "$SRC"
  tar -xzf "$TARBALL" -C "$SRC" --strip-components=1
  rm -f "$TARBALL"
  bash "$SRC/scripts/setup-web.sh"
else
  rm -f "$TARBALL"; echo "claude-resources unreachable — skipping"; exit 0
fi
```

### Step 3: Report

State which target was applied, the files written (committed mode) or where to
paste (env-script mode), and the two prerequisites (mirror must carry `web/`;
network policy must allow HTTPS to `github.com`). Mention that the bootstrap
fetches a tarball (not `git clone`) because web's scoped git proxy blocks
out-of-scope repos — so no per-repo GitHub scope change is needed.

## Notes

- `settings.local.json` is **not** an option — it is git-ignored and never

  reaches the web container, which fetches the profile from the remote.

- The bootstrap is plain bash and needs no skills pre-installed, so the first web

  session self-populates `~/.claude`.

- `setup-web.sh` sources from its own location, so it correctly copies the

  downloaded mirror's config (not the consumer project) into `~/.claude`.

- **No `git clone` on web (403 root cause):** web rewrites `git` through a scoped

  proxy (`gitConfigInjection`, e.g. `127.0.0.1:41729`) that only permits the
  session's in-scope GitHub repo. `git clone`/`git ls-remote` of any other repo —
  including public ones like `octocat/Hello-World` — returns **403**, while plain
  HTTPS GET/tarball returns **200**. The bootstrap therefore downloads a tarball
  and re-fetches fresh each session (no `.git`, so no incremental `pull`).
  *Alternative, only if you control the web environment:* add
  `Takazudo/claude-resources` to the session's allowed GitHub repo scope so
  `git clone` works again — but that is a manual, per-repo setting, whereas the
  tarball fetch needs no scope change and works everywhere. Verify a scope change
  with `git ls-remote --exit-code https://github.com/Takazudo/claude-resources HEAD`
  (expect a hash, not 403).
