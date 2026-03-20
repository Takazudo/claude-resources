# Timeouts and Resource Limits

## Why Timeouts Matter

GitHub Actions default `timeout-minutes` is **360 (6 hours)**. Common causes of stuck jobs:

- Deadlocked processes
- Infinite loops in tests
- Hung processes waiting for interactive input
- Network requests without timeouts
- Process waiting on a port that never opens

Without explicit timeouts, a single stuck job can burn an entire day of runner minutes.

## Job-Level Timeout

Set on every job. This is the most important single line in any workflow.

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - run: npm test
```

## Step-Level Timeout

Use for individual steps that might hang (network calls, server startup waits).

```yaml
steps:
  - name: Wait for server
    run: curl --retry 10 --retry-delay 2 http://localhost:3000/health
    timeout-minutes: 2

  - name: Run E2E tests
    run: npx playwright test
    timeout-minutes: 20
```

## Recommended Timeout Values

| Job type                    | timeout-minutes | Reasoning                                      |
| --------------------------- | --------------- | ---------------------------------------------- |
| Lint / typecheck            | 5-10            | Fast, CPU-bound                                |
| Unit tests                  | 10-15           | Usually fast; add buffer for flaky tests       |
| Build (frontend)            | 15-30           | Depends on project size                        |
| E2E tests                   | 30-60           | Browser tests are slow; include server startup |
| Docker build                | 15-30           | Layer caching makes subsequent builds faster   |
| Deploy (Netlify/Cloudflare) | 10-15           | Network-bound; retry logic handles transients  |
| Notification (IFTTT, Slack) | 5               | Single HTTP request                            |
| Security audit              | 10              | Dependency scanning                            |
| Cache maintenance           | 10              | Cleanup operations                             |

## Matrix Strategy Limits

When using matrix, set `fail-fast: true` to cancel remaining jobs when one fails.

```yaml
strategy:
  fail-fast: true
  matrix:
    node: [18, 20, 22]
    shard: [1, 2, 3, 4]
  # max-parallel limits concurrent jobs (saves runner minutes)
  max-parallel: 4
```
