---
name: x-as-pr
description: "Start a development workflow as a draft PR. Creates a NEW branch from the current branch, empty start commit, draft PR targeting the current branch, then implements. ALWAYS creates a new branch by default — produces a nested PR-on-PR when the current branch already has one. Use when: (1) User says 'dev as pr', (2) User wants a PR-first workflow before coding, (3) User passes -s/--stay to reuse the current branch instead of nesting, (4) User passes a GitHub issue URL to implement, (5) User passes --make-issue/--issue to create an issue first. Logs progress via issue comments when an issue is linked."
argument-hint: "[-haiku|-so|-op] [-co|--codex] [-gco|--github-copilot] [-gcoc|--github-copilot-cheap] [-a|--auto] [--make-issue|--issue] [-s|--stay] [-l|--review-loop] [-v|--verify-ui] [-nor|--no-review] [--noi] [-noi|--no-raise-issues] [issue-url-or-number] [branch-name] [base-branch]"
---

# Dev As PR

Start a development workflow by creating a branch and draft PR before implementation — or create a PR from existing work on the current branch.

## !! CRITICAL — PR TARGET BRANCH RULE !!

**The new PR's base MUST be the current (invocation) branch, NOT the repository's default branch.**

As the very first action in this skill, record the current branch:

```bash
INVOCATION_BRANCH=$(git branch --show-current)
```

Every `gh pr create` call in this skill must pass `--base "$INVOCATION_BRANCH"` (or a user-specified base) — NEVER omit `--base`, because `gh pr create` defaults to the repo's default branch (usually `main`), which is almost always wrong here.

**Concrete example (this is the bug this rule prevents):**

```
Current branch: topic/foo-bar
User runs:      /x-as-pr do blah blah...
CORRECT:        new branch topic/moo-mew → PR targets topic/foo-bar
WRONG:          new branch topic/moo-mew → PR targets main   ← DO NOT DO THIS
```

This applies regardless of:

- Whether the current branch already has a PR
- Whether the current branch has commits ahead of main
- Whether `main` "seems more natural" as the base
- Whether the current branch looks like a work-in-progress topic

If the user wants the PR to target a different branch, they pass it explicitly via `base:<name>` or as a trailing arg. If not specified, the answer is ALWAYS `$INVOCATION_BRANCH`.

(See Step 3 "Determine Target (Base) Branch" for the full mechanism, and the Scenarios table under "Default Behavior" for every case.)

## Auto-Pilot Behavior (Always On)

This skill orchestrates long-running autonomous work (branch setup, implementation, review, PR management). When invoked, behave as if Auto Mode is active — regardless of session mode:

1. **Execute immediately** — start implementing right away. Make reasonable assumptions and proceed on low-risk work.
2. **Minimize interruptions** — prefer making reasonable assumptions over asking questions for routine decisions.
3. **Prefer action over planning** — do not enter plan mode unless the user explicitly asks. When in doubt, start coding.
4. **Expect course corrections** — treat mid-run user input as normal corrections, not failures.
5. **Do not take overly destructive actions** — deleting data, force-pushing, or modifying shared/production systems still needs explicit confirmation.
6. **Avoid data exfiltration** — do not post to external platforms or share secrets unless the user has authorized that specific destination.

## Input Parsing

Parse `$ARGUMENTS` to extract:

