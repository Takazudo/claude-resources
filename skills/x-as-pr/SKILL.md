---
name: x-as-pr
description: >-
  Start a development workflow as a draft PR. Fetches, creates a branch, makes an empty start
  commit, pushes, and opens a draft PR. Then starts implementation if instructions are provided.
  Also handles the case where implementation is already done on a topic branch — detects this and
  creates a PR from the current branch instead. When a GitHub issue URL is passed, treats it as an
  implementation request — read the issue and implement it. Use --make-issue to create a GitHub
  issue first describing the plan, then proceed. With linked issues, logs progress via issue
  comments. Use when: (1) User says 'dev as pr', (2) User wants to start a new feature/fix
  development with a PR-first workflow, (3) User wants to set up a branch and draft PR before
  coding, (4) User has already implemented changes on a branch and wants to create a PR for them,
  (5) User passes a GitHub issue URL to implement, (6) User says '--make-issue' to create an issue
  first.
argument-hint: "[--make-issue] [--stay] [issue-url-or-number] [branch-name] [base-branch]"
---

# Dev As PR

Start a development workflow by creating a branch and draft PR before implementation — or create a PR from existing work on the current branch.

## Input Parsing

Parse `$ARGUMENTS` to extract:

- **`--make-issue` flag**: If present, create a GitHub issue before starting (see "Issue Creation Mode" below)
- **`--stay` flag**: If present, stay on the current branch instead of creating a new one (see "Stay Mode" below)
- **GitHub issue**: URL (`https://github.com/owner/repo/issues/123`) or number (`123` or `#123`)
- **Branch name**: Explicit branch name if provided (look for words like `branch:` or a slash-containing name like `topic/foo`)
- **Base branch**: Explicit base branch if provided (look for words like `base:` or `from:`)
- **Implementation instructions**: Any remaining text describing what to implement

**When a GitHub issue URL or number is provided, treat it as an implementation request** — read the issue and implement what it describes. The issue title/body ARE the implementation instructions.

If ambiguous, ask the user to clarify.

## Stay Mode (`--stay`)

When `--stay` is passed, stay on the current branch instead of creating a new one. This avoids deep nesting when running `/x-as-pr` multiple times in sequence.

**Typical scenario:**

1. First round: `/x-as-pr` creates `topic/foo-impl` → `main`, work is done, PR merged
2. Need more tweaks — you're still on `topic/foo-impl`
3. Without `--stay`: creates `topic/foo-impl-v2` → `topic/foo-impl` → `main` (too nested)
4. With `--stay`: stays on `topic/foo-impl`, reuses or creates a PR targeting `main`

**How it works:**

1. The current branch IS the working branch — no new branch, no empty commit
2. Determine `TARGET_BRANCH` (for PR base):
- Check if a PR already exists for this branch: `gh pr view --json baseRefName -q '.baseRefName'`
- If yes, reuse that PR (record its number) — no new PR needed
- If no PR exists, use the repository's default branch as `TARGET_BRANCH` and create a new draft PR
3. If implementation instructions are provided, start implementation (commit locally, no push)
4. All post-implementation steps (local review, push, CI watch, PR revision) work the same

When `--stay` is passed, skip Mode Detection entirely and go straight to implementation.

---

## Mode Detection

Before starting the workflow, detect which mode to use:

### Check Current State

```bash
git fetch origin
INVOCATION_BRANCH=$(git branch --show-current)  # Record this — default base for PRs
DEFAULT_BRANCH=$(git remote show origin | grep 'HEAD branch' | awk '{print $NF}')
```

### Existing-Work Mode

Use **Existing-Work Mode** when ALL of these are true:

1. The current branch is NOT the default branch (e.g., not `main` or `master`)
2. There are commits on the current branch that are not on the default branch (`git log origin/$DEFAULT_BRANCH..$INVOCATION_BRANCH --oneline` shows commits)
3. No PR already exists for this branch (`gh pr view $INVOCATION_BRANCH` returns error / not found)
4. No explicit branch name or implementation instructions were provided in `$ARGUMENTS` (if the user provided these, always use Fresh-Start Mode — the user wants to create a new sub-branch from the current one)

### Fresh-Start Mode

Use **Fresh-Start Mode** in all other cases (on the default branch, no extra commits, or a PR already exists).

---

## Issue Creation Mode (`--make-issue`)

When `--make-issue` is present in `$ARGUMENTS`:

### Step 1: Understand the Task

Read the remaining arguments and conversation context to understand what the user wants to implement.

If the description is unclear, ask the user to clarify before creating the issue.

### Step 2: Create GitHub Issue

The issue serves as a **spec tracker** — it should clearly communicate what is being implemented and why. Write a concise but informative summary: enough for someone unfamiliar with the task to understand the scope. Not too detailed (that's for the PR), not too brief (that's useless).

