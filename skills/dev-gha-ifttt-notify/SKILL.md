---
name: dev-gha-ifttt-notify
description: >-
  Add IFTTT webhook notification to a GitHub Actions workflow for mobile push notifications on
  deploy success/failure. Use when: (1) Adding deploy notifications to CI/CD, (2) Setting up IFTTT
  webhook in GitHub Actions, (3) User mentions 'IFTTT notify', 'deploy notification', 'push
  notification for CI'
disable-model-invocation: true
---

# IFTTT Deploy Notification for GitHub Actions

Add an IFTTT Webhooks notification job to a GitHub Actions workflow. Sends mobile push notifications on deploy success/failure.

## Architecture

```
GitHub Actions workflow completes
  -> notify job (if: always())
    -> Collect job results from prior jobs
    -> Determine status string
    -> POST JSON to IFTTT Webhooks URL
      -> IFTTT triggers mobile push notification
```

The notification is silently skipped when the secret is not set, making it safe to add without requiring all contributors to configure IFTTT.

## Setup Steps

### 1. IFTTT Applet

1. Go to https://ifttt.com/maker_webhooks
2. Create a new applet:
- **Trigger**: Webhooks -> "Receive a web request"
- **Event name**: Choose a name (e.g., `deploy_notify`, project name, etc.)
- **Action**: Notifications -> "Send a notification from the IFTTT app" (or any other action)
- **Notification template**: `{{Value1}}: {{Value2}}` (status + commit info). `{{Value3}}` contains the workflow run URL
3. Copy the webhook URL: `https://maker.ifttt.com/trigger/{EVENT_NAME}/with/key/{KEY}`

### 2. GitHub Repository Secret

Add the webhook URL as a repository secret:

```bash
gh secret set IFTTT_PROD_NOTIFY
# Paste: https://maker.ifttt.com/trigger/{EVENT_NAME}/with/key/{KEY}
```

### 3. Workflow Job

Add a `notify` job at the end of the workflow. It must `needs` all prior jobs and use `if: always()` to run regardless of success/failure.

#### Payload

IFTTT Webhooks accepts `value1`, `value2`, `value3`:

| Field    | Content                                              |
| -------- | ---------------------------------------------------- |
| `value1` | Status string (e.g., "succeeded", "failed (build)")  |
| `value2` | Short commit info (`{7-char SHA} {message}`)         |
| `value3` | GitHub Actions workflow run URL                      |

#### Implementation Pattern

```yaml
  notify:
    name: Deploy Notification
    needs: [quality, build, e2e-full, deploy]  # adjust to your job names
    if: always()
    runs-on: ubuntu-latest
    timeout-minutes: 5

    steps:
      - name: Notify via IFTTT
        if: env.IFTTT_PROD_NOTIFY != ''
        env:
          IFTTT_PROD_NOTIFY: ${{ secrets.IFTTT_PROD_NOTIFY }}
        run: |
          # Collect results from prior jobs
          QUALITY="${{ needs.quality.result }}"
          BUILD="${{ needs.build.result }}"
          E2E="${{ needs.e2e-full.result }}"
          DEPLOY="${{ needs.deploy.result }}"

          # Determine status (check deploy success first, then failures in order)
          if [ "$DEPLOY" = "success" ]; then
            STATUS="succeeded"
          elif [ "$QUALITY" = "failure" ]; then
            STATUS="failed (quality checks)"
          elif [ "$BUILD" = "failure" ]; then
            STATUS="failed (build)"
          elif [ "$E2E" = "failure" ]; then
            STATUS="failed (E2E tests)"
          elif [ "$DEPLOY" = "failure" ]; then
            STATUS="failed (deploy)"
          else
            STATUS="cancelled"
          fi

          # Build commit info
          COMMIT_MSG=$(git log -1 --format='%s' "${{ github.sha }}" 2>/dev/null || echo "Deploy")
          SHORT_SHA=$(echo "${{ github.sha }}" | cut -c1-7)
          RUN_URL="${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"

          # Send webhook
          jq -n \
            --arg v1 "$STATUS" \
            --arg v2 "$SHORT_SHA $COMMIT_MSG" \
            --arg v3 "$RUN_URL" \
            '{value1: $v1, value2: $v2, value3: $v3}' | \
          curl -sf -X POST "$IFTTT_PROD_NOTIFY" \
            -H 'Content-Type: application/json' \
            -d @-
```

### Key Details

- **`if: always()`** on the job ensures it runs even when prior jobs fail or are cancelled
- **`if: env.IFTTT_PROD_NOTIFY != ''`** on the step silently skips when the secret is not configured
- **`jq -n`** builds the JSON payload safely (no shell injection from commit messages)
- **`curl -sf`** fails silently (`-s`) and returns non-zero on HTTP errors (`-f`)
- **`timeout-minutes: 5`** prevents the notification job from hanging indefinitely
- **`needs` list** must include all jobs whose results you want to report on

### Adapting to Your Workflow

Adjust the `needs` list and status detection logic to match your workflow's job names. The pattern works with any number of jobs:

```yaml
# Simple workflow with just build + deploy
needs: [build, deploy]

# ...
if [ "$DEPLOY" = "success" ]; then
  STATUS="succeeded"
elif [ "$BUILD" = "failure" ]; then
  STATUS="failed (build)"
elif [ "$DEPLOY" = "failure" ]; then
  STATUS="failed (deploy)"
else
  STATUS="cancelled"
fi
```

### .env.example Entry

Add a commented reference in `.env.example` for documentation:

```bash
# IFTTT webhook for production deploy notifications (GitHub Actions)
# Create at: https://ifttt.com/maker_webhooks
# IFTTT_PROD_NOTIFY=https://maker.ifttt.com/trigger/{event}/with/key/xxxxxx
```

### Testing the Webhook

```bash
curl -sf -X POST "https://maker.ifttt.com/trigger/{EVENT}/with/key/{KEY}" \
  -H 'Content-Type: application/json' \
  -d '{"value1": "succeeded", "value2": "abc1234 test commit", "value3": "https://github.com/..."}'
```
