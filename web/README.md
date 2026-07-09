# Web profile — Claude Code on the web

This repo is the user's `~/.claude` on macOS. Claude Code on the web runs in an
ephemeral cloud container that clones the **repo** but never sees the local
`~/.claude`, so a web session starts without the custom skills, agents, and
commands. This directory + `scripts/setup-web.sh` close that gap.

## How it works — two load paths

**Primary — environment Setup script (pre-launch).** Paste
[`web/env-setup-script.sh`](./env-setup-script.sh) into the web environment's
**Setup script** field (claude.ai/code → Environment). It runs **before Claude
Code launches**: clones `Takazudo/claude-settings` (falls back to the public
`claude-resources` tarball when the clone is rejected), then runs
`scripts/setup-web.sh`, so the profile is fully in place at boot. Environments
are per-account, so this path is inherently self-only. Also add to the
environment's **Environment variables** field:

```
CLAUDE_WEB_PROFILE_OPT_IN=1
DROPBOX_CCLOGS_DIR=/tmp/cclogs
DROPBOX_SCREENSHOTS_DIR=/tmp/screenshots
```

**Secondary — committed SessionStart hook (single-repo top-up).**
`.claude/settings.json` registers a SessionStart hook running
`.claude/web-bootstrap.sh` — a self-only gate (no-op unless on web **and**
`CLAUDE_WEB_PROFILE_OPT_IN=1` is set) that re-runs `scripts/setup-web.sh` from
the session's own checkout. In a single-repo web session on this repo that
overlays the **current branch**'s files on top of the pre-launch install (the
setup script only knows the default branch). The overlay is additive
(`cp -a` union copy) — files deleted or renamed on the branch may linger from
the default-branch install. **Limitation (verified in-container):** in multi-repo sessions
the project dir is `/home/user` with repos as subdirectories, and repo-level
settings **hooks are not registered** — CLAUDE.md and skills load, hooks don't —
so this path silently skips there. The Setup script covers those sessions.

Both paths converge on the shared loader:

1. `scripts/setup-web.sh` (web-only, idempotent) mirrors the portable trees
   (`skills/ agents/ commands/ scripts/ hooks/ web/` + `CLAUDE.md`) into the
   container's `$HOME/.claude`, then overlays `web/settings.web.json` as
   `~/.claude/settings.json`.
2. Dropbox env vars (`DROPBOX_CCLOGS_DIR`, `DROPBOX_SCREENSHOTS_DIR`) are stubbed
   to `/tmp` so skills that read them degrade gracefully (via `$CLAUDE_ENV_FILE`
   when run as a hook; via the env-vars field for the pre-launch path).

On the Mac terminal both paths no-op (`$CLAUDE_CODE_REMOTE` is unset — and the
Setup script field only exists on web), so the wiring is safe to keep committed.

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
2. **Claude-only** — Codex (`-co`) is disabled; default to
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
`settings.web.json` also disables the `codex-review` backend
and omits the agent-teams env flag.

## Wisdom skills

`scripts/setup-web-wisdom.sh` is invoked by `setup-web.sh` as its **final**
step (web-only, after the settings overlay — so a timeout in this slow,
networked step can't leave a session without `settings.json`) and bakes a
curated set of public wisdom repos into the container.

### Which repos are baked

| Skill(s) provided | Source repo |
|---|---|
| `test-wisdom` | `Takazudo/zudo-test-wisdom` |
| `cloudflare-wisdom` | `Takazudo/zudo-cloudflare-wisdom` |
| `tauri-wisdom` | `Takazudo/zudo-tauri-wisdom` |
| `codemirror-wisdom` | `Takazudo/zudo-codemirror-wisdom` |
| `css-wisdom` | `Takazudo/zudo-css-wisdom` |

Repos are cloned in priority order — the most commonly used repo
(`zudo-test-wisdom`) first, the heavier `css-wisdom` setup last.

`zudo-test-wisdom` also carries `verify-ui`, `headless-browser`, and
`verify-ui-ai` under its own `.claude/skills/`, but `setup-web-wisdom.sh` only
symlinks **one** doc-lookup skill per repo (`test-wisdom`) into
`~/.claude/skills/` — those three stay uninstalled unless a session symlinks
them manually. See [`web-mode.md`](./web-mode.md) §7 for the working
browser-verification path on web.

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

## Distribution to other repos

Solved by the per-environment **Setup script** (`web/env-setup-script.sh`): it
runs for every session using that environment regardless of which repo(s) the
session includes, so no per-repo commit is needed. `/dev-setup-webenv` prints
the snippet and can additionally commit a per-repo hook as a single-repo
redundancy fallback (it fetches the public mirror's default branch and skips
when the env script already installed — only this repo's own hand-written hook
re-syncs from the session's checkout).

Network notes (observed in-container 2026-07, **from SessionStart context** —
i.e. after Claude Code booted; the Setup script runs *pre-launch*, where git
proxy/credential state is unverified):

- Plain-HTTPS tarball fetch of the public `claude-resources` mirror works.
- `git clone` of the user's own **public** repos through the scoped proxy works
  post-boot — the old "out-of-scope clone always 403s" behavior has loosened
  (e.g. `setup-web-wisdom.sh` clones its five public wisdom repos). The private
  `claude-settings` clone and *pre-launch* git in general are extrapolations:
  if they fail, tier 1 degrades to the tarball and the wisdom clones fail
  (isolated, logged, non-fatal) — check the environment's setup output on
  first run for `claude-profile: cloned claude-settings` vs `fetched
  claude-resources tarball` and the wisdom `Done in Ns` summary line.
- GitHub **release assets** (`github.com/*/releases/download/*`) are still
  403-blocked under restricted policies — affects packages whose postinstall
  downloads binaries from releases (e.g. `ffmpeg-static`, `canvas` prebuilds),
  not this loader.

## Not yet ported

The PR utility skills (`/pr`, `/pr-recreate`, `/pr-revise`, `/pr-split`,
`/pr-make-suggestion-*`) and the image helpers (`/gh-fetch-issue`,
`/gh-issue-with-imgs`) still assume `gh`. They build on the same `web-mode.md`
contract when ported.