```bash
gh issue create \
  --title "<concise description of what's being done>" \
  --body "$(cat <<'EOF'
## Summary

<2-4 sentences explaining what this implementation does and why. What problem does it solve? What's the approach?>

## Plan
- <step-by-step plan of what will be done>

## Notes
- Created via `/x-as-pr --make-issue`
EOF
)"
```

Record the created issue number as `ISSUE_NUM`. From here, proceed with the normal workflow (Fresh-Start or Existing-Work mode) using this issue.

### Step 3: If User Clarifies

If the user provides additional clarification after the issue is created, update the issue body:

```bash
gh issue edit <ISSUE_NUM> --body "<updated body with clarifications>"
```

---

## TODO Checklist on GitHub Issue

When a GitHub issue is linked (either passed as argument or created via `--make-issue`), **update the issue body** to serve as a spec tracker. This prevents losing track of steps and clearly communicates the implementation scope.

### Adding Spec and TODO

When creating an issue (`--make-issue`) or linking an existing one, ensure the issue body contains (use `gh issue edit` to update if needed):

1. A **Summary** section — 2-4 sentences explaining what this implementation does and why. Enough for someone unfamiliar to understand the scope. Not too detailed (that's for the PR), not too brief (that's useless).
2. A **TODO checklist** of workflow steps:

```markdown
### TODO
- [ ] Create branch and draft PR
- [ ] Implementation
- [ ] Local review (`/local-review`)
- [ ] Push changes to remote
- [ ] CI watch (if CI configured)
- [ ] PR revision (`/pr-revise`)
```

### After Each Step Completes

1. **Check off the completed step** — use `gh issue edit` to update `- [ ]` to `- [x]`
2. **Comment** on the issue with a brief milestone report
3. **Re-read the issue** to confirm what comes next:

```bash
gh issue view <ISSUE_NUM>
```

This re-read step is **critical** — it prevents losing track of remaining steps during long workflows with many interactions. Always check the TODO list to determine "What's next?" before proceeding.

## Progress Logging via Issue Comments

When a GitHub issue is linked (either passed as argument or created via `--make-issue`), **comment on the issue at key milestones** to create a progress log. Use the issue number stored as `ISSUE_NUM`.

### When to Comment

| Milestone | Comment content |
|-----------|----------------|
| PR created | "Draft PR created: `<PR_URL>`" |
| Implementation started | "Starting implementation. Plan: `<brief plan>`" |
| Significant progress | "Progress: `<what was done so far>`" |
| Plan changed | "Plan update: `<what changed and why>`" |
| Problem encountered | "Issue encountered: `<description of problem and how it was resolved or workaround>`" |
| Implementation complete | "Implementation complete. Changes: `<summary of what was done>`" |

### How to Comment

```bash
gh issue comment <ISSUE_NUM> --body "<comment>"
```

### Guidelines

- Keep comments concise but informative
- Always mention if the original plan was changed and why
- Log problems even if they were resolved — this creates useful history
- Do NOT comment for trivial steps (e.g., "fetching origin", "checking out branch")

---

## PR Body Reference Header

When creating any PR (`gh pr create`), check for parent references and prepend a header to the PR body. This identifies what the PR belongs to.

**Determine references:**

1. **Parent issue**: Use `ISSUE_NUM` if set (from linked issue or `--make-issue`)
2. **Parent PR**: Check if `TARGET_BRANCH` has an open PR:
   ```bash
   PARENT_PR_NUM=$(gh pr list --head "$TARGET_BRANCH" --json number -q '.[0].number' 2>/dev/null)
   ```

**If either exists**, prepend this header to the very start of the PR body (before `## Summary`):

```markdown
- issues
    - <REPO_URL>/issues/<ISSUE_NUM>
- parent PR
    - <REPO_URL>/pull/<PARENT_PR_NUM>

---

```

- Use `gh repo view --json url -q '.url'` to get `REPO_URL`
- Only include sections that have values — omit `- issues` if no issue, omit `- parent PR` if no parent PR
- If neither exists, omit the header entirely
- **When updating the PR body later** (e.g., via `/pr-revise`), always preserve the reference header at the top — do not remove or replace it

---

## Fresh-Start Mode (default)

This is the original workflow for starting new work.

### Step 1: Read Issue (if specified)

```bash
# If GitHub URL
gh issue view <issue-num> --repo <owner/repo>

# If issue number
gh issue view <issue-num>
```

Use the issue title and body as context for branch naming and implementation. **The issue content IS the implementation request** — implement what the issue describes.

Record the issue number as `ISSUE_NUM` for progress logging.

### Step 2: Determine Branch Name

If user specified a branch name, use it directly.