- **`--make-issue` or `--issue` flag**: If present, create a GitHub issue before starting (see "Issue Creation Mode" below)
- **`-s` or `--stay` flag**: If present, stay on the current branch instead of creating a new one (see "Stay Mode" below). **Opt-in only — never auto-detected.**
- **`-l` or `--review-loop` flag**: If present, replace the final review step with `/review-loop 5 --aggressive` instead of `/deep-review` (see "Review Loop Mode" below)
- **`-v` or `--verify-ui` flag**: If present, run `/verify-ui` after review fixes to verify frontend changes visually (see "Verify UI Mode" below)
- **`--noi`, `--noissue`, or `--noissues` flag**: Only meaningful with `--review-loop`. Suppresses GitHub issue creation for review findings. Without this flag, review-loop creates issues for considerable findings by default
- **`-nor` or `--no-review` flag**: Skip the post-implementation review entirely (no `/deep-review`, no `/review-loop`, no fix-delegation Agent). Just do the implementation, then proceed straight to verify-ui (if `-v` was passed), push, CI watch, and PR revision. See "No Review Mode" below
- **`-noi` or `--no-raise-issues` flag**: Suppress raising GitHub issues for unrelated problems found during coding or reviewing. See "Raising Issues for Unrelated Findings" below
- **Model flags** (`-haiku` / `--haiku`, `-so` / `--sonnet`, `-op` / `--opus`): Claude model used for subagents spawned during the workflow (notably the fix-delegation Agent after review) and passed through to `/deep-review` / `/review-loop`. Pick at most one. **Default: `-op` (Opus).** See "Claude Model Mode" below.
- **`-co` or `--codex` flag**: If present, use codex-based alternatives for reviews, doc writing, and research. See "Codex Mode" below. Can combine with `-gco` / `-gcoc` (multiple backends run in parallel for reviews / 2nd-opinions).
- **`-gco` or `--github-copilot` flag**: If present, use GitHub Copilot for reviews and research. See "GitHub Copilot Mode" below. Can combine with `-co` and/or `-gcoc`.
- **`-gcoc` or `--github-copilot-cheap` flag**: Same as `-gco` but forces the free `gpt-4.1` model (skips the Premium opus attempt). See "GitHub Copilot Cheap Mode" below. Can combine with `-co` and/or `-gco`.
- **`-a` or `--auto` flag**: If present, automatically run `/pr-complete -c -w` after the workflow completes. See "Auto-Complete Mode" below
- **GitHub issue**: URL (`https://github.com/owner/repo/issues/123`) or number (`123` or `#123`)
- **Branch name**: Explicit branch name if provided (look for words like `branch:` or a slash-containing name like `topic/foo`)
- **Base branch**: Explicit base branch if provided (look for words like `base:` or `from:`)
- **Implementation instructions**: Any remaining text describing what to implement

**When a GitHub issue URL or number is provided, treat it as an implementation request** — read the issue and implement what it describes. The issue title/body ARE the implementation instructions.

If ambiguous, ask the user to clarify.

## Default Behavior: ALWAYS Create a New Branch

**Unless `--stay` / `-s` is explicitly passed by the user, this skill ALWAYS creates a new branch from the current (invocation) branch** and opens a new PR targeting the current branch. This is the default and only behavior. It applies regardless of:

- Whether the current branch has an existing PR
- Whether the current branch has uncommitted or unpushed commits
- Whether there is existing work in progress
- Whether "staying" would seem logical given the current branch state

**CRITICAL — never auto-detect stay behavior.** Do NOT decide to commit on the current branch just because:

