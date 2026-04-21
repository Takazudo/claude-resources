# Reliability Patterns

## Avoid `curl | sh` Installers

Classic shell installers for language toolchains (`wasm-pack`, `rustup`, Deno, Bun, various CLIs) pipe a single `curl` into `sh`. One transient 5xx from the redirect target kills the build with no retry.

**Real failure** (2026-04-18, production deploy on main):

```
curl: (22) The requested URL returned error: 504
wasm-pack-init: failed to download https://github.com/rustwasm/wasm-pack/releases/download/v0.13.1/wasm-pack-v0.13.1-x86_64-unknown-linux-musl.tar.gz
```

**Fix options, in order of preference:**

1. **Prebuilt-binary action (best).** `taiki-e/install-action@v2` covers a long list of Rust/Go/Node tools and handles retries + runner caching:

   ```yaml
   - uses: taiki-e/install-action@v2
     with:
       tool: wasm-pack
   ```

2. **`actions/cache` + pinned binary.** If the tool isn't supported by `taiki-e/install-action`, cache the downloaded binary keyed by version so the network hit only happens once per cache-miss.

3. **Retry loop around curl (last resort).** Only when no cacheable binary exists:

   ```yaml
   - name: Install foo
     run: |
       for i in 1 2 3; do
         curl --retry 5 --retry-all-errors --retry-delay 5 -sSf \
           https://example.com/install.sh | sh && break
         sleep $((i*5))
       done
   ```

Never ship a bare `curl ... | sh` in a workflow you care about — it's a coin flip every run.

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
