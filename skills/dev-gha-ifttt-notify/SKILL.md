---
name: dev-gha-ifttt-notify
description: "Add IFTTT webhook notification to a GitHub Actions workflow for mobile push notifications on deploy success/failure. Use when: (1) Adding deploy notifications to CI/CD, (2) Setting up IFTTT webhook in GitHub Actions, (3) User mentions 'IFTTT notify', 'deploy notification', 'push notification for CI'."
---

# IFTTT Deploy Notification for GitHub Actions

Add an IFTTT Webhooks notification job to a GitHub Actions workflow. Sends mobile push notifications on deploy success/failure.

The payload layout follows the canonical IFTTT contract (convention C2) owned by `/dev-ci-ifttt-notify` — see that skill for the full rationale. Every skill posting to `IFTTT_PROD_NOTIFY` must use the same value1/value2/value3 layout.

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
- **Notification template**: `{{Value1}}` — already the full `<project>: <emoji> <status>` string, self-explanatory on its own. `{{Value2}}` carries the run URL (use it if the action has a link field); `{{Value3}}` is unused
3. Copy the webhook URL: `https://maker.ifttt.com/trigger/{EVENT_NAME}/with/key/{KEY}`

> If an applet already exists with the old `{{Value1}}: {{Value2}}` template, its IFTTT-side notification template must be updated to match — the applet lives in IFTTT, not in this repo, so this is a manual user action.

### 2. GitHub Repository Secret

Add the webhook URL as a repository secret:

```bash
gh secret set IFTTT_PROD_NOTIFY
# Paste: https://maker.ifttt.com/trigger/{EVENT_NAME}/with/key/{KEY}
```

### 3. Workflow Job

Add a `notify` job at the end of the workflow. It must `needs` all prior jobs and use `if: always()` to run regardless of success/failure.

#### Payload

IFTTT Webhooks accepts `value1`, `value2`, `value3`. This follows the canonical contract owned by `/dev-ci-ifttt-notify`:

| Field | Content | Example |
| --- | --- | --- |
| `value1` | `<project>: <emoji> <status>` | `my-app: ✅ Deploy succeeded` |
| `value2` | Run URL for tapping through | `https://github.com/.../runs/123` |
| `value3` | (unused / empty) | `""` |

**Do NOT split project name and status across value1/value2** — the user should see the full picture from the notification title alone.

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
            STATUS="✅ succeeded"
          elif [ "$QUALITY" = "failure" ]; then
            STATUS="❌ failed (quality checks)"
          elif [ "$BUILD" = "failure" ]; then
            STATUS="❌ failed (build)"
          elif [ "$E2E" = "failure" ]; then
            STATUS="❌ failed (E2E tests)"
          elif [ "$DEPLOY" = "failure" ]; then
            STATUS="❌ failed (deploy)"
          else
            STATUS="⚠️ cancelled"
          fi

          RUN_URL="${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"

          # Send webhook — value1 = "<project>: <emoji> <status>", value2 = run URL, value3 unused
          jq -n \
            --arg v1 "<project-name>: $STATUS" \
            --arg v2 "$RUN_URL" \
            '{value1: $v1, value2: $v2, value3: ""}' | \
          curl -sf -X POST "$IFTTT_PROD_NOTIFY" \
            -H 'Content-Type: application/json' \
            -d @-
```

### Key Details

- **`if: always()`** on the job ensures it runs even when prior jobs fail or are cancelled
- **`if: env.IFTTT_PROD_NOTIFY != ''`** on the step silently skips when the secret is not configured
- **`jq -n`** builds the JSON payload safely (no shell injection from dynamic values)
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
  STATUS="✅ succeeded"
elif [ "$BUILD" = "failure" ]; then
  STATUS="❌ failed (build)"
elif [ "$DEPLOY" = "failure" ]; then
  STATUS="❌ failed (deploy)"
else
  STATUS="⚠️ cancelled"
fi
# value1 = "<project-name>: $STATUS"
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
  -d '{"value1": "my-app: ✅ succeeded", "value2": "https://github.com/owner/repo/actions/runs/123", "value3": ""}'
```
