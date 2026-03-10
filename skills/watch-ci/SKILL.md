---
name: watch-ci
description: >-
  Watch GitHub PR CI checks in the background and notify on completion. Use when: (1) User wants to
  monitor CI/CD pipeline status, (2) User says 'watch CI', 'check CI', 'monitor checks', or 'wait
  for CI', (3) User wants to know when PR checks pass or fail. Launches a background agent that
  polls CI every 30 seconds, sends macOS system notification on completion. Also handles merged PRs
  by watching the merge target branch CI instead.
---

# Watch CI

Monitor GitHub PR CI checks in the background, notify on completion via macOS system notification.
Also supports watching CI on the merge target branch when a PR is already merged.

## Scripts

- **Notification**: `~/.claude/skills/watch-ci/scripts/notify.sh`

## Workflow

### Step 1: Identify the PR

Determine which PR to watch:

```bash
# If user provides a PR number or URL, use it directly
# Otherwise, detect from current branch
gh pr view --json number,title,url,headRefName,baseRefName,state,mergeCommit --jq '{number,title,url,headRefName,baseRefName,state,mergeCommit}'
```

If no PR is found for the current branch, inform the user and stop.

**Check the PR state:**

- If `state` is `"OPEN"` → proceed to Step 2 (normal PR watch)
- If `state` is `"MERGED"` → proceed to Step 2b (merged PR: watch target branch CI)
- If `state` is `"CLOSED"` (not merged) → inform the user the PR was closed without merging and stop

### Step 2: Show Initial Status (Open PR)

Show the current state:

```bash
gh pr checks <PR_NUMBER> --json name,state,bucket,workflow
```

Report to the user: PR number/title, total checks, current status breakdown (passed/pending/failed).

If all checks already passed or failed, skip to Step 4 or Step 5 respectively. Otherwise proceed to **Step 3**.

### Step 2b: Merged PR — Switch to Target Branch CI

When the PR is already merged:

1. Get the base branch and merge commit SHA from Step 1 output
2. Inform the user: "PR #123 is already merged into `main`. Watching CI on `main` for merge commit `abc1234`..."
3. Show initial status:

   ```bash
   gh run list --branch <base-branch> --commit <merge-commit-sha> --json databaseId,name,status,conclusion --limit 20
   ```

   If no runs found with commit SHA, retry without it:

   ```bash
   gh run list --branch <base-branch> --json databaseId,name,status,conclusion --limit 10
   ```

4. Proceed to **Step 3**.

### Step 3: Launch Background Watch

Launch a **background Agent** to poll CI status. The agent should:

- Poll every 30 seconds using `sleep 30` between checks
- For open PRs: run `gh pr checks <PR_NUMBER> --json name,state,bucket` each cycle
- For merged PRs: run `gh run list --branch <base-branch> --commit <sha> --json databaseId,name,status,conclusion --limit 20` each cycle
- Print a brief progress update each cycle (e.g., "5/8 passed, 3 pending")
- Stop when all checks reach a terminal state (all passed, or any failed)
- On **success**: run `bash ~/.claude/skills/watch-ci/scripts/notify.sh success "All CI checks passed! PR #<number>"`
- On **failure**: run `bash ~/.claude/skills/watch-ci/scripts/notify.sh error "CI check failed: <check-name>. PR #<number>"`
- Maximum watch time: 60 minutes. After that, notify with warning and stop.

**Agent prompt template** (adapt based on PR state):

```
Watch CI for PR #<NUMBER> (<title>).
Poll every 30 seconds until all checks complete.

For each poll cycle:
1. Run: gh pr checks <NUMBER> --json name,state,bucket
2. Count passed/pending/failed from the bucket field
3. Print progress: "Checking... X/Y passed, Z pending"
4. If all terminal (no pending): stop and notify

On completion:
- If all passed: run bash ~/.claude/skills/watch-ci/scripts/notify.sh success "All CI checks passed! PR #<NUMBER>"
- If any failed: run bash ~/.claude/skills/watch-ci/scripts/notify.sh error "CI check failed: <failed-check-names>. PR #<NUMBER>"
  Then investigate: run gh run list --branch <branch> --status failure --limit 5 --json databaseId,name,conclusion
  Then run gh run view <run-id> --log-failed for each failed run
  Analyze the logs and report the root cause.

Between each check: sleep 30
Max duration: 60 minutes (warn and stop if exceeded)
```

Tell the user: "Watching CI in background. You'll be notified when it completes."

### Step 4: All Checks Passed (Foreground Fast Path)

If checks already passed at Step 2/2b (no polling needed):

1. Send notification:

   ```bash
   bash ~/.claude/skills/watch-ci/scripts/notify.sh success "All CI checks passed! PR #<number>"
   ```

2. Report the final status summary.

### Step 5: CI Check Failed (Foreground Fast Path)

If checks already failed at Step 2/2b:

1. Send notification:

   ```bash
   bash ~/.claude/skills/watch-ci/scripts/notify.sh error "CI check failed: <check-name>. PR #<number>"
   ```

2. Investigate the failure:

   ```bash
   gh pr checks <PR_NUMBER> --json name,state,bucket,link --jq '[.[] | select(.bucket == "fail" or .bucket == "cancel")]'
   gh run list --branch <branch> --status failure --limit 5 --json databaseId,name,conclusion
   gh run view <run-id> --log-failed
   ```

3. Analyze and report. For open PRs: offer to fix. For merged PRs: report only, do NOT auto-fix on the target branch.

## Notes

- Uses background Agent for polling — the main conversation stays free
- No custom shell scripts for checking — uses `gh` commands directly
- System notifications use macOS `osascript` via notify.sh
- The `gh` CLI must be authenticated and have access to the repository
- 30-second polling interval balances responsiveness with API rate limits
- For merged PRs, watches workflow runs on the target branch filtered by merge commit SHA
