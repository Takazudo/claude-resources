# Anti-Patterns and Foot Guns

## 1. No Timeout (Most Dangerous)

Default 6-hour timeout means a stuck job burns 360 minutes before failing.

```yaml
# BAD - uses 6-hour default
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test

# GOOD
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - run: npm test
```

## 2. Recursive Workflow Triggers

PATs can trigger workflows that trigger more workflows, creating infinite loops. `GITHUB_TOKEN` has built-in protection against this, but PATs do not.

```yaml
# DANGEROUS with PAT - can create infinite loop
on:
  push:
    branches: [main]
jobs:
  update:
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.MY_PAT }}
      - run: |
          git commit --allow-empty -m "update"
          git push  # Triggers another workflow run!
```

## 3. Unscoped Triggers

Running on every push to every branch wastes minutes.

```yaml
# BAD - triggers on ALL branches
on: push

# GOOD - scoped to relevant branches
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
```

## 4. No Concurrency Control on PR Checks

Rapid pushes to a PR branch queue multiple redundant runs.

```yaml
# BAD - all runs queue up
on:
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest

# GOOD - cancel previous runs
on:
  pull_request:
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

## 5. `pull_request_target` with PR Checkout

Gives fork code access to repository secrets. See [security.md](security.md) for details.

## 6. String Interpolation of User Input

PR titles, branch names, and commit messages can contain shell metacharacters. See [security.md](security.md) for safe patterns.

## 7. `secrets: inherit` in Called Workflows

Passes all secrets including ones the called workflow doesn't need. Pass individually.

## 8. Inconsistent Action Versions

Mixing `actions/checkout@v4` and `@v6` across workflows creates maintenance burden and security risk. Standardize to latest stable versions.

## 9. Missing `fail-fast` in Matrix

Without `fail-fast: true`, all matrix combinations run even after one fails, wasting minutes.

```yaml
# BAD - runs all shards even if shard 1 fails
strategy:
  matrix:
    shard: [1, 2, 3, 4]

# GOOD
strategy:
  fail-fast: true
  matrix:
    shard: [1, 2, 3, 4]
```

## 10. Overusing `continue-on-error`

Silently masks real failures. Only use for truly optional steps.

## 11. No Path Filters

Building and testing everything on every push, even for docs-only changes.

```yaml
# BAD
on:
  push:
    branches: [main]

# GOOD
on:
  push:
    branches: [main]
    paths-ignore:
      - '**.md'
      - 'docs/**'
      - '.github/ISSUE_TEMPLATE/**'
```

## 12. Long Artifact Retention

Default 90-day retention for build artifacts wastes storage. Set `retention-days: 1` for ephemeral build output.

## 13. Using Artifacts for Inter-Job Data Sharing

Artifacts count toward **shared org storage** (the quota orgs hit first). For passing build output between jobs in the same workflow, use `actions/cache` with a run-specific key instead — caches have a separate 10 GB per-repo limit.

```yaml
# BAD — accumulates in shared org storage even with retention-days: 1
- uses: actions/upload-artifact@v4
  with:
    name: build-output
    path: dist/
    retention-days: 1

# GOOD — uses separate per-repo cache quota
- uses: actions/cache/save@v4
  with:
    path: dist/
    key: build-${{ github.run_id }}
```

## 14. `actions/checkout` Polluting Gitconfig on Self-Hosted Runners

`actions/checkout` defaults `set-safe-directory` to `true`, running `git config --global --add safe.directory` on every CI run. On self-hosted runners this creates thousands of duplicate entries in `~/.gitconfig` over time.

```yaml
# BAD — appends to ~/.gitconfig on every run
- uses: actions/checkout@v4

# GOOD
- uses: actions/checkout@v4
  with:
    set-safe-directory: false
```

## 15. Hardcoded Ports in E2E Test Server Setup

On self-hosted runners, ports persist between workflow runs. Starting a server on a hardcoded port (e.g., `python3 -m http.server 34434 &`) can silently fail if a stale process from a previous run still occupies it. The background process dies, but a subsequent health check (`curl`) passes against the stale server — which may be a dev server with HMR/WebSocket, not your production build.

```yaml
# BAD - silently fails if port is occupied, health check hits stale server
cd dist
python3 -m http.server 34434 &
SERVER_PID=$!
# curl passes because SOMETHING is on 34434... but not our server

# GOOD - probe for available port, verify process is alive
PORT=34434
while lsof -ti:$PORT > /dev/null 2>&1; do
  echo "Port $PORT in use, trying next..."
  PORT=$((PORT + 1))
done

cd dist
python3 -m http.server $PORT &
SERVER_PID=$!

sleep 1
if ! kill -0 $SERVER_PID 2>/dev/null; then
  echo "Server process died immediately"
  exit 1
fi

# Pass the dynamic port to test runner via env
BASE_URL="http://localhost:$PORT" pnpm exec playwright test
```

This is especially dangerous with sharded E2E tests on self-hosted runners — multiple shards or leftover processes compete for the same port.

## 16. Remote Caching on Self-Hosted Runners

On self-hosted runners, build caches (Cargo, pnpm store, Go modules) already persist on disk. Using `actions/cache` or `cache: pnpm` in `setup-node` uploads them to GitHub's remote cache API on every run — pure overhead that creates duplicate entries.
