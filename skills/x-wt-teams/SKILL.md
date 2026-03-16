---
name: x-wt-teams
description: >-
  Parallel multi-topic development using git worktrees with a base branch strategy and Claude Code
  agent teams. Use when: (1) User wants to work on multiple related features in parallel, (2) User
  mentions 'worktree', 'base branch', or 'parallel development', (3) User says 'split into topics'
  or 'multi-topic development'. This skill is FULLY AUTONOMOUS — it creates worktrees, spawns agent
  teams, and coordinates everything automatically. No manual child sessions needed.
argument-hint: "[--no-issue] [--stay] [#issue-number] <instructions>"
---

# Git Worktree Multi-Topic Development

Coordinate parallel development of multiple related features using git worktrees, a shared base branch, and Claude Code agent teams. **This is fully automated** — you (the manager) create the infrastructure and spawn child agents to do the work. Never ask the user to manually start sessions in worktrees.

## GitHub Issue Tracking (Default)

By default, create a GitHub issue at the start to track progress. The manager and child agents comment on this issue at the end of each step, providing a running log of progress.

- **`--no-issue`**: Skip issue creation. Also skip if the user explicitly says not to create an issue.
- **`--stay`**: Use the current branch as the base branch instead of creating a new one. See "Using `--stay`" below.
- **Existing issue provided**: If the user provides an existing issue (number or URL), read it first with `gh issue view <number>`. The issue body typically contains implementation instructions or a prompt — use it as the primary input for planning topics and development. Reuse this issue for progress logging instead of creating a new one.
- The issue number is passed to all child agents so they can comment on it too.
- Comments should be concise step reports (what was done, outcome, any issues encountered).

### Using `--stay`

When `--stay` is passed, the current branch is reused as the base branch — no new `base/<project-name>` branch is created. This avoids deep nesting when running `/x-wt-teams` multiple times in sequence.

**Typical scenario:**

1. First round: `/x-wt-teams` creates `base/foo-impl` → `main`, work is done, PR merged
2. Need more tweaks — you're still on `base/foo-impl`
3. Without `--stay`: creates `base/foo-impl-v2` → `base/foo-impl` → `main` (too nested)
4. With `--stay`: reuses `base/foo-impl` as the base, topics branch off it, root PR targets `main`

**How it works:**

- The current branch becomes `BASE_BRANCH` directly (no new branch, no empty commit)
- The parent branch (for the root PR target) is determined by:
  1. Checking if a PR already exists for this branch: `gh pr view --json baseRefName -q '.baseRefName'`
  2. If yes, reuse that PR (record its number) and use its base as the parent branch
  3. If no PR exists, use the repository's default branch as the parent and create a new root PR
- Topics branch off `BASE_BRANCH` and merge back into it as usual
- Everything else (worktrees, child agents, review, push) works the same

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

## PR Body Reference Header

When creating any PR (`gh pr create`), check for parent references and prepend a header to the PR body. This identifies what the PR belongs to.

**For the root PR (Step 2):**

1. **Parent issue**: Use `ISSUE_NUMBER` if set
2. **Parent PR**: Check if the parent branch has an open PR:
   ```bash
   PARENT_PR_NUM=$(gh pr list --head "$PARENT_BRANCH" --json number -q '.[0].number' 2>/dev/null)
   ```
   (When using `--stay`, check for a parent PR on `PARENT_BRANCH`, not the current branch itself.)

**For topic PRs (Step 9):**

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
6.5. Shut down child agents — close tmux panes, TeamDelete
7. Sync local base branch
8. Quality assurance: local review (`/local-review`)
9. Push all changes to remote
10. CI watch: verify CI passes on root PR (invoke `/watch-ci`, fix if red)
11. Update root PR and mark ready — **STOP HERE. Workflow ends.**
12. _(DEFERRED — only when user asks, after PR is merged)_ Clean up worktrees and branches

