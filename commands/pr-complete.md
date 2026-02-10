---
name: pr-complete
description: Complete a pull request by monitoring CI checks and merging when ready.
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
