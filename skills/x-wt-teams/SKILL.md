---
name: x-wt-teams
description: "Parallel multi-topic development using git worktrees, base branches, and Claude Code agent teams. Use when: (1) User wants to work on multiple related features in parallel, (2) User mentions 'worktree', 'base branch', 'parallel development', 'split into topics', or 'multi-topic'. FULLY AUTONOMOUS — creates worktrees, spawns teams, coordinates everything. Also supports Super-Epic child mode for [Epic] issues from /big-plan with '**Super-epic:** #N' markers (targets the super-epic base branch instead of main)."
argument-hint: "[-haiku|-so|-op] [-co|--codex] [-gco|--github-copilot] [-gcoc|--github-copilot-cheap] [-a|--auto] [--no-issue] [-s|--stay] [-l|--review-loop] [-v|--verify-ui] [-nor|--no-review] [--noi] [-noi|--no-raise-issues] [#issue-number] <instructions>"
---

# Git Worktree Multi-Topic Development

Coordinate parallel development of multiple related features using git worktrees, a shared base branch, and Claude Code agent teams. **This is fully automated** — you (the manager) create the infrastructure and spawn child agents to do the work. Never ask the user to manually start sessions in worktrees.

## References

Detail lives in `references/` so this file stays a workflow spine. Open the relevant reference whenever the workflow touches its topic — these are not optional:

- **`references/arguments.md`** — every flag (model, backend, `-s` / `-a` / `--no-review`, etc.), how they combine, manager-invariant rule.
- **`references/super-epic-mode.md`** — Super-Epic child mode lifecycle: detection markers, Step 1a / Step 2 overrides, mandatory epic-PR merge, Auto-Suggest variant, why `-a` is ignored.
- **`references/reviewer-modes.md`** — `-co` / `-gco` / `-gcoc` substitution tables and Combined Reviewer Mode (run all selected backends).
- **`references/execution-modes.md`** — subagents vs teams routing: how `/big-plan`'s `Execution mode:` markers are read, default-to-teams fallback, mixed-mode degradation, Step 5 / Step 7 path differences, drift sanity check.
- **`references/per-topic-models.md`** — per-topic Claude model resolution: how `/big-plan`'s `Model:` markers are read, manual `-haiku`/`-so`/`-op` flag override, per-topic model assignment in spawn calls, default-to-opus fallback.
- **`references/issue-templates.md`** — tracking issue body, claim comments, unrelated-findings issue, Step 14 session report, Step 15 verification comments, accumulating-epic Auto-Suggest hand-off.
- **`references/resource-coordination.md`** — Playwright / browser isolation rule and port-binding `flock` rule (full patterns).

## !! CRITICAL — ROOT PR TARGET BRANCH RULE !!

**The root PR's base MUST be the current (invocation) branch, NOT the repository's default branch.**

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

## SendMessage Content — No Markdown Code Spans (Ink Crash Workaround)

**HARD RULE**: Every `SendMessage` tool call — manager → child, child → manager, or peer → peer — MUST use plain prose in the `message` content. No backticks, no triple-backtick code fences, no inline markdown code formatting of any kind. Reference file paths, function names, shell commands, and identifiers as unquoted words.

