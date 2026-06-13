---
name: x-wt-teams
description: "Parallel multi-topic development using git worktrees, base branches, and Claude Code agent teams. Use when: (1) User wants to work on multiple related features in parallel, (2) User mentions 'worktree', 'base branch', 'parallel development', 'split into topics', or 'multi-topic'. FULLY AUTONOMOUS — creates worktrees, spawns teams, coordinates everything. Also supports Super-Epic child mode for [Epic] issues from /big-plan with '**Super-epic:** #N' markers (targets the super-epic base branch instead of main)."
argument-hint: "[-op|-so|-haiku] [-co|--codex] [-gco|--github-copilot] [-t-op|--team-opus] [-t-so|--team-sonnet] [-a|--auto] [-m|--merge] [-f|-fix|--auto-fix] [-nf|--no-fix] [--no-issue] [-s|--stay] [-l|--review-loop] [-v|--verify-ui] [-nor|--no-review] [-ri|--raise-issues] [-nori|--no-raise-issues] [#issue-number] <instructions>"
---

# Git Worktree Multi-Topic Development

Coordinate parallel development of multiple related features using git worktrees, a shared base branch, and Claude Code agent teams. **This is fully automated** — you (the manager) create the infrastructure and spawn child agents to do the work. Never ask the user to manually start sessions in worktrees.

> **On Claude Code on the web** (`$CLAUDE_CODE_REMOTE=true`): follow [`web/web-mode.md`](../../web/web-mode.md). **Always take the subagents path — never create an agent team:** ignore the `Execution mode:` markers and the default-to-teams fallback, and do not read `references/teams-path.md`. Worktrees + one-shot `Agent`-tool fan-out work normally. Do all PR / issue / label / merge / CI work via the GitHub MCP, not `gh` (push branches before opening PRs; pre-create labels). Claude-only — ignore Codex `-co` / Copilot `-gco`. No Dropbox. **Branch model — see web-mode.md §5:** the `claude/*` session branch IS the base (`$WEB_BASE`) — do NOT create `base/<project-name>` and do NOT push an empty start commit (web = the adopt-current-branch case). Topics fork from `$WEB_BASE` and merge back into it **locally**; the root PR is `$WEB_BASE` → `$WEB_PARENT` (the repo default branch — this inverts the ROOT PR TARGET rule below), created **after the first real commit exists** (no empty-diff PR). Push only `$WEB_BASE` while checked out on it — drop the per-topic push loop and the per-topic documentation PRs (topics are merged locally and never pushed). `-m` merges `$WEB_BASE` → `$WEB_PARENT` via MCP **without deleting the session branch** (web owns it); after merge `git checkout "$WEB_BASE"`, not the default. **Super-epic mode is unsupported on web** — refuse early (see Step 1a). When pushing before a PR, push **only the branch you are checked out on**. **Concurrency — see web-mode.md §6:** the local 6-concurrent-child cap is Mac-freeze protection and does NOT apply on web — fan out all topics in one parallel batch (the browser one-at-a-time rule and the port `flock` rule still hold).

## References

Detail lives in `references/` so this file stays a workflow spine. Open the relevant reference whenever the workflow touches its topic — these are not optional:

- **`references/arguments.md`** — every flag (model, backend, `-s` / `-a` / `-m` / `--no-review`, etc.), how they combine, manager-invariant rule.
- **`references/super-epic-mode.md`** — Super-Epic child mode lifecycle: detection markers, Step 1a / Step 2 overrides, mandatory epic-PR merge, Auto-Suggest variant, why `-m` is ignored.
- **`references/reviewer-modes.md`** — `-co` / `-gco` substitution tables and Combined Reviewer Mode (run all selected backends).
- **`references/execution-modes.md`** — subagents vs teams routing: how `/big-plan`'s `Execution mode:` markers are read, default-to-teams fallback, mixed-mode degradation, Step 5 / Step 7 path differences, drift sanity check.
- **`references/teams-path.md`** — the on-demand teams-path body (read ONLY when a topic is marked `teams` or a marker is missing): TeamCreate + named teammates, idle/wake, the shutdown_request teardown, TeamDelete. The common subagents default is inline in Step 5 / Step 7.
- **`references/per-topic-models.md`** — per-topic Claude model resolution for child agents: how `/big-plan`'s `Model:` markers are read, manual `-t-op` / `-t-so` flag override, per-topic model assignment in spawn calls, default-to-opus fallback.
- **`references/issue-templates.md`** — tracking issue body, claim comments, unrelated-findings issue, Step 14 session report, Step 15 verification comments, accumulating-epic Auto-Suggest hand-off.
- **`references/resource-coordination.md`** — Playwright / browser isolation rule and port-binding `flock` rule (full patterns).

## !! CRITICAL — ROOT PR TARGET BRANCH RULE !!

**The root PR's base MUST be the current (invocation) branch, NOT the repository's default branch.**

> **On web this rule INVERTS — see web-mode.md §5.** The invocation branch is the `claude/*` session branch (`$WEB_BASE`) and becomes the **base**; the root PR targets `$WEB_PARENT` (the repo default, the fork-from branch) — head=`$WEB_BASE`, base=`$WEB_PARENT`, created via MCP after the first real commit. The "default branch is almost always wrong" warning below applies to the terminal only.

As the very first action, record the current branch:

```bash
INVOCATION_BRANCH=$(git branch --show-current)
```

The root PR's `--base` MUST be `$INVOCATION_BRANCH` (or a user-specified parent branch) — NEVER omit `--base` on `gh pr create`, because `gh` defaults to the repo's default branch (usually `main`), which is almost always wrong here.

**Concrete example (this is the bug this rule prevents):**

```
Current branch: topic/foo-bar
User runs:      /x-wt-teams do blah blah...
CORRECT:        base/moo-mew → root PR targets topic/foo-bar
WRONG:          base/moo-mew → root PR targets main   ← DO NOT DO THIS
```

This applies regardless of:

- Whether the current branch already has a PR
- Whether the current branch has commits ahead of main
- Whether `main` "seems more natural" as the base
- Whether the current branch looks like a work-in-progress topic

The only exceptions are (a) the user explicitly specifies a different parent branch, or (b) this is a Super-Epic child session — parent branch is fixed to the super-epic base. See `references/super-epic-mode.md`. Both are explicit, never inferred.

## Auto-Pilot Behavior (Always On)

This skill orchestrates long-running autonomous parallel work (worktrees, agent teams, issue tracking, reviews, merges). When invoked, behave as if Auto Mode is active — regardless of session mode:

1. **Execute immediately** — start implementing right away. Make reasonable assumptions and proceed on low-risk work.
2. **Minimize interruptions** — prefer making reasonable assumptions over asking questions for routine decisions.
3. **Prefer action over planning** — do not enter plan mode unless the user explicitly asks. When in doubt, start coding.
4. **Expect course corrections** — treat mid-run user input as normal corrections, not failures.
5. **Do not take overly destructive actions** — deleting data, force-pushing, or modifying shared/production systems still needs explicit confirmation.
6. **Avoid data exfiltration** — do not post to external platforms or share secrets unless the user has authorized that specific destination.

These rules apply to the manager session and are carried into child agent prompts so worktree teammates also operate in auto-pilot.

## Resource Coordination — top-level summary

**Playwright / browser tools**: Neither manager nor child agents may invoke `/headless-browser`, `/verify-ui`, or any Playwright / Chrome DevTools-backed tool directly. Every browser check is dispatched to a fresh disposable Opus subagent (one alive at a time, sequential only, killed on return).

**Heavy / port-based tests**: Child agents must NOT run full e2e / integration suites, long builds, or hold a dev server (`pnpm dev` etc.) open for verification. Children commit + report back; the manager runs these sequentially on the merged base. Legitimate short port-binding work uses `flock` on `/tmp/x-wt-teams-<repo>-locks/port-<N>.lock`.

**See `references/resource-coordination.md` for the full dispatch pattern, lock pattern, and rationale. Both rules are HARD — they prevent local-machine freezes and token blow-ups.**

## Architecture

```
<parent-branch> (the branch you branch from — could be main, develop, or a feature branch)
  └── base/<project-name>  (base branch, created by manager)
        ├── <project-name>/topicA  (child branch → PR into base)
        ├── <project-name>/topicB  (child branch → PR into base)
        └── <project-name>/topicC  (child branch → PR into base)

worktrees/
  ├── <topicA>/  (worktree for topicA, child agent works here)
  ├── <topicB>/  (worktree for topicB, child agent works here)
  └── <topicC>/  (worktree for topicC, child agent works here)
```

Each topic gets its own worktree directory, its own branch, and its own PR targeting the base branch. The manager merges topic PRs into the base branch, then creates one root PR from base into the parent branch.

> **On web (web-mode.md §5):** drop the `base/<project-name>` layer. `$WEB_BASE` (the `claude/*` session branch) IS the base — topics fork from `$WEB_BASE` and merge into `$WEB_BASE` **locally** (never pushed); the single root PR is `$WEB_BASE` → `$WEB_PARENT` (repo default).

**Super-Epic child variant** — `<parent-branch>` is fixed to the super-epic base `base/<super-title>`, and `<project-name>` equals `<super-title>-<epic-slug>`. The root PR becomes the epic-PR and targets the super-epic base rather than main. See `references/super-epic-mode.md`.

## PR Body Reference Header

When creating any PR (`gh pr create`), check for parent references and prepend a header to the PR body. This identifies what the PR belongs to.

**For the root PR (Step 2):**

1. **Parent issue**: Use `ISSUE_NUMBER` if set
2. **Parent PR**: Check if the parent branch has an open PR:

   ```bash
   PARENT_PR_NUM=$(gh pr list --head "$PARENT_BRANCH" --json number -q '.[0].number' 2>/dev/null)
   ```

   (When using `--stay`, check for a parent PR on `PARENT_BRANCH`, not the current branch itself.)

**For topic PRs (Step 11):**

1. **Parent issue**: Use `ISSUE_NUMBER` if set
2. **Parent PR**: Use the root PR number

**Header format** — prepend to the very start of the PR body (before `## Summary`):

```markdown
- issues
    - <REPO_URL>/issues/<ISSUE_NUMBER>
- parent PR
    - <REPO_URL>/pull/<PARENT_PR_NUM>

---

```

