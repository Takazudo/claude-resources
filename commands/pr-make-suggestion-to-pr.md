---
name: pr-make-suggestion-to-pr
description: "Create separate suggestion PRs from unstaged edits, each based on current PR branch."
---

# PR Make Suggestion To PR

Create separate pull requests for each suggestion topic from the unstaged changes, with each PR based on the current PR branch.

## Context

This command is typically used after `/pr-make-suggestion-edit` which leaves unstaged changes. These changes represent suggestions to improve the current PR, grouped by topic.

## Process

### Step 1: Analyze Unstaged Changes

1. Check current branch and PR
2. View all unstaged changes: `git status`, `git diff --stat`, `git diff`
3. Analyze the changes and determine logical groupings

### Step 2: Group Changes by Topic

Examples of topics:
- Formatting errors
- Type safety improvements
- Refactoring for better patterns
- Performance optimizations
- Accessibility improvements

Present the groupings to the user for confirmation.

### Step 3: Create Suggestion PRs

For **each topic**, create a separate PR:

1. **Create a new branch based on CURRENT branch (not base branch)**
   ```bash
   git checkout -b suggest/[descriptive-topic-name] $ORIGINAL_BRANCH
   ```

2. **Selectively stage only files for this topic**

3. **Create commit following project conventions**
   ```bash
   git commit -m "suggest: [clear description]"
   ```

4. **Push and create PR targeting the original PR branch**
   ```bash
   gh pr create --base $ORIGINAL_BRANCH --title "suggest: [title]"
   ```

5. **Return to original branch for next topic**

### Step 4: Verify and Report

List all created PRs and remaining unstaged changes.

## Important Rules

### Branch Strategy
- **Base suggestion PRs on the CURRENT PR branch** (not on main/master)
- Branch names should start with `suggest/`
- This creates a chain: main <- original-pr <- suggestion-pr

### Commit & PR Conventions
- **PR titles MUST start with `suggest: `**
- Follow project's commit message format
- Follow project's PR format

### Process
- One topic = One PR (don't mix unrelated changes)
- Stage only relevant files for each PR
- Test that changes still work (type check if applicable)
- Provide clear URLs to all created PRs

## Notes

- This command works with `/pr-make-suggestion-edit` as a pair
- Each suggestion PR is **independent and reviewable**
- The base PR maintainer can choose which suggestions to merge
- After merging suggestions, they become part of the base PR
