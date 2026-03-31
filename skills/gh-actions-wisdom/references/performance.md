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

Skip workflows when only irrelevant files changed.

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'src/**'
      - 'package.json'
      - 'pnpm-lock.yaml'
    paths-ignore:
      - '**.md'
      - 'docs/**'
```

For conditional job execution within a workflow, use `dorny/paths-filter`:

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
