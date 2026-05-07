---
name: dev-actions-self-runner
description: "Add self-hosted runner support with automatic fallback to GitHub-hosted runners in GitHub Actions workflows. Use when: (1) User wants to add self-hosted runner support, (2) User says 'self-hosted runner', 'add self runner', 'self-hosted fallback', (3) User wants to save GitHub Actions minutes."
---

# Self-Hosted Runner with Fallback

Add a reusable `detect-runner.yml` workflow that checks if a self-hosted runner is online via GitHub API, then modify existing workflows to use it for heavy jobs while falling back to `ubuntu-latest` when offline.

## Step 1: Check Project Structure

Verify `.github/workflows/` exists and identify workflows to modify. Focus on **heavy jobs** (build, test, quality checks). Skip lightweight jobs (branch checks, notifications, deploys).

**Keep on `ubuntu-latest`:**

- Lightweight gate jobs (check-should-run, security checks)

**Special handling needed:**

- Jobs using `container:` (Docker) — works on WSL2 with Docker installed, but requires a permissions cleanup step (see [references/self-hosted-gotchas.md](references/self-hosted-gotchas.md))
- Deploy jobs using artifacts only (no checkout) — need workspace cleanup step due to stale files from prior jobs

## Step 2: Ask About Runner Registration Level

Ask the user: **"Is your self-hosted runner registered at the organization level or the repository level?"**

- **Organization level** (Settings > Actions > Runners at the org, shared with repos): Use the **org API** endpoint
- **Repository level** (Settings > Actions > Runners at the repo): Use the **repo API** endpoint

This determines both the API endpoint and the required token permissions.

| Level | API Endpoint | Token Permission |
| --- | --- | --- |
| **Org** | `/orgs/{org}/actions/runners` | Organization self-hosted runners: Read |
| **Repo** | `/repos/{owner}/{repo}/actions/runners` | Administration: Read-only |

## Step 3: Create detect-runner.yml

Create `.github/workflows/detect-runner.yml` using the appropriate API endpoint based on the user's answer in Step 2.

**For organization-level runners:**

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
# Requires RUNNER_CHECK_TOKEN secret (fine-grained PAT with
# "Organization self-hosted runners: Read-only" permission).
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
            # Check org-level runners first, then repo-level
            ORG="${{ github.repository_owner }}"
            ONLINE=0

            for API_URL in \
              "https://api.github.com/orgs/${ORG}/actions/runners" \
              "https://api.github.com/repos/${{ github.repository }}/actions/runners"; do

              echo "Checking: $API_URL"
              RESPONSE=$(curl -s --max-time 10 -w "\n%{http_code}" \
                -H "Authorization: Bearer $CHECK_TOKEN" \
                -H "Accept: application/vnd.github+json" \
                -H "X-GitHub-Api-Version: 2022-11-28" \
                "$API_URL")

              HTTP_CODE=$(echo "$RESPONSE" | tail -1)
              BODY=$(echo "$RESPONSE" | sed '$d')

              if [ "$HTTP_CODE" = "200" ] && [ -n "$BODY" ]; then
                COUNT=$(echo "$BODY" | jq -r '[.runners[]? | select(.status == "online")] | length' 2>/dev/null)
                if [ -n "$COUNT" ] && [ "$COUNT" != "null" ] && [ "$COUNT" -gt 0 ]; then
                  ONLINE=$COUNT
                  echo "Found $ONLINE online runner(s)"
                  break
                fi
              else
                echo "API returned $HTTP_CODE, trying next"
              fi
            done

            if [ "$ONLINE" -gt 0 ]; then
              RUNNER_LABEL="self-hosted"
              echo "Self-hosted runner detected (online)"
            else
              echo "No self-hosted runners online, using ubuntu-latest"
            fi
          else
            echo "RUNNER_CHECK_TOKEN not set, using ubuntu-latest"
          fi

          echo "runner=$RUNNER_LABEL" >> "$GITHUB_OUTPUT"
          echo "Selected runner: $RUNNER_LABEL"
```

**For repository-level runners:** Use the same template but replace the API URL line with:

```yaml
              "https://api.github.com/repos/${{ github.repository }}/actions/runners")