**PUSH-FORBID DURING WORK**: To save CI resources, child agents must **NOT push** during implementation. They commit locally only. All pushing happens in Step 9 after local review is complete. This prevents CI from running on every intermediate commit.

**Never ask the user to manually cd into worktrees or start Claude sessions.** Use the Task tool to spawn agents that work in each worktree directory.

### Step 1: Resolve GitHub Tracking Issue

There are three modes depending on user input:

#### 1a: Existing issue provided

If the user provides an existing issue number or URL, **read it first** — it usually contains implementation instructions or a prompt:

```bash
gh issue view <number>
```

Use the issue body as the primary input for planning topics and the development approach. Set `ISSUE_NUMBER=<number>` and reuse this issue for progress logging (no new issue needed).

**Update the issue body** with `gh issue edit` to add:
1. A **Summary** section (if missing) — write 2-4 sentences explaining what this implementation does and why, based on the user's instructions and your planned approach
2. A **Topics** section listing each topic with a 1-sentence description
3. A **TODO checklist** of workflow steps (same as in 1b)

This ensures the issue serves as a spec tracker that clearly communicates the implementation scope.

#### 1b: Create new issue (default)

Unless `--no-issue` is passed or the user explicitly says not to create an issue, create a new GitHub issue to track progress. **The issue serves as a spec tracker** — it should clearly communicate what is being implemented and why, not just log steps.

