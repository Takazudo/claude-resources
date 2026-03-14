---
name: dev-ci-ifttt-notify
description: >-
  Add IFTTT webhook notification to a GitHub Actions CI/CD workflow. Use when: (1) User wants CI
  deploy notifications via IFTTT, (2) User says 'add IFTTT notify', 'CI notification', or 'deploy
  notification', (3) User wants webhook notifications for build/deploy status
argument-hint: <IFTTT_WEBHOOK_URL>
---

# CI IFTTT Notification

Add an IFTTT webhook notification job to a GitHub Actions workflow. The notification reports deploy status (succeeded, failed with reason, cancelled) along with a link to the workflow run.

## Requirements

- User must provide the IFTTT webhook URL (e.g., `https://maker.ifttt.com/trigger/<event>/with/key/<key>`)
- Project must have a GitHub Actions workflow to add the notification to
- `gh` CLI must be available for setting the repo secret

## IFTTT Payload Design

IFTTT notifications (especially mobile push) typically only show `value1` prominently. Put **all critical info in `value1`** so the notification is self-explanatory at a glance:

| Field | Content | Example |
| --- | --- | --- |
| `value1` | `<project>: <emoji> <status>` | `my-app: ✅ Deploy succeeded` |
| `value2` | Run URL for tapping through | `https://github.com/.../runs/123` |
| `value3` | (unused / empty) | `""` |

**Do NOT split project name and status across value1/value2** — the user should see the full picture from the notification title alone.

## Workflow

### 1. Identify the Workflow

Read `.github/workflows/` to find the target workflow (typically the production deploy workflow). Identify all job names and their dependency chain.

### 2. Add the Notify Job

Add a `notify` job at the end of the workflow with this pattern:

```yaml
notify:
  name: Notify
  needs: [<all-prior-jobs>]
  runs-on: ubuntu-latest
  timeout-minutes: 2
  if: always()
  steps:
    - name: Send IFTTT notification
      env:
        IFTTT_PROD_NOTIFY: ${{ secrets.IFTTT_PROD_NOTIFY }}
      run: |
        if [ -z "$IFTTT_PROD_NOTIFY" ]; then
          echo "IFTTT_PROD_NOTIFY not set, skipping notification"
          exit 0
        fi

        JOB1_RESULT="${{ needs.<job1>.result }}"
        JOB2_RESULT="${{ needs.<job2>.result }}"
        DEPLOY_RESULT="${{ needs.<deploy-job>.result }}"
        # ... one variable per job in needs

        # Determine status — check deploy success first, then failures in pipeline order
        if [ "$DEPLOY_RESULT" = "success" ]; then
          STATUS="✅ Deploy succeeded"
        elif [ "$JOB1_RESULT" = "failure" ]; then
          STATUS="❌ <Job1 description> failed"
        elif [ "$JOB2_RESULT" = "failure" ]; then
          STATUS="❌ <Job2 description> failed"
        elif [ "$DEPLOY_RESULT" = "failure" ]; then
          STATUS="❌ Deploy failed"
        else
          STATUS="⚠️ Deploy result: job1=$JOB1_RESULT job2=$JOB2_RESULT deploy=$DEPLOY_RESULT"
        fi

        curl -s -o /dev/null \
          -H "Content-Type: application/json" \
          -d "{\"value1\":\"<project-name>: $STATUS\",\"value2\":\"https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }}\",\"value3\":\"\"}" \
          "$IFTTT_PROD_NOTIFY"
```

Key design points:

- **`value1` contains project name + status** — notification is readable without opening it
- **Emoji prefixes** (`✅`, `❌`, `⚠️`) for instant visual scanning on mobile
- `needs` lists ALL prior jobs so status of each can be checked
- `if: always()` ensures notification runs regardless of success/failure
- Empty check on `IFTTT_PROD_NOTIFY` allows silent skip if secret not configured
- Status determination checks jobs in pipeline order to identify which stage failed
- `curl -s -o /dev/null` to suppress output noise in CI logs

### 3. Set GitHub Repo Secret

```bash
gh secret set IFTTT_PROD_NOTIFY --body "<webhook-url>"
```

Verify with `gh secret list`.

### 4. Update Workflow Header Comment

Add a line to the workflow's header comment describing the notification step.