Otherwise, derive `{SLUG}` (max 40 chars, lowercase, hyphens) from the issue title or implementation description, then:

| Condition | Branch name pattern |
|-----------|-------------------|
| Has issue | `issue-#<ISSUE_NO>/<SLUG>` |
| Documentation updates | `doc/<SLUG>` |
| Other | `topic/<SLUG>` |

### Step 3: Determine Target (Base) Branch

- If user specified a base branch, use it
- Otherwise, use `INVOCATION_BRANCH` (the branch that was checked out when the command was invoked)

Record this as `TARGET_BRANCH`.

**Example**: If invoked on `topic/foobar`, the new branch targets `topic/foobar` by default, not the repository's default branch.

### Step 4: Create Branch and Draft PR

```bash
# Create and switch to new branch from TARGET_BRANCH
git checkout -b <BRANCH_NAME> <TARGET_BRANCH>

# Create empty start commit
git commit --allow-empty -m "= start <SLUG> dev ="

# Push to remote (only the initial empty commit — this is the only push until implementation is complete)
git push -u origin <BRANCH_NAME>

# Create draft PR against TARGET_BRANCH
gh pr create \
  --base <TARGET_BRANCH> \
  --title "<PR_TITLE>" \
  --body "$(cat <<'EOF'
## Summary
<brief description based on issue or instructions>

## Changes
- (in progress)

## Test Plan
- (to be determined)
EOF
)" \
  --draft
```

The PR title should be descriptive based on the issue or instructions provided.

### Step 5: Start Implementation (Push-Forbid Mode)

**IMPORTANT: DO NOT push during implementation.** All commits stay local until the post-implementation phase. This saves CI resources by avoiding CI runs on every intermediate commit. Only push once at the end after local review is complete.

If the user provided implementation instructions (either via issue or direct text), begin the implementation work immediately. Commit frequently but do NOT push.

If no instructions were provided, report the PR URL and wait for further direction.

---

## Existing-Work Mode

Use this when implementation is already done (or nearly done) on the current branch.

### Step 1: Gather Context

```bash
# Identify current branch and base
INVOCATION_BRANCH=$(git branch --show-current)
DEFAULT_BRANCH=$(git remote show origin | grep 'HEAD branch' | awk '{print $NF}')

# Review what was done
git log origin/$DEFAULT_BRANCH..$INVOCATION_BRANCH --oneline
git diff origin/$DEFAULT_BRANCH...$INVOCATION_BRANCH --stat
```

Determine `TARGET_BRANCH`:

- If the user specified a base branch, use it
- Otherwise, use `DEFAULT_BRANCH` as the fallback (since `INVOCATION_BRANCH` is the working branch itself in this mode)

If the user specified an issue, read it for PR title/body context.

### Step 2: Stage and Commit Remaining Work (if any)

If there are uncommitted changes (staged or unstaged):

```bash
git add <relevant-files>
git commit -m "<descriptive message>"
```

Follow normal commit conventions — no empty commits, meaningful messages.

### Step 3: Push and Create Draft PR

```bash
# Push current branch to remote
git push -u origin $INVOCATION_BRANCH

# Create draft PR against TARGET_BRANCH
gh pr create \
  --base <TARGET_BRANCH> \
  --title "<PR_TITLE>" \
  --body "$(cat <<'EOF'
## Summary
<brief description based on commits and diff>

## Changes
- <list actual changes from the diff/commits>

## Test Plan
- <describe how changes were tested, if known>
EOF
)" \
  --draft
```

The PR title and body should reflect the **actual work done** (derived from commit messages and diff), not placeholder text.

### Step 4: Continue or Report (Push-Forbid Mode)

If the user provided additional implementation instructions, continue working on the branch. **Commit frequently but DO NOT push** — pushing is deferred to the post-implementation phase to save CI resources.

If no further instructions were provided, report the PR URL and wait for direction.

---

## Examples

### Fresh-start: with issue number

```
/x-as-pr 42
-> Fetch, detect on main → Fresh-Start Mode
-> Read issue #42 "Add dark mode support"
-> Branch: issue-#42/add-dark-mode-support
-> Base: main
-> Empty commit, push, draft PR
-> Start implementing based on issue
```

### Fresh-start: with explicit branch and base

```
/x-as-pr branch:feature/new-auth base:develop
-> Fetch, detect on develop → Fresh-Start Mode
-> Branch: feature/new-auth
-> Base: develop
-> Empty commit, push, draft PR
```

### Fresh-start: with instructions only

```
/x-as-pr add pagination to the user list page
-> Fetch, detect on main → Fresh-Start Mode
-> Branch: topic/add-pagination-user-list
-> Base: main
-> Empty commit, push, draft PR
-> Start implementing pagination
```

### Fresh-start: from a non-default branch (invocation branch as base)

