---
name: review-loop
description: "Iterative code review loop that runs /local-review multiple times, fixing issues each round. Finds bugs, improvements, and quality issues through repeated passes. Use when: (1) User says 'review-loop', 'review loop', or 'review repeat', (2) User wants continuous review+fix cycles to kill tiny problems, (3) User wants thorough multi-pass review before finalizing code, (4) User says 'review 5 rounds' or similar."
user-invocable: true
argument-hint: "[count] [--issues] [--aggressive|--defensive] [--stay|--as-pr]"
---

# Review Loop

Run `/local-review` repeatedly, fixing issues each round. Progressively kills bugs, improves code quality, and surfaces improvement opportunities.

## Input Parsing

Parse arguments to extract:

- **count** (number): How many review rounds. Default: 3
- **--aggressive**: Fix almost everything. Ask user only for truly base-changing decisions (e.g., "should we switch frameworks?"). Use during prototyping, massive migration, or greenfield work
- **--defensive** (default): Handle results carefully. Fix only clear bugs and convention violations. Use when the project is live and stability matters
- **--stay** (default): Apply fixes directly to the current branch
- **--as-pr**: Create a GitHub issue + branch + draft PR, then apply fixes there. Follow the `/x-as-pr` workflow
- **--issues**: Create GitHub issues for review findings that are worth considering but not must-fix. Do NOT create issues for high-priority must-fix items (just fix those directly)

## Workflow

### Step 1: Setup

Determine the working mode from parsed arguments.

If `--as-pr`:

1. Invoke `/x-as-pr --make-issue <description>` to create a tracking issue, branch, and draft PR
2. Record the issue number as `BASE_ISSUE_NUM` and PR number as `PR_NUM`
3. All subsequent work happens on the new branch

If `--stay`:

1. Work directly on the current branch
2. If `--issues` is passed, create a tracking issue to collect child issue links:

```bash
ISSUE_URL=$(gh issue create \
  --title "review-loop: Code quality improvements for $(git branch --show-current)" \
  --body "$(cat <<'EOF'
## Summary
Iterative code review findings and fixes.

## Issues
(child issues added below as they are created)
EOF
)")
BASE_ISSUE_NUM=$(echo "$ISSUE_URL" | grep -o '[0-9]*$')
```

### Step 2: Review Loop (repeat N times)

For each round (1 to N):

#### 2a: Run /local-review

Invoke `/local-review` using the Skill tool. Wait for all reviewers to complete.

#### 2b: Categorize findings

Sort all findings into:

- **Must-fix**: Bugs, logic errors, broken functionality, convention violations, security issues
- **Should-fix**: Code quality, DRY violations, missing types, accessibility gaps
- **Consider**: Refactoring opportunities, architectural improvements, nice-to-have enhancements

#### 2c: Apply fixes based on strategy

**If `--aggressive`:**

- Fix everything in must-fix and should-fix automatically
- Fix consider items too, UNLESS the change is truly base-changing (framework switch, major API redesign). In that case, ask the user
- If `--issues` is also set: create issues for consider items, then implement them too. Link issues to the PR

**If `--defensive`:**

- Fix must-fix items automatically
- Fix should-fix items only if clearly safe and low-risk
- Skip consider items entirely
- If `--issues` is set: create issues for should-fix and consider items but do NOT implement them

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

### Step 3: Create issues (if --issues)

For findings categorized as "consider" (and "should-fix" if `--defensive`):

1. Create a GitHub issue for each finding (or group closely related ones)
2. Each issue body should include:

```markdown
## Context
Found during review-loop round N on branch `<branch>`.

## Description
<what was found and why it matters>

## Suggested approach
<how to fix it>
```

3. If `--as-pr` and a PR exists, add the PR link to each issue:

```markdown
## PR
- <REPO_URL>/pull/<PR_NUM>
```

4. Collect all created issue URLs and update the base issue (if one exists):

```markdown
## Issues
- <REPO_URL>/issues/<ISSUE_1>
- <REPO_URL>/issues/<ISSUE_2>
- <REPO_URL>/issues/<ISSUE_3>
```

Use `gh issue edit <BASE_ISSUE_NUM>` to append the issues list to the body.

### Step 4: Finalize

If `--as-pr`:

1. Push changes to remote
2. Invoke `/pr-revise` to update the PR title and description
3. Report the PR URL

If `--stay`:

1. Report what was done across all rounds
2. If `--issues`, report the list of created issues

## Issue and PR Cross-Linking

### PR body format

Each PR (if `--as-pr`) should start with:

```markdown
- <REPO_URL>/issues/<BASE_ISSUE_NUM>

---

## Summary
...
```

### Issue body format

Each child issue should include (if a PR exists):

```markdown
## PR
- <REPO_URL>/pull/<PR_NUM>
```

### Base issue body format

The base/tracking issue should accumulate all child issue links:

```markdown
## Issues
- <REPO_URL>/issues/48
- <REPO_URL>/issues/46
- <REPO_URL>/issues/44
```

## Examples

### Basic: 3 rounds, defensive, stay on branch

```
/review-loop
```

### Aggressive migration review with issues

```
/review-loop 5 --aggressive --issues
```

Runs 5 rounds, fixes aggressively, creates issues for remaining findings.

### Careful review as a PR

```
/review-loop 3 --defensive --as-pr --issues
```

Creates issue+branch+PR, runs 3 defensive rounds, creates issues for non-critical findings, updates PR.

### Quick single round

```
/review-loop 1 --aggressive
```

## Important Notes

- Each round of `/local-review` uses 3 Opus reviewers in PR mode (or 6 in full project mode)
- Later rounds often find fewer issues as earlier rounds fixed the low-hanging fruit
- The `--aggressive` vs `--defensive` distinction controls the threshold for automatic fixes, not the review depth
- Always run typecheck between rounds to catch regressions from fixes
- If a round finds 0 actionable issues, skip remaining rounds early
