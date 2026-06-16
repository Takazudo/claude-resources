# Web profile — Claude Code on the web

This repo is the user's `~/.claude` on macOS. Claude Code on the web runs in an
ephemeral cloud container that clones the **repo** but never sees the local
`~/.claude`, so a web session starts without the custom skills, agents, and
commands. This directory + `scripts/setup-web.sh` close that gap.

## How it works

1. `.claude/settings.json` registers a **SessionStart hook** that runs
   `scripts/setup-web.sh`.
2. `setup-web.sh` (web-only, idempotent) mirrors the portable trees
   (`skills/ agents/ commands/ scripts/ hooks/` + `CLAUDE.md`) into the
   container's `$HOME/.claude`, then overlays `web/settings.web.json` as
   `~/.claude/settings.json`.
3. Dropbox env vars (`DROPBOX_CCLOGS_DIR`, `DROPBOX_SCREENSHOTS_DIR`) are stubbed
   to `/tmp` so skills that read them degrade gracefully.

On the Mac terminal the hook no-ops (`$CLAUDE_CODE_REMOTE` is unset), so wiring
it up is safe.

## What differs from the macOS settings

`web/settings.web.json` is the macOS `settings.json` minus the parts that can't
work headless / offline:

- **Dropped:** IFTTT Stop hook, `ccstatusline` status line, plugins &
  marketplaces (Codex, LSPs), Mac-absolute-path permissions.
- **Kept:** `skillOverrides` (disables hardware/desktop skills), the portable
  `deny-check.sh` and `allow-worktree-teammate-edits.sh` hooks, model, effort,
  permission flags.

## Web mode contract

[`web-mode.md`](./web-mode.md) is the single contract that web-aware skills
reference. Four rules:

1. **GitHub via MCP**, not `gh` — see [`github-ops.md`](./github-ops.md) for the
   command mapping.
2. **Claude-only** — Codex (`-co`) and Copilot (`-gco`) are disabled; default to
   Claude reviewers.
3. **Subagents-only** — no agent teams; fan out one-shot subagents.
4. **No Dropbox** — persist to the repo or the GitHub issue/PR (`/tmp` is
   ephemeral).

The intent is to keep **one** copy of each skill and make only these touch
points environment-aware — never a full fork.

## Ported skills

These skills carry a web-mode banner pointing at the contract — the full core
workflow chain:
`/big-plan`, `/x`, `/x-as-pr`, `/x-wt-teams`, `/light-review`, `/deep-review`,
`/review-loop`, `/pr-complete`, `/watch-ci`, `/cleanup-resources`.
`settings.web.json` also disables the `codex-review` and `gco-review` backends
and omits the agent-teams env flag.

## Wisdom skills

`scripts/setup-web-wisdom.sh` runs as a second SessionStart step (web-only,
after `setup-web.sh`) and bakes a curated set of public wisdom repos into the
container.

### Which repos are baked

| Skill(s) provided | Source repo |
|---|---|
| `test-wisdom`, `verify-ui`, `headless-browser`, `verify-ui-ai` | `Takazudo/zudo-test-wisdom` |
| `cloudflare-wisdom` | `Takazudo/zudo-cloudflare-wisdom` |
| `tauri-wisdom` | `Takazudo/zudo-tauri-wisdom` |
| `codemirror-wisdom` | `Takazudo/zudo-codemirror-wisdom` |
| `css-wisdom` | `zudolab/zudo-css-wisdom` |

Repos are cloned in priority order — cheaper Takazudo repos first so the most
commonly used skills (`test-wisdom` / browser helpers) appear earliest.

### Cache: `$HOME/.claude-wisdom`

Each repo is cloned once into `$HOME/.claude-wisdom/<repo-name>`. On subsequent
runs within the same container the script runs `git pull --ff-only` instead of
re-cloning. The first run in a fresh container clones all repos over the
network; subsequent runs within the same container are much faster.
**Cross-session `$HOME` persistence is assumed but not guaranteed** — the
graceful fallback is a full re-clone on the next fresh container.

### Web-only and graceful

The script exits early when `$CLAUDE_CODE_REMOTE` is not set to `"true"`
(Mac terminal), so the SessionStart hook is safe to leave wired up
unconditionally. Every repo in the loop runs under `set +e` with per-repo git
and npm timeouts (75 s each), plus a 5-minute overall wall-clock budget. If
any step fails the script logs a warning and continues. **The script always
exits 0**, so a wisdom-baking failure never aborts the SessionStart hook or
blocks the session.

### Lookup/read mode and `settings.web.json` overrides

Wisdom skills are documentation lookups — they read bundled Markdown and never
write back to their source repos. They are therefore **intentionally left
enabled** on web with no `skillOverrides` entries. If a future wisdom skill
needs hardware or local-only tooling that cannot work headless, add a targeted
`"<skill-name>": "off"` override to `settings.web.json` with a comment
explaining why.

## Distribution to other repos (follow-up)

This loader works for web sessions **in this repo**. Making the profile load in
*other* project repos needs the project's web session to fetch this config,
which depends on whether the locked-down container can reach an external repo at
hook time — **untested**. Options, once verified:

- Per-environment **setup script** (web UI), reused across sessions.
- A scrubbed public mirror cloned at hook time (the `/claude-resources-share`
  pipeline already strips private info).

## Not yet ported

The PR utility skills (`/pr`, `/pr-recreate`, `/pr-revise`, `/pr-split`,
`/pr-make-suggestion-*`) and the image helpers (`/gh-fetch-issue`,
`/gh-issue-with-imgs`) still assume `gh`. They build on the same `web-mode.md`
contract when ported.
