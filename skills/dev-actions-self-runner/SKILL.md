---
name: dev-actions-self-runner
description: >
  Add self-hosted runner support with automatic fallback to GitHub-hosted runners in GitHub Actions
  workflows. Use when: (1) User wants to add self-hosted runner support to CI, (2) User says
  'self-hosted runner', 'add self runner', 'self-hosted fallback', (3) User wants to save GitHub
  Actions minutes, (4) User asks about runner detection or runner fallback in GitHub Actions.
---

# Self-Hosted Runner with Fallback

Add a reusable `detect-runner.yml` workflow that checks if a self-hosted runner is online via GitHub API, then modify existing workflows to use it for heavy jobs while falling back to `ubuntu-latest` when offline.

## Step 1: Check Project Structure

Verify `.github/workflows/` exists and identify workflows to modify. Focus on **heavy jobs** (build, test, quality checks). Skip lightweight jobs (branch checks, notifications, deploys).

**Keep on `ubuntu-latest`:**

- Jobs using `container:` (Docker) — won't work on macOS/WSL2 self-hosted
- Lightweight gate jobs (check-should-run, security checks)
- Deploy jobs (usually fast, need specific credentials)

## Step 2: Create detect-runner.yml

Create `.github/workflows/detect-runner.yml`:

```yaml
name: Detect Runner

# Reusable workflow to detect if a self-hosted runner is online.
# Falls back to ubuntu-latest if no runner is available or token is not set.
#
# Usage:
#   jobs:
#     detect-runner:
#       uses: ./.github/workflows/detect-runner.yml
#       secrets: inherit
#     my-job:
#       needs: detect-runner
#       runs-on: ${{ needs.detect-runner.outputs.runner }}
#
# Requires RUNNER_CHECK_TOKEN secret (PAT with administration:read scope).
on:
  workflow_call:
    outputs:
      runner:
        description: "Runner label to use (self-hosted or ubuntu-latest)"
        value: ${{ jobs.detect.outputs.runner }}

jobs:
  detect:
    name: Detect Runner
    runs-on: ubuntu-latest
    timeout-minutes: 2
    outputs:
      runner: ${{ steps.detect.outputs.runner }}
    steps:
      - name: Check for online self-hosted runner
        id: detect
        env:
          CHECK_TOKEN: ${{ secrets.RUNNER_CHECK_TOKEN }}
        run: |
          RUNNER_LABEL="ubuntu-latest"

          if [ -n "$CHECK_TOKEN" ]; then
            RESPONSE=$(curl -s --max-time 10 -w "\n%{http_code}" \
              -H "Authorization: Bearer $CHECK_TOKEN" \
              -H "Accept: application/vnd.github+json" \
              -H "X-GitHub-Api-Version: 2022-11-28" \
              "https://api.github.com/repos/${{ github.repository }}/actions/runners")

            HTTP_CODE=$(echo "$RESPONSE" | tail -1)
            BODY=$(echo "$RESPONSE" | sed '$d')

            if [ "$HTTP_CODE" = "200" ] && [ -n "$BODY" ]; then
              ONLINE=$(echo "$BODY" | jq -r '[.runners[]? | select(.status == "online")] | length' 2>/dev/null)
              if [ -z "$ONLINE" ] || [ "$ONLINE" = "null" ]; then
                ONLINE=0
              fi
              if [ "$ONLINE" -gt 0 ]; then
                RUNNER_LABEL="self-hosted"
                echo "Self-hosted runner detected (online)"
              else
                echo "No self-hosted runners online, using ubuntu-latest"
              fi
            else
              echo "Runner API returned $HTTP_CODE, using ubuntu-latest"
            fi
          else
            echo "RUNNER_CHECK_TOKEN not set, using ubuntu-latest"
          fi

          echo "runner=$RUNNER_LABEL" >> "$GITHUB_OUTPUT"
          echo "Selected runner: $RUNNER_LABEL"
```

## Step 3: Modify Existing Workflows

For each workflow with heavy jobs, add the detect-runner call and update `runs-on`:

```yaml
jobs:
  detect-runner:
    uses: ./.github/workflows/detect-runner.yml
    secrets: inherit

  heavy-job:
    needs: [detect-runner, ...existing-needs]
    runs-on: ${{ needs.detect-runner.outputs.runner }}
```

When a workflow already has a gate job (like `check-should-run`), add `detect-runner` as a parallel job and add it to the `needs` of downstream jobs.

## Step 4: Guide User Through Setup

After modifying workflows, inform the user of required setup:

1. **Register self-hosted runner**: repo Settings > Actions > Runners
2. **Create RUNNER_CHECK_TOKEN**: Fine-grained PAT with `Administration: Read-only` for the repo
3. **Add as repo secret**: Settings > Secrets > `RUNNER_CHECK_TOKEN`

Without `RUNNER_CHECK_TOKEN`, all jobs run on `ubuntu-latest` as before (safe default).

For runner setup details (WSL2, systemd, auto-start), see [references/setup-guide.md](references/setup-guide.md).