```
/x-as-pr add search to the sidebar
-> Fetch, detect on topic/foobar → Fresh-Start Mode
-> Branch: topic/add-search-sidebar
-> Base: topic/foobar (INVOCATION_BRANCH, not main)
-> Empty commit, push, draft PR targeting topic/foobar
-> Start implementing search
```

### Existing-work: implementation already done on branch

```
/x-as-pr
-> Fetch, detect on topic/add-search-feature with 3 commits ahead → Existing-Work Mode
-> Push branch, create draft PR with summary from actual commits
-> Report PR URL
```

### Existing-work: with issue reference for context

```
/x-as-pr 42
-> Fetch, detect on issue-#42/add-dark-mode with commits ahead → Existing-Work Mode
-> Read issue #42 for PR title/body context
-> Push branch, create draft PR
-> Report PR URL
```

### With issue URL (implementation request)

```
/x-as-pr https://github.com/owner/repo/issues/42
-> Fetch issue #42 "Add dark mode support"
-> Issue body describes what to implement → treat as implementation instructions
-> Branch: issue-#42/add-dark-mode-support, base: main
-> Empty commit, push, draft PR
-> Comment on issue #42: "Draft PR created: <URL>. Starting implementation."
-> Implement the issue
-> Comment on issue #42: "Implementation complete. Changes: ..."
```

### With --make-issue (create issue first)

```
/x-as-pr --make-issue add a search feature to the sidebar
-> Create GitHub issue "Add search feature to sidebar" with plan
-> Branch: issue-#99/add-search-sidebar, base: main
-> Empty commit, push, draft PR
-> Comment on issue #99: "Draft PR created: <URL>"
-> Implement, commenting on issue for progress
```

---

## Post-Implementation: Automatic Local Review

After implementation is complete (in either mode), evaluate whether to run an automatic code review:

### Trigger Conditions (ALL must be true)

1. Implementation was actually performed (not just PR creation with no instructions)
2. The implementation completed without needing to ask the user for confirmation or clarification (no `AskUserQuestion` was used during implementation)
3. No errors or failures occurred during implementation
4. Changes were committed successfully

### Action

When all conditions are met, invoke `/local-review` to perform an automatic code quality review of the changes.

Tell the user: "Implementation went smoothly — running local review on the changes."

Commit any review fixes locally (do NOT push yet).

### Skip Conditions

Do NOT run local review if:

- No implementation was done (e.g., Existing-Work Mode with no additional instructions)
- The user was asked for confirmation or clarification during implementation
- Errors occurred that required user intervention
- The user explicitly asked to skip review

---

## Post-Implementation: Push Changes

After local review is complete (or skipped), **push all commits to remote in one batch**. This is the first push since the initial empty commit — saving CI resources.

```bash
git push origin <BRANCH_NAME>
```

This single push triggers CI once with the complete implementation, rather than on every intermediate commit.

---

## Post-Implementation: CI Watch

**Only perform this step if the project has CI configured.** Check with `gh pr checks <PR_NUMBER>` — if no checks exist, skip to PR Revision.

Invoke `/watch-ci` on the PR to monitor CI:

```bash
RESULT=$(bash ~/.claude/skills/watch-ci/scripts/check-ci.sh <PR_NUMBER>)
echo "$RESULT"
```

- **If CI passes**: Proceed to PR Revision
- **If CI fails**: Investigate and fix
  - Fetch failed run logs: `gh run view <run-id> --log-failed`
  - Fix the issue, commit, push, and re-watch CI
  - Only attempt CI fixes if the failure is related to the changes made
- **If CI still fails after a fix attempt**: Stop and ask the user for guidance

If the task is intentionally CI-breaking, skip CI verification and inform the user.

---

## Post-Implementation: PR Revision

After implementation, local review, push, and CI watch are complete (or skipped), update the PR to reflect the full implementation.

### When to Run

Run `/pr-revise` when implementation was performed (in either Fresh-Start or Existing-Work mode). The PR was created at the start with placeholder or initial content, and the implementation may have gone beyond the original scope.

### Action

Invoke `/pr-revise` to analyze the full diff and update the PR title and description to accurately reflect all changes made.

### Skip Conditions

Do NOT run PR revision if:

- No implementation was done (PR was just created with no instructions)
- The PR was just created in Existing-Work Mode with an already-accurate description (the body was derived from actual commits/diff)

---

## STOP — WORKFLOW ENDS HERE

**After the last post-implementation step completes, the workflow is DONE.** Report the PR URL and stop.

**CRITICAL RULES:**
- **Stay on `<BRANCH_NAME>`.** Do NOT checkout `main`, the parent branch, or any other branch.
- **Do NOT do anything else** unless the user asks.

The user expects to remain on the working branch when the workflow finishes.