```

And update the comment to: `# Requires RUNNER_CHECK_TOKEN secret (PAT with administration:read scope).`

## Step 4: Modify Existing Workflows

For each workflow, add the detect-runner call and update `runs-on`. By default, put all jobs on dynamic runner. If the user prefers, keep lightweight jobs (deploy, notify) on `ubuntu-latest`.

### Gate `actions/setup-node` and `actions/cache` to GH-hosted only

**On self-hosted runners these actions are pure overhead** — node is pre-installed and tool caches like `~/.cache/ms-playwright` or `~/.cache/pnpm` persist between runs naturally. But `actions/setup-node` will redownload/reextract node every run, and `actions/cache` will upload/download the cache to GitHub-hosted storage every run.

Real-world cost (zudo-pattern-gen run [#24927434497](https://github.com/zudolab/zudo-pattern-gen/actions/runs/24927434497/job/72999635846), self-hosted WSL2 runner that had degraded into a stuck state):

| Step | Cancelled run (`x0x-wsl2-zudolab-4`) | Healthy run (`x0x-wsl2-zudolab`) |
|---|---|---|
| `Setup Node.js` | **5m 58s** | 1s |
| `Cache Playwright browsers` (restore) | **10m 12s** | 1s |
| `Post Cache Playwright browsers` (save) | 24s (cancelled) | **5m 29s** every run |

Even on a healthy self-hosted runner, the post-cache save step burned ~5 min uploading 200MB for a directory that was already on disk. On the degraded runner the same steps appeared to hang.

**Pattern — gate both with the same `if:` used for `Install Playwright system deps (GH-hosted only)`:**

```yaml
# Self-hosted runners have node pre-installed; setup-node would
# redownload/reextract it every run.
- name: Setup Node.js (GH-hosted only)
  if: needs.detect-runner.outputs.runner == 'ubuntu-latest'
  uses: actions/setup-node@v5
  with:
    node-version: 22

# On GH-hosted, cache the browser binaries so reinstalling chromium only
# happens when the Playwright version bumps. On self-hosted runners,
# ~/.cache/ms-playwright persists between runs naturally — using
# actions/cache there costs ~10 min restore + ~5 min save uploading
# 200MB to GitHub for a directory that is already on disk.
- name: Cache Playwright browsers (GH-hosted only)
  if: needs.detect-runner.outputs.runner == 'ubuntu-latest'
  uses: actions/cache@v4
  with:
    path: ~/.cache/ms-playwright
    key: ${{ runner.os }}-playwright-${{ hashFiles('pnpm-lock.yaml') }}
    restore-keys: |
      ${{ runner.os }}-playwright-
```

Apply the same gate to any other `actions/cache` step whose `path:` is a tool cache that would naturally persist (Playwright, pnpm store, Cypress, Puppeteer, etc.). Project-source caches (e.g., `node_modules` build outputs that are populated by job steps) usually don't need this — they're not "naturally" present on a fresh checkout.

### Per-step `timeout-minutes` as a fail-fast safety net

Job-level `timeout-minutes: 25` lets a stuck cache or setup-node burn the full budget before the workflow gives up. For steps that have historically hung on degraded runners (`Setup Node.js`, `Cache Playwright browsers`, `pnpm install` on a corrupted store), add a tight per-step timeout so the workflow fails fast and a re-trigger lands on a healthy runner:

```yaml
- name: Cache Playwright browsers (GH-hosted only)
  if: needs.detect-runner.outputs.runner == 'ubuntu-latest'
  timeout-minutes: 3
  uses: actions/cache@v4
  # ...
```

Suggested values: 3–5 min for cache restore/save, 3 min for setup-node. If the step usually completes in <30s on a healthy runner, 3 min is generous. The worst case is one wasted run that fails fast instead of a 25 min hang plus a manual cancel.

### If a single self-hosted runner is consistently slow

The runner detection logic returns "any online runner" — it does not load-balance across multiple registered runners or detect degraded ones. If one specific runner (e.g., `x0x-wsl2-zudolab-4` in the example above) is consistently slower than its siblings, that is a host-level issue: check WSL2 disk/memory limits in `.wslconfig`, VHDX size and free space, and whether multiple runners on the same Windows host are competing for IO. Workflow-level gating + per-step timeouts make degraded runners survivable, but they don't fix the underlying host.

### Replacing Docker container jobs (e.g., Playwright)

If a workflow uses `container:` with a Docker image (e.g., `mcr.microsoft.com/playwright:v1.59.1-noble`), **replace it with direct tool installation**. Docker may not be available on self-hosted runners.

```yaml
# Before (Docker container):
e2e-tests:
  runs-on: ubuntu-latest
  container:
    image: mcr.microsoft.com/playwright:v1.59.1-noble
  steps:
    - run: pnpm install --frozen-lockfile
      env:
        PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: 1

# After (direct install with sudo-n pattern):
e2e-tests:
  needs: detect-runner
  runs-on: ${{ needs.detect-runner.outputs.runner }}
  steps:
    - run: pnpm install --frozen-lockfile
    - name: Install Playwright browsers
      run: |
        # --with-deps requires sudo for apt-get (GitHub-hosted has it, self-hosted may not)
        if sudo -n true 2>/dev/null; then
          pnpm exec playwright install --with-deps chromium
        else
          pnpm exec playwright install chromium
        fi
```

Also **remove any Playwright browser cache steps** (`actions/cache` with `~/.cache/ms-playwright`) — browsers persist on self-hosted runners naturally, and on GitHub-hosted the fresh download is fast enough (~30s).

### Removing cache maintenance workflows

If the project has a cache-maintenance workflow that exists solely to keep Playwright (or similar) caches alive, **delete it** — the caches are no longer needed.

### Multi-job workflows (build → deploy → notify)

```yaml
jobs:
  detect-runner:
    uses: ./.github/workflows/detect-runner.yml
    secrets: inherit

  build:
    needs: detect-runner
    runs-on: ${{ needs.detect-runner.outputs.runner }}
    # ... heavy build steps

  deploy:
    needs: [detect-runner, build]
    runs-on: ${{ needs.detect-runner.outputs.runner }}
    # ... deploy steps

  notify:
    needs: [detect-runner, build, deploy]
    runs-on: ${{ needs.detect-runner.outputs.runner }}
```

### Single-job workflows (build + deploy in one job)

The entire job gets the dynamic runner:

```yaml
jobs:
  detect-runner:
    uses: ./.github/workflows/detect-runner.yml
    secrets: inherit

  build-and-deploy:
    needs: detect-runner
    runs-on: ${{ needs.detect-runner.outputs.runner }}
    # ... build + deploy steps together
```

### With existing gate jobs

Add `detect-runner` as a parallel job alongside existing gates:

```yaml
jobs:
  check-should-run:
    # ... existing gate logic
  detect-runner:
    uses: ./.github/workflows/detect-runner.yml
    secrets: inherit

  build:
    needs: [check-should-run, detect-runner]
    runs-on: ${{ needs.detect-runner.outputs.runner }}
```

## Step 5: Ask About IFTTT Fallback Notification

Ask the user: **"Would you like to receive an IFTTT notification when the self-hosted runner is offline and CI falls back to ubuntu-latest?"**

If the user says **yes**, add a notification step to `detect-runner.yml` after the detect step:

```yaml
      - name: Notify IFTTT on fallback
        if: steps.detect.outputs.runner == 'ubuntu-latest' && env.IFTTT_PROD_NOTIFY != ''
        env:
          IFTTT_PROD_NOTIFY: ${{ secrets.IFTTT_PROD_NOTIFY }}
          SERVER_URL: ${{ github.server_url }}
          REPO: ${{ github.repository }}
          RUN_ID: ${{ github.run_id }}
        run: |
          RUN_URL="${SERVER_URL}/${REPO}/actions/runs/${RUN_ID}"
          curl -sSf --max-time 10 -X POST "$IFTTT_PROD_NOTIFY" \
            -H 'Content-Type: application/json' \
            -d "{
              \"value1\": \"$(echo $REPO | rev | cut -d/ -f1 | rev): self-hosted runner offline\",
              \"value2\": \"Falling back to ubuntu-latest\",
              \"value3\": \"${RUN_URL}\"
            }" || echo "::warning::IFTTT notification failed"
```

Then tell the user:

> To enable notifications, add your IFTTT Webhooks URL as a repo secret:
>
> 1. Go to https://ifttt.com/maker_webhooks → Documentation to find your webhook URL
> 2. Create a Webhooks applet that triggers on the event you choose
> 3. Add the webhook URL as a repo secret named `IFTTT_PROD_NOTIFY`:
>    - Settings → Secrets and variables → Actions → New repository secret
>    - Name: `IFTTT_PROD_NOTIFY`
>    - Value: `https://maker.ifttt.com/trigger/{event}/json/with/key/{your-key}`
>
> The notification sends three values: `value1` (status message), `value2` (detail), `value3` (run URL).
> Without the secret, the step is silently skipped.

If the user says **no**, skip this step.

## Step 6: Guide User Through Setup

After modifying workflows, inform the user of required setup:

1. **Register self-hosted runner**:
- **Org-level**: org Settings > Actions > Runners (shared with selected repos)
- **Repo-level**: repo Settings > Actions > Runners
2. **Create RUNNER_CHECK_TOKEN**: Fine-grained PAT with the appropriate scope:
- **Org-level runner**: `Organization self-hosted runners: Read` (under Organization permissions)
- **Repo-level runner**: `Administration: Read-only` (under Repository permissions)
3. **Add as repo secret**: Settings > Secrets > `RUNNER_CHECK_TOKEN` (add to each repo, or as an org secret)

Without `RUNNER_CHECK_TOKEN`, all jobs run on `ubuntu-latest` as before (safe default).

## Important Notes

- **Always call detect-runner unconditionally** — never skip it with `if:` conditions. The fallback handles all failure modes gracefully.
- **Cache keys differ by runner OS** — `runner.os` produces `Linux` on GitHub-hosted but may produce `macOS` or `Linux` on self-hosted depending on setup. Cache hits may not cross between them.
- **Replace `container:` jobs with direct tool install** — Docker may not be available on self-hosted runners. Use the `sudo -n` pattern for tools like Playwright that need system deps (see Step 4).
- **Single runner = single concurrent job** — parallel jobs need multiple runner instances registered in separate directories.
- **Never use `npx` in pnpm projects** — `npx` hangs on self-hosted runners. Use `./node_modules/.bin/<cmd>` or `pnpm dlx` instead (see gotchas).
- **`pnpm exec` only works in workspace members** — test fixtures with symlinked `node_modules` need direct bin paths instead.
- **Always clean stale `~/setup-pnpm` before `pnpm/action-setup`** — on self-hosted runners, `~/setup-pnpm` persists between runs and can cause `ENOTEMPTY` crashes. Add a cleanup step with `|| true` before every `pnpm/action-setup` invocation (even `rm -rf` itself can fail with ENOTEMPTY due to NFS lock files or held handles):

  ```yaml
  - name: Clean pnpm setup cache
    run: rm -rf ~/setup-pnpm ~/setup-pnpm-<slug> || true
  - uses: pnpm/action-setup@...
    with:
      version: 10
      dest: ~/setup-pnpm-<slug>
  ```

- **Use unique `dest:` per workflow** — when multiple workflows share the same self-hosted runner home directory, each must have a unique `dest:` to prevent concurrent runs from stomping on each other's pnpm installation. Convention: `~/setup-pnpm-{workflow-slug}`. For matrix/shard jobs, include the matrix variable: `~/setup-pnpm-{slug}-${{ matrix.shard }}`. Each cleanup step only removes `~/setup-pnpm` (legacy) and its own directory (see gotchas).
- **Prune pnpm store before install** — the persistent pnpm store on self-hosted runners can accumulate corrupted entries, causing `Worker pnpm#N exited with code 1` crashes. Add `pnpm store prune || true` before `pnpm install`:

  ```yaml
  - name: Install dependencies
    run: |
      pnpm store prune || true
      pnpm install --frozen-lockfile
  ```

For runner setup details (WSL2, systemd, auto-start), see [references/setup-guide.md](references/setup-guide.md).

For common pitfalls with self-hosted runners (Docker permissions, stale workspaces, pnpm store conflicts, concurrent pnpm dest conflicts, global install PATH issues), see [references/self-hosted-gotchas.md](references/self-hosted-gotchas.md).
