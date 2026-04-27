---
name: pr-complete
description: "Complete a pull request by monitoring CI checks and merging when ready. Use when: (1) User says 'complete pr', 'merge pr', or 'finish pr', (2) PR is reviewed and ready to merge but CI checks may still be running, (3) User wants to wait for CI and auto-merge."
argument-hint: "[-c/--close] [-k/--keep-issue] [-w/--watch-ci] [-now/--no-wait]"
---

# PR Complete

This PR is checked, reviewed, and no other tasks are left. Complete the following:

## Step 0: Pre-flight — check for uncommitted changes

Before anything else, run `git status` and `git diff --stat` to check for unstaged or staged-but-uncommitted changes.

- **If the working tree is clean** → skip to step 1.
- **If there are uncommitted changes:**
  - Look at what changed. In most cases, the user simply forgot to commit before invoking `/pr-complete`.
  - **If it's clearly work that belongs in this PR** (source code, config, docs related to the current branch's topic) → invoke `/commits push` to commit and push automatically, then continue to step 1.
  - **If it's ambiguous** (unrelated files, experimental changes, files you're unsure about) → tell the user: "There are uncommitted changes. Please run `/commits push` first, then re-invoke `/pr-complete`." and **stop here**.

## Step 1: Check PR status

1. Check the current PR status and CI checks using `gh pr view` and `gh pr checks`
2. If `--no-wait` / `-now` was passed → skip the CI wait and merge immediately (see "`--no-wait` (`-now`) option" below)
3. If all CI checks have already passed and the PR is approved → proceed to step 4
4. If CI checks are still in progress:
- Invoke `/watch-ci` to monitor CI in the background
- Tell the user: "CI is still running. Watching in background via /watch-ci"
- do NOT block the conversation with polling
5. Once all CI checks are green and the PR is approved:
- Merge the PR using `gh pr merge --merge --delete-branch`
- Confirm the operation completed successfully

**Important:** Before merging, verify:

- All CI checks have passed (if still in progress, use `/watch-ci` and stop), unless `--no-wait` was passed
- The PR has been approved
- You are on the correct branch

If any CI checks fail, report the failure and do not merge (unless `--no-wait` was explicitly passed — see below).

## `--no-wait` (`-now`) option

If `--no-wait` or `-now` is passed, skip the CI watch entirely and merge the PR immediately, regardless of check status:

1. Do NOT invoke `/watch-ci`
2. Do NOT block on or wait for CI checks to complete
3. Run `gh pr merge --merge --delete-branch` straight away
- If GitHub rejects the merge because branch protection requires passing checks, report the error to the user and stop. Do not retry, do not bypass with admin merge unless the user explicitly asks
4. Then proceed to the post-merge steps (`--close` / `--keep-issue` / `--watch-ci`) as normal

**When to use:** the user has already verified locally that the changes are good (or doesn't care about CI for this merge) and wants the PR merged now without waiting on the pipeline. This is an explicit opt-in — never assume `--no-wait` from context.

**Note:** `--no-wait` only skips waiting for CI checks. The `--watch-ci` (`-w`) option, which watches **post-merge** CI on the target branch, is independent and still works alongside `-now`.

## `--close` (`-c`) option

If `--close` or `-c` is passed, after the PR is successfully merged:

1. Find the parent issue linked to this PR
- Check PR body for "Closes #N", "Fixes #N", "Resolves #N" patterns
- Also check `gh pr view --json closingIssuesReferences`
2. If a linked issue is found and the PR was merged successfully:
- Check if it is an **epic issue** (one that holds sub-issues):

     a. Fetch the issue body: `gh issue view <number> --json body`
     b. Look for task list entries referencing issues in the body:

  - Patterns: `- [ ] #N`, `- [x] #N`, `- [ ] owner/repo#N`, `- [x] owner/repo#N`

     c. Also try the GitHub sub-issues API: `gh api repos/{owner}/{repo}/issues/<number>/sub_issues`
        (this returns a list if the newer GitHub sub-issues feature is in use)

- If sub-issues are found (either from the body task list or the API):
  - For each sub-issue:
    - Confirm it is still open: `gh issue view <sub-issue-number> --json state`
    - If open, close it: `gh issue close <sub-issue-number>`
    - Report each closure
  - After all sub-issues are closed, close the epic issue itself:
    - `gh issue close <number>`
    - Report that the epic issue was closed
- If no sub-issues are found (regular issue):
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
