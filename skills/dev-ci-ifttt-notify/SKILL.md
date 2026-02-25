---
name: dev-ci-ifttt-notify
description: Add IFTTT webhook notification to a GitHub Actions CI/CD workflow. Use when: (1) User wants CI deploy notifications via IFTTT, (2) User says 'add IFTTT notify', 'CI notification', or 'deploy notification', (3) User wants webhook notifications for build/deploy status
argument-hint: <IFTTT_WEBHOOK_URL>
---

# CI IFTTT Notification

Add an IFTTT webhook notification job to a GitHub Actions workflow. The notification reports deploy status (succeeded, failed with reason, cancelled) along with commit info and a link to the workflow run.

## Requirements

- User must provide the IFTTT webhook URL (e.g., `https://maker.ifttt.com/trigger/<event>/with/key/<key>`)
- Project must have a GitHub Actions workflow to add the notification to
- `gh` CLI must be available for setting the repo secret

## Workflow

### 1. Identify the Workflow

Read `.github/workflows/` to find the target workflow (typically the production deploy workflow). Identify all job names and their dependency chain.

### 2. Add the Notify Job

Add a `notify` job at the end of the workflow with this pattern:

```yaml
notify:
  name: Deploy Notification
  needs: [<all-prior-jobs>]
  if: always()
  runs-on: ubuntu-latest
  timeout-minutes: 5

  steps:
    - name: Notify via IFTTT
      if: env.IFTTT_PROD_NOTIFY != ''
      env:
        IFTTT_PROD_NOTIFY: ${{ secrets.IFTTT_PROD_NOTIFY }}
      run: |
        JOB1="${{ needs.<job1>.result }}"
        JOB2="${{ needs.<job2>.result }}"
        # ... one variable per job in needs

        # Determine status - check deploy success first, then failures in pipeline order
        if [ "$DEPLOY_JOB" = "success" ]; then
          STATUS="succeeded"
        elif [ "$JOB1" = "failure" ]; then
          STATUS="failed (<job1 description>)"
        elif [ "$JOB2" = "failure" ]; then
          STATUS="failed (<job2 description>)"
        else
          STATUS="cancelled"
        fi

        COMMIT_MSG=$(echo '${{ github.event.head_commit.message }}' | head -1 | sed 's/"/\\"/g')
        SHORT_SHA=$(echo "${{ github.sha }}" | cut -c1-7)
        RUN_URL="${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"

        curl -sf -X POST "$IFTTT_PROD_NOTIFY" \
          -H 'Content-Type: application/json' \
          -d "{
            \"value1\": \"${STATUS}\",
            \"value2\": \"${SHORT_SHA} ${COMMIT_MSG}\",
            \"value3\": \"${RUN_URL}\"
          }"
```

Key design points:

- `needs` lists ALL prior jobs so status of each can be checked
- `if: always()` ensures notification runs regardless of success/failure
- `if: env.IFTTT_PROD_NOTIFY != ''` on the step allows silent skip if secret not configured
- Status determination checks jobs in pipeline order to identify which stage failed
- IFTTT payload: value1=status, value2=commit context, value3=run URL

### 3. Update .env

Add the webhook URL to the project's `.env` file:

```
IFTTT_PROD_NOTIFY=<webhook-url>
```

### 4. Set GitHub Repo Secret

```bash
gh secret set IFTTT_PROD_NOTIFY --body "<webhook-url>"
```

Verify with `gh secret list`.

### 5. Update Workflow Header Comment

Add a line to the workflow's header comment describing the notification step.
