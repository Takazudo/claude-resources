---
name: pr-complete
description: "Complete a pull request by monitoring CI checks and merging when ready. Use when: (1) User says 'complete pr', 'merge pr', or 'finish pr', (2) PR is reviewed and ready to merge but CI checks may still be running, (3) User wants to wait for CI and auto-merge."
argument-hint: "[-c/--close] [-k/--keep-issue] [-w/--watch-ci]"
---

# PR Complete

This PR is checked, reviewed, and no other tasks are left. Complete the following:

1. Check the current PR status and CI checks using `gh pr view` and `gh pr checks`
2. If all CI checks have already passed and the PR is approved → proceed to step 4
3. If CI checks are still in progress:
- Invoke `/watch-ci` to monitor CI in the background
- Tell the user: "CI is still running. Watching in background via /watch-ci. Run `/pr-complete` again once CI passes to merge."
- **Stop here** — do NOT block the conversation with polling
4. Once all CI checks are green and the PR is approved:
- Merge the PR using `gh pr merge --merge --delete-branch`
- Confirm the operation completed successfully

**Important:** Before merging, verify:

- All CI checks have passed (if still in progress, use `/watch-ci` and stop)
- The PR has been approved
- You are on the correct branch

If any CI checks fail, report the failure and do not merge.

## `--close` (`-c`) option

If `--close` or `-c` is passed, after the PR is successfully merged:

1. Find the parent issue linked to this PR
- Check PR body for "Closes #N", "Fixes #N", "Resolves #N" patterns
- Also check `gh pr view --json closingIssuesReferences`
2. If a linked issue is found and the PR was merged successfully, close the issue:
- `gh issue close <number>`
- Report which issue was closed

## `--keep-issue` (`-k`) option

If `--keep-issue` or `-k` is passed, after the PR is successfully merged:

1. Find the parent issue linked to this PR (same lookup as `--close`)
2. Instead of closing the issue, prepend `[PR-Merged][Confirm] ` to the issue title:
- `gh issue edit <number> --title "[PR-Merged][Confirm] <original title>"`
- This signals that the PR was merged but the issue needs user confirmation before closing
3. Report which issue was updated

**Note:** `--keep-issue` and `--close` are mutually exclusive. If both are passed, `--keep-issue` takes precedence.

## `--watch-ci` (`-w`) option

If `--watch-ci` or `-w` is passed, after the PR is successfully merged:

1. Determine the merge target branch (the base branch of the PR)
2. Check if there are any CI workflow runs triggered on the merge target branch for the merge commit:
- `gh run list --branch <base-branch> --limit 5 --json databaseId,name,status,conclusion`
3. If CI runs exist on the target branch, invoke `/watch-ci` to monitor the merge target branch CI in the background
- `/watch-ci` already handles merged PRs — it will detect the merged state and watch the target branch CI
4. If no CI runs exist on the target branch, skip and report: "No CI detected on the merge target branch."

**This option is only activated when explicitly passed.** Without `-w`, pr-complete does not watch post-merge CI.
