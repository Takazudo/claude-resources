# Performance Optimization

## Dependency Caching: Don't Cache Package Managers

**Do NOT use `cache: 'pnpm'` (or `npm`, `yarn`) in `actions/setup-node`.** GitHub Actions cache restore is often slower than a fresh `pnpm install` from npm's CDN. npm's CDN is highly optimized for package downloads, while GitHub's cache API has significant overhead for large stores (especially 1GB+). Benchmarking confirmed: direct install from CDN consistently beats cache restore + install.

For self-hosted runners this is even more pointless — the pnpm store is already local, so caching to GitHub's remote cache and restoring it adds pure overhead.

```yaml
# BAD - cache restore adds overhead
- uses: actions/setup-node@v4
  with:
    node-version-file: .node-version
    cache: pnpm  # REMOVE THIS

# GOOD - just install directly
- uses: actions/setup-node@v4
  with:
    node-version-file: .node-version
- run: pnpm install
```

### Custom Cache (Playwright browsers, etc.)

```yaml
- uses: actions/cache@v4
  with:
    path: $HOME/.cache/ms-playwright
    key: playwright-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
    restore-keys: |
      playwright-${{ runner.os }}-
```

## Path Filters

Skip workflows when only irrelevant files changed. **Critical for repos with expensive E2E pipelines** — a one-line `.gitignore` change should not trigger a full build+E2E across all apps.

### `paths` vs `paths-ignore`

| Approach | Use when | Trade-off |
|----------|----------|-----------|
| `paths-ignore` | You know which paths to exclude from app CI | New directories are included by default (safe) |
| `paths` | You want a workflow to fire only for specific directories (e.g., doc CI) | New directories are excluded by default (must remember to add) |

**You cannot use both in the same trigger** — GitHub Actions rejects the workflow.

### Pattern: Separate App and Doc CI in a Monorepo

When app code and documentation live in the same repo, split into two independent workflows:

```yaml
# app-ci.yml — runs only when app-relevant files change
on:
  pull_request:
    paths-ignore:
      - 'docs/**'           # documentation directory
      - '**/.gitignore'     # gitignore changes
      - '*.md'              # root-level markdown
      - 'LICENSE'
      - '.vscode/**'

# doc-ci.yml — runs only when docs change
on:
  pull_request:
    paths:
      - 'docs/**'
      - '.github/workflows/doc-ci.yml'
```

**Mixed PRs**: When a PR contains both app and doc changes, both workflows run — this is correct behavior.

### Common `paths-ignore` candidates

```yaml
paths-ignore:
  - '*.md'                      # README, CHANGELOG, etc.
  - 'docs/**'                   # documentation directory
  - '.vscode/**'                # editor settings
  - 'LICENSE'
  - '**/.gitignore'             # gitignore changes
  # Add project-specific non-app directories as needed
```

### Job-Level Conditional: `dorny/paths-filter`

When you want to skip specific jobs (e.g., always lint but skip E2E) rather than the entire workflow:

```yaml
jobs:
  changes:
    runs-on: ubuntu-latest
    outputs:
      frontend: ${{ steps.filter.outputs.frontend }}
      backend: ${{ steps.filter.outputs.backend }}
    steps:
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            frontend:
              - 'src/frontend/**'
            backend:
              - 'src/backend/**'

  test-frontend:
    needs: changes
    if: needs.changes.outputs.frontend == 'true'
    # ...
```

## Job Parallelization

Split independent tasks into parallel jobs.

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - run: pnpm lint

  typecheck:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - run: pnpm typecheck

  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - run: pnpm test

  build:
    needs: [lint, typecheck, test]
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - run: pnpm build
```

## E2E Test Sharding

Split E2E tests across parallel jobs using matrix sharding.

```yaml
jobs:
  e2e:
    strategy:
      fail-fast: true
      matrix:
        shard: [1, 2, 3, 4]
    timeout-minutes: 30
    steps:
      - run: npx playwright test --shard=${{ matrix.shard }}/4
```

## Shallow Clone

Use `fetch-depth: 1` for deploy workflows that don't need history.

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 1
```

## Artifact Retention

Set short retention for non-essential artifacts.

```yaml
- uses: actions/upload-artifact@v4
  with:
    name: build-output
    path: dist/
    retention-days: 1  # Default is 90 days
```

## Inter-Job Data: Use Cache, Not Artifacts

Artifacts count toward **shared org storage** (often the bottleneck — orgs hit 90% easily). For passing build output between jobs in the same workflow, use `actions/cache` instead — it uses a **separate 10 GB per-repo limit**.

```yaml
# In build job — save with run-specific key
- uses: actions/cache/save@v4
  with:
    path: dist/
    key: build-${{ github.run_id }}

# In deploy job — restore
- uses: actions/cache/restore@v4
  with:
    path: dist/
    key: build-${{ github.run_id }}
```

If both steps can run on the same runner, merging into a single job is even simpler.

## Self-Hosted Runner: Skip Remote Caching

On self-hosted runners, build tool caches (Cargo, Go, Gradle) and package stores (pnpm, npm) **already persist on disk**. Using `actions/cache` uploads them to GitHub's remote cache on every run, creating duplicate entries and wasting storage.

- Don't use `actions/cache` for `~/.cargo`, `~/.gradle`, Go module cache, etc.
- Don't use `cache: pnpm` in `actions/setup-node`
- The local disk IS the cache on self-hosted runners

## Self-Hosted Runner: Disable `set-safe-directory`

`actions/checkout` runs `git config --global --add safe.directory` by default. On self-hosted runners, this appends a new entry to `~/.gitconfig` on **every single CI run**, creating thousands of duplicate lines over time.

```yaml
- uses: actions/checkout@v4
  with:
    set-safe-directory: false  # Prevent gitconfig pollution
```

## Docker Layer Caching

```yaml
- uses: docker/build-push-action@v6
  with:
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

## Self-Hosted Runner Fallback

Detect if a self-hosted runner is available, fall back to GitHub-hosted.

```yaml
jobs:
  detect-runner:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    outputs:
      runner: ${{ steps.detect.outputs.runner }}
    steps:
      - id: detect
        uses: actions/github-script@v7
        with:
          script: |
            const runners = await github.rest.actions.listSelfHostedRunnersForRepo({
              owner: context.repo.owner,
              repo: context.repo.repo
            });
            const online = runners.data.runners.some(r => r.status === 'online');
            core.setOutput('runner', online ? 'self-hosted' : 'ubuntu-latest');

  build:
    needs: detect-runner
    runs-on: ${{ needs.detect-runner.outputs.runner }}
```