- The current branch already has a PR (the expected behavior is to create a nested PR-on-PR, not to add to the existing PR)
- The current branch has commits ahead of main (these are someone else's topic — make a new sub-branch from it)
- It "makes sense" or "seems more efficient" to stay

**If the user wants stay behavior, they MUST type `--stay` or `-s` explicitly.** There is no inference from context.

### Scenarios

| Current branch | User invocation | Result |
|----------------|----------------|--------|
| `main` | `/x-as-pr foo` | New branch `topic/foo` → PR targets `main` |
| `topic/foo` (has PR → main) | `/x-as-pr bar` | New branch `topic/bar` → nested PR targets `topic/foo` |
| `topic/foo` (has PR → main) | `/x-as-pr -s bar` | Stay on `topic/foo`, commit there, extend existing PR |
| `topic/foo` (has commits, no PR) | `/x-as-pr bar` | New branch `topic/bar` → PR targets `topic/foo` |
| `topic/foo` (has commits, no PR) | `/x-as-pr -s` | Stay on `topic/foo`, create PR from current work |

---

## Stay Mode (`-s` / `--stay`)

When `-s` or `--stay` is **explicitly passed by the user**, stay on the current branch instead of creating a new one. This avoids deep nesting when running `/x-as-pr` multiple times in sequence, and is the way to create a PR from work already committed on the current branch.

**Typical scenarios:**

1. **Continuing work** — first round: `/x-as-pr` creates `topic/foo-impl` → `main`, PR merged. Need more tweaks, still on `topic/foo-impl` → run `/x-as-pr -s` to stay and extend.
2. **Existing committed work** — you've been coding on `topic/bar` but forgot to start via `/x-as-pr`. Run `/x-as-pr -s` to create a PR from the existing commits.

**How it works:**

1. The current branch IS the working branch — no new branch, no empty commit
2. Determine `TARGET_BRANCH` (for PR base):
- Check if a PR already exists for this branch: `gh pr view --json baseRefName -q '.baseRefName'`
- If yes, reuse that PR (record its number) — no new PR needed
- If no PR exists, use the repository's default branch as `TARGET_BRANCH` and create a new draft PR
3. If there are uncommitted changes, commit them with a descriptive message (no empty commits)
4. If implementation instructions are provided, start implementation (commit locally, no push)
5. All post-implementation steps (deep review, push, CI watch, PR revision) work the same

---

## Issue Creation Mode (`--make-issue` / `--issue`)

When `--make-issue` or `--issue` is present in `$ARGUMENTS`:

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

Record the created issue number as `ISSUE_NUM`. From here, proceed with the normal workflow using this issue.

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
- [ ] Deep review (`/deep-review`)
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

## Codex 2nd Opinion (Planning Phase)

Before starting implementation, when the abstract concept of the task is understood:

1. **Form an initial plan** — understand what needs to be done, which files are involved, and the approach
2. **Invoke `/codex-2nd`** — send the plan to codex for a second opinion
3. **Review feedback** — if codex returns useful, actionable feedback, update the plan accordingly
4. **Optionally re-run** — if the plan changed significantly, invoke `/codex-2nd` again with the updated plan (up to 3 iterations total)
5. **Finalize and proceed** — once the plan is stable, begin implementation

This step is advisory. If codex is unresponsive or provides no useful feedback, proceed with the original plan.

---

## Claude Model Mode (`-haiku` / `-so` / `-op`)

Pick at most one. **Default: `-op` (Opus).**

When a model flag is passed (or left at default), it governs:

- The `model:` field of the fresh **fix-delegation Agent** spawned after review (see "Delegating Review Fixes to a Fresh Agent" below).
- Any other subagents spawned during implementation.
- Forwarded verbatim to `/deep-review` / `/review-loop` so their Claude reviewers run at the same model.
- Forwarded to the fix-delegation agent's own `/light-review` self-check — though if no model flag was explicitly passed, `/light-review` falls to its own default (`-gcoc`).

Multiple model flags → last one wins (documented, not an error).

Model flags are **orthogonal** to `-co` / `-gco` / `-gcoc`. They can coexist — e.g. `-so -gco` means Sonnet for Claude subagents **and** `/gco-review` as the review backend.

---

## Codex Mode (`-co` / `--codex`)

When `-co` or `--codex` is passed, the following substitutions apply throughout the entire workflow:

| Default tool | Codex replacement | Used for |
|---|---|---|
| `/deep-review` | `/codex-review` | Post-implementation code review |
| `/review-loop N --aggressive` | `/codex-review` (run once) | Review loop mode review step |
| Agent tool (web search, research) | `/codex-research` | Any web search or codebase research during planning/implementation |
| Agent tool (doc writing) | `/codex-writer` | Writing documentation, README, or other text content |

**How it affects the workflow:**

- **Post-Implementation Review**: Instead of `/deep-review` or `/review-loop`, invoke `/codex-review`. If `-l`/`--review-loop` is also passed, still invoke `/codex-review` once (not multiple rounds — codex review is already thorough).
- **Research during planning/implementation**: When you need to research libraries, APIs, or best practices (web search or codebase exploration), prefer `/codex-research` over the Agent tool or WebSearch.
- **Documentation writing**: When writing README content, doc comments, or other prose during implementation, prefer `/codex-writer` over writing directly.

All other workflow steps (branch creation, PR, CI watch, etc.) remain unchanged.

---

## GitHub Copilot Mode (`-gco` / `--github-copilot`)

When `-gco` or `--github-copilot` is passed, the following substitutions apply throughout the entire workflow:

| Default tool | GCO replacement | Used for |
|---|---|---|
| `/deep-review` | `/gco-review` | Post-implementation code review |
| `/review-loop N --aggressive` | `/gco-review` (run once) | Review loop mode review step |
| `/codex-2nd` (planning phase) | `/gco-2nd` | Second opinion on plans |
| Agent tool (web search, research) | `/gco-research` | Any web search or codebase research during planning/implementation |

**How it affects the workflow:**

- **Post-Implementation Review**: Instead of `/deep-review` or `/review-loop`, invoke `/gco-review`. If `-l`/`--review-loop` is also passed, still invoke `/gco-review` once (not multiple rounds). `/gco-review` silently falls back to Claude Code reviewers if Copilot is rate-limited — no special handling needed here.
- **Second Opinion (planning phase)**: Instead of `/codex-2nd`, invoke `/gco-2nd`. If Copilot is rate-limited, `/gco-2nd` silently skips.
- **Research during planning/implementation**: When you need to research libraries, APIs, or best practices (web search or codebase exploration), prefer `/gco-research` over the Agent tool or WebSearch.

All other workflow steps (branch creation, PR, CI watch, etc.) remain unchanged.

---

## GitHub Copilot Cheap Mode (`-gcoc` / `--github-copilot-cheap`)

Same as `-gco` / `--github-copilot` above, but forces the free `gpt-4.1` model (skips the Premium opus attempt). Use this when Premium quota is exhausted or when the task is simple enough that `gpt-4.1` feedback is sufficient. Mutually exclusive with `-co` and `-gco`.

When `-gcoc` or `--github-copilot-cheap` is passed, the following substitutions apply throughout the entire workflow:

| Default tool | GCOC replacement | Used for |
|---|---|---|
| `/deep-review` | `/gcoc-review` | Post-implementation code review |
| `/review-loop N --aggressive` | `/gcoc-review` (run once) | Review loop mode review step |
| `/codex-2nd` (planning phase) | `/gcoc-2nd` | Second opinion on plans |
| Agent tool (web search, research) | `/gcoc-research` | Any web search or codebase research during planning/implementation |

**How it affects the workflow:**

- **Post-Implementation Review**: Instead of `/deep-review` or `/review-loop`, invoke `/gcoc-review`. If `-l`/`--review-loop` is also passed, still invoke `/gcoc-review` once (not multiple rounds). `/gcoc-review` silently falls back to Claude Code reviewers if Copilot is rate-limited — no special handling needed here.
- **Second Opinion (planning phase)**: Instead of `/codex-2nd`, invoke `/gcoc-2nd`. If Copilot is rate-limited, `/gcoc-2nd` silently skips.
- **Research during planning/implementation**: When you need to research libraries, APIs, or best practices (web search or codebase exploration), prefer `/gcoc-research` over the Agent tool or WebSearch.

All other workflow steps (branch creation, PR, CI watch, etc.) remain unchanged.

---

## Default Workflow (create new branch)

This is the only default workflow. (See "Stay Mode" above for the opt-in `--stay` / `-s` variant.)

### Step 1: Read Issue (if specified)

```bash
# If GitHub URL
gh issue view <issue-num> --repo <owner/repo>

# If issue number
gh issue view <issue-num>
```

Use the issue title and body as context for branch naming and implementation. **The issue content IS the implementation request** — implement what the issue describes.

Record the issue number as `ISSUE_NUM` for progress logging.

#### Claim the Issue (Prevent Session Conflicts)

**Immediately after reading a pre-existing issue passed by the user**, post a claim comment so other Claude Code sessions don't start parallel work on the same topic:

```bash
gh issue comment "$ISSUE_NUM" --body "🤖 Starting work on this issue in a Claude Code session (\`/x-as-pr\`). To avoid conflicts, please check the latest comments before starting another session on this issue."
```

**When to post:**

- Any pre-existing issue passed by the user as argument (issue URL or number)
- This applies to **all pre-existing issues including epic issues** — always claim before starting

**When to skip:**

- `--make-issue` / `--issue` was used (the issue was just created by this session — no conflict risk)
- No issue is linked

This claim happens **before** any branch creation or implementation work. Its sole purpose is to mark the issue as "in progress" so concurrent sessions can see someone is already on it.

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
# !! PR TARGET CHECK !! — <TARGET_BRANCH> MUST be INVOCATION_BRANCH (recorded at the start),
# not the repo default branch. If you about to pass `--base main` on a session that was
# invoked from `topic/foo`, STOP — that is the bug the top-of-file rule prohibits.
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

**IMPORTANT: DO NOT push during implementation.** All commits stay local until the post-implementation phase. This saves CI resources by avoiding CI runs on every intermediate commit. Only push once at the end after deep review is complete.

If the user provided implementation instructions (either via issue or direct text), begin the implementation work immediately. Commit frequently but do NOT push.

If no instructions were provided, report the PR URL and wait for further direction.

---

## Examples

### Default: with issue number

```
/x-as-pr 42
-> Fetch, on main
-> Read issue #42 "Add dark mode support"
-> Branch: issue-#42/add-dark-mode-support
-> Base: main
-> Empty commit, push, draft PR
-> Start implementing based on issue
```

### Default: with explicit branch and base

```
/x-as-pr branch:feature/new-auth base:develop
-> Fetch, on develop
-> Branch: feature/new-auth
-> Base: develop
-> Empty commit, push, draft PR
```

### Default: with instructions only

```
/x-as-pr add pagination to the user list page
-> Fetch, on main
-> Branch: topic/add-pagination-user-list
-> Base: main
-> Empty commit, push, draft PR
-> Start implementing pagination
```

### Default: from a non-default branch (nested PR)

```
/x-as-pr add search to the sidebar
-> Fetch, on topic/foobar (even if it has its own PR)
-> Branch: topic/add-search-sidebar (new)
-> Base: topic/foobar (INVOCATION_BRANCH)
-> Empty commit, push, draft PR targeting topic/foobar (nested PR-on-PR)
-> Start implementing search
```

### Stay Mode: reuse current branch

```
/x-as-pr -s more tweaks to search
-> Fetch, on topic/add-search-sidebar (has existing PR → main)
-> Stay on current branch, reuse existing PR
-> Start implementing
```

### Stay Mode: create PR from already-committed work

```
/x-as-pr --stay
-> Fetch, on topic/add-search-feature with 3 commits ahead, no PR
-> Stay on current branch
-> Push branch, create draft PR targeting main with summary from actual commits
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

## Raising Issues for Unrelated Findings (Default Behavior)

During coding and reviewing, you may discover problems that are **unrelated to the original topic** — e.g., pre-existing bugs, code smells in adjacent files, outdated dependencies, or inconsistencies in code that was not part of the task. By default, **always raise these as separate GitHub issues** so they are tracked and not lost.

### When to Raise

- A reviewer flags a problem in code that was NOT modified by this PR
- You notice a bug or code quality issue in adjacent code while implementing
- A pre-existing test failure or lint warning is discovered
- Any problem that is clearly outside the scope of the current task

### How to Raise

```bash
gh issue create \
  --title "<concise description of the unrelated problem>" \
  --body "$(cat <<'EOF'
## Found during

PR: <PR_URL> (or branch: <BRANCH_NAME>)

## Description

<what the problem is, where it is, and why it matters>

## Suggested fix

<brief suggestion if obvious, otherwise omit>

---
*Discovered during `/x-as-pr` workflow — not related to the original task.*
EOF
)"
```

### Suppressing with `--no-raise-issues` / `-noi`

When `-noi` or `--no-raise-issues` is passed, **do NOT raise GitHub issues for unrelated findings**. Simply ignore them and focus only on the original task. This is useful when you want a lean workflow without side-effect issues.

---

## No Review Mode (`-nor` / `--no-review`)

When `-nor` or `--no-review` is passed, **skip the entire post-implementation review step** — no `/deep-review`, no `/review-loop`, no fix-delegation Agent. Just do the implementation, then proceed straight to the remaining post-implementation steps (verify-ui if `-v` was passed, push, CI watch, PR revision, session report).

**Effect on the workflow:**

- "Post-Implementation: Automatic Deep Review" step → **skipped entirely**, including the fix-delegation Agent that would normally run after review findings
- `-l` / `--review-loop` → **ignored** (no review at all overrides "more rigorous review")
- `-v` / `--verify-ui` → still honored (verify-ui is independent of code review)
- All other post-implementation steps (push, CI watch, PR revision, session report, requirements verification, auto-complete) → unchanged

**Use when:**

- You've already reviewed the changes yourself and want to skip the automated pass
- The task is throwaway / exploratory and a review pass would be wasted effort
- You want the fastest possible "implement → push → done" loop

This is an explicit opt-in — never assume `--no-review` from context.

---

## Post-Implementation: Automatic Deep Review

After implementation is complete (in either mode), evaluate whether to run an automatic code review:

### Trigger Conditions (ALL must be true)

1. `-nor` / `--no-review` was NOT passed (if it was, skip this entire section — see "No Review Mode" above)
2. Implementation was actually performed (not just PR creation with no instructions)
3. The implementation completed without needing to ask the user for confirmation or clarification (no `AskUserQuestion` was used during implementation)
4. No errors or failures occurred during implementation
5. Changes were committed successfully

### Action

When all conditions are met, run the review:

- **If `-l` / `--review-loop` was passed**: Invoke `/review-loop 5 --aggressive --issues` instead of `/deep-review`. If `--noi` / `--noissue` / `--noissues` was also passed, omit the `--issues` flag (i.e., invoke `/review-loop 5 --aggressive`). This runs 5 rounds of aggressive review-fix cycles for thorough quality improvement.
- **Otherwise (default)**: Invoke `/deep-review` to perform a standard code quality review.

Tell the user: "Implementation went smoothly — running deep review on the changes." (or "running review-loop" if `--review-loop` is active).

#### Delegating Review Fixes to a Fresh Agent

After the review produces findings that require code changes, **delegate the fixes to a fresh Agent** instead of fixing in the current (token-heavy) context. This resets the token budget so the finalization phase stays lightweight.

**If the review found no actionable issues**, skip this — proceed directly to the next post-implementation step.

**If fixes are needed:**

1. **Create a fix issue** capturing all findings:

   ```bash
   FIX_ISSUE_URL=$(gh issue create \
     --title "Review fixes: <SLUG>" \
     --body "$(cat <<'EOF'
   ## Review Findings to Fix

   <all review findings — file paths, line numbers, what to fix and why>

   ## Context
   - Branch: `<BRANCH_NAME>`
   - PR: <PR_URL>

   ## Instructions
   Fix all issues listed above. Commit locally — do NOT push.
   EOF
   )")
   FIX_ISSUE_NUM=$(echo "$FIX_ISSUE_URL" | grep -o '[0-9]*$')
   ```

2. **Spawn a fresh Agent** to handle the fixes:

   ```
   Agent tool:
     description: "Fix review findings"
     model: <resolved Claude model flag; default "opus">
     prompt: "You are on branch <BRANCH_NAME> in <repo-path>.
              Read GitHub issue #<FIX_ISSUE_NUM> with `gh issue view <FIX_ISSUE_NUM>`.
              Fix all issues described there.
              Commit fixes locally — do NOT push.
              After committing, run `/light-review <forwarded backend flags>` as a self-check
              and address any high-priority findings it flags.
              When done, close the issue with a summary of what was fixed."
     mode: "bypassPermissions"
   ```

- **Model**: set `model:` from the resolved Claude model flag (default `"opus"`). Skip the `model:` field if you want to inherit the manager's model — pick one convention and stick with it.
- **Backend flags forwarded to `/light-review`**: pass whichever of `-co` / `-gco` / `-gcoc` were on the original invocation. If none were passed, omit them — `/light-review` falls to its own default (`-gcoc`).

3. **Verify** — after the agent returns, confirm fixes were committed (`git log --oneline -5`)
4. **Close the fix issue** if the agent didn't already
5. **Proceed** to the next post-implementation step (Verify UI or Push)

### Skip Conditions

Do NOT run deep review if:

- `-nor` / `--no-review` was passed (see "No Review Mode" above)
- No implementation was done (e.g., `--stay` used to just create a PR from existing commits with no additional instructions)
- The user was asked for confirmation or clarification during implementation
- Errors occurred that required user intervention
- The user explicitly asked to skip review

---

## Post-Implementation: Verify UI (optional)

**Only run this step if `-v` / `--verify-ui` was passed.**

After the review step (whether `/deep-review` or `/review-loop`) is complete and fixes are committed:

1. **Launch a verification target** — start the project's dev server, use a PR preview URL, or any other means to get the implementation running in a browser
2. **Invoke `/verify-ui`** to verify that frontend/CSS/layout changes were actually applied correctly
3. If `/verify-ui` reveals issues, fix them and commit locally (do NOT push yet)

This step ensures that visual/UI changes are not just code-correct but render correctly in the browser. Skip if the changes are purely backend or non-visual.

---

## Post-Implementation: Push Changes

After deep review is complete (or skipped), **push all commits to remote in one batch**. This is the first push since the initial empty commit — saving CI resources.

```bash
git push origin <BRANCH_NAME>
```

This single push triggers CI once with the complete implementation, rather than on every intermediate commit.

---

## Post-Implementation: CI Watch

**Only perform this step if the project has CI configured.** Check with `gh pr checks <PR_NUMBER>` — if no checks exist, skip to PR Revision.

Invoke `/watch-ci <PR_NUMBER>` to monitor CI. The `/watch-ci` skill handles polling, notifications, and failure investigation internally.

- **If CI passes**: Proceed to PR Revision
- **If CI fails**: Investigate and fix
  - Fetch failed run logs: `gh run view <run-id> --log-failed`
  - Fix the issue, commit, push, and re-watch CI
  - Only attempt CI fixes if the failure is related to the changes made
- **If CI still fails after a fix attempt**: Stop and ask the user for guidance

If the task is intentionally CI-breaking, skip CI verification and inform the user.

---

## Post-Implementation: PR Revision

After implementation, deep review, push, and CI watch are complete (or skipped), update the PR to reflect the full implementation.

### When to Run

Run `/pr-revise` when implementation was performed. The PR was created at the start with placeholder or initial content, and the implementation may have gone beyond the original scope.

### Action

Invoke `/pr-revise` to analyze the full diff and update the PR title and description to accurately reflect all changes made.

### Skip Conditions

Do NOT run PR revision if:

- No implementation was done (PR was just created with no instructions)
- The PR was just created with `--stay` from already-committed work and has an already-accurate description (the body was derived from actual commits/diff)

---

## Post-Implementation: Session Report

After all post-implementation steps are complete, generate a structured session report. This report serves two purposes: (1) a log for future Claude Code sessions to reference via `/logrefer`, and (2) a GitHub issue comment for human visibility.

### Report Content

Write a markdown report summarizing:

- What was implemented (feature/fix description)
- Key decisions made during implementation
- Files changed (summary, not full list)
- Review findings and fixes applied (if `/deep-review` was run)
- CI status (pass/fail/skipped)
- PR URL and status

### Save to Log Directory

```bash
$HOME/.claude/scripts/save-file.js "{logdir}/{timestamp}-x-as-pr-{slug}.md" "<report content>"
```

Where `{slug}` is derived from the branch name or PR title (e.g., `add-dark-mode-support`).

### Post to GitHub Issue

If a GitHub issue is linked (`ISSUE_NUM` is set), post the report as an issue comment:

```bash
gh issue comment "$ISSUE_NUM" --body "<report content>"
```

---

## Post-Implementation: Requirements Verification

**Only run this step when a GitHub issue is linked** (`ISSUE_NUM` is set — either passed as argument or created via `--make-issue`). Skip if no issue is linked.

After the session report, verify that the original requirements have been fully implemented:

### Step 1: Re-read the Issue

```bash
gh issue view "$ISSUE_NUM"
```

Read the **initial issue body** and any **early comments** (especially the first 1-2 comments) to extract the original requirements. These represent what the user actually asked for.

### Step 2: Compare Against Implementation

Check every requirement, acceptance criterion, and bullet point from the issue against what was actually implemented. Be thorough — check the code, not just commit messages.

### Step 3: Handle Missing Requirements

- **If all requirements are met**: Proceed to STOP. Add a comment on the issue confirming all requirements are satisfied:

  ```bash
  gh issue comment "$ISSUE_NUM" --body "All original requirements verified as implemented."
  ```

- **If requirements are missing**: Do NOT stop. Instead:
  1. Comment on the issue listing the missing requirements:

     ```bash
     gh issue comment "$ISSUE_NUM" --body "### Requirements gap found\n\nMissing: <list of missing items>\n\nContinuing implementation..."
     ```

  2. **Continue the development loop** — implement the missing parts, commit locally (push-forbid), then re-run the post-implementation steps (review, verify-ui if applicable, push, CI watch, PR revision, session report)
  3. **Re-run this verification step** after the additional implementation is complete
  4. Repeat until all original requirements are satisfied

This creates a self-correcting loop that ensures nothing from the original spec is missed, even in long workflows where context can drift.

---

## Auto-Complete Mode (`-a` / `--auto`)

**Only run this step if `-a` or `--auto` was passed.** Otherwise, skip to STOP below.

After requirements verification passes (or after the session report if no issue is linked), automatically invoke `/pr-complete -c -w` to:

1. Wait for CI checks to pass
2. Merge the PR (`--merge --delete-branch`)
3. Close the linked issue (`-c`)
4. Watch post-merge CI on the target branch (`-w`)

This is intended for safe-to-merge, fully automated workflows. If CI fails or the PR cannot be merged, `/pr-complete` will handle the error reporting.

**After `/pr-complete` succeeds**, checkout the merged target branch and pull:

```bash
# Determine the target branch the PR was merged into
TARGET_BRANCH=$(gh pr view <PR_NUMBER> --json baseRefName -q '.baseRefName')