**Why**: Claude Code v2.1.117 has an unfixed Ink rendering bug ([anthropics/claude-code#51855](https://github.com/anthropics/claude-code/issues/51855)). When a teammate's message contains inline code spans, Claude Code's `※ recap:` summary line crashes with `<Box> can't be nested inside <Text>` at `createInstance` (`cli.js:495:249`). The crashed pane then tears down the whole `$HOME/.claude/teams/<name>/` directory, cascading to all other teammates. In a 6-way parallel workflow, one stray backtick in one message can kill the entire run. Receive-side stalls have also been observed, so the rule applies in both directions.

**Examples:**

- Bad: "Committed the fix to `src/api.ts` — run `pnpm test` to verify"
- Good: "Committed the fix to src/api.ts — run pnpm test to verify"
- Bad: triple-backtick fenced diff or code block inside the message
- Good: "See the log file at {logdir}/… for the diff"

**Scope**: Applies ONLY to `SendMessage` tool calls. Markdown (including backticks and code fences) is still fine everywhere else — commits, PR bodies, issue comments, log files, TaskCreate descriptions, source code. When the upstream bug is fixed, revisit and drop this workaround.

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
5. Use TeamCreate + Task tool to spawn child agents in worktrees (NO pushing during implementation — commit only)
6. Monitor child agents, review their PRs, merge into base
7. Shut down child agents — close tmux panes, TeamDelete
8. Sync local base branch
9. Quality assurance: `/deep-review` (default) or `/review-loop 5 --aggressive` (if `-l`/`--review-loop`)
10. Verify UI: `/verify-ui` (if `-v`/`--verify-ui`)
11. Push all changes to remote
12. CI watch: verify CI passes on root PR (invoke `/watch-ci`, fix if red)
13. Update root PR and mark ready
14. Session report
15. Requirements verification (if issue linked) — **STOP HERE. Workflow ends.**
16. _(DEFERRED — only when user asks, after PR is merged)_ Clean up worktrees and branches

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
- **Dependency order** — respect the dependency graph; start with independent topics first
- **Execution mode per topic** — extract the `**Execution mode:** {subagents|teams}` marker from each `[Sub]` issue body (or each inline sub-task in Super-Epic mode). This drives Step 5's spawn path. See `references/execution-modes.md` for the parsing logic, default-to-teams fallback, and mixed-mode degradation rule.
- **Model per topic** — extract the `**Model:** {opus|sonnet|haiku}` marker from each `[Sub]` issue body (or each inline sub-task in Super-Epic mode). This drives the per-child model assignment in Step 5. A manual `-haiku` / `-so` / `-op` flag on this invocation OVERRIDES per-topic markers session-wide. Default-when-missing-and-no-flag: `opus`. See `references/per-topic-models.md` for the resolution table.

Do NOT re-plan or re-analyze. Do NOT update the epic issue body. Proceed to Step 2 with the extracted topics, base branch, and per-topic execution mode.

**Super-Epic child mode** — if the epic body also contains `**Super-epic:** #N` (and the two related markers), this is a Super-Epic child session. Apply ALL Step 1a / Step 2 overrides from `references/super-epic-mode.md`: parent branch is the super-epic base (NOT invocation branch), `EPIC_BASE` is verbatim from the marker, topics come from inline sub-tasks, super-epic base existence is verified, and `SUPER_EPIC_NUMBER` / `SUPER_EPIC_BASE` / `EPIC_BASE` are captured for later steps.

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

### Manager invariant & reviewer-mode flags

**The manager session is ALWAYS Opus.** Model flags (`-haiku` / `-so` / `-op`) do NOT downgrade the manager. When a flag is present, it acts as a session-wide manual override for child delegation, replacing any per-topic `Model:` annotations from `/big-plan`. When no flag is present, each child's model is resolved per-topic from the annotation (default `opus`). See `references/arguments.md` for the four delegation points and `references/per-topic-models.md` for the override + per-topic resolution.

`-co` / `-gco` / `-gcoc` substitute reviewers, 2nd-opinions, and research/writer tools throughout the workflow. Multiple backend flags can be combined (run them all, never pick one). Full substitution tables and Combined Reviewer Mode rules: `references/reviewer-modes.md`.

### Step 2: Create Base Branch and Root PR

**CRITICAL: `-s` / `--stay` is STRICTLY opt-in.** Only use the `--stay` flow if the user explicitly passed `-s` or `--stay`. Do NOT auto-detect. Default ALWAYS creates a new branch — even if the current branch has an existing PR. See `references/arguments.md` for the full `--stay` mechanism.

**Super-Epic child mode**: parent branch is `$SUPER_EPIC_BASE`, base branch is `$EPIC_BASE` verbatim (from the marker). Root PR targets `$SUPER_EPIC_BASE`. See `references/super-epic-mode.md`.

#### Default flow (no `--stay`) — ALWAYS used unless `-s` / `--stay` explicitly passed

Base branch is created from the currently checked-out branch; that branch becomes the root-PR target. True regardless of whether it has an existing PR.

```bash
INVOCATION_BRANCH=$(git branch --show-current)  # Record before any checkout
```

**Determine `<parent-branch>`**: If the user specified one, use it. Otherwise default to `INVOCATION_BRANCH`.

**CRITICAL**: Create the root PR immediately with an empty commit. This locks in the correct parent branch from the start.

```bash
git checkout <parent-branch>
git pull origin <parent-branch>

git checkout -b base/<project-name>

git commit --allow-empty -m "= start <project-name> dev ="
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

Before any TeamCreate or Agent call, decide whether this session uses **teams** (default, current behavior) or **subagents** based on the per-topic execution-mode markers extracted in Step 1a:

- All topics marked `subagents` → **subagents path** (skip TeamCreate; spawn each topic as a one-shot Agent call).
- Any topic marked `teams`, OR any topic missing the marker → **teams path** (full team workflow below).

Tell the user which path was chosen with one line: which path, and why (e.g. "Execution mode: subagents (all 3 topics marked subagents)" or "Execution mode: teams (no `Execution mode` markers found — defaulting to teams)"). Then run a brief drift sanity check per topic.

Full routing logic, marker grep patterns, drift sanity check, and the subagents-path Step 5 / Step 7 behavior live in `references/execution-modes.md` — read it once when the spawn path resolves to subagents, or when any marker is ambiguous.

#### Resolve model per topic

The downstream child model is **per-topic**, not session-wide. Resolve in this order:

1. **Manual flag override** — if the invocation has `-haiku`, `-so`, or `-op`, that flag applies to ALL topics. This is a deliberate manual override; the per-topic markers are ignored. Tell the user explicitly: "Manual override: all topics use {model} (-{flag})."
2. **Per-topic annotation** — otherwise, use the `**Model:**` marker extracted from each topic's `[Sub]` issue body (or inline sub-task) in Step 1a.
3. **Default** — if a topic has no marker AND no flag was passed, default to `opus`.

Tell the user the resolution before spawning, e.g. "Models per topic: topicA=opus, topicB=sonnet, topicC=opus." When children spawn (either path), set each one's model parameter to its own resolved value — children in the same session may run different models, that's fine.

Full table and rationale: `references/per-topic-models.md`.

#### Teams path (default)

Use TeamCreate to create a team, then the Task tool to spawn child agents — one per topic. Each agent works in its own worktree directory.

```
1. TeamCreate with team_name: "<project-name>"
2. TaskCreate for each topic (implementation tasks)
3. Task tool to spawn agents with:
   - subagent_type: "frontend-worktree-child" (or "general-purpose" for non-frontend topics)
   - team_name: "<project-name>"
   - name: "topic-<name>"  (e.g., "topic-topicA")
   - (Do NOT pass a `mode:` param. Agent-team teammates inherit the lead's permission mode at spawn
     time; per-teammate modes cannot be set. Permission prompts on file edits are handled by the
     PreToolUse hook at $HOME/.claude/hooks/allow-worktree-teammate-edits.sh, which auto-approves
     Edit/Write/NotebookEdit when either the session cwd or the target file path sits under a
     worktrees/<topic>/ segment. Confirm the hook is registered in settings.json before first use.)
   - model: the per-topic resolved model — see "Resolve model per topic" above. Always set explicitly per child; different children in the same session may run different models.
   - prompt: Detailed instructions including:
     a. The worktree absolute path to work in
     b. What to implement for this topic
     c. Branch name: <project-name>/<topic-name>
     d. Base branch: base/<project-name>
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
     i. NO BACKTICKS / CODE FENCES IN SendMessage. When reporting via SendMessage, message content
        must be plain prose. Markdown is still fine in commits, PR bodies, issue comments, log
        files, source code — just not in SendMessage. See "SendMessage Content" rule above.
     j. REBUILD TOUCHED WORKSPACE PACKAGES BEFORE REPORTING DONE. If the project has a workspace/
        monorepo layout and commits touched source inside a package whose consumer imports through
        a built artifact (e.g. an `exports` map → ./dist/...), the agent MUST rebuild that package
        and commit the build output before declaring done. Editing source without rebuilding leaves
        the consumer loading stale compiled output. Defer to project CLAUDE.md for workspace root
        and rebuild command. Skip silently only if the touched package has no build script or its
        build output is gitignored AND consumers import from source. A failed build is a blocker.
```

**Spawn child agents in parallel — capped at 6 concurrent.** Use multiple Task tool calls in a single message for the first batch. Each agent should:

1. Work in its assigned worktree directory
2. Implement the topic
3. **Commit changes locally only — DO NOT push** (deferred to Step 11)
4. **Run `/light-review`** to self-review — fix clearly useful findings and commit. Forward whichever `-co` / `-gco` / `-gcoc` backend flags were on the original invocation. If no backend flag is active, `/light-review` falls to its own default (`-gcoc`).
5. Save a log to `{logdir}/` (the agent's log-writing constraint handles this)
6. (If issue tracking is active) Comment on the tracking issue with a brief completion note
7. **Report back with brief message only**: status (1-2 sentences), PR URL if created, log file path. No backticks / code fences in SendMessage.

#### Concurrency Limit: Max 6 Child Agents at Once

**CPU load protection**: Never run more than **6 child agents concurrently**. Running 7+ parallel agents overloads the local machine.

- **6 or fewer topics**: Spawn all in parallel.
- **7+ topics**: Spawn the first 6 in parallel, queue the rest. As each active agent completes and reports back, spawn the next queued topic. Continue until the queue is empty.

The active agent count stays at ≤6 at all times.

### Step 6: Review and Merge Topic Branches Locally

Children committed locally without pushing. Merge their branches into base **locally** with git:

```bash
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

### Step 7: Shut Down Child Agents and Remove Worktrees

All child agents are done; their branches are merged. Clean up worktrees and (if a team was created in Step 5) shut the team down.

**Subagents path**: skip steps 1 and 2 below entirely — there is no team. One-shot Agent calls already terminated when each returned. Jump straight to step 3 (worktree removal).

1. **(Teams path only)** **Send shutdown to each agent individually** (structured messages cannot be broadcast to `"*"`):

   ```
   For each child agent (e.g., "topic-topicA", "topic-topicB", ...):
     SendMessage: to="topic-<name>", message={type: "shutdown_request", reason: "All topics merged into base branch. Work complete."}
   ```

   Send all shutdown messages in parallel (multiple SendMessage calls in one response).

2. **(Teams path only)** **Wait for shutdown confirmations**, then **delete the team**:

   ```
   TeamDelete
   ```

3. **Remove worktrees** — they are no longer needed (topic branches survive independently):

   ```bash
   for wt in worktrees/*/; do
     git worktree remove "$wt"
   done
   ```

4. **Fix pnpm symlinks** if the project uses pnpm workspaces (worktree removal can break symlinks):

   ```bash
   pnpm install --ignore-scripts 2>/dev/null || true
   ```

This closes the tmux panes and frees disk space. The rest of the workflow (review, push, CI) is handled by the manager alone.

### Step 8: Sync Local Base Branch

Ensure the base branch is up to date with any remote changes:

```bash
git fetch origin base/<project-name>
git merge origin/base/<project-name>
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

This flag's purpose: when `/deep-review -t` (default team-fix path) spawns a child `/x-wt-teams --no-review --stay` to apply fixes, the child must NOT run `/deep-review` again — that would loop forever. Manual users almost never pass this. See `references/arguments.md`.

#### Review Loop Mode (`-l` / `--review-loop`)

If `-l` was passed (and `--no-review` was NOT), invoke `/review-loop 5 --aggressive --issues` instead of `/deep-review`. If `--noi` / `--noissue` / `--noissues` was also passed, omit `--issues`:

```
Skill tool: skill="review-loop", args="5 --aggressive --issues"
# or without --issues if --noi was passed:
Skill tool: skill="review-loop", args="5 --aggressive"
```

#### Default Mode

If neither flag was passed, invoke `/deep-review`:

```
Skill tool: skill="deep-review"
```

`/deep-review` defaults to `-t` team-fix mode — it handles its own fix delegation by spawning a fresh `/x-wt-teams --no-review --stay`, applying fixes, committing, merging back into `base/<project-name>`, pushing, and running `/pr-revise`. By the time `/deep-review` returns, fixes are already committed and pushed. You do NOT need to create a fix issue, spawn an Agent, or call `/pr-revise` from this step.

For the legacy inline-fix flow (manager applies fixes in own context, no nested team), use `/deep-review -nt`.

#### Reviewer-mode substitution

If `-co` / `-gco` / `-gcoc` is active, substitute the reviewer skill: `/codex-review` / `/gco-review` / `/gcoc-review`. With multiple flags, run all selected backends sequentially and merge findings. Full rules: `references/reviewer-modes.md`.

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

```bash
# Push the base branch (contains all merged topic work + review fixes)
git push origin base/<project-name>

# Push topic branches so PRs can be created for documentation
for branch in <project-name>/topicA <project-name>/topicB <project-name>/topicC; do
  git push origin "$branch"
done
```

After pushing, create topic PRs for documentation/tracking, close them, then **immediately delete topic branches**.

**IMPORTANT**: Topic branches are already merged locally into base (Step 6). If the remote base already contains the topic commits, `gh pr create` fails with "No commits between base and head". Always guard against this — check if the PR was actually created before trying to close it. **Never call `gh pr close` with an empty PR number** — `gh` will default to closing the current branch's PR (the root PR), which is destructive.

```bash
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

**This step always runs in Super-Epic child mode, regardless of `-a` / `--auto`.** `-a` is intentionally ignored in Super-Epic mode (see "Auto-Complete Mode" below for the rationale) — do NOT skip this mandatory merge thinking `/pr-complete` will handle it.

**Why mandatory:** A super-epic stacks many epic-PRs on the same super-epic base. If an epic-PR is left open at STOP, the next epic session branches off a stale super-epic base, sibling epic-PRs collide, and the super-PR never converges. Each epic session must merge its own epic-PR before STOP — no exceptions.

The merge has 5 sub-steps: re-confirm CI green, `gh pr merge --merge --delete-branch`, comment on the super-epic issue (do NOT close it), and switch to the super-epic base while deleting the now-dead local epic base. Full sequence with the exact commands and Dead Branch Cleanup details: **`references/super-epic-mode.md`**.

After this step, proceed to Close Tracking Issue → Auto-Suggest Next Command (Super-Epic variant) → STOP.

---

### Auto-Complete Mode (`-a` / `--auto`)

**Only run if `-a` or `--auto` was passed AND this session is NOT Super-Epic child mode.** Otherwise skip to STOP.

**Why `-a` is ignored in Super-Epic child mode:** The mandatory merge step above already merges the epic-PR into the super-epic base — the only merge a Super-Epic child session is responsible for. `-a` is redundant there and is also semantically misleading (a user might read "auto-merge" as "also merge the super-epic base into main," which this skill never does). Full rationale in `references/super-epic-mode.md`.

After Step 15 passes, automatically invoke `/pr-complete -c -w` to:

1. Wait for CI checks to pass
2. Merge the root PR (`--merge --delete-branch`)
3. Close the linked issue (`-c`)
4. Watch post-merge CI on the target branch (`-w`)

Intended for safe-to-merge, fully automated workflows. If CI fails or the PR cannot be merged, `/pr-complete` handles error reporting.

**After `/pr-complete` succeeds**, apply the Dead Branch Cleanup Principle (Important Rule 25): checkout the merged target branch, pull, and `git branch -d` the now-dead local source branch:

```bash
TARGET_BRANCH=$(gh pr view <root-pr-number> --json baseRefName -q '.baseRefName')

DEAD_SOURCE_BRANCH=$(git branch --show-current)

git checkout "$TARGET_BRANCH"
git pull origin "$TARGET_BRANCH"

# Use -d (NOT -D). If unmerged commits exist, surface as a loud failure rather than silently destroy.
if [ "$DEAD_SOURCE_BRANCH" != "$TARGET_BRANCH" ]; then
  git branch -d "$DEAD_SOURCE_BRANCH"
fi
```

If `git branch -d` fails (unmerged commits), do NOT force with `-D`. Stop and report.

This leaves the user on the up-to-date target branch (e.g., `main`) after a fully automated workflow, with no dead local branch left behind.

---

### Raising Issues for Unrelated Findings (Default Behavior)

During coding and reviewing (manager and child agents), you may discover problems **unrelated to the original topic** — pre-existing bugs, code smells in adjacent files, outdated dependencies, etc. By default, **always raise these as separate GitHub issues** so they are tracked and not lost.

**When to raise:**

- A reviewer flags a problem in code NOT modified by this workflow
- You or a child notices a bug or quality issue in adjacent code while implementing
- A pre-existing test failure or lint warning is discovered
- Any problem clearly outside the scope of the current task

**How to raise:** see the unrelated-findings template in `references/issue-templates.md`.

**Suppressing with `--no-raise-issues` / `-noi`:** Ignore unrelated findings and focus only on the original task. Pass this flag context to child agents so they skip too.

---

### Close Tracking Issue

**Always close the tracking issue when the workflow ends** (unless `--no-issue` was used). The tracking issue is a workflow log — it has served its purpose.

```bash
gh issue close "$ISSUE_NUMBER" --comment "Workflow complete. Root PR: <ROOT_PR_URL>"
```

If problems were discovered that need follow-up, raise them as **separate issues** before closing the tracking issue.

**Exception**: If the user provided the issue (not created by this workflow), do NOT close it.

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

---

### STOP — WORKFLOW ENDS HERE

**After the tracking issue is closed (or skipped), auto-complete finishes (if applicable), AND the Auto-Suggest Next Command step has run (whenever its signals matched), the automated workflow is DONE.** Report the root PR URL and wait for user response.

**Before printing the final "workflow complete" block, verify Auto-Suggest ran if its signals applied.** If Signal A or Signal B matched and you did NOT yet print a hand-off, go back and print it now. The user should NEVER have to type "give me next command" for a planned multi-session workflow.

**CRITICAL RULES at this point:**

- **If `-a` / `--auto` was used and the PR was merged**: You are already on the target branch (e.g., `main`) after the auto-complete checkout+pull. Stay there.
- **If Super-Epic child mode** (any epic — not just the last): You are already on the super-epic base after the merge step's branch-cleanup. Stay there. The local epic base is already deleted; do not try to switch back to it.
- **Otherwise (non-Super-Epic, non-`-a`)**: **Stay on `base/<project-name>`.** Do NOT checkout `main`, the parent branch, or any other branch.
- **Do NOT run Step 16** (unless `-a` was used and the PR is merged). Step 16 is cleanup that only happens later, after the user has reviewed and merged the PR.
- **Do NOT delete any branches** (local or remote) unless `-a` was used (the merge branch is already deleted by `--delete-branch`) or unless this is Super-Epic child mode (the local epic base was already deleted by the merge step). Beyond those, leave branches alone.
- **Do NOT do anything else** unless the user asks.

The user will review the PR and may:

1. **Provide feedback** — see "Feedback Loop" below. Handle it automatically.
2. **Merge the PR** — then Step 16 can be run if the user asks.

---

### Feedback Loop: Iterating on User Feedback

After you report the root PR, the user often replies with feedback — requests for changes, fixes, or improvements. Range: small single-file tweaks to substantial multi-area rework.

**When user feedback is received, re-run Steps 3–14 using `--stay` semantics on the existing base branch.** This spins up new agent teams to implement the fixes following the same workflow. Base branch and root PR already exist — no need to recreate.

#### How it works

1. **Analyze the feedback** — break into discrete topics. Each heading, bullet group, or distinct concern becomes a topic. Single small concern is fine as one topic.
2. **Create new worktrees and topic branches** off the existing base branch (Step 3).
3. **Spawn new child agent teams** (Steps 4–5):
- Use `TeamCreate` with an incremented team name: `<project-name>-v2`, `<project-name>-v3`, etc.
- New topic branches: `<project-name>/<new-topic-name>`
- New worktrees: `worktrees/<new-topic-name>`
- Include the user's feedback verbatim in child agent prompts.
4. **Same workflow**: merge topics → shut down agents → sync → deep review → push → CI watch → update PR (Steps 6–14).
5. **Report back** and wait for the next round.

#### Key points

- **No new base branch or root PR** — reuse what already exists. The root PR accumulates iterations.
- **New team name per iteration** — `-v2`, `-v3`, etc. to avoid team-name collisions.
- **Issue tracking continues** — comment on the issue with iteration progress if `ISSUE_NUMBER` is set.
- **Repeat as needed** — each round of feedback triggers a new iteration. Loop continues until the user is satisfied and merges the PR.
- **Small feedback** still uses this pattern — even a single-topic fix benefits from worktree isolation, review, CI check.

---

### Step 16: Cleanup (ONLY when user asks, after PR is merged)

**NEVER run this step automatically.** Only run when the user explicitly asks to clean up after the root PR has been merged.

By this point, worktrees (Step 7) and topic branches (Step 11) are already cleaned up. Only the base branch remains. This is also a Dead Branch Cleanup case — the merged PR's `--delete-branch` removed the remote, so the local `base/<project-name>` is a dead pointer.

```bash
# If the user is still on the dying branch, switch to the parent first —
# `git branch -d` cannot delete the currently checked-out branch.
CURRENT=$(git branch --show-current)
if [ "$CURRENT" = "base/<project-name>" ]; then
  git fetch origin --prune
  git checkout <parent-branch>
  git pull origin <parent-branch>
fi

# Use -d (NOT -D) — surface unmerged commits as a loud failure rather than silently destroy.
git branch -d base/<project-name>

# Delete the remote branch only if it still exists (Auto-Complete Mode and Super-Epic merge already
# deleted it — defensive check).
git push origin --delete base/<project-name> 2>/dev/null || true
```

If `git branch -d` fails on unmerged commits, do NOT force with `-D`. Stop and ask the user to investigate.

## Branch Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Base branch | `base/<project>` | `base/marker-fix` |
| Topic branch | `<project>/<topic>` | `marker-fix/bogaudio-knobs` |
| Worktree dir | `worktrees/<topic>` | `worktrees/bogaudio-knobs` |

## Important Rules

1. **NEVER checkout main or parent branch** — after the workflow completes (Step 13), stay on `base/<project-name>`. Do NOT switch branches, do NOT delete branches, do NOT run Step 16. Workflow ends at Step 15. **Exceptions** (all instances of Rule 25 Dead Branch Cleanup): (a) `-a` / `--auto` and PR merged → checkout the target branch, pull, `git branch -d` the now-dead local `base/<project-name>`. (b) **Super-Epic child mode** → ALWAYS check out `$SUPER_EPIC_BASE` and delete the now-dead local epic base after the mandatory epic-PR merge. Unconditional in Super-Epic child mode (whether or not it's the last epic). Performed by step 5 of `references/super-epic-mode.md`.
2. **Fully autonomous** — never ask the user to manually start sessions or cd into worktrees. Use Task tool to spawn agents.
3. **Always pull the parent branch before creating the base branch** — stale bases cause conflicts.
4. **Create the root PR immediately in Step 2** — empty commit + draft PR locks in the correct parent branch.
5. **Never force push** — regular merge only, preserves history.
6. **Push-forbid during work** — child agents commit locally only. All pushing happens in Step 11 after deep review. Saves CI resources.
7. **Topic branches merge locally first** — manager merges via `git merge`, not GitHub PR merge. Topic branches are pushed later for documentation only.
8. **Root PR targets the parent branch** — handled automatically by creating it in Step 2. Super-Epic child sessions target the super-epic base; see `references/super-epic-mode.md`.
9. **worktrees/ must be in .gitignore** — worktrees are local only.
10. **Manager stays at repo root** — never cd into worktrees for git ops.
11. **Each child agent works in its worktree** — git ops affect that branch only.
12. **Quality assurance before pushing** — always run Step 9 after merging all topics. Mandatory, never skip.
13. **CI watch after pushing** — if the project has CI, invoke `/watch-ci` on the root PR (Step 12). Fix and re-push on red.
14. **Re-read the issue TODO after every step** — `gh issue view` to check the TODO checklist and confirm what comes next. Prevents forgetting steps during long workflows.
15. **Issue tracking by default** — create a GitHub issue with TODO checklist and comment progress at each step. Skip with `--no-issue`. Close when the root PR is merged.
16. **pnpm worktree cleanup breaks symlinks** — Step 7 runs `pnpm install --ignore-scripts` to fix.
17. **NEVER auto-detect `-s` / `--stay`** — always create a new base branch unless explicitly passed. Do not infer from branch state, existing PRs, or context.
18. **Max 6 concurrent child agents** — Step 5 caps parallelism. With 7+ topics, queue the rest and spawn as earlier agents complete.
19. **Playwright / browser tools go through an isolated one-shot Opus subagent** — see `references/resource-coordination.md`. Neither manager nor child may invoke browser tools directly. At most one browser-verification subagent alive at a time, sequential only.
20. **No heavy / port-based tests in child agents** — see `references/resource-coordination.md`. Children commit + report; manager runs sequentially on merged base. Legitimate short port-binding work uses `flock`.
21. **Auto-Suggest Next Command is MANDATORY for multi-session plans** — before STOP, if Signal A (Super-Epic) or Signal B (`--stay` accumulating-epic) applies, MUST print a copy-pasteable next command. The user should never have to type "give me next command" for a planned multi-session workflow.
22. **Super-Epic child sessions MUST merge the epic-PR into the super-epic base before STOP, then switch to the super-epic base and delete the local epic base** — see `references/super-epic-mode.md`. The mandatory merge step is unconditional in Super-Epic child mode, runs even if `-a` was passed. This rule OVERRIDES Rule 1's "stay on `base/<project-name>`" default.
23. **Execution mode is read from `/big-plan` annotations, not guessed** — when an `[Epic]` or Super-Epic child issue is the input, Step 1a extracts the per-topic `**Execution mode:** {subagents|teams}` markers and Step 5 routes accordingly. Default-when-missing is **teams** (preserves pre-annotation behavior). All-subagents → spawn one-shot Agent calls without TeamCreate. Any-teams or any-missing → full team workflow. The skill never auto-classifies execution mode itself — that decision belongs in `/big-plan`. Full routing logic, drift sanity check, and subagent-path differences live in `references/execution-modes.md`.
24. **Per-topic model is read from `/big-plan` annotations, with manual flag override** — Step 1a extracts each topic's `**Model:** {opus|sonnet|haiku}` marker and Step 5 spawns each child with its own model. A manual `-haiku` / `-so` / `-op` flag on the invocation OVERRIDES every topic's annotation as a session-wide manual override; without a flag, per-topic markers are honored. Default-when-missing-and-no-flag is **opus** (preserves pre-annotation behavior). The skill never auto-classifies the model itself — that decision belongs in `/big-plan` or in the user's flag. Full resolution table and rationale: `references/per-topic-models.md`.
25. **Dead Branch Cleanup Principle (general meta-rule)** — whenever this skill orchestrates a merge (or watches one) where the source branch's work is absorbed into a parent **and** the source remote is deleted (e.g., `gh pr merge --delete-branch`, `/pr-complete`, equivalent), the local source branch is now a dead pointer and MUST be cleaned up before session ends. Pattern:

1. Capture the dead branch name BEFORE switching off it: `DEAD_BRANCH=$(git branch --show-current)`
2. `git fetch origin --prune` to drop the now-deleted remote refs
3. `git checkout <parent-branch> && git pull origin <parent-branch>` to land on the absorbing branch
4. `git branch -d "$DEAD_BRANCH"` — use **`-d` NOT `-D`**. If unmerged commits, `-d` refuses; surface as a loud failure rather than silently destroy work with `-D`.

    Why mandatory: a dead local branch confuses the user — its remote is gone, its commits are already in the parent, future operations (push, fetch, rebase) will surprise them. Concrete instances: Super-Epic merge (Rule 22), Auto-Complete after `/pr-complete` (Rule 1 exception (a)), Step 16 manual cleanup. Add this principle to any new merge-and-delete pattern in this skill. Does NOT apply to: branches whose remote is still alive (super-epic base accumulates more epics and stays live), the `--stay` accumulating-epic flow's epic base (PR is intentionally kept open), branches that haven't been merged.

## Prerequisites

- `worktrees/` in `.gitignore`
- `gh` CLI authenticated
- `git` version 2.15+ (worktree support)
