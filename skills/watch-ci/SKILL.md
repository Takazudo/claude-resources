---
name: watch-ci
description: "Watch GitHub PR CI checks in the background and notify on completion. Use when: (1) User wants to monitor CI/CD pipeline status, (2) User says 'watch CI', 'check CI', 'monitor checks', or 'wait for CI', (3) User wants to know when PR checks pass or fail. Runs a background `gh` polling shell loop (NOT a subagent — near-zero token cost during the watch), sends macOS system notification on completion. Also handles merged PRs by watching the merge target branch CI instead."
---

# Watch CI

Monitor GitHub PR CI checks in the background, notify on completion via macOS system notification.
Also supports watching CI on the merge target branch when a PR is already merged.

The polling itself is a pure shell loop (`gh` CLI + `jq`) launched via `Bash` with `run_in_background: true`. No subagent is spawned — token cost is paid only at launch and at completion, not on every poll cycle.

## Scripts

- `scripts/notify.sh` — macOS notification helper
- `scripts/poll-pr-checks.sh <pr-number> [max-min]` — poll an open PR's checks until terminal, then notify
- `scripts/poll-runs.sh <branch> <commit-sha> [max-min]` — poll workflow runs on a branch+commit until terminal, then notify

All scripts default to a 60-minute cap and a 30-second poll interval.

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

### Step 3: Launch Background Poll (CLI-only, no subagent)

**Do NOT launch a subagent.** Use the Bash tool with `run_in_background: true` to run the polling shell script. The script polls `gh` directly, exits when checks reach a terminal state, fires a macOS notification, and prints a final `RESULT:` line.

For an open PR:

```
bash $HOME/.claude/skills/watch-ci/scripts/poll-pr-checks.sh <PR_NUMBER>
```

For a merged PR:

```
bash $HOME/.claude/skills/watch-ci/scripts/poll-runs.sh <BASE_BRANCH> <MERGE_SHA>
```

Behaviour:

- Polls every 30 seconds (open PR: `gh pr checks`; merged PR: `gh run list --branch ... --commit ...`)
- On **success**: `notify.sh success` (Glass sound) + `RESULT: PASSED` to stdout, exit 0
- On **failure**: `notify.sh error` (Basso sound) with failed check names + `RESULT: FAILED (<names>)`, exit 1
- On **timeout** (default 60 min): `notify.sh warning` (Purr sound) + `RESULT: TIMEOUT`, exit 2

After launching, tell the user: "Watching CI in background. You'll be notified when it completes."

When the background task completes you'll be notified automatically. Read its output file to see the `RESULT:` line, report to the user, and — if FAILED — proceed to Step 5's investigation steps.

### Step 4: All Checks Passed (Foreground Fast Path)

If checks already passed at Step 2/2b (no polling needed):

1. Send notification:

   ```bash
   bash $HOME/.claude/skills/watch-ci/scripts/notify.sh success "All CI checks passed! PR #<number>"
   ```

2. Report the final status summary.

### Step 5: CI Check Failed (Foreground Fast Path)

If checks already failed at Step 2/2b:

1. Send notification:

   ```bash
   bash $HOME/.claude/skills/watch-ci/scripts/notify.sh error "CI check failed: <check-name>. PR #<number>"
   ```

2. Investigate the failure:

   ```bash
   gh pr checks <PR_NUMBER> --json name,state,bucket,link --jq '[.[] | select(.bucket == "fail" or .bucket == "cancel")]'
   gh run list --branch <branch> --status failure --limit 5 --json databaseId,name,conclusion
   gh run view <run-id> --log-failed
   ```

3. Analyze and report. For open PRs: offer to fix. For merged PRs: report only, do NOT auto-fix on the target branch.

## Notes

- Polling is a pure shell loop run via `Bash run_in_background: true` — no subagent, no per-cycle token cost. The main conversation only pays at launch and at completion.
- System notifications use macOS `osascript` via `notify.sh`
- The `gh` CLI must be authenticated and have access to the repository
- 30-second polling interval balances responsiveness with API rate limits
- Default cap 60 minutes; override with the optional `[max-min]` arg to either script
- For merged PRs, watches workflow runs on the target branch filtered by merge commit SHA
- The script's stdout (progress lines + final `RESULT:` line) is captured by the background task — read the output file when you get the completion notification
