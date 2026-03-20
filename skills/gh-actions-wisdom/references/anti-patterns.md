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