- Use `gh repo view --json url -q '.url'` to get `REPO_URL`
- Only include sections that have values — omit `- issues` if no issue, omit `- parent PR` if no parent PR
- If neither exists, omit the header entirely
- **When updating the PR body later** (e.g., via `/pr-revise`), always preserve the reference header at the top — do not remove or replace it

## Fully Automated Workflow

**IMPORTANT**: You are the manager. You handle ALL steps automatically:

1. Resolve GitHub tracking issue (read existing, create new, or skip)
2. Create base branch + root PR
3. Create worktrees for each topic
4. Set up environment in worktrees
5. Spawn child agents in worktrees — subagents (inline default) or teams (TeamCreate, when a topic is marked `teams`; see `references/teams-path.md`). NO pushing during implementation — commit only
6. Monitor child agents, review their PRs, merge into base
7. Remove worktrees (and, on the teams path, shut the team down — TeamDelete)
8. Sync local base branch
9. Quality assurance: `/deep-review` (default) or `/review-loop 5` (if `-l`/`--review-loop`)
10. Verify UI: `/verify-ui` (if `-v`/`--verify-ui`)
11. Push all changes to remote
12. CI watch: verify CI passes on root PR (invoke `/watch-ci`, fix if red)
13. Update root PR and mark ready
14. Session report
15. Requirements verification (if issue linked)

15.5. Auto-fix raised findings (default; skipped with `-nf`/`--no-fix`) — triage `agent-found` issues, auto-fix the safe subset on `agent-fix/<slug>` PRs, close fixed issues

16. Cleanup audit via `/cleanup-resources` — close completed sub-issues / tracking issue, delete dead local/remote branches. **STOP HERE. Workflow ends.**
17. _(DEFERRED — only when user asks, after PR is merged in a later session)_ Manual cleanup hook — re-invokes `/cleanup-resources` if leftover branches need tidying

**PUSH-FORBID DURING WORK**: To save CI resources, child agents must **NOT push** during implementation. They commit locally only. All pushing happens in Step 11 after deep review is complete. This prevents CI from running on every intermediate commit.

**Never ask the user to manually cd into worktrees or start Claude sessions.** Use the Task tool to spawn agents that work in each worktree directory.

### Step 1: Resolve GitHub Tracking Issue

Three modes depending on user input.

#### 1a: Existing issue provided

Read it first — it usually contains implementation instructions:

```bash
gh issue view <number>
```

Use the issue body as the primary input for planning. Set `ISSUE_NUMBER=<number>`; reuse this issue for progress logging (no new issue needed).

**Epic issue shortcut (`[Epic]` in title, created by `/big-plan`):** Planning is already done. Extract directly from the issue body:

- **Topics** — use the child sub-issues listed (each `[Sub]` issue becomes one topic). For Super-Epic child sessions, topics come from inline sub-tasks in the epic body instead.
- **Base branch** — use the `base/...` name stated in the issue body (do NOT invent)
- **Pre-made base branch ("Use this PR as base")** — if the epic body says to use an existing PR / base branch as the base (the `/big-plan` resource-handoff case from the `dev-setup-temp-resource` skill — it carries `_temp-resource/{epic#}-{slug}/` for the implementer), record that branch + PR. In Step 2 you will **reuse** it instead of creating a new base branch, and the resources are already on it for the child agents.
- **Dependency order** — respect the dependency graph; start with independent topics first
- **Execution mode per topic** — extract the `**Execution mode:** {subagents|teams}` marker from each `[Sub]` issue body (or each inline sub-task in Super-Epic mode). This drives Step 5's spawn path. See `references/execution-modes.md` for the parsing logic, default-to-teams fallback, and mixed-mode degradation rule.
- **Model per topic** — extract the `**Model:** {opus|sonnet|haiku}` marker from each `[Sub]` issue body (or each inline sub-task in Super-Epic mode). This drives the per-child model assignment in Step 5. A manual `-t-op` / `-t-so` flag on this invocation OVERRIDES per-topic markers session-wide. Default-when-missing-and-no-flag: `opus`. See `references/per-topic-models.md` for the resolution table.

Do NOT re-plan or re-analyze. Do NOT update the epic issue body. Proceed to Step 2 with the extracted topics, base branch, and per-topic execution mode.

**Super-Epic child mode** — if the epic body also contains `**Super-epic:** #N` (and the two related markers), this is a Super-Epic child session. Apply ALL Step 1a / Step 2 overrides from `references/super-epic-mode.md`: parent branch is the super-epic base (NOT invocation branch), `EPIC_BASE` is verbatim from the marker, topics come from inline sub-tasks, super-epic base existence is verified, and `SUPER_EPIC_NUMBER` / `SUPER_EPIC_BASE` / `EPIC_BASE` are captured for later steps. **On web (`$CLAUDE_CODE_REMOTE=true`) Super-Epic mode is UNSUPPORTED (web-mode.md §5):** it needs real `base/<super>` / `base/<super>-<epic>` branches that are neither `claude/`-prefixed (unpushable) nor the session branch. If both web and the Super-epic markers are detected, **refuse early**: print "Super-epic mode is not supported on Claude Code on the web — run this epic from the terminal." and STOP. Do not attempt the single-base fallback for super-epics.

**Claim the issue** — post a claim comment so other Claude Code sessions don't start parallel work. See `references/issue-templates.md` for the per-mode wording.

**For non-epic issues:** Update the issue body via `gh issue edit` to add a Summary, a Topics section, and the TODO checklist (same as 1b). This makes the issue a spec tracker, not just a step log.

#### 1b: Create new issue (default)

Unless `--no-issue` is passed, create a new tracking issue. **The issue is a spec tracker** — Summary should answer "what are we doing and why?" before listing steps. See `references/issue-templates.md` for the full body template and the per-step progress comment pattern.

After creation, capture `ISSUE_NUMBER` from the URL.

#### 1c: No issue (`--no-issue`)

Skip issue creation entirely. All `gh issue comment` calls throughout the workflow are skipped.

---

Save `ISSUE_NUMBER` (from 1a or 1b) — passed to all child agents and used for progress comments throughout. After every subsequent step: check off the TODO line in the issue body, comment a brief report, then re-read the issue to confirm what's next. Re-reading is **critical** to prevent losing track during long workflows.

### Codex 2nd Opinion (Planning Phase)

**SKIP ENTIRELY if the issue was created by `/big-plan`** (`[Epic]` in title, or Super-Epic child session). `/big-plan` already validated the plan during its workflow — re-running here is wasteful.

For all other sessions (no issue, or user-provided non-epic issue), after Step 1 and before Step 2, when topics are planned:

1. Form an initial plan — list topics, what each will implement, and the overall approach.
2. Invoke `/codex-2nd` (or backend variants per active flags — see `references/reviewer-modes.md`).
3. If feedback is useful (missing topics, better decomposition, risk areas), update the plan.
4. Optionally re-run (up to 3 iterations).
5. Finalize and proceed to Step 2.

This is advisory. If codex is unresponsive, proceed with the original plan.

### Manager invariant & two flag families

**The manager session is ALWAYS Opus.** Neither reviewer flags nor team-member flags downgrade the manager.

Two orthogonal flag families:

- **Reviewer flags** — `-op` / `-so` / `-haiku` choose the Claude reviewer model; `-co` / `-gco` add codex / Copilot reviewer backends. All combine — multiple flags means run every selected reviewer. See `references/reviewer-modes.md` for substitution tables and Combined Reviewer Mode rules.
- **Team-member flags** — `-t-op` / `-t-so` override the model for child worktree agents and fix-delegation agents session-wide, replacing any per-topic `Model:` annotations from `/big-plan`. Without a flag, each child's model resolves per-topic from the annotation (default `opus`). See `references/per-topic-models.md` for resolution order and `references/arguments.md` for the canonical flag table.

### Step 2: Create Base Branch and Root PR

**CRITICAL: `-s` / `--stay` is STRICTLY opt-in.** Only use the `--stay` flow if the user explicitly passed `-s` or `--stay`. Do NOT auto-detect. Default ALWAYS creates a new branch — even if the current branch has an existing PR. See `references/arguments.md` for the full `--stay` mechanism. **On web this default does NOT hold (web-mode.md §5):** web always behaves as the adopt-current-branch case — `$WEB_BASE` (the `claude/*` session branch) is the base regardless of flags; no new base branch is created. The parent is `$WEB_PARENT` (the fork-from / default branch) **unconditionally — do NOT run the `gh pr view --json baseRefName` preference step**, even if the session branch already has a PR.

**Super-Epic child mode**: parent branch is `$SUPER_EPIC_BASE`, base branch is `$EPIC_BASE` verbatim (from the marker). Root PR targets `$SUPER_EPIC_BASE`. See `references/super-epic-mode.md`.

#### Pre-made base branch (resource handoff) — reuse, do NOT create

If Step 1 found a "**Use this PR as base**" note on the epic (the `/big-plan` resource-handoff case, per the `dev-setup-temp-resource` skill), the base branch **already exists on the remote** with `_temp-resource/{epic#}-{slug}/` committed on it. Reuse it — do NOT create a new one or an empty start commit:

```bash
git fetch origin <stated-base-branch>
git checkout <stated-base-branch>
git pull origin <stated-base-branch>
```

