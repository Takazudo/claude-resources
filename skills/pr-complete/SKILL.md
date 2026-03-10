---
name: pr-complete
description: >-
  Complete a pull request by monitoring CI checks and merging when ready. Use when: (1) User says
  'complete pr', 'merge pr', or 'finish pr', (2) PR is reviewed and ready to merge but CI checks may
  still be running, (3) User wants to wait for CI and auto-merge.
argument-hint: "[--close]"
---

# PR Complete

This PR is checked, reviewed, and no other tasks are left. Complete the following:

1. Check the current PR status and CI checks using `gh pr view`
2. If CI checks are still in progress, continuously monitor them until completion
- Poll the CI status every 10-15 seconds
- Display progress updates to the user
- Wait until all checks complete
3. Once all CI checks are green and the PR is approved:
- Merge the PR using `gh pr merge --merge --delete-branch`
- Confirm the operation completed successfully

**Important:** Before merging, verify:

- All CI checks have passed (wait for them if in progress)
- The PR has been approved
- You are on the correct branch

If any CI checks fail, report the failure and do not merge.

## `--close` option

If `--close` is passed, after the PR is successfully merged:

1. Find the parent issue linked to this PR
- Check PR body for "Closes #N", "Fixes #N", "Resolves #N" patterns
- Also check `gh pr view --json closingIssuesReferences`
2. If a linked issue is found and the PR was merged successfully, close the issue:
- `gh issue close <number>`
- Report which issue was closed
