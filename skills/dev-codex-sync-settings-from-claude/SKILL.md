---
name: dev-codex-sync-settings-from-claude
description: "Sync the user's Claude Code workflow skills into the OpenAI Codex CLI settings repo ($HOME/.codex) as Codex-native ports, fix the Codex .gitignore for new local state, then commit and push. Use when: (1) user says '/dev-codex-sync-settings-from-claude', 'sync codex settings', 'sync claude skills to codex', 'port skills to codex', or 'update codex from claude'; (2) after updating ~/.claude workflow skills (big-plan, x, x-as-pr, x-wt-teams) and Codex should catch up; (3) the $HOME/.codex repo has drifted behind $HOME/.claude. The ports are condensed Codex-native REWRITES, never file copies."
---

# dev-codex-sync-settings-from-claude

The user's primary agent is Claude Code, but they also run OpenAI's Codex CLI. Codex reads skills from `$HOME/.codex/skills` (a git repo, remote `Takazudo/codex-settings`). This skill re-syncs the Claude-side workflow skills into Codex whenever `$HOME/.claude` has moved ahead. Run it FROM Claude Code — it reads `$HOME/.claude/skills` and writes `$HOME/.codex/skills`.

## The one rule that matters

Codex is NOT Claude Code. A Codex skill is a **condensed, Codex-native rewrite** of the Claude skill — never a copy. Claude sources run 200–1100 lines; good Codex ports run ~40–150 lines: they drop Claude-harness minutiae and translate Claude concepts (Task tool, agent teams, Opus/Sonnet/Haiku subagents) into Codex primitives (`spawn_agent` / `send_input` / `wait_agent` / `close_agent`).

Before writing or refreshing any port, read [references/codex-port-contract.md](references/codex-port-contract.md) — the house style and adaptation rules every port follows. Copying a Claude `SKILL.md` verbatim into Codex is the main failure mode; don't.

## What the Codex repo tracks

`$HOME/.codex/` is a git repo that intentionally tracks only:

- `.gitignore`
- `skills/` — the ported workflow skills plus separately-installed reference skills

Everything else in `$HOME/.codex` is machine-local runtime state (sqlite DBs, `auth.json`, `config.toml`, sessions, caches) and stays gitignored.

## Canonical skill set to keep synced

The user's Codex workflow centers on `/big-plan`, `/x-wt-teams`, `/x-as-pr`. Keep these plus everything they reference in sync:

- **Entry points:** `big-plan`, `x`, `x-as-pr`, `x-wt-teams` (canonical) + `x-wt-team` (thin alias → x-wt-teams)
- **Support:** `cleanup-resources`, `review-loop`, `deep-review` (alias → codex-review), `verify-ui` (external — sourced from `Takazudo/zudo-test-wisdom`, NOT `$HOME/.claude/skills`; only sync/keep it on machines where that repo's setup installed it), `watch-ci`, `pr-revise`, `gh-fetch-issue`
- **Codex-native helpers:** `codex-2nd`, `codex-review`, `codex-research`, `codex-writer`

Rule of thumb: the set = the workflow trio + every skill named in their "Related Skills" sections. If a Claude workflow starts referencing a new helper, add its Codex port too.

Reference skills installed on the Codex side by other tools (e.g. the Cloudflare pack: `cloudflare*`, `workers-best-practices`, `wrangler`, `durable-objects`, `agents-sdk`, `sandbox-sdk`, `turnstile-spin`, `web-perf`) are NOT ported from Claude — leave them as-is and commit them in their own group.

**Utility & Codex-only skills (don't prune):**

- `ss` — utility port of the Claude `/ss` screenshot loader. Codex runs on WSL/Linux, so the port uses `stat -c %Y` (with a `stat -f %m` BSD fallback), not the macOS `stat -f %m` of the Claude source, and drops `$ARGUMENTS` / `` !`cmd` `` / `allowed-tools` frontmatter (Codex has none). Refresh it if the Claude source's resolve/freshness/retry logic changes; re-apply the Linux stat adaptation each time.
- `ccref` — Codex-only, no Claude source. It bridges Codex to the Claude skills (`~/.claude`, `./.claude`) + `CLAUDE.md`. It has no upstream to sync from — leave it in place; never treat it as "missing" and never overwrite it.
- `refer-another-project` — utility port of the Claude skill. Two Codex adaptations to re-apply on refresh: slug resolution uses `find "$HOME/repos" -mindepth 2 -maxdepth 2 -type d -name <slug>` (NOT the Claude source's `$HOME/repos/*/<slug>` glob, which is a fatal `no matches found` under Codex's interactive zsh), and update mode drops the Claude-only `-co` backend flag (Codex `x-as-pr` is already Codex-native).

## Sync workflow

1. **Gitignore audit.** `cd $HOME/.codex`, run `git status --short`. Any untracked machine-local runtime state belongs in `.gitignore`: versioned sqlite (`goals_*.sqlite*`, `logs_*.sqlite*`, `memories_*.sqlite*`, `state_*.sqlite*`), `generated_images/`, `installation_id`, `models_cache.json`, `session_index.jsonl`, `history.jsonl`. Codex bumps the version number in state filenames (`logs_1` → `logs_2`), so use generalized globs (`logs_*.sqlite*`), never pinned names. Confirm with `git check-ignore <file>`.
2. **Drift check.** For each canonical skill, compare the `$HOME/.claude/skills/<name>/SKILL.md` source against the `$HOME/.codex/skills/<name>/SKILL.md` port. Add missing ports; flag ones whose source gained behavior the port lacks (new flags, new steps, renamed sub-skills). Read both and judge behavioral drift — no line diff needed.
3. **Port / refresh.** For each missing or drifted skill, write a Codex-native `SKILL.md` per the port contract. On a refresh, preserve the existing port's structure rather than rewriting from scratch.
4. **Verify the ports as a set.** Frontmatter `name` matches the directory name; every skill named in a "Related Skills"/routing section is a canonical Codex name; flags are spelled identically across files; no dangling Claude-only instruction survives (the `Claude X -> Codex spawn_agent` mapping lines are expected and fine).
5. **Commit + push** — see below.

## Large syncs: fan out

When several skills drifted at once, porting them is embarrassingly parallel. Optionally drive it with a Workflow: one drafter per skill (each reads its Claude source + current Codex port + the port contract and returns the final `SKILL.md`), then one consistency-verifier over all drafts. Write the returned content to disk yourself to keep editorial control and run the set-level verify. For one or two skills, just do it inline.

## Commit + push

Group into separate commits so history stays legible:

1. `.gitignore` changes — `chore: ignore local Codex state files`
2. the workflow-skill sync — `feat(skills): sync Codex-native workflow skills from ~/.claude`
3. any newly-installed reference skills, as-is — `chore(skills): add <pack> reference skills`

Then push. Prefer `/commits push` — it offloads the git work to a subagent and handles the grouping. Never stage machine-local state; after committing, `git ls-files | grep -E '\.sqlite|auth\.json|config\.toml'` must return nothing.