# Checkout and pull the target branch
git checkout "$TARGET_BRANCH"
git pull origin "$TARGET_BRANCH"
```

This leaves the user on the up-to-date target branch (e.g., `main`) after a fully automated workflow.

---

## Post-Implementation: Close Tracking Issue

**Only run this step when the tracking issue was created by this workflow** (`--make-issue` was used). Skip if the issue was provided by the user (they may want it to remain open for other purposes).

After requirements verification passes (or auto-complete finishes), close the tracking issue:

```bash
gh issue close "$ISSUE_NUM" --comment "Workflow complete. PR: <PR_URL>"
```

The tracking issue is a workflow log — it has served its purpose. If any problems were discovered during the workflow that need follow-up, they should have been raised as **separate issues** (not left as open items on the tracking issue).

---

## STOP — WORKFLOW ENDS HERE

**After the tracking issue is closed (or skipped), the workflow is DONE.** Report the PR URL and stop.

**CRITICAL RULES:**

- **If `-a` / `--auto` was used and the PR was merged**: You are already on the target branch (e.g., `main`) after the auto-complete checkout+pull. Stay there.
- **Otherwise**: **Stay on `<BRANCH_NAME>`.** Do NOT checkout `main`, the parent branch, or any other branch. The user expects to remain on the working branch when the workflow finishes.
- **Do NOT do anything else** unless the user asks.