The root PR is the existing base PR `/big-plan` opened (don't create a second one — just adopt it for the rest of the workflow). Then go to Step 3; topic worktrees fork from this base, so every child inherits the resources, and each sub-issue points at `_temp-resource/{epic#}-{slug}/` in its working tree. Skip the "Default flow" below. **On web (web-mode.md §5):** there is no separate pre-made base branch to `git fetch` / `git checkout` — `/big-plan`'s web variant committed `_temp-resource` directly onto `$WEB_BASE` (the session branch). Treat the handoff as "resources are already on `$WEB_BASE`"; do NOT checkout a different branch (it would leave the session branch and break push-only-current-branch).

#### Default flow (no `--stay`) — ALWAYS used unless `-s` / `--stay` explicitly passed

Base branch is created from the currently checked-out branch; that branch becomes the root-PR target. True regardless of whether it has an existing PR.

```bash
INVOCATION_BRANCH=$(git branch --show-current)  # Record before any checkout
```

**Determine `<parent-branch>`**: If the user specified one, use it. Otherwise default to `INVOCATION_BRANCH`.

**CRITICAL**: Create the root PR immediately with an empty commit. This locks in the correct parent branch from the start.

> **On web (web-mode.md §5):** run the canonical detection from §5 to set `$WEB_BASE` / `$WEB_PARENT`, stay on `$WEB_BASE`, and SKIP the entire terminal block below — no `git checkout <parent>`, no `base/<project-name>`, no empty commit, no `git push -u`. The draft root PR is created **later** (after the first real commit lands on `$WEB_BASE`) via MCP `create_pull_request` head=`$WEB_BASE` base=`$WEB_PARENT` draft:true; push `$WEB_BASE` first. The guard below makes this executable — do not run the terminal commands on web.

```bash
if [ "$CLAUDE_CODE_REMOTE" = "true" ]; then
  # Web: §5 detection already set WEB_BASE / WEB_PARENT. Stay on WEB_BASE.
  # Root PR is deferred to after the first real commit (MCP create_pull_request,
  # head=$WEB_BASE base=$WEB_PARENT draft:true). Do NOT create base/<project-name>,
  # do NOT empty-commit, do NOT push here.
  :
else
  git checkout <parent-branch>
  git pull origin <parent-branch>

  git checkout -b base/<project-name>

  # [skip ci] = GitHub-native skip instruction — the empty commit changes nothing, so CI on it
  # is guaranteed-green waste; real commits that follow trigger CI normally
  git commit --allow-empty -m "= start <project-name> dev = [skip ci]"
  git push -u origin base/<project-name>

  # !! PR TARGET CHECK !! — <parent-branch> MUST be INVOCATION_BRANCH (recorded above) for non-Super-Epic
  # sessions, or $SUPER_EPIC_BASE for Super-Epic child mode. NEVER omit --base — `gh pr create` falls
  # back to the repo default branch (usually main). That is the bug the top-of-file rule prohibits.
  gh pr create \
    --base <parent-branch> \
    --title "<project-name>: root PR title" \
    --body "$(cat <<'EOF'
## Summary
(in progress)

## Topic PRs
(to be added as topics are completed)
EOF
)" \
    --draft
fi
```

Save the root PR number — you will update it as topics are merged.

#### If `-s` / `--stay` is explicitly passed

The current branch is reused as the base branch. No new branch or empty commit. Parent branch is determined from any existing PR on the current branch, or the repo default branch if none. See `references/arguments.md` for the full mechanism.

```bash
INVOCATION_BRANCH=$(git branch --show-current)
BASE_BRANCH="$INVOCATION_BRANCH"

PARENT_BRANCH=$(gh pr view "$BASE_BRANCH" --json baseRefName -q '.baseRefName' 2>/dev/null)
if [ -z "$PARENT_BRANCH" ]; then
  PARENT_BRANCH=$(git remote show origin | grep 'HEAD branch' | awk '{print $NF}')
fi

EXISTING_PR=$(gh pr view "$BASE_BRANCH" --json number -q '.number' 2>/dev/null)
```

If `EXISTING_PR` exists: reuse it. If not: create a new draft PR targeting `PARENT_BRANCH`.

### Step 3: Create Worktrees

For each topic:

```bash
# On web (web-mode.md §5): fork from $WEB_BASE (the session branch), not base/<project-name>:
#   git worktree add worktrees/<topic-name> -b <topic-name> "$WEB_BASE"
git worktree add worktrees/<topic-name> -b <project-name>/<topic-name> base/<project-name>
```

Example with 3 topics:

```bash
git worktree add worktrees/topicA -b marker-fix/topicA base/marker-fix
git worktree add worktrees/topicB -b marker-fix/topicB base/marker-fix
git worktree add worktrees/topicC -b marker-fix/topicC base/marker-fix
```

### Step 4: Environment Setup (if needed)

If the project has environment files, symlink them into each worktree:

```bash
for wt in worktrees/*/; do
  ln -sf "$(pwd)/.env" "$wt/.env" 2>/dev/null
  # Add project-specific symlinks as needed (e.g., metadata, generated files)
done
```

If using pnpm workspaces, install dependencies in each worktree:

```bash
for wt in worktrees/*/; do
  (cd "$wt" && pnpm install)
done
```

### Step 5: Spawn Child Agents

#### Pick the spawn path first

Before any Agent or TeamCreate call, decide whether this session uses **subagents** or **teams** based on the per-topic execution-mode markers extracted in Step 1a:

- All topics marked `subagents` → **subagents path** (the inline default below — skip TeamCreate; spawn each topic as a one-shot Agent call).
- Any topic marked `teams`, OR any topic missing the marker → **teams path** (read `references/teams-path.md`). The missing-marker fallback being teams preserves pre-annotation behavior.

The subagents path is the inline default here because it's the common case; the teams path body is on-demand in `references/teams-path.md` so it costs no tokens unless a `teams` marker actually appears. The *routing* default when markers are absent is still teams (escape hatch + back-compat).

Tell the user which path was chosen with one line: which path, and why (e.g. "Execution mode: subagents (all 3 topics marked subagents)" or "Execution mode: teams (no `Execution mode` markers found — defaulting to teams)"). Then run a brief drift sanity check per topic.

Full routing logic, marker grep patterns, drift sanity check, and the subagents-path Agent-call shape live in `references/execution-modes.md`; the full teams-path body lives in `references/teams-path.md` — read it whenever the spawn path resolves to teams or any marker is ambiguous.

#### Resolve model per topic

The downstream child model is **per-topic**, not session-wide. Resolve in this order:

1. **Manual team-member flag override** — if the invocation has `-t-op` or `-t-so`, that flag applies to ALL topics. This is a deliberate manual override; the per-topic markers are ignored. Tell the user explicitly: "Manual override: all topics use {model} (-{flag})."
2. **Per-topic annotation** — otherwise, use the `**Model:**` marker extracted from each topic's `[Sub]` issue body (or inline sub-task) in Step 1a.
3. **Default** — if a topic has no marker AND no flag was passed, default to `opus`.

Tell the user the resolution before spawning, e.g. "Models per topic: topicA=opus, topicB=sonnet, topicC=opus." When children spawn (either path), set each one's model parameter to its own resolved value — children in the same session may run different models, that's fine.

Note: reviewer flags (`-op` / `-so` / `-haiku`) do NOT affect children. Only `-t-op` / `-t-so` does. Full table and rationale: `references/per-topic-models.md`.

#### Subagents path (default)

This is the common, steady-state default. **Skip TeamCreate and TaskCreate entirely** — spawn each topic as a one-shot Agent tool call pointing at its pre-created worktree. No team, no shutdown ceremony, no SendMessage. The full subagents-path routing and the Step 7 simplification live in `references/execution-modes.md`.

```
For each topic, issue an Agent tool call (parallel, capped at 6 concurrent — **on web: uncapped, fan out all topics at once; web-mode.md §6**):
   - subagent_type: "frontend-worktree-child" (or "general-purpose" for non-frontend topics)
   - model: the per-topic resolved model — see "Resolve model per topic" above. Always set explicitly per child; different children in the same session may run different models.
   - (Do NOT pass `isolation: "worktree"` — the worktree already exists from Step 3. Do NOT pass
     `team_name` / `name` — those are team-only. Permission prompts on file edits are handled by the
     PreToolUse hook at $HOME/.claude/hooks/allow-worktree-teammate-edits.sh, which auto-approves
     Edit/Write/NotebookEdit when either the session cwd or the target file path sits under a
     worktrees/<topic>/ segment. Confirm the hook is registered in settings.json before first use.)
   - prompt: Detailed instructions including (this is the CANONICAL prompt body — the teams path in
     references/teams-path.md reuses items a–j verbatim, layering only its team-specific deltas):
     a. The worktree absolute path to work in
     b. What to implement for this topic
     c. Branch name: <project-name>/<topic-name>
     d. Base branch: base/<project-name>   (on web: $WEB_BASE, the claude/* session branch — web-mode.md §5)
     d2. If the sub-issue references `_temp-resource/<issue>-<topic>/`, tell the child those delegated
         resources (prototypes / design refs / fixtures) are already in its working tree at that path —
         read them directly; no download / Dropbox.
     e. COMMIT ONLY — DO NOT PUSH. All commits stay local. Pushing happens in Step 11.
     f. NO DIRECT BROWSER TOOLING. Children must NEVER invoke /headless-browser, /verify-ui, or any
        Playwright / Chrome DevTools-backed tool. If browser verification is needed, commit and
        report back to the manager with URL + what to verify + branch. Manager dispatches a fresh
        disposable Opus subagent. See references/resource-coordination.md.
     g. NO HEAVY / PORT-BASED TESTS DURING IMPLEMENTATION. Children must NOT run full e2e suites,
        long builds, or hold dev servers open. Commit + report back; manager runs sequentially on
        merged base. For unavoidable short port-binding work, use the flock pattern in
        references/resource-coordination.md.
     h. (If issue tracking is active) ISSUE_NUMBER and instruction to comment on it when done:
        gh issue comment <ISSUE_NUMBER> --body "### topic-<name> — completed\n\n<summary>"
     i. DO NOT use SendMessage — there is no team in this session. Return a brief plain-text summary
        when done. (On the teams path this item becomes: report via SendMessage instead — see
        references/teams-path.md.)
     j. REBUILD TOUCHED WORKSPACE PACKAGES BEFORE REPORTING DONE. If the project has a workspace/
        monorepo layout and commits touched source inside a package whose consumer imports through
        a built artifact (e.g. an `exports` map → ./dist/...), the agent MUST rebuild that package
        and commit the build output before declaring done. Editing source without rebuilding leaves
        the consumer loading stale compiled output. Defer to project CLAUDE.md for workspace root
        and rebuild command. Skip silently only if the touched package has no build script or its
        build output is gitignored AND consumers import from source. A failed build is a blocker.
```

#### Teams path (on-demand — read `references/teams-path.md`)

If any topic is marked `teams` (see `references/execution-modes.md` for the marker), or any topic is missing the `Execution mode:` marker, the session uses the teams path instead. **Read `references/teams-path.md` for the full team workflow** — TeamCreate + named teammates, idle/wake, the shutdown_request teardown, and TeamDelete. It reuses the canonical prompt body (items a–j) above with its team-specific deltas.

**Spawn child agents in parallel — capped at 6 concurrent (on web: uncapped — one batch, web-mode.md §6).** Use multiple Agent tool calls in a single message for the first batch (Task tool calls on the teams path). Each agent should:

1. Work in its assigned worktree directory
2. Implement the topic
3. **Commit changes locally only — DO NOT push** (deferred to Step 11)
4. **Run `/light-review`** to self-review — fix clearly useful findings and commit. Forward whichever reviewer flags were on the original invocation (`-op` / `-so` / `-haiku` / `-co` / `-gco`). If no reviewer flag is active, `/light-review` falls to its own default (`-co`).
5. Save a log to `{logdir}/` (the agent's log-writing constraint handles this)
6. (If issue tracking is active) Comment on the tracking issue with a brief completion note
7. **Report back with brief message only**: status (1-2 sentences), PR URL if created, log file path. (Subagents path: return a plain-text summary. Teams path: report via SendMessage — see `references/teams-path.md`.)

#### Concurrency Limit: Max 6 Child Agents at Once

**CPU load protection**: Never run more than **6 child agents concurrently**. Running 7+ parallel agents overloads the local machine.

> **On web (web-mode.md §6):** this cap is Mac-freeze protection and does NOT apply — the cloud container is not your interactive machine. Spawn **all** topics in one parallel batch (one Agent call per topic in a single message); do not throttle to 6 or queue. (The browser "one alive at a time" rule and the port `flock` rule still hold — their reasons are context-window token balloon and port collisions, not CPU freeze.)

- **6 or fewer topics**: Spawn all in parallel.
- **7+ topics**: Spawn the first 6 in parallel, queue the rest. As each active agent completes and reports back, spawn the next queued topic. Continue until the queue is empty.

The active agent count stays at ≤6 at all times.

### Step 6: Review and Merge Topic Branches Locally

Children committed locally without pushing. Merge their branches into base **locally** with git:

```bash
# On web (web-mode.md §5): the base is $WEB_BASE (the session branch), so: git checkout "$WEB_BASE"
git checkout base/<project-name>

# Regular merge, NOT squash
git merge <project-name>/topicA
git merge <project-name>/topicB
git merge <project-name>/topicC
```

Review the combined diff:

```bash
git diff <parent-branch>...base/<project-name> --stat
```

### Step 7: Remove Worktrees (and shut down the team if one was created)

All child agents are done; their branches are merged. Clean up worktrees.

**Subagents path (default)**: there is no team — the one-shot Agent calls already terminated when each returned. Just remove worktrees and fix symlinks:

1. **Remove worktrees** — they are no longer needed (topic branches survive independently):

   ```bash
   for wt in worktrees/*/; do
     git worktree remove "$wt"
   done
   ```

2. **Fix pnpm symlinks** if the project uses pnpm workspaces (worktree removal can break symlinks):

   ```bash
   pnpm install --ignore-scripts 2>/dev/null || true
   ```

**Teams path**: a team was created in Step 5. Run the full shutdown ceremony (per-agent `shutdown_request`, then `TeamDelete`) **before** the worktree removal above — see `references/teams-path.md` "Step 7 — Teams-path teardown" for the exact sequence.

This closes the tmux panes and frees disk space. The rest of the workflow (review, push, CI) is handled by the manager alone.

### Step 8: Sync Local Base Branch

Ensure the base branch is up to date with any remote changes:

> **On web (web-mode.md §5):** SKIP this sync entirely — `$WEB_BASE` is local-only until Step 11, there is no remote `base/<project-name>` ref to fetch, and there are no concurrent remote writers to the session branch (the Step 6 topic merges are already in `$WEB_BASE`). The guard below makes that executable.

```bash
if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  git fetch origin base/<project-name>
  git merge origin/base/<project-name>
fi
```

Re-read the issue TODO to confirm the next step:

```bash
gh issue view "$ISSUE_NUMBER"
```

Next is **Step 9: Quality Assurance**. You MUST run it before pushing. Do NOT skip ahead.

---

### !! MANDATORY CHECKPOINT: Step 9 — Quality Assurance !!

**STOP. Before you push ANYTHING, you MUST run the review step.** This is the most commonly skipped step in long workflows because the context gets long after managing multiple child agents. **Read this carefully and execute it.**

**CRITICAL: The review MUST run on the base branch in the main repo directory** (NOT in a worktree or isolated context). At this point, topic branches are merged locally but NOT pushed — the merged commits only exist in the local base branch. Reviewers spawned with `isolation: "worktree"` or in separate worktrees will NOT see the unpushed merged changes and will report "no code to review." Always run from the main repo root on `base/<project-name>`.

#### `--no-review` opt-out (skip Step 9 entirely)

If `--no-review` or `-nor` was passed, **skip this step entirely** — do not invoke any review skill, do not delegate fixes, do not block before Step 11. Proceed straight to Step 10 (if `--verify-ui`) or Step 11 (push).

This flag's purpose: when `/deep-review -t` (default team-fix path) spawns a child `/x-wt-teams --no-review --stay` to apply fixes, the child must NOT run `/deep-review` again — that would loop forever. (`/deep-review` also passes `-nf -nori` to that child, so the contained fix session skips the Step 15.5 auto-fix and raises no issues — the outer `/deep-review` owns both.) Manual users almost never pass this. See `references/arguments.md`.

#### Review Loop Mode (`-l` / `--review-loop`)

If `-l` was passed (and `--no-review` was NOT), invoke `/review-loop 5` instead of `/deep-review`. Forward `-nori` if it was passed — `/review-loop` raises GitHub issues (label `agent-found`) for deferred needs-consideration findings by default, matching this skill's own `-ri`/`-nori` semantics:

```
Skill tool: skill="review-loop", args="5"
# or, if -nori was passed:
Skill tool: skill="review-loop", args="5 -nori"
```

#### Default Mode

If neither flag was passed, invoke `/deep-review`, forwarding `-nori` if it was passed (under the default `-ri`, `/deep-review` raises `agent-found` issues for findings it doesn't fix — those feed Step 15.5's auto-fix):

```
Skill tool: skill="deep-review"
```

With no reviewer flags, `/deep-review` delegates the review to `/codex-review` — codex is the house default reviewer.

`/deep-review` defaults to `-t` team-fix mode — it handles its own fix delegation by spawning a fresh `/x-wt-teams --no-review --stay`, applying fixes, committing, merging back into `base/<project-name>`, pushing, and running `/pr-revise`. By the time `/deep-review` returns, fixes are already committed and pushed. You do NOT need to create a fix issue, spawn an Agent, or call `/pr-revise` from this step.

For the legacy inline-fix flow (manager applies fixes in own context, no nested team), use `/deep-review -nt`.

#### Reviewer-mode substitution

If `-co` / `-gco` is active, substitute the reviewer skill: `/codex-review` / `/gco-review`. With multiple flags, run all selected backends sequentially and merge findings. Full rules: `references/reviewer-modes.md`.

#### Common steps

1. Invoke the review skill as described above.
2. Wait for it to complete:
- `/deep-review -t`: fixes already applied, committed, and pushed by inner `/x-wt-teams --no-review --stay`. Base branch is in its post-fix state.
- `/deep-review -nt`: fixes applied inline; no inner team session ran.
- `/review-loop`: ran multiple review-fix cycles internally.
- No actionable issues: nothing changed; continue.
3. Confirm base branch state (`git log --oneline -5`, `git status`) so you know whether new commits were added.
4. Proceed to Step 10 (if `--verify-ui`) or Step 11.

If you are about to run `git push` and you have NOT yet invoked the review skill in this session (and `--no-review` was NOT passed), **STOP and go back to this step.**

---

### Step 10: Verify UI (optional)

**Only run if `-v` / `--verify-ui` was passed.** Skip otherwise.

After Step 9 fixes are committed:

1. **Launch a verification target** — start the project's dev server, use a PR preview URL, or any other means to get the implementation running in a browser.
2. **Dispatch a disposable Opus subagent to run `/verify-ui`** — do NOT invoke `/verify-ui` in the manager's own context. See `references/resource-coordination.md` for the exact Agent-tool dispatch pattern. The subagent loads Playwright, runs the check, returns a PASS/FAIL report, and is torn down on return. Spawn one subagent per discrete verification (sequential, never parallel).
3. If the subagent reports issues, fix them **in the manager context** (no browser needed for the fix itself) and commit locally (do NOT push yet). Spawn a **fresh** subagent for re-verification — never reuse the earlier one.

Skip if changes are purely backend or non-visual.

---

### Step 11: Push All Changes to Remote

**Pre-push gate**: Confirm Step 9 has run. If skipped (and `--no-review` was NOT passed), go back now.

Push everything in one batch — first push after the initial empty commit. This avoids running CI on every intermediate commit.

> **On web (web-mode.md §5): push ONLY `$WEB_BASE`, and DROP the topic-branch push loop.** Topic branches were merged into `$WEB_BASE` locally and are not `claude/`-prefixed — the proxy refuses non-current, non-`claude/` pushes. The manager is checked out on `$WEB_BASE` after Step 6, so `git push origin "$WEB_BASE"` satisfies push==current. The guard below makes this executable.

```bash
if [ "$CLAUDE_CODE_REMOTE" = "true" ]; then
  # Push only the session base (manager is on it after Step 6).
  git push origin "$WEB_BASE"
else
  # Push the base branch (contains all merged topic work + review fixes)
  git push origin base/<project-name>

  # Push topic branches so PRs can be created for documentation
  for branch in <project-name>/topicA <project-name>/topicB <project-name>/topicC; do
    git push origin "$branch"
  done
fi
```

After pushing, create topic PRs for documentation/tracking, close them, then **immediately delete topic branches**.

**IMPORTANT**: Topic branches are already merged locally into base (Step 6). If the remote base already contains the topic commits, `gh pr create` fails with "No commits between base and head". Always guard against this — check if the PR was actually created before trying to close it. **Never call `gh pr close` with an empty PR number** — `gh` will default to closing the current branch's PR (the root PR), which is destructive.

> **On web (web-mode.md §5):** SKIP the per-topic documentation PRs entirely (topics live only locally, merged into `$WEB_BASE`) and drop every `git push origin --delete <topic>` (non-current, non-`claude/` push → rejected). Local `git branch -d <topic>` is fine. The empty-`PR_NUM` guard below MUST be preserved when any PR op is translated to MCP — a `gh pr close` with an empty number closes the **root PR** (destructive). The guard wraps both loops.

```bash
if [ "$CLAUDE_CODE_REMOTE" = "true" ]; then
  # Topics were never pushed on web — no documentation PRs, no remote delete.
  for branch in <project-name>/topicA <project-name>/topicB <project-name>/topicC; do
    git branch -d "$branch" 2>/dev/null || true
  done
else
  for branch in <project-name>/topicA <project-name>/topicB <project-name>/topicC; do
    if gh pr create --base base/<project-name> --head "$branch" --title "<topic> implementation" --body "Part of <project-name> development" --fill 2>/dev/null; then
      PR_NUM=$(gh pr list --head "$branch" --json number -q '.[0].number')
      if [ -n "$PR_NUM" ]; then
        gh pr close "$PR_NUM" --comment "Already merged into base branch locally"
      fi
    fi
  done

  # Clean up topic branches immediately (merged into base, PRs are closed)
  for branch in <project-name>/topicA <project-name>/topicB <project-name>/topicC; do
    git branch -d "$branch"
    git push origin --delete "$branch"
  done
fi
```

Only the base branch remains.

### Step 12: CI Watch (Verify CI Passes)

**Only if the project has CI configured.** Check with `gh pr checks <root-pr-number>` — if no checks exist, skip to Step 13.

Invoke `/watch-ci <root-pr-number>` to monitor CI. The skill handles polling, notifications, and failure investigation internally.

- **CI passes**: Proceed to Step 13.
- **CI fails**: Investigate and fix.
  - `gh run view <run-id> --log-failed` to fetch failed logs
  - Fix, commit, push, re-watch
  - Only attempt CI fixes if the failure is related to the changes (not pre-existing or infrastructure issues)
- **CI still fails after a fix attempt**: Stop and ask the user. Explain what failed, what was tried, and why it could not be resolved automatically.

If the task is intentionally CI-breaking (new linting rules, framework migration), skip CI verification and inform the user.

### Step 13: Update Root PR and Mark Ready

Invoke `/pr-revise` to analyze the full diff between the parent branch and `base/<project-name>` and update the root PR title and description to accurately reflect all combined changes.

Mark the PR as ready:

```bash
gh pr ready <root-pr-number>
```

---

### Step 14: Session Report

Generate a structured report — a log for future Claude Code sessions to reference via `/logrefer`, and a GitHub issue comment for human visibility.

Save to `{logdir}/{timestamp}-x-wt-teams-{slug}.md` and (if issue is linked) post as a comment on `$ISSUE_NUMBER`. Full template and content checklist: `references/issue-templates.md`.

---

### Step 15: Requirements Verification

**Only when `ISSUE_NUMBER` is set.** Skip if `--no-issue` was used.

After the session report, verify the original requirements are fully implemented:

1. Re-read the issue with `gh issue view "$ISSUE_NUMBER"` — read the **initial issue body** and any **early comments** to extract original requirements.
2. Compare every requirement, acceptance criterion, and bullet against actual implementation. Be thorough — check the code, not commit messages.
3. **All met**: Comment confirming, then proceed to STOP. Wording in `references/issue-templates.md`.
4. **Missing requirements**: Do NOT stop. Comment listing the gaps, then re-run Steps 3–14 using `--stay` semantics on the existing base branch (same as the Feedback Loop). Re-run Step 15 after the additional implementation. Repeat until everything is satisfied.

This creates a self-correcting loop that ensures nothing from the original spec is missed, even in long workflows where context can drift.

---

### Super-Epic: Merge Epic-PR into Super-Epic Base (MANDATORY)

**Only run when this session is Super-Epic child mode** — i.e., the epic issue body contained `**Super-epic:** #N` and `SUPER_EPIC_NUMBER` was captured in Step 1a. Skip entirely for non-Super-Epic sessions.

**This step always runs in Super-Epic child mode, regardless of `-m` / `--merge`.** `-m` is intentionally ignored in Super-Epic mode (see "Merge Mode" below for the rationale) — do NOT skip this mandatory merge thinking `/pr-complete` will handle it.

**Why mandatory:** A super-epic stacks many epic-PRs on the same super-epic base. If an epic-PR is left open at STOP, the next epic session branches off a stale super-epic base, sibling epic-PRs collide, and the super-PR never converges. Each epic session must merge its own epic-PR before STOP — no exceptions.

The merge has 5 sub-steps: re-confirm CI green, `gh pr merge --merge --delete-branch`, comment on the super-epic issue (do NOT close it), and switch to the super-epic base while deleting the now-dead local epic base. Full sequence with the exact commands and Dead Branch Cleanup details: **`references/super-epic-mode.md`**.

After this step, proceed to Close Tracking Issue → Auto-Suggest Next Command (Super-Epic variant) → STOP.

---

### Merge Mode (`-m` / `--merge`)

**Only run if `-m` or `--merge` was passed AND this session is NOT Super-Epic child mode AND no next wave remains.** Otherwise skip to Step 15.5 / Step 16 / Auto-Suggest. (This was `-a`'s job before the `-a`/`-m` split — `-a` is now the auto-chain flag and does NOT merge.)

**Why `-m` is ignored in Super-Epic child mode:** The mandatory merge step above already merges the epic-PR into the super-epic base — the only merge a Super-Epic child session is responsible for. `-m` is redundant there and is also semantically misleading (a user might read "auto-merge" as "also merge the super-epic base into main," which this skill never does). Full rationale in `references/super-epic-mode.md`.

**Why `-m` defers mid-chain:** when this session is part of a multi-wave / multi-session plan, evaluate the Auto-Suggest signals (Signal A / Signal B — see "Auto-Suggest Next Command" below) BEFORE merging. If a next wave remains, do NOT merge here — the root/epic PR must stay open so later waves keep accumulating onto it. Forward `-m` in the next-wave hand-off (or auto-invocation, under `-a`) instead; the merge runs in the session where no next wave remains (chain termination).

> **On web (web-mode.md §5):** `-m` merges `$WEB_BASE` → `$WEB_PARENT` (repo default) via MCP `merge_pull_request` — `/pr-complete` is web-aware and does NOT pass a branch-delete (Part E), so the `claude/*` session branch survives. After the merge, **`git checkout "$WEB_BASE"`** (it still exists) so the manager stays on a pushable branch — do NOT stay on `$WEB_PARENT` (the default branch is not pushable on web; the STOP rule "stay on the base" maps to `$WEB_BASE`). The CI-fix subagent must NOT push to `$WEB_PARENT` (not checked out on it, not `claude/`-prefixed) — route the fix through a `claude/agent-fix-<slug>` branch + PR (the branch-protection fallback path is the only path on web). Replace every `gh pr view` / `gh pr merge` below with MCP.

After Step 15 passes, automatically:

1. Invoke `/pr-complete -c` to wait for CI, merge the root PR (`--merge --delete-branch`), and close the linked issue.
2. After the merge, invoke `/watch-ci <root-pr-number>` on the merged target branch to confirm post-merge CI is green.
3. **If CI goes red**:
- Fetch the failed run logs: `gh run view <run-id> --log-failed`
- Spawn a dedicated Opus subagent with the failure details to investigate the root cause, fix the code, and push the fix directly to the target branch.
- **Branch protection fallback**: if the subagent's direct push to the target branch is rejected by branch protection rules, it must open a fix-forward PR targeting the target branch and report the PR URL — never force-push, never silently abandon.
- After the subagent reports back, re-invoke `/watch-ci` to confirm green. Attempt at most **2 fix cycles**. If CI is still red after 2 cycles, stop and report to the user with the full failure summary.
4. **After clean post-merge CI**, checkout the merged target branch and pull so the manager lands somewhere live:

```bash
# On web (web-mode.md §5): the manager returns to $WEB_BASE (it survives; the default branch
# is not pushable), NOT $TARGET_BRANCH:
#   git checkout "$WEB_BASE"
TARGET_BRANCH=$(gh pr view <root-pr-number> --json baseRefName -q '.baseRefName')

git checkout "$TARGET_BRANCH"
git pull origin "$TARGET_BRANCH"
```

**Do NOT delete the dead local source branch here.** Branch deletion is now handled by `/cleanup-resources` at Step 16, which has full context on every branch the workflow touched (base + topics) and applies the safety mechanics (`git branch -d` not `-D`, parent-branch checkout if needed) consistently. The merge-then-cleanup-resources sequence is the single source of truth for end-of-workflow branch cleanup — keeping it in one place avoids the double-cleanup confusion the old inline block produced. See Rule 27.

---

### Raising Issues for Unrelated Findings (Default Behavior)

During coding and reviewing (manager and child agents), you may discover problems **unrelated to the original topic** — pre-existing bugs, code smells in adjacent files, outdated dependencies, improvement possibilities, etc. By default (`-ri` / `--raise-issues`, on unless `-nori` is passed), **always raise these as separate GitHub issues** with the `agent-found` label so they are tracked and not lost.

**When to raise:**

- A reviewer flags a problem in code NOT modified by this workflow
- You or a child notices a bug or quality issue in adjacent code while implementing
- A pre-existing test failure or lint warning is discovered
- An improvement possibility (refactor, cleanup, modernization) outside the task scope
- Any problem clearly outside the scope of the current task

**Ensure the label exists (once per session, before the first raise):**

```bash
gh label create "agent-found" \
  --description "Raised automatically by a Claude Code agent during a /x-as-pr or /x-wt-teams workflow" \
  --color "ededed" 2>/dev/null || true
```

The command is idempotent — it no-ops when the label already exists.

**How to raise:** see the unrelated-findings template in `references/issue-templates.md`. Always pass `--label "agent-found"` on `gh issue create`; for `/gh-issue-with-imgs`, follow the issue creation with `gh issue edit <num> --add-label "agent-found"`.

**Suppressing with `--no-raise-issues` / `-nori`:** Ignore unrelated findings and focus only on the original task. Pass this flag context to child agents so they skip too.

---

### Step 15.5: Auto-Fixing Raised Findings (`-f` / `--auto-fix`, DEFAULT)

**This step runs by default.** Skip it only if `-nf` / `--no-fix` was passed — then go straight to Step 16. It runs AFTER the main work (and after Merge Mode / the mandatory Super-Epic merge, if those applied) and BEFORE Step 16 cleanup.

**Gating:**

- Requires `-ri` (the default). If `-nori` / `--no-raise-issues` was passed, this step is a **no-op** — no `agent-found` issues were raised this session. Print one line and skip.
- For careful / manual sessions, pass `-nf` / `--no-fix` to leave all raised issues open for human triage.

**Scope:** the `agent-found` issues *raised by this session* (manager and child agents), tracked in session state from "Raising Issues for Unrelated Findings" above. Do NOT touch unrelated pre-existing `agent-found` issues from other sessions.

**Ensure the `needs-decision` label exists** once before the first leave-open (idempotent, mirrors the `agent-found` block):

```bash
gh label create "needs-decision" \
  --description "Left open by -fix: needs a human product/design decision or is too big for an auto-fix session" \
  --color "d93f0b" 2>/dev/null || true
```

**Per raised `agent-found` issue, triage:**

1. **LEAVE OPEN** — needs a product/design decision, or is too big for this session: a big architecture change, removing an existing UI / feature, adding a big feature, or anything needing product/design judgment. Do NOT touch the code. Add a note comment and the `needs-decision` label:

   ```bash
   gh issue comment <ISSUE_NUM> --body "Left open by -fix: needs a human decision (product/design judgment or too large for an auto-fix session)."
   gh issue edit <ISSUE_NUM> --add-label "needs-decision"
   ```

2. **AUTO-FIX** — everything else, landing chosen by SCOPE:
- **TINY / trivial / localized** (one-liner, obvious cleanup, single-spot fix): **bundle ALL tiny fixes into ONE shared fix PR** on a single `agent-fix/<slug>` branch.
- **NON-TRIVIAL but bounded:** **each gets its OWN `agent-fix/<slug>` branch + PR.**

**Landing each fix — target the parent / ultimate-landing branch, NOT the intermediate `base/<project-name>`.** For `/x-wt-teams` that is `$PARENT_BRANCH` (the branch the root PR targets; in Super-Epic child mode, `$SUPER_EPIC_BASE`). Targeting the parent keeps fix branches valid even when `-m`'s `/pr-complete --delete-branch` already removed `base/<project-name>`. Create each `agent-fix/<slug>` branch from `$PARENT_BRANCH` and target its PR at `$PARENT_BRANCH`. **On web (web-mode.md §5):** name fix branches `claude/agent-fix-<slug>` (only `claude/`-prefixed branches are pushable), fork them from `$WEB_PARENT` (the default branch), and push each **while it is the current branch**, then `git checkout "$WEB_BASE"` to return. Prefer bundling ALL tiny fixes into ONE PR — fewer branch switches on web. The session branch is never deleted, and these `claude/agent-fix-*` branches ARE deletable (only `$WEB_BASE` is protected).

For each fix branch (the tiny bundle, or one per non-trivial issue):

1. `git checkout -b agent-fix/<slug> <PARENT_BRANCH>`, implement the fix(es), commit locally.
2. **Run `/light-review`** before merge — forward active reviewer flags (`-op` / `-so` / `-haiku` / `-co` / `-gco`) so `-op` → opus-backed review. Tiny bundle reviewed as a unit; per-issue fixes individually. Address high-priority findings and commit.
3. Push and open the fix PR (`gh pr create --base <PARENT_BRANCH> ...`), body linking the `agent-found` issue(s) it closes.
4. **Verify the fix** (build / tests / the issue's described check). Heavy / port-based verification goes through the manager on the merged branch, never a child — same rule as the rest of the workflow; browser checks go through the isolated Opus subagent (`references/resource-coordination.md`).
5. **On success: CLOSE the corresponding `agent-found` issue and link the fix PR** (overrides cleanup's "always keep" for FIXED issues only; left-open / unfixed ones stay open and kept):

   ```bash
   gh issue comment <ISSUE_NUM> --body "Fixed by -fix: <fix-PR-URL>. Closing."
   gh issue close <ISSUE_NUM>
   ```

**Loop + guardrails:**

- Repeat triage → fix → close until no auto-fixable issues remain.
- **Cap at ~3 rounds.** If a fix repeatedly fails, **leave that issue open** and stop retrying it:

  ```bash
  gh issue comment <ISSUE_NUM> --body "auto-fix attempted by -fix but did not converge — needs human. <brief note on what was tried>."
  ```

  Do NOT add `needs-decision` here (that label is the deliberate leave-open path); this is a failed-fix marker. Never loop forever.

**`-m` interaction (fix PR auto-merge):** fix PRs follow the **same auto-merge semantics as the root PR** — with `-m`, auto-merge each fix PR after `/light-review` + verification (e.g. `gh pr merge --merge --delete-branch` once green, or `/pr-complete` per fix PR); without `-m`, leave each as a ready (non-draft) PR for the user and still close the linked `agent-found` issue with the link once verified. **In Super-Epic child mode `-m` is ignored (see "Why `-m` is ignored in Super-Epic child mode" above), so treat fix PRs as the no-`-m` case — leave them as ready PRs for the super-epic flow to merge; still close the linked `agent-found` issue once verified.** Track the fix PRs and closed issues in session state — they go into the Step 16 manifest (role: `fix`).

---

### Step 16: Cleanup audit via `/cleanup-resources`

**Always run this step before Auto-Suggest / STOP** (unless `--no-issue` AND no branches were created — extremely rare). Replaces the older bespoke "close tracking issue" step and the deferred manual cleanup hook (now Step 17). The Sonnet subagent re-fetches every resource the workflow touched and returns a structured close/keep/delete plan; the manager (you) executes the plan and prints a final report. This catches the historical bugs where: (a) sub-issues stayed open after their PRs merged, (b) the tracking issue silently stayed open at end of workflow, (c) `-m` deleted the remote base but the local copy stayed behind.

```
Skill tool: skill="cleanup-resources", args="workflow:x-wt-teams <-a if -m was passed>"
```

(`/cleanup-resources`'s `-a` flag means `--auto-merged` — it maps to this skill's `-m`, the flag that actually merges the root PR. Do NOT pass it just because the auto-chain flag `-a` was on this invocation.)

**Temp-resource cleanup:** if this session consumed a `_temp-resource/{epic#}-{slug}/` handoff (the pre-made base branch case), delete that subdir with a commit on the base branch **before the root PR merges**, so the scratch resources don't reach the parent branch. Harmless if left (tooling ignores `_temp-resource/`), but prefer clean — anything durable should already be migrated into real docs by a docs sub-task. See the `dev-setup-temp-resource` skill.

**Manifest contents for `/x-wt-teams`:**

- Workflow context:
  - `workflow: x-wt-teams`
  - `auto-flag: <true if -m/--merge was passed, else false>`
  - `epic-mode: <true if Step 1a was epic shortcut or Super-Epic child mode, else false>`
  - `super-epic-mode: <true if Super-Epic child mode, else false>`
  - `root-PR: <ROOT_PR_URL>`
  - `root-PR-merged: <true if -m flow merged it, else false>`
  - `parent-branch: <PARENT_BRANCH>`
  - `super-epic-base: <SUPER_EPIC_BASE if Super-Epic child mode, else "none">`
- Issues to include:
  - **Tracking issue** (created by Step 1b or epic issue from 1a) — role: `tracking` for 1b, `epic` for 1a non-Super-Epic, `epic` for 1a Super-Epic child. Sonnet should propose CLOSE for `tracking` once the root PR is merged or workflow ended cleanly. For `epic` in non-Super-Epic mode, propose KEEP if any sub-issue is still open (the agent checks via `gh issue view` on each sub); CLOSE if all sub-issues are closed AND root-PR-merged. In Super-Epic child mode, the epic was already closed by the mandatory merge step's comment OR kept by design — the agent should KEEP whatever the current state is.
  - **Sub-issues** (epic mode, one per `[Sub]` issue under the epic) — role: `sub`. Sonnet should propose CLOSE for each whose corresponding topic branch was merged into the base (the manager merged these locally in Step 6, and the topic PRs were either auto-closed in Step 11 or merged externally). Otherwise KEEP.
  - **Unrelated-findings issues** raised during coding/review (track them in session state) — role: `unrelated-finding`. ALWAYS KEEP unless closed by `-fix` (the auto-fix step closes the ones it fixed and links the fix PR; the audit leaves those closed and keeps every still-open one).
  - **Review-fix issues** from `/deep-review -t` team-fix delegation (if any) — role: `fix`. Sonnet proposes CLOSE if the fix-delegation session merged its fixes.
  - **`agent-found` issues closed by `-fix`** (if the Step 15.5 auto-fix step ran) — already closed by this session; the audit confirms KEEP-as-closed.
  - **Super-epic issue** (Super-Epic child mode only) — role: `claimed-existing` with note "parent super-epic; never close from a child session". ALWAYS KEEP.
- Branches to include:
  - **Base branch** (`base/<project-name>`) — role: `base`, `pr-merged: <true if root PR merged>`. When `-m` flow merged the root PR, propose delete (local AND remote — the remote was already removed by `--delete-branch`, but pass `scope: both` so the manager's `git push origin --delete` is idempotent and `git branch -d` cleans up local). **On web (web-mode.md §5):** this "base branch" IS the `claude/*` session branch — pass it as `role: session-web` with `protected-session-branch: <its literal name>`; mark KEEP (web owns it). Never delete local or remote.
  - **Topic branches** (`<project-name>/<topic-name>` for each topic) — role: `topic`. Step 11 already deleted these; pass them in the manifest with `scope: both, pr-merged: true` so the agent confirms they're gone and the manager surfaces any stragglers in the "Warnings" section. Defensive only. **On web:** topics were never pushed — `scope: local` only.
  - **`agent-fix/<slug>` branches** (if Step 15.5 created any) — role: `fix`, targeting `$PARENT_BRANCH`. Pass `pr-merged: <true if the fix PR merged — always under `-m`, else false>` so merged fix branches are cleaned up and unmerged ones (ready PRs awaiting the user) are kept.
  - **Parent branch** (`$PARENT_BRANCH` or `$SUPER_EPIC_BASE`) — role: `parent`. ALWAYS KEEP (the agent's prompt forbids deleting parent roles).
- PRs to include:
  - **Root PR** — role: `root`, state from `gh pr view`. KEEP regardless — PRs that are still open are intentional, merged/closed PRs are done.
  - **`-fix` fix PRs** (if Step 15.5 created any) — role: `fix`, state from `gh pr view`. Merged → done; ready/open → KEEP (intentional, awaiting the user when `-m` was not passed).

After `/cleanup-resources` returns its report:

1. Print the close/delete/keep summary to the user (e.g. "Closed 4 sub-issues + tracking issue, deleted local base branch, kept 2 unrelated-findings issues").
2. If the report has an "Ambiguous" section, list those resources verbatim and either resolve them yourself (re-fetch and decide) under `-a` autonomy, or surface to the user otherwise.
3. If the manager was sitting on a branch the cleanup just deleted, it has already switched to the parent branch as part of execution. Confirm the new `git branch --show-current` matches the expected post-cleanup state per the STOP rules below.

**Exception**: If the user provided the tracking issue (not created by this workflow), the manifest still lists it as `claimed-existing` and the Sonnet agent will propose KEEP. Do not pass it as `tracking`.

**Super-Epic child mode** has a special wrinkle: the mandatory merge step already closed the epic-PR. The cleanup audit confirms the epic-PR is merged, confirms the local epic base is deleted (it was, by step 5 of `references/super-epic-mode.md`), and reports any drift. The super-epic issue itself is NEVER closed by a child session.

---

### Auto-Suggest Next Command (MANDATORY when session is part of a multi-session plan)

**You MUST run this step before STOP whenever this session is part of a multi-session plan.** Skipping it means the user has to manually type "give me next command" every time. Covers BOTH Super-Epic child mode AND `--stay` accumulating-epic wave sessions.

Print a concrete, copy-pasteable `/x-wt-teams <url> [flags] <instructions>` line as the final block of session output (just before the generic "workflow complete" closing). Use the literal URL from `gh` output — do NOT reconstruct.

**When to fire — detect either signal:**

- **Signal A — Super-Epic child session**: epic issue body contains `**Super-epic:** #N` (captured as `SUPER_EPIC_NUMBER`). → **Super-Epic variant**. Full detection, sibling lookup, message templates, and last-epic all-done branch: `references/super-epic-mode.md`.
- **Signal B — Accumulating-epic wave session**: the session was invoked with `-s` / `--stay` AND the user's original instructions contain ANY of:
  - "wave" / "Wave N<letter>" / "Sub N" / "next sub" / "next wave"
  - "accumulating epic PR" or "Do NOT ... merge PR #NNNN" or "Do NOT run /pr-complete"
  - "close the sub-issue" (sequential sub-issue pattern)
  - An enumerated list of remaining sub-issues / waves
  - The session merged a sub-issue into the epic base and the epic PR stayed open

  → **Accumulating-epic variant**. Full detection, identification of `EPIC_BASE` / `EPIC_PR`, sub-issue lookup, hand-off message template, and no-next-found fallback: `references/issue-templates.md`.

If neither signal applies, skip auto-suggest and fall through to STOP.

#### `-a` / `--auto` — auto-continue the chain

When `-a` was passed on this invocation AND Signal A or Signal B matched, do not stop after printing the hand-off. Instead:

1. Build the next-wave command exactly as the matching template (`references/super-epic-mode.md` for Signal A, `references/issue-templates.md` for Signal B) prescribes, then **also append `-a`** to the flag list so the chain keeps running on subsequent waves — and forward `-m` / `-nf` / `-nori` if they were on this invocation (auto-fix and issue-raising are defaults, so only the opt-outs need forwarding) (`-m` defers to chain termination, where Merge Mode merges the root PR — non-Super-Epic only; in Super-Epic chains the mandatory epic merge governs and `-m` stays ignored).
2. Print the hand-off block as usual (so the log records the transition), then **immediately invoke the same command via the Skill tool** — `Skill skill="x-wt-teams" args="<flags + url + instructions>"`. This re-enters the skill in the same session and runs the next wave end-to-end.
3. The chain self-terminates when a future iteration's auto-suggest finds no remaining siblings (last-epic all-done branch in `super-epic-mode.md`, no-next-found fallback in `issue-templates.md`). At that point, print the "all done" message, run Merge Mode if `-m` rode the chain (non-Super-Epic only), and STOP normally.

**Pause conditions — do NOT auto-invoke; print the hand-off + a short blocker note and STOP so the user can intervene:**

- CI failed and a single fix attempt did not turn it green, or the failure cause is not clearly addressable by the just-merged changes.
- `/deep-review` or `/review-loop` reported issues that this session could not auto-fix (e.g., requires user product decision, requires schema/migration approval).
- Step 15 found missing requirements this session cannot satisfy without user input.
- Any merge conflict on the super-epic base or accumulating-epic base that this session cannot resolve safely.
- Any condition the manager would normally surface to the user mid-run (denied destructive action, missing credential, etc.).

A pause is a soft stop — write a one-line "paused: <reason>" note above the hand-off, leave the chain ready to be resumed by the user re-running the printed next-wave command (which still has `-a` appended, so resuming continues the chain).

**Without `-a`**: behave as before — print the hand-off and STOP. Single-session runs and `-a`-less multi-session plans are untouched.

---

### STOP — WORKFLOW ENDS HERE

**After Step 16 (`/cleanup-resources` audit) completes its plan AND the Auto-Suggest Next Command step has run (whenever its signals matched), the automated workflow is DONE.** Report the root PR URL and wait for user response.

**Before printing the final "workflow complete" block, verify Auto-Suggest ran if its signals applied.** If Signal A or Signal B matched and you did NOT yet print a hand-off, go back and print it now. The user should NEVER have to type "give me next command" for a planned multi-session workflow.

**CRITICAL RULES at this point:**

- **If `-m` / `--merge` was used and the PR was merged**: The merge-mode checkout+pull put you on the target branch, and `/cleanup-resources` then proposed deleting the now-dead local `base/<project-name>` (which the manager executed). Stay on the target branch — the dead base is gone. (on web the session branch is NOT deleted — after `-m` the manager is back on `$WEB_BASE`, which survives — web-mode.md §5)
- **If Super-Epic child mode** (any epic — not just the last): You are already on the super-epic base after the mandatory merge step's branch-cleanup. `/cleanup-resources` then audited and confirmed. Stay on the super-epic base; the local epic base is already deleted.
- **Otherwise (non-Super-Epic, non-`-m`)**: **Stay on `base/<project-name>`.** `/cleanup-resources` proposed KEEP for the base branch (PR not merged yet). Do NOT checkout `main`, the parent branch, or any other branch. (on web: stay on `$WEB_BASE`, the session branch — web-mode.md §5)
- **Do NOT re-run cleanup** — Step 16 already ran. The "Step 17 (deferred)" manual cleanup hook is only for a later session where the user explicitly asks.
- **Do NOT delete any branches manually** — `/cleanup-resources` is the only step authorized to delete branches in this workflow. If it didn't delete a branch, leave it alone.
- **Do NOT do anything else** unless the user asks.

The user will review the PR and may:

1. **Provide feedback** — see "Feedback Loop" below. Handle it automatically.
2. **Merge the PR** — then the Step 17 manual cleanup hook can be run if the user asks.

---

### Feedback Loop: Iterating on User Feedback

After you report the root PR, the user often replies with feedback — requests for changes, fixes, or improvements. Range: small single-file tweaks to substantial multi-area rework.

**When user feedback is received, re-run Steps 3–14 using `--stay` semantics on the existing base branch.** This spins up new agent teams to implement the fixes following the same workflow. Base branch and root PR already exist — no need to recreate.

#### How it works

1. **Analyze the feedback** — break into discrete topics. Each heading, bullet group, or distinct concern becomes a topic. Single small concern is fine as one topic.
2. **Create new worktrees and topic branches** off the existing base branch (Step 3).
3. **Spawn new child agents** (Steps 4–5) following the same spawn-path decision as the original run:
- Subagents path (default): one-shot Agent calls, no team — no team name needed.
- Teams path: `TeamCreate` with an incremented team name (`<project-name>-v2`, `<project-name>-v3`, etc.) to avoid collisions — see `references/teams-path.md`.
- New topic branches: `<project-name>/<new-topic-name>`
- New worktrees: `worktrees/<new-topic-name>`
- Include the user's feedback verbatim in child agent prompts.
4. **Same workflow**: merge topics → shut down agents → sync → deep review → push → CI watch → update PR (Steps 6–14).
5. **Report back** and wait for the next round.

#### Key points

- **No new base branch or root PR** — reuse what already exists. The root PR accumulates iterations.
- **New team name per iteration (teams path only)** — `-v2`, `-v3`, etc. to avoid team-name collisions. The subagents-path default needs no team name.
- **Issue tracking continues** — comment on the issue with iteration progress if `ISSUE_NUMBER` is set.
- **Repeat as needed** — each round of feedback triggers a new iteration. Loop continues until the user is satisfied and merges the PR.
- **Small feedback** still uses this pattern — even a single-topic fix benefits from worktree isolation, review, CI check.

---

### Step 17 (deferred): Manual cleanup hook (when user later asks after merging the PR)

**Only run when the user explicitly asks**, typically after they've merged the root PR in a separate session and want to tidy up the leftover base branch.

When `-m` was used, the unconditional `/cleanup-resources` audit at end of workflow already deleted the dead local base branch — there's nothing left to do here. This step exists for the `-m`-less flow: the user merged the PR manually later and now wants the dead branches cleaned up.

```
Skill tool: skill="cleanup-resources", args="workflow:x-wt-teams"
```

Build the manifest the same way as the unconditional audit, but with `root-PR-merged: true` so the agent proposes deleting the base branch. The skill handles the safety mechanics (`git branch -d`, parent-branch checkout if needed) — do NOT re-implement those here.

If the user asks "clean up everything," just invoke `/cleanup-resources` and trust its plan. The legacy inline `git branch -d` block that used to live here is replaced by the skill — having two places that delete branches drifts.

## Branch Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Base branch | `base/<project>` (on web: the `claude/*` session branch `$WEB_BASE` — no `base/<project>`, see web-mode.md §5) | `base/marker-fix` |
| Topic branch | `<project>/<topic>` | `marker-fix/bogaudio-knobs` |
| Worktree dir | `worktrees/<topic>` | `worktrees/bogaudio-knobs` |

## Important Rules

1. **NEVER checkout main or parent branch on your own** — the workflow ends at Step 16 (cleanup audit), and `/cleanup-resources` is the only step authorized to switch branches as part of dead-branch cleanup. Outside its execution, stay on `base/<project-name>`. **Exceptions** (all routed through `/cleanup-resources` per Rule 27, or explicit special cases of Rule 26 Dead Branch Cleanup): (a) `-m` / `--merge` and PR merged → cleanup-resources proposes deleting the dead local `base/<project-name>`; the skill itself handles the checkout-parent + `git branch -d` mechanics. (b) **Super-Epic child mode** → the mandatory super-epic merge step (before Step 16) still checks out `$SUPER_EPIC_BASE` and deletes the local epic base, per step 5 of `references/super-epic-mode.md`. Cleanup-resources then audits and confirms. **On web (web-mode.md §5):** the "dead local base" is the `claude/*` session branch (`$WEB_BASE`) — do NOT delete it (web owns it). After `-m` merge, return to `$WEB_BASE`, not the default branch.
2. **Fully autonomous** — never ask the user to manually start sessions or cd into worktrees. Use Task tool to spawn agents.
3. **Always pull the parent branch before creating the base branch** — stale bases cause conflicts.
4. **Create the root PR immediately in Step 2** — empty commit + draft PR locks in the correct parent branch. **On web:** no empty start commit and no `base/<project-name>` — the `claude/*` session branch is the base; the root PR is created via MCP (head=`$WEB_BASE`, base=`$WEB_PARENT`) after the first real commit. See web-mode.md §5.
5. **Never force push** — regular merge only, preserves history.
6. **Push-forbid during work** — child agents commit locally only. All pushing happens in Step 11 after deep review. Saves CI resources.
7. **Topic branches merge locally first** — manager merges via `git merge`, not GitHub PR merge. Topic branches are pushed later for documentation only. **On web:** topic branches are merged locally into `$WEB_BASE` and never pushed (push-only-current-branch) — drop the documentation push. See web-mode.md §5.
8. **Root PR targets the parent branch** — handled automatically by creating it in Step 2. Super-Epic child sessions target the super-epic base; see `references/super-epic-mode.md`. **On web this inverts:** the root PR targets `$WEB_PARENT` (repo default); the session branch is the base. See web-mode.md §5.
9. **worktrees/ must be in .gitignore** — worktrees are local only.
10. **Manager stays at repo root** — never cd into worktrees for git ops.
11. **Each child agent works in its worktree** — git ops affect that branch only.
12. **Quality assurance before pushing** — always run Step 9 after merging all topics. Mandatory, never skip.
13. **CI watch after pushing** — if the project has CI, invoke `/watch-ci` on the root PR (Step 12). Fix and re-push on red.
14. **Re-read the issue TODO after every step** — `gh issue view` to check the TODO checklist and confirm what comes next. Prevents forgetting steps during long workflows.
15. **Issue tracking by default** — create a GitHub issue with TODO checklist and comment progress at each step. Skip with `--no-issue`. Closing happens via `/cleanup-resources` at Step 16 (mandatory), not via a bespoke `gh issue close` call buried in the workflow tail. See Rule 27.
16. **pnpm worktree cleanup breaks symlinks** — Step 7 runs `pnpm install --ignore-scripts` to fix.
17. **NEVER auto-detect `-s` / `--stay`** — always create a new base branch unless explicitly passed. Do not infer from branch state, existing PRs, or context.
18. **Max 6 concurrent child agents** — Step 5 caps parallelism. With 7+ topics, queue the rest and spawn as earlier agents complete. **On web (web-mode.md §6) this cap is lifted** — fan out all topics in one batch (it is Mac-freeze protection, irrelevant in the cloud container).
19. **Playwright / browser tools go through an isolated one-shot Opus subagent** — see `references/resource-coordination.md`. Neither manager nor child may invoke browser tools directly. At most one browser-verification subagent alive at a time, sequential only.
20. **No heavy / port-based tests in child agents** — see `references/resource-coordination.md`. Children commit + report; manager runs sequentially on merged base. Legitimate short port-binding work uses `flock`.
21. **Auto-Suggest Next Command is MANDATORY for multi-session plans** — before STOP, if Signal A (Super-Epic) or Signal B (`--stay` accumulating-epic) applies, MUST print a copy-pasteable next command. The user should never have to type "give me next command" for a planned multi-session workflow.
22. **Super-Epic child sessions MUST merge the epic-PR into the super-epic base before STOP, then switch to the super-epic base and delete the local epic base** — see `references/super-epic-mode.md`. The mandatory merge step is unconditional in Super-Epic child mode, runs even if `-m` was passed. This rule OVERRIDES Rule 1's "stay on `base/<project-name>`" default.
23. **Execution mode is read from `/big-plan` annotations, not guessed** — when an `[Epic]` or Super-Epic child issue is the input, Step 1a extracts the per-topic `**Execution mode:** {subagents|teams}` markers and Step 5 routes accordingly. The **subagents path is the inline default** (it owns the canonical prompt body in Step 5 / Step 7); the **routing fallback when a marker is missing is teams** (preserves pre-annotation behavior). All-subagents → spawn one-shot Agent calls without TeamCreate (inline). Any-teams or any-missing → full team workflow in `references/teams-path.md`. The skill never auto-classifies execution mode itself — that decision belongs in `/big-plan`. Full routing logic, drift sanity check, and the subagents-path Agent-call shape live in `references/execution-modes.md`; the teams-path body lives in `references/teams-path.md`.
24. **Per-topic model is read from `/big-plan` annotations, with manual team-member flag override** — Step 1a extracts each topic's `**Model:** {opus|sonnet|haiku}` marker and Step 5 spawns each child with its own model. A manual `-t-op` / `-t-so` flag on the invocation OVERRIDES every topic's annotation as a session-wide manual override; without a flag, per-topic markers are honored. Default-when-missing-and-no-flag is **opus** (preserves pre-annotation behavior). Reviewer flags (`-op` / `-so` / `-haiku`) do NOT affect children — those govern the Step 9 Claude reviewer only. The skill never auto-classifies the model itself — that decision belongs in `/big-plan` or in the user's flag. Full resolution table and rationale: `references/per-topic-models.md`.
25. **`-a` / `--auto` auto-continues multi-wave plans in one session** — when `-a` is passed AND Auto-Suggest detected a next wave (Signal A or Signal B), the manager appends `-a` to the next-wave command (forwarding `-m` / `-nf` / `-nori` too) and invokes it immediately via the Skill tool instead of stopping. The chain keeps running until a future iteration finds no more siblings; if `-m` rode the chain, the merge runs at chain termination. Pause (soft-stop with hand-off + blocker note) on the conditions listed in the Auto-Suggest sub-section — never silently swallow a blocker to keep the chain going. Single-session runs and `-a`-less invocations are unaffected. (`-a` replaces the retired `-seq` flag; `-a` itself never merges — merging is `-m`'s job.)
26. **Dead Branch Cleanup Principle (general meta-rule)** — whenever this skill orchestrates a merge (or watches one) where the source branch's work is absorbed into a parent **and** the source remote is deleted (e.g., `gh pr merge --delete-branch`, `/pr-complete`, equivalent), the local source branch is now a dead pointer and MUST be cleaned up before session ends. Pattern:
1. Capture the dead branch name BEFORE switching off it: `DEAD_BRANCH=$(git branch --show-current)`
2. `git fetch origin --prune` to drop the now-deleted remote refs
3. `git checkout <parent-branch> && git pull origin <parent-branch>` to land on the absorbing branch
4. `git branch -d "$DEAD_BRANCH"` — use **`-d` NOT `-D`**. If unmerged commits, `-d` refuses; surface as a loud failure rather than silently destroy work with `-D`.

    Why mandatory: a dead local branch confuses the user — its remote is gone, its commits are already in the parent, future operations (push, fetch, rebase) will surprise them. Concrete instances: Super-Epic merge (Rule 22), Merge Mode after `/pr-complete` (Rule 1 exception (a)), the Step 17 deferred manual cleanup hook. Add this principle to any new merge-and-delete pattern in this skill. Does NOT apply to: branches whose remote is still alive (super-epic base accumulates more epics and stays live), the `--stay` accumulating-epic flow's epic base (PR is intentionally kept open), branches that haven't been merged. **As of Rule 27, the actual implementation of this cleanup is delegated to `/cleanup-resources` at Step 16 — hand-rolled `git branch -d` blocks should not be added; let cleanup-resources do it.**

27. **Cleanup audit via `/cleanup-resources` — mandatory before STOP** — every workflow MUST invoke `/cleanup-resources` at Step 16 unless `--no-issue` was used AND no branches were created (essentially never in practice). The Sonnet subagent re-fetches every resource the manifest names, returns a structured close/keep/delete plan, and the manager executes the safe actions. This is the single source of truth for "what gets closed / deleted at end of workflow" — do NOT scatter ad-hoc `gh issue close` or `git branch -d` calls earlier in the workflow that duplicate its job. Concrete bugs this rule fixes: (a) sub-issues staying open after their topic PRs merged because the manager forgot to close them mid-workflow, (b) the tracking issue silently staying open at the very end, (c) `-m` deleting the remote base via `--delete-branch` but leaving the local base around to confuse the user. Rule 26 (Dead Branch Cleanup Principle) is now implemented by this audit step rather than by hand-rolled cleanup blocks. **On web:** there is no `base/<topic>` and the session branch must survive (protected by name in the manifest) — the "(c)" leftover-base framing does not apply. See web-mode.md §5.

## Prerequisites

- `worktrees/` in `.gitignore`
- `gh` CLI authenticated
- `git` version 2.15+ (worktree support)