**Before creating the issue**, analyze the user's instructions and plan the topics. Then write a concise but informative summary that answers: "What are we doing and why?" This summary should be enough for someone unfamiliar with the task to understand the scope. Not too detailed (that's for the PR), not too brief (that's useless).

```bash
ISSUE_URL=$(gh issue create \
  --title "<project-name>: <concise description of what's being done>" \
  --body "$(cat <<'EOF'
## Summary

<2-4 sentences explaining what this implementation does and why. What problem does it solve? What's the approach?>

### Topics

- **<topic-A>**: <1 sentence — what this topic covers>
- **<topic-B>**: <1 sentence — what this topic covers>

### TODO
- [ ] Step 1: Resolve GitHub tracking issue
- [ ] Step 2: Create base branch and root PR
- [ ] Step 3: Create worktrees
- [ ] Step 4: Environment setup
- [ ] Step 5: Spawn child agents (implementation)
- [ ] Step 6: Review and merge topic PRs
- [ ] Step 6.5: Shut down child agents
- [ ] Step 7: Sync local base branch
- [ ] Step 8: Quality assurance (local review)
- [ ] Step 9: Push all changes to remote
- [ ] Step 10: CI watch (verify CI passes)
- [ ] Step 11: Update root PR and mark ready
- [ ] Step 12: Cleanup

### Progress Log
Comments below contain step-by-step progress reports.
EOF
)")
ISSUE_NUMBER=$(echo "$ISSUE_URL" | grep -o '[0-9]*$')
```

#### 1c: No issue (`--no-issue`)

Skip issue creation entirely. All `gh issue comment` calls throughout the workflow are skipped.

---

Save `ISSUE_NUMBER` (from 1a or 1b) — it will be passed to all child agents and used for progress comments throughout the workflow.

**Progress reporting pattern**: At the end of each subsequent step:

1. **Check off the completed step** in the issue body's TODO checklist (use `gh issue edit` to update the body, changing `- [ ]` to `- [x]` for the completed step)
2. **Comment** on the issue with a brief report:

```bash
gh issue comment "$ISSUE_NUMBER" --body "$(cat <<'EOF'
### Step N: <step name> — completed

<concise summary of what was done, outcome, any issues>
EOF
)"
```

3. **Re-read the issue** to check the TODO list and confirm what comes next:

```bash
gh issue view "$ISSUE_NUMBER"
```

This re-read step is **critical** — it prevents losing track of remaining steps during long workflows with many interactions. Always check the TODO list to determine "What's next?" before proceeding.

### Step 2: Create Base Branch and Root PR

#### If `--stay` is passed

The current branch is reused as the base branch. No new branch or empty commit is created.

```bash
INVOCATION_BRANCH=$(git branch --show-current)  # This IS the base branch
BASE_BRANCH="$INVOCATION_BRANCH"

# Determine the parent branch for the root PR target
PARENT_BRANCH=$(gh pr view "$BASE_BRANCH" --json baseRefName -q '.baseRefName' 2>/dev/null)
if [ -z "$PARENT_BRANCH" ]; then
  PARENT_BRANCH=$(git remote show origin | grep 'HEAD branch' | awk '{print $NF}')
fi

# Check if a root PR already exists for this branch
EXISTING_PR=$(gh pr view "$BASE_BRANCH" --json number -q '.number' 2>/dev/null)
```

- If `EXISTING_PR` exists: reuse it as the root PR (record its number). No new PR needed.
- If no PR exists: create a new draft PR targeting `PARENT_BRANCH` (same as the normal flow below, but skip branch creation and empty commit).

#### Normal flow (no `--stay`)

The base branch is created from whichever branch is the "parent" — this is often `main` or `develop`, but can also be a feature branch.

**Determine `<parent-branch>`**: If the user specified a parent/base branch, use it. Otherwise, **default to the branch that was checked out when the command was invoked** (`INVOCATION_BRANCH`). For example, if invoked on `topic/foobar`, the parent branch is `topic/foobar`, not `main`.

```bash
INVOCATION_BRANCH=$(git branch --show-current)  # Record before any checkout
```

**CRITICAL**: Create the root PR immediately with an empty commit. This locks in the correct parent branch from the start.

```bash
# Ensure parent branch is up to date
git checkout <parent-branch>
git pull origin <parent-branch>

# Create the base branch
git checkout -b base/<project-name>

# Create empty start commit and push
git commit --allow-empty -m "= start <project-name> dev ="
git push -u origin base/<project-name>

# Create the root PR immediately (draft, targeting parent branch)
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

### Step 3: Create Worktrees

For each topic:

```bash
# Create worktree with a topic branch based on the base branch
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

### Step 5: Spawn Child Agents via Teams

Use TeamCreate to create a team, then use the Task tool to spawn child agents — one per topic. Each agent works in its own worktree directory.

```
1. TeamCreate with team_name: "<project-name>"
2. TaskCreate for each topic (implementation tasks)
3. Task tool to spawn agents with:
   - subagent_type: "frontend-worktree-child" (or "general-purpose" for non-frontend topics)
   - team_name: "<project-name>"
   - name: "topic-<name>"  (e.g., "topic-topicA")
   - prompt: Detailed instructions including:
     a. The worktree absolute path to work in
     b. What to implement for this topic
     c. Branch name: <project-name>/<topic-name>
     d. Base branch: base/<project-name>
     e. **COMMIT ONLY — DO NOT PUSH.** All commits stay local. Pushing happens later (Step 9) to save CI resources.
     f. (If issue tracking is active) The ISSUE_NUMBER and instruction to comment on it when done:
        `gh issue comment <ISSUE_NUMBER> --body "### topic-<name> — completed\n\n<summary of work done>"`
```

**Spawn all child agents in parallel** using multiple Task tool calls in a single message. Each agent should:
1. Work in its assigned worktree directory
2. Implement the topic
3. **Commit changes locally only — DO NOT push** (pushing is deferred to Step 9)
4. **Run `/light-review`** to self-review their work — fix any clearly useful findings and commit
5. Save a log to `{logdir}/` (the agent's log-writing constraint handles this)
6. (If issue tracking is active) Comment on the tracking issue with a brief completion note
7. **Report back with brief message only**: status (1-2 sentences), PR URL if created, and log file path. Do NOT send full summaries — the log file has the detail. The manager can read it via `/logrefer` if needed

### Step 6: Review and Merge Topic Branches Locally

Since child agents committed locally without pushing, merge their topic branches into the base branch **locally** using git:

```bash
git checkout base/<project-name>

# Merge each topic branch into base (regular merge, not squash)
git merge <project-name>/topicA
git merge <project-name>/topicB
git merge <project-name>/topicC
```

Review the combined diff to make sure everything looks right:

```bash
git diff <parent-branch>...base/<project-name> --stat
```

### Step 6.5: Shut Down Child Agents

All child agents are done and their branches have been merged. Shut down the team to close their tmux panes and free resources.

1. **Send shutdown to all agents** via broadcast:

```
SendMessage: to="*", message={type: "shutdown_request", reason: "All topics merged into base branch. Work complete."}
```

2. **Wait for shutdown confirmations**, then **delete the team**:

```
TeamDelete
```

This closes the tmux panes for all child agents. The rest of the workflow (review, push, CI) is handled by the manager alone.

### Step 7: Sync Local Base Branch

Ensure the base branch is up to date with any remote changes (e.g., if the root PR's empty commit was pushed in Step 2):

```bash
git fetch origin base/<project-name>
git merge origin/base/<project-name>
```

After syncing, **re-read the issue TODO** to confirm the next step:

```bash
gh issue view "$ISSUE_NUMBER"
```

The next step is **Step 8: Local Review**. You MUST run it before pushing. Do NOT skip ahead to pushing.

---

### !! MANDATORY CHECKPOINT: Step 8 — Local Review !!

**STOP. Before you push ANYTHING, you MUST run `/local-review`.** This step is the most commonly skipped step in long workflows because the context gets long after managing multiple child agents. **Read this carefully and execute it.**

**CRITICAL: The review MUST run on the base branch in the main repo directory** (NOT in a worktree or isolated context). At this point, topic branches have been merged locally but NOT pushed — the merged commits only exist in the local base branch. Reviewers spawned with `isolation: "worktree"` or in separate worktrees will NOT see the unpushed merged changes and will report "no code to review." Always run `/local-review` from the main repo root on `base/<project-name>`.

1. **Invoke `/local-review` using the Skill tool** — not a manual review, not a summary, the actual skill:

```
Skill tool: skill="local-review"
```

2. **Wait for all 3 reviewers to complete** and read their findings
3. **Fix issues** found by the reviewers and commit locally (do NOT push yet)
4. **Only after `/local-review` has been invoked and findings addressed**, proceed to Step 9

If you are about to run `git push` and you have NOT yet invoked the `local-review` skill in this session, **STOP and go back to this step.**

---

### Step 9: Push All Changes to Remote

**Pre-push gate**: Before pushing, confirm you have already run `/local-review` (Step 8). If you skipped it, go back now.

Push everything to remote **in one batch**. This is the first time anything is pushed after the initial empty commit — saving CI resources by avoiding intermediate pushes.

```bash
# Push the base branch (contains all merged topic work + review fixes)
git push origin base/<project-name>

# Push topic branches so PRs can be created for documentation
for branch in <project-name>/topicA <project-name>/topicB <project-name>/topicC; do
  git push origin "$branch"
done
```

After pushing, create topic PRs for documentation/tracking purposes and merge them:

```bash
# For each topic branch, create PR and merge it
for branch in <project-name>/topicA <project-name>/topicB <project-name>/topicC; do
  gh pr create --base base/<project-name> --head "$branch" --title "<topic> implementation" --body "Part of <project-name> development" --fill
  # These can be merged immediately since they're already merged locally
  PR_NUM=$(gh pr list --head "$branch" --json number -q '.[0].number')
  gh pr close "$PR_NUM" --comment "Already merged into base branch locally"
done
```

### Step 10: CI Watch (Verify CI Passes)

**Only perform this step if the project has CI configured.** Check with `gh pr checks <root-pr-number>` — if no checks exist, skip to Step 11.

Invoke `/watch-ci` on the root PR to monitor CI:

```bash
RESULT=$(bash ~/.claude/skills/watch-ci/scripts/check-ci.sh <root-pr-number>)
echo "$RESULT"
# Poll every 20 seconds until terminal state
```

- **If CI passes**: Proceed to Step 11
- **If CI fails**: Investigate and fix
  - Fetch failed run logs: `gh run view <run-id> --log-failed`
  - Fix the issue, commit, push, and re-watch CI
  - **IMPORTANT**: Only attempt CI fixes if the failure is related to the changes made (not pre-existing failures or infrastructure issues)
- **If CI still fails after a fix attempt**: Stop and ask the user for guidance. Explain what failed, what was tried, and why it could not be resolved automatically

If the task is intentionally CI-breaking (e.g., adding new linting rules, migrating frameworks), **skip CI verification** and inform the user.

### Step 11: Update Root PR and Mark Ready

Invoke `/pr-revise` to analyze the full diff between the parent branch and `base/<project-name>`, and update the root PR title and description to accurately reflect all combined changes from the merged topics.

After `/pr-revise` completes, mark the PR as ready:

```bash
# Mark ready for review (remove draft status)
gh pr ready <root-pr-number>
```

---

### Step 11.5: Session Report

Generate a structured session report. This report serves two purposes: (1) a log for future Claude Code sessions to reference via `/logrefer`, and (2) a GitHub issue comment for human visibility.

#### Report Content

Write a markdown report summarizing:

- Project name and scope
- Topics implemented (one bullet per topic with brief summary of what each child agent did)
- Key decisions and architectural choices
- Review findings and fixes applied (from `/local-review`)
- CI status (pass/fail/skipped)
- Root PR URL and topic PR URLs

#### Save to Log Directory

```bash
~/.claude/scripts/save-file.js "{logdir}/{timestamp}-x-wt-teams-{slug}.md" "<report content>"
```

Where `{slug}` is derived from the project name (e.g., `marker-fix`).

#### Post to GitHub Issue

If a GitHub issue is linked (`ISSUE_NUMBER` is set), post the report as an issue comment:

```bash
gh issue comment "$ISSUE_NUMBER" --body "<report content>"
```

---

### STOP — WORKFLOW ENDS HERE

**After Step 11.5, the automated workflow is DONE.** Report the root PR URL and wait for user response.

**CRITICAL RULES at this point:**

- **Stay on `base/<project-name>`.** Do NOT checkout `main`, the parent branch, or any other branch.
- **Do NOT run Step 12.** Step 12 is cleanup that only happens later, after the user has reviewed and merged the PR.
- **Do NOT delete any branches** (local or remote) — topic branches, base branch, all stay.
- **Do NOT do anything else** unless the user asks.

The user will review the PR and may:

1. **Provide feedback** — see "Feedback Loop" below. Handle it automatically.
2. **Merge the PR** — then Step 12 can be run if the user asks.

---

### Feedback Loop: Iterating on User Feedback

After you report the root PR, the user often replies with feedback — requests for changes, fixes, or improvements. This feedback can range from small single-file tweaks to substantial multi-area rework.

**When user feedback is received, re-run Steps 3–11.5 using `--stay` semantics on the existing base branch.** This spins up new agent teams to implement the fixes, following the same structured workflow. The base branch and root PR already exist — no need to recreate them.

#### How it works

1. **Analyze the feedback** — break it into discrete topics. Each heading, bullet group, or distinct concern becomes a separate topic. If there's only one small concern, a single topic is fine.
2. **Create new worktrees and topic branches** off the existing base branch (Step 3)
3. **Spawn new child agent teams** (Steps 4–5):
  - Use `TeamCreate` with an incremented team name: `<project-name>-v2`, `<project-name>-v3`, etc.
  - New topic branches: `<project-name>/<new-topic-name>`
  - New worktrees: `worktrees/<new-topic-name>`
  - Include the user's feedback verbatim in child agent prompts so they have full context
4. **Follow the same workflow**: merge topics → shut down agents → sync → local review → push → CI watch → update PR (Steps 6–11.5)
5. **Report back** and wait for the next round of feedback

#### Key points

- **No new base branch or root PR** — reuse what already exists. The root PR accumulates all iterations.
- **New team name per iteration** — `<project-name>-v2`, `-v3`, etc. to avoid team name collisions.
- **Issue tracking continues** — if `ISSUE_NUMBER` is set, comment on the issue with the feedback iteration progress.
- **Repeat as needed** — each round of feedback triggers a new iteration. The loop continues until the user is satisfied and merges the PR.
- **Small feedback** still uses this pattern — even a single-topic fix benefits from the structured workflow (worktree isolation, review, CI check).

---

### Step 12: Cleanup (ONLY when user asks, after PR is merged)

**NEVER run this step automatically.** Only run when the user explicitly asks to clean up after the root PR has been merged.

```bash
# (Team was already shut down in Step 6.5)

# Remove worktrees
for wt in worktrees/*/; do
  git worktree remove "$wt"
done

# Delete local and remote topic branches
git branch -d <project-name>/topicA <project-name>/topicB <project-name>/topicC
git push origin --delete <project-name>/topicA <project-name>/topicB <project-name>/topicC

# Delete base branch
git branch -d base/<project-name>
git push origin --delete base/<project-name>
```

Even during cleanup, do NOT checkout main or the parent branch. Stay on whatever branch you are on.

## Branch Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Base branch | `base/<project>` | `base/marker-fix` |
| Topic branch | `<project>/<topic>` | `marker-fix/bogaudio-knobs` |
| Worktree dir | `worktrees/<topic>` | `worktrees/bogaudio-knobs` |

## Important Rules

1. **NEVER checkout main or parent branch** — after the workflow completes (Step 11), stay on `base/<project-name>`. Do NOT switch branches, do NOT delete branches, do NOT run Step 12. The workflow ends at Step 11. Step 12 is only run later when the user explicitly asks
2. **Fully autonomous** — never ask the user to manually start sessions or cd into worktrees. Use Task tool to spawn agents
3. **Always pull the parent branch before creating the base branch** — stale bases cause conflicts
4. **Create the root PR immediately in Step 2** — an empty commit + draft PR locks in the correct parent branch
5. **Never force push** — regular merge only, preserves history
6. **Push-forbid during work** — child agents commit locally only. All pushing happens in Step 9 after local review. This saves CI resources
7. **Topic branches merge locally first** — the manager merges topic branches into base via `git merge`, not GitHub PR merge. Topic branches are pushed later for documentation only
8. **Root PR targets the parent branch** — this is handled automatically by creating it in Step 2
9. **worktrees/ must be in .gitignore** — worktrees are local only
10. **Manager stays at repo root** — never cd into worktrees for git ops
11. **Each child agent works in its worktree** — git ops affect that branch only
12. **Quality assurance before pushing** — always run `/local-review` after merging all topics (Step 8). This is mandatory, never skip it
13. **CI watch after pushing** — if the project has CI, invoke `/watch-ci` on the root PR (Step 10). If CI fails, fix and re-push
14. **Re-read the issue TODO after every step** — use `gh issue view` to check the TODO checklist and confirm what comes next. This prevents forgetting steps during long workflows
15. **Issue tracking by default** — create a GitHub issue with TODO checklist and comment progress at each step. Skip with `--no-issue` or if the user says not to. Close the issue when the root PR is merged
16. **pnpm worktree cleanup breaks symlinks** — when worktrees are removed (TeamDelete or manual), pnpm workspace symlinks in `node_modules/` may point to deleted worktree paths. After worktree cleanup, run `pnpm install --ignore-scripts` to fix broken symlinks before running tests

## Prerequisites

- `worktrees/` in `.gitignore`
- `gh` CLI authenticated
- `git` version 2.15+ (worktree support)
