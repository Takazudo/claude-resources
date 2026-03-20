# Reliability Patterns

## Retry Logic for Network Operations

Deploy steps can fail due to transient network issues. Use `nick-fields/retry`.

```yaml
- uses: nick-fields/retry@v3
  with:
    timeout_minutes: 5
    max_attempts: 3
    retry_wait_seconds: 10
    command: npx wrangler pages deploy dist/ --project-name=my-site
```

## `continue-on-error` (Use Sparingly)

Marks a step as non-blocking. The job continues even if this step fails.

```yaml
# Acceptable: optional optimization step
- name: Build doc history (optional)
  run: node scripts/build-history.js
  continue-on-error: true

# BAD: masking real failures
- name: Run tests
  run: npm test
  continue-on-error: true  # NEVER do this for tests
```

## Conditional Step Execution

```yaml
# Run only on main branch
- if: github.ref == 'refs/heads/main'
  run: pnpm deploy

# Run only when previous step failed
- if: failure()
  run: echo "Previous step failed"

# Run regardless of previous step status
- if: always()
  run: echo "Cleanup"

# Run only when a specific step outcome
- if: steps.test.outcome == 'failure'
  run: echo "Tests failed"
```

## Server Health Check Before E2E

Wait for server to be ready before running tests.

```yaml
- name: Start server
  run: pnpm preview &

- name: Wait for server
  run: |
    for i in $(seq 1 30); do
      curl -s http://localhost:3000 > /dev/null && exit 0
      sleep 2
    done
    echo "Server failed to start" && exit 1
  timeout-minutes: 2

- name: Run E2E
  run: npx playwright test
```

## Job Dependency Chains

Use `needs` to create reliable execution order.

```yaml
jobs:
  build:
    # ...
  test:
    needs: build
    # ...
  deploy:
    needs: [build, test]
    if: github.ref == 'refs/heads/main'
    # ...
  notify:
    needs: deploy
    if: always()  # Run even if deploy fails
    # ...
```

## Status Check Reporting

Report workflow status to external services.

```yaml
notify:
  needs: [build, test, deploy]
  if: always()
  runs-on: ubuntu-latest
  timeout-minutes: 5
  steps:
    - name: Notify
      run: |
        STATUS="${{ needs.deploy.result }}"
        curl -X POST "$WEBHOOK_URL" \
          -d "value1=$STATUS&value2=${{ github.repository }}"
      env:
        WEBHOOK_URL: ${{ secrets.IFTTT_WEBHOOK_URL }}
```
