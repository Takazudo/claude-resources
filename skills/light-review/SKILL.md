---
name: light-review
description: >-
  Lightweight code review using 2 Sonnet reviewers. Faster and cheaper than /local-review. Use when:
  (1) Quick review of a small change, (2) Child agents self-reviewing before reporting to manager,
  (3) User says 'light review' or 'quick review', (4) Review is needed but full /local-review is
  overkill. Always uses PR mode (diff-based) with 2 reviewers.
model: sonnet
---

# Light Review

Lightweight code review — 2 Sonnet reviewers on the diff. Use this instead of `/local-review` for smaller changes or when speed matters more than depth.

## Review Focus

- Silly mistakes, bugs, and logic errors
- Missing error handling
- Code quality and readability
- Obvious refactoring opportunities

## Process

### Step 1: Get the Diff

```bash
BRANCH=$(git branch --show-current)
BASE=$(gh pr view --json baseRefName -q '.baseRefName' 2>/dev/null)
```

If no PR exists, use the default branch:

```bash
BASE=$(git remote show origin | grep 'HEAD branch' | awk '{print $NF}')
```

```bash
git diff "$BASE"...HEAD
```

### Step 2: Run 2 Parallel Reviews

**Launch 2 code-reviewer subagents in PARALLEL using Sonnet model.**

**Reviewer 1: Bugs & Logic**

```
Review the code changes focusing on:
1. Logic errors, typos, incorrect implementations
2. Missing null checks, off-by-one errors
3. Broken functionality, incorrect API usage
4. Error handling issues

Be concise. Only flag real problems, not style preferences.

REPORTING: Save your FULL findings to the log file (as per your log generation rules).
Then return to the caller ONLY:
- A bullet list of high-priority findings (1 sentence each, max 3 items)
- The log file path
Do NOT return the full analysis — it is in the log file.
```

**Reviewer 2: Quality & Structure**

```
Review the code changes focusing on:
1. Code duplication (DRY violations)
2. Overly complex code that can be simplified
3. Type safety issues
4. Performance concerns (unnecessary re-renders, missing memoization)
5. Better patterns or abstractions

Be concise. Only flag real problems, not style preferences.

REPORTING: Save your FULL findings to the log file (as per your log generation rules).
Then return to the caller ONLY:
- A bullet list of high-priority findings (1 sentence each, max 3 items)
- The log file path
Do NOT return the full analysis — it is in the log file.
```

**CRITICAL: Launch both code-reviewer subagents in PARALLEL in a single message using Sonnet model.**

### Step 3: Synthesize and Apply

After both reviewers complete (each returns high-priority items + log path):

1. Merge and deduplicate findings from brief returns
2. Categorize by priority (high / medium / low)
3. If more detail is needed on a finding, read the reviewer's log file
4. Apply high-priority fixes automatically
5. Apply medium-priority fixes if clearly safe
6. Skip low-priority and style-only suggestions

### Step 4: Commit Fixes

If fixes were applied, commit them with a descriptive message.

## Important Notes

- This is a **lightweight** review — 2 reviewers, Sonnet model
- Reviewers save full findings to log files, return only high-priority items + path
- For thorough review (3-6 Opus reviewers), use `/local-review` instead
- Focus on real bugs and clear improvements, not style nitpicks
- Keep it fast — the goal is a quick sanity check, not a deep audit
- Log files are available via `/logrefer` for future sessions
