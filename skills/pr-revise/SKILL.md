---
name: pr-revise
description: >-
  Update an existing PR's title and description to reflect the full implementation. Use when: (1)
  User says 'revise pr', 'update pr description', 'pr revise', (2) Additional work was done after
  the original PR was created and the PR title/body no longer matches the actual changes, (3) User
  wants to sync the PR metadata with the current state of the branch.
---

# PR Revise

Update an existing PR's title and description to accurately reflect the full implementation, not just the original scope.

## Prerequisites

- Current branch must have an open PR
- If no PR is found, abort with a message: "No PR found for the current branch."

## Step 1: Gather PR and Branch Context

```bash
# Get current branch
BRANCH=$(git branch --show-current)

# Fetch latest
git fetch origin

# Get PR details
gh pr view "$BRANCH" --json number,title,body,baseRefName,headRefName
```

Record the PR number, current title, current body, and base branch.

## Step 2: Analyze Full Implementation

Review ALL changes in the PR — not just recent commits:

```bash
BASE_BRANCH=<baseRefName from step 1>

# All commits in the PR
git log "origin/$BASE_BRANCH".."$BRANCH" --oneline

# Full diff stat
git diff "origin/$BASE_BRANCH"..."$BRANCH" --stat

# Full diff for understanding
git diff "origin/$BASE_BRANCH"..."$BRANCH"
```

Read the diff carefully. Understand:

- What features were added
- What was refactored or fixed
- What files were created, modified, or deleted
- The overall scope and purpose of the changes

## Step 3: Draft New Title and Description

**Optional: Copilot-assisted body draft**

Before drafting manually, attempt to get a Copilot-drafted body:

```bash
BASE_BRANCH=<baseRefName from step 1>
DRAFT=$($HOME/.claude/skills/gco/scripts/gco-pr-body.sh "$BASE_BRANCH" 2>/dev/null || true)
```

If `$DRAFT` is non-empty, use it as the starting point for the body. Claude must still review and adjust it — fill any gaps, fix inaccuracies, and ensure tone/completeness. If the script fails or returns empty, draft directly as below.

---

Based on the full diff analysis:

**Title**: Write a concise PR title (under 70 chars) that captures the overall scope. If the PR covers multiple concerns, summarize the primary theme.

**Description**: Write a comprehensive PR body using this format:

```markdown
## Summary
<2-4 bullet points covering the main changes>

## Changes
<Detailed list of what was done, grouped by category if needed>

## Test Plan
<How to verify the changes work correctly>
```

If the original body contained issue references (e.g., `Closes #123`, `Fixes #456`), preserve them in the new body.

## Step 4: Show the User What Will Change

Present the proposed updates clearly:

```
Current title: <old title>
New title:     <new title>

Current body:
<old body>

New body:
<new body>
```

Ask the user to confirm before applying.

## Step 5: Apply Updates

```bash
PR_NUMBER=<number from step 1>

# Update title
gh pr edit "$PR_NUMBER" --title "<new title>"

# Update body
gh pr edit "$PR_NUMBER" --body "$(cat <<'EOF'
<new body content>
EOF
)"
```

Report the updated PR URL when done.

## Important Notes

- Always analyze the FULL diff against the base branch, not just recent commits
- Preserve issue references from the original body
- Do not change the PR's base branch or draft status
- If the diff is very large, use `--stat` first to get an overview, then read key files selectively
- Copilot output is NEVER applied verbatim — always review and adjust before showing to user

## Copilot draft audit (pr-* skills)

Disposition of every `pr-*` skill regarding the Copilot-draft path:

| Skill | Disposition |
|---|---|
| `/pr` | **Adopt** (this sub-task) |
| `/pr-revise` | **Adopt** (this sub-task) |
| `/pr-complete` | Skip — merge/completion workflow, not text generation |
| `/pr-split` | Skip — structural rearrangement, not text generation |
| `/pr-recreate` | Skip — history cleanup, not text generation |
| `/pr-make-suggestion-edit` | Skip — applies code suggestions as edits, different domain |
| `/pr-make-suggestion-to-pr` | Defer — creates new PRs from suggestion edits; future candidate, track in a follow-up issue |
