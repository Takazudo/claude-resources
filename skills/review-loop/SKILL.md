---
name: review-loop
description: "Iterative code review loop that runs /deep-review multiple times, fixing issues each round. Finds bugs, improvements, and quality issues through repeated passes. Use when: (1) User says 'review-loop', 'review loop', or 'review repeat', (2) User wants continuous review+fix cycles to kill tiny problems, (3) User wants thorough multi-pass review before finalizing code, (4) User says 'review 5 rounds' or similar."
user-invocable: true
argument-hint: "[count] [--aggressive|--defensive] [--stay|--as-pr] [-co|--codex] [-gco|--github-copilot]"
---

# Review Loop

Run `/deep-review` repeatedly, fixing issues each round. Progressively kills bugs, improves code quality, and surfaces improvement opportunities.

## Input Parsing

Parse arguments to extract:

- **count** (number): How many review rounds. Default: 3
- **--aggressive**: Fix almost everything. Ask user only for truly base-changing decisions (e.g., "should we switch frameworks?"). Use during prototyping, massive migration, or greenfield work
- **--defensive** (default): Handle results carefully. Fix only clear bugs and convention violations. Use when the project is live and stability matters
- **--stay** (default): Apply fixes directly to the current branch
- **--as-pr**: Create a branch + draft PR, then apply fixes there. Follow the `/x-as-pr` workflow
- **-co** or **--codex**: Use `/codex-review` instead of `/deep-review` for the review process. Codex review uses OpenAI Codex CLI for faster, cheaper reviews
- **-gco** or **--github-copilot**: Use `/gco-review` (GitHub Copilot CLI) instead of `/deep-review` for the review process. Mutually exclusive with `-co`

## Workflow

### Step 1: Setup

Determine the working mode from parsed arguments.

If `--as-pr`:

1. Invoke `/x-as-pr <description>` to create a branch and draft PR
2. Record the PR number as `PR_NUM`
3. All subsequent work happens on the new branch

If `--stay`:

1. Work directly on the current branch

### Step 2: Review Loop (repeat N times)

For each round (1 to N):

#### 2a: Run review

If `--codex` is set, invoke `/codex-review` using the Skill tool. `/codex-review` silently falls back to Claude Code reviewers if codex is rate-limited — no special handling needed here. If `--github-copilot` is set, invoke `/gco-review` using the Skill tool. `/gco-review` silently falls back to Claude Code reviewers if Copilot is rate-limited — no special handling needed here. Otherwise, invoke `/deep-review`. Wait for all reviewers to complete.

#### 2b: Categorize findings

Sort all findings into:

- **Must-fix**: Bugs, logic errors, broken functionality, convention violations, security issues
- **Should-fix**: Code quality, DRY violations, missing types, accessibility gaps
- **Consider**: Refactoring opportunities, architectural improvements, nice-to-have enhancements

#### 2c: Apply fixes based on strategy

**If `--aggressive`:**

- Fix everything in must-fix and should-fix automatically
- Fix consider items too, UNLESS the change is truly base-changing (framework switch, major API redesign). In that case, ask the user

**If `--defensive`:**

- Fix must-fix items automatically
- Fix should-fix items only if clearly safe and low-risk
- Skip consider items entirely
- Report consider items to the user in the terminal for awareness

#### 2d: Handle fix volume

- **Small fixes** (< 5 files, straightforward): Apply directly
- **Large fixes** (many files, complex refactoring): Use `/x-wt-teams` to spawn parallel agents. Group related fixes into topics

#### 2e: Commit fixes

After applying fixes for this round:

1. Run typecheck / lint to verify
2. Commit with descriptive message: `[scope] Fix review round N findings: <summary>`

#### 2f: Report round results

Tell the user what was found and fixed in this round. Be concise.

#### 2g: Early exit

If a round finds 0 actionable issues, skip remaining rounds. Report "No issues found — stopping early."

### Step 3: Finalize

If `--as-pr`:

1. Push changes to remote
2. Invoke `/pr-revise` to update the PR title and description
3. Report the PR URL

If `--stay`:

1. Report what was done across all rounds

## Examples

### Basic: 3 rounds, defensive, stay on branch

```
/review-loop
```

### Aggressive migration review

```
/review-loop 5 --aggressive
```

Runs 5 rounds, fixes aggressively.

### Careful review as a PR

```
/review-loop 3 --defensive --as-pr
```

Creates branch+PR, runs 3 defensive rounds, updates PR.

### Codex-powered review

```
/review-loop 3 --codex
```

Uses `/codex-review` (OpenAI Codex CLI) instead of `/deep-review` for each round.

### GitHub Copilot-powered review

```
/review-loop 3 --github-copilot
```

Uses `/gco-review` (GitHub Copilot CLI) instead of `/deep-review` for each round.

### Quick single round

```
/review-loop 1 --aggressive
```

## Important Notes

- Default review uses `/deep-review` with 3 Opus reviewers in PR mode (or 6 in full project mode)
- With `--codex`, review uses `/codex-review` (OpenAI Codex CLI) instead — faster and cheaper. If codex is rate-limited, `/codex-review` silently falls back to Claude Code reviewers (no workflow interruption)
- With `--github-copilot`, review uses `/gco-review` (GitHub Copilot CLI) instead. If Copilot is rate-limited, `/gco-review` silently falls back to Claude Code reviewers (no workflow interruption)
- Later rounds often find fewer issues as earlier rounds fixed the low-hanging fruit
- The `--aggressive` vs `--defensive` distinction controls the threshold for automatic fixes, not the review depth
- Always run typecheck between rounds to catch regressions from fixes
- If a round finds 0 actionable issues, skip remaining rounds early
- Do NOT create GitHub issues for review findings — findings are reported in the terminal only. Issues created for review findings tend to linger forever since they are not urgent enough to fix immediately
