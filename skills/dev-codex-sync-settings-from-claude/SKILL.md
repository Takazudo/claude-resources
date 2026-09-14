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

`$HOME/.codex/` is a git repo that intentionally tracks:

- `.gitignore`
- `README.md` — how a machine is set up, and why `config.toml` is not tracked
- `agents/` — per-model agent profiles (e.g. `sol.toml`, `terra.toml`)
- `config.toml.example` — the **portable** template the live config is seeded from (see below)
- `hooks/`
- `scripts/` — includes `bootstrap-config.sh`, which seeds a machine's `config.toml`
- `skills/` — the ported workflow skills plus separately-installed reference skills

The live `config.toml` is **not** tracked — it is gitignored, and machine-local by design.

Everything else in `$HOME/.codex` is machine-local runtime state (sqlite DBs, `auth.json`, sessions, caches) and stays gitignored.

### config.toml is untracked — template + bootstrap, not a clean filter

The live `config.toml` is **gitignored**. Codex rewrites it constantly with machine-local project
trust records, desktop-app paths, marketplace metadata, generated MCP settings and runtime state —
at last count 40 `[projects."/Users/…"] trust_level` tables of machine-absolute paths, which are
meaningless on the WSL machines and accumulate forever.

What is tracked instead:

- **`config.toml.example`** — the portable defaults.
- **`scripts/bootstrap-config.sh`** — run once per machine, after cloning to `CODEX_HOME`:

  ```bash
  "$HOME/.codex/scripts/bootstrap-config.sh"
  ```

  It copies the template to `config.toml` **only when no local config exists**, and never overwrites
  one.

Change portable defaults by editing `config.toml.example`. **The trade to know about:** because
bootstrap never overwrites, machines that already have a `config.toml` do *not* pick those changes
up — that has to be done by hand. Keep machine-specific entries (`[projects]`, `[marketplaces]`,
generated MCP settings, hook state, absolute paths) only in the ignored live config. Settings that
belong to one codebase go in that codebase's own `.codex/config.toml`.

#### Don't rebuild the clean filter

An earlier design tracked `config.toml` behind a git clean filter that pinned `model`,
`model_reasoning_effort` and the `[tui.model_availability_nux]` counters at staging time. It was
real, and it is gone on purpose:

- **`35ad713`** (2026-07-11) added `.gitattributes` + `scripts/normalize-config-toml.js`.
- **`aaf192a`** (2026-07-23) deleted both and untracked `config.toml`, adding the template, the bootstrap script and `README.md` in their place.

Twelve days, then replaced. A filter can pin a volatile *field*; it cannot make 40 machine-absolute
path tables shareable, which was the real problem. The absence of `normalize-config-toml.js` is a
**decision, not an oversight** — a later session read it as one and nearly rebuilt it. If tracked
volatile fields ever come back, read `$HOME/.codex/README.md` first.

(For comparison, `$HOME/.claude/settings.json` **keeps** its clean filter. Its payload is a large
curated `permissions.allow` list that genuinely must propagate to every machine, and a copy-once
bootstrap would stop that — the asymmetry is about ownership, not file format.)

## Canonical skill set to keep synced

The user's Codex workflow centers on `/big-plan`, `/x-wt-teams`, `/x-as-pr`. Keep these plus everything they reference in sync:

- **Entry points:** `big-plan`, `x`, `x-as-pr`, `x-wt-teams` (canonical) + `x-wt-team` (thin alias → x-wt-teams)
- **Support:** `cleanup-resources`, `deep-review` (= `/code-review` + `/codex-review`), `verify-ui` (external — sourced from `Takazudo/zudo-test-wisdom`, NOT `$HOME/.claude/skills`; only sync/keep it on machines where that repo's setup installed it), `watch-ci`, `pr-revise`, `gh-fetch-issue`
- **Codex-native helpers:** `codex-2nd`, `codex-research`, `codex-writer`
- **Do NOT port `/codex-review`.** It exists here because codex is a *different* model from the session; on Codex the session already is codex, and Codex ships a native `$review-agent`. The Codex-side workflow skills invoke that directly.

Rule of thumb: the set = the workflow trio + every skill named in their "Related Skills" sections. If a Claude workflow starts referencing a new helper, add its Codex port too.

Reference skills installed on the Codex side by other tools (e.g. the Cloudflare pack: `cloudflare*`, `workers-best-practices`, `wrangler`, `durable-objects`, `agents-sdk`, `sandbox-sdk`, `turnstile-spin`, `web-perf`) are NOT ported from Claude — leave them as-is and commit them in their own group.

**Utility & Codex-only skills (don't prune):**

- `db` + `ss` — utility ports of the Claude Dropbox loaders. `db` carries the resolution engine (Dropbox root, directory settle, sync retries, placeholder materialization) and `ss` is the thin screenshot shorthand that adds only latest-N selection, so **refresh them as a pair** — engine changes land in `db`, and `ss` must keep pointing at it. Two adaptations to re-apply each time: Codex runs on WSL/Linux, so the helpers lead with `stat -c %Y` / `stat -c %s` (BSD `stat -f` as fallback), the reverse of the macOS-first Claude source; and Codex has no `$ARGUMENTS` / `` !`cmd` `` / `allowed-tools` frontmatter, so the cutoff is captured by an explicit `date +%s` first action. The Claude side splits the engine into `db/references/resolve.md`; the Codex port inlines it into `db/SKILL.md` and keeps only `references/env-secrets.md` separate.
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

Then push. Prefer `/commits push` — it offloads the git work to a subagent and handles the grouping. Never stage machine-local state; after committing, both of these must return nothing:

```bash
git -C "$HOME/.codex" ls-files | grep -E '\.sqlite|auth\.json'
git -C "$HOME/.codex" ls-files config.toml
```

The second is the one that regresses quietly: the live `config.toml` must stay **untracked** (see above). If it ever shows up in `ls-files`, something re-added it — `git rm --cached config.toml`, don't "fix" it by reintroducing a filter.
