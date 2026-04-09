# Self-Hosted Runner Gotchas

Common issues when migrating GitHub Actions workflows from ephemeral GitHub-hosted runners to persistent self-hosted runners (especially WSL2).

## Docker Container Jobs on WSL2

Docker container jobs (`container:` in workflow) **DO work on WSL2 self-hosted runners** as long as Docker is installed. However, they create root-owned files that must be cleaned up.

### Root-Owned Files from Containers

Docker containers run as root by default. Files created in `$GITHUB_WORKSPACE` during container jobs are owned by root on the host. The next run's `actions/checkout` fails with `EACCES: permission denied` when trying to clean the workspace.

**Fix:** Add a cleanup step at the end of every container job:

```yaml
container:
  image: mcr.microsoft.com/playwright:v1.58.2-noble

steps:
  # ... your steps ...

  - name: Fix workspace permissions
    if: always()
    run: |
      # Container runs as root — fix ownership so the self-hosted runner
      # user can clean up the workspace on the next run.
      RUNNER_UID=$(stat -c '%u' "$GITHUB_WORKSPACE/..")
      RUNNER_GID=$(stat -c '%g' "$GITHUB_WORKSPACE/..")
      chown -R "$RUNNER_UID:$RUNNER_GID" "$GITHUB_WORKSPACE" || true
```

The UID/GID is detected from the workspace parent directory (owned by the runner user), so this is portable across runner setups.

## Stale Workspace Between Jobs

Unlike ephemeral GitHub-hosted runners, self-hosted runner workspaces persist between jobs. This causes problems for jobs that:

- Don't use `actions/checkout` (e.g., deploy jobs that only download artifacts)
- Expect a clean working directory

**Symptoms:** Wrangler or bundler can't resolve files, `cp -r` copies into existing directories instead of replacing them, unexpected files present.

**Fix:** Add a workspace cleanup step at the start of artifact-only jobs:

```yaml
steps:
  - name: Clean workspace
    run: rm -rf "$GITHUB_WORKSPACE"/{deploy,functions,functions-out,blog-out,doc-out,node_modules,package.json,pnpm-lock.yaml}

  - name: Download artifact
    uses: actions/download-artifact@v4
    # ...
```

## pnpm Store Conflicts

When a container job runs `pnpm install`, it uses the container's store path (e.g., `/__w/.pnpm-store/v10`). A subsequent host job in the same workspace finds the leftover `node_modules` linked to the wrong store, causing `ERR_PNPM_UNEXPECTED_STORE`.

**Fix:** Remove stale `node_modules` before running `pnpm add`:

```yaml
- name: Install function dependencies
  run: |
    rm -rf node_modules
    pnpm add -w minisearch
```

Note: `pnpm add` at a workspace root requires the `-w` (or `--workspace-root`) flag, otherwise pnpm refuses with `ERR_PNPM_ADDING_TO_ROOT`.

## pnpm Store Corruption (Worker Crash)

On persistent self-hosted runners, the pnpm content-addressable store (`~/.local/share/pnpm/store`) can accumulate corrupted entries from interrupted or concurrent installs. This causes pnpm workers to crash during package extraction.

**Symptoms:**

```
ERROR  Worker pnpm#1 exited with code 1
pnpm: Worker pnpm#1 exited with code 1
    at Worker.<anonymous> (.../pnpm/dist/pnpm.cjs:93167:27)
```

Or linking failures:

```
ERR_PNPM_LINKING_FAILED  ENOENT: no such file or directory
```

**Fix:** Add `pnpm store prune` before `pnpm install` to clean unreferenced/corrupted store entries:

```yaml
- name: Install dependencies
  run: |
    pnpm store prune || true
    pnpm install --frozen-lockfile
```

The `|| true` ensures a store prune failure (e.g., if the store doesn't exist yet) doesn't block the install.

## npx Hangs in pnpm Projects

On self-hosted runners, `npx <command>` may prompt to install the package and hang forever in non-interactive CI. This is especially common when the project uses pnpm — npm/npx may not find pnpm-installed binaries on its PATH.

**Symptoms:** CI job hangs indefinitely at a step that runs `npx astro build`, `npx playwright test`, etc. No error output, just silence.

**Fix:** Use `./node_modules/.bin/<command>` directly instead of `npx`:

```yaml
# Instead of:
#   npx astro build
#   npx astro preview --port 4500

# Use:
./node_modules/.bin/astro build
./node_modules/.bin/astro preview --port 4500
```

**Why not `pnpm exec`?** If the command runs in a subdirectory that isn't a pnpm workspace member (e.g., test fixtures with symlinked `node_modules`), `pnpm exec` fails with `ERR_PNPM_RECURSIVE_EXEC_NO_PACKAGE`. The direct bin path works everywhere since `node_modules` is symlinked from the repo root.

## Playwright --with-deps Requires sudo

`playwright install --with-deps chromium` installs OS-level dependencies (libgbm, libnss3, etc.) using `apt-get`, which requires `sudo`. On self-hosted runners, this fails if the runner user doesn't have passwordless sudo.

**Symptoms:**

```
sudo: a terminal is required to read the password
sudo: a password is required
Failed to install browsers
```

**Best fix for CI (recommended):** Use `sudo -n` to detect sudo availability and skip `--with-deps` on self-hosted runners. System deps persist on self-hosted between runs, so they only need to be installed once manually.

```yaml
- name: Install Playwright browsers
  run: |
    # --with-deps requires sudo for apt-get (available on GitHub-hosted, not on self-hosted)
    if sudo -n true 2>/dev/null; then
      pnpm exec playwright install --with-deps chromium
    else
      pnpm exec playwright install chromium
    fi
```

On the self-hosted runner, install system deps once manually:

```bash
sudo npx playwright install-deps chromium
```

**Alternative fix:** Configure passwordless sudo for the runner user:

```bash
sudo visudo
# Add: <your-username> ALL=(ALL) NOPASSWD: ALL
```

## Stale E2E Preview Servers

On persistent self-hosted runners, `astro preview` servers from previous CI runs may still be bound to E2E test ports (e.g., 4500-4503). Playwright's `reuseExistingServer: true` silently reuses these stale servers instead of starting fresh ones.

**Fix:** Kill stale servers before E2E runs and disable server reuse in CI:

```yaml
# In workflow:
- name: Kill stale preview servers
  run: for p in 4500 4501 4502 4503; do lsof -ti :"$p" 2>/dev/null | xargs -r kill 2>/dev/null || true; done
```

```typescript
// In playwright.config.ts:
reuseExistingServer: !process.env.CI,
```

## Global npm Install PATH Issues

`npm install -g <package>` on self-hosted runners may install to a path not in the runner's `PATH`. This is especially common on WSL2 runners.

**Fix:** Use `pnpm dlx` instead of global installs for CLI tools:

```yaml
# Instead of:
#   npm install -g wrangler@4
#   wrangler pages deploy ...

# Use:
pnpm dlx wrangler@4 pages deploy deploy \
  --project-name=my-project \
  --branch=main
```

This avoids PATH issues entirely and doesn't leave global packages on the runner.

## Concurrent Workflow pnpm dest Conflicts

When multiple deploy workflows run concurrently on the same self-hosted runner (e.g., `deploy-sync-server` and `deploy-publish-server`), they can destroy each other's pnpm installation if they share the same `dest:` directory.

**Symptoms:**

```
Error: ENOENT: process.cwd failed with error no such file or directory
```

The `pnpm/action-setup` step crashes because Workflow A's cleanup step (`rm -rf ~/setup-pnpm-deploy`) deleted the directory while Workflow B was using it.

**Root cause:** Both workflows use `dest: ~/setup-pnpm-deploy` and both have a cleanup step `rm -rf ~/setup-pnpm ~/setup-pnpm-deploy`. When they run concurrently, one workflow's cleanup deletes the other's active pnpm installation.

**Fix:** Give each deploy workflow a **unique** `dest:` directory:

```yaml
# deploy-sync-server.yml
- name: Clean stale pnpm setup (self-hosted runner)
  run: rm -rf ~/setup-pnpm ~/setup-pnpm-deploy || true
- uses: pnpm/action-setup@...
  with:
    dest: ~/setup-pnpm-deploy

# deploy-publish-server.yml — DIFFERENT directory
- name: Clean stale pnpm setup (self-hosted runner)
  run: rm -rf ~/setup-pnpm ~/setup-pnpm-publish || true
- uses: pnpm/action-setup@...
  with:
    dest: ~/setup-pnpm-publish

# deploy-another-server.yml — yet another directory
- name: Clean stale pnpm setup (self-hosted runner)
  run: rm -rf ~/setup-pnpm ~/setup-pnpm-another || true
- uses: pnpm/action-setup@...
  with:
    dest: ~/setup-pnpm-another
```

**For matrix/shard jobs** that run in parallel, include the matrix variable in the dest to avoid conflicts between shards:

```yaml
# e2e-tests with 4 parallel shards
- name: Clean stale pnpm setup (self-hosted runner)
  run: rm -rf ~/setup-pnpm ~/setup-pnpm-e2e-${{ matrix.shard }} || true
- uses: pnpm/action-setup@...
  with:
    dest: ~/setup-pnpm-e2e-${{ matrix.shard }}
```

**Rule of thumb:** Convention is `~/setup-pnpm-{workflow-slug}`. For sharded jobs use `~/setup-pnpm-{workflow-slug}-${{ matrix.shard }}`. Each cleanup step should only remove `~/setup-pnpm` (legacy) and its own directory — never another workflow's.

## rm -rf Fails with ENOTEMPTY on Stale pnpm Setup Directory

On self-hosted runners, `rm -rf ~/setup-pnpm` can itself fail with `ENOTEMPTY` or `Directory not empty`. This happens when other processes (or NFS `.nfs*` lock files) hold handles on files inside the directory. Under `bash -e` (GitHub Actions default), this kills the entire step and fails the job.

**Symptoms:**

```
rm: cannot remove '/home/runner/setup-pnpm/node_modules/.bin/store/v10/files/cb': Directory not empty
##[error]Process completed with exit code 1.
```

**Fix:** Always use `|| true` on cleanup steps — partial cleanup is better than a failed job:

```yaml
- name: Clean pnpm setup cache
  run: rm -rf ~/setup-pnpm || true
```

**Why this happens:** `pnpm/action-setup` stores its installation at `~/setup-pnpm` (default `dest`). On persistent self-hosted runners, this directory survives between runs. The action's built-in cleanup uses Node.js `rmdir` which also fails with `ENOTEMPTY` on the same stale files. Adding a pre-cleanup step with `|| true` removes most of the stale content, allowing the action's setup to succeed even if a few locked files remain.

## Hardcoded Port Collisions in E2E Tests

On persistent self-hosted runners, server processes from previous workflow runs (or concurrent shards on the same machine) can leave ports occupied. Starting a background server on a hardcoded port fails silently — the process dies but a health check (`curl`) succeeds against whatever stale process is already listening. This stale server may be a dev server with HMR/WebSocket scripts, causing false test failures.

**Symptoms:**

```
WebSocket connection to 'ws://localhost:34434/?token=abc123' failed:
```

A single page fails with a WebSocket error in a production E2E test, even though no WebSocket code exists in the built HTML. All other pages pass.

**Root cause:** `python3 -m http.server 34434 &` (or `serve`) fails with `Address already in use`, dies immediately, but the health check succeeds against a stale Astro dev server on the same port — which injects HMR scripts.

**Fix:** Probe for an available port before starting the server, and verify the process is alive:

```yaml
- name: Run E2E tests
  run: |
    # Find an available port starting from preferred port
    PORT=34434
    while lsof -ti:$PORT > /dev/null 2>&1; do
      echo "Port $PORT in use, trying next..."
      PORT=$((PORT + 1))
    done

    cd dist
    python3 -m http.server $PORT &
    SERVER_PID=$!
    cd ..

    # Verify the server process survived
    sleep 1
    if ! kill -0 $SERVER_PID 2>/dev/null; then
      echo "Server process died immediately"
      exit 1
    fi

    # Pass dynamic port to tests
    BASE_URL="http://localhost:$PORT" pnpm exec playwright test
```

**Also consider:** Adding WebSocket connection errors to the E2E test's console error ignore list as defense-in-depth — WebSocket failures from stale processes aren't caused by the site's code.

## pnpm/action-setup Corrupted Installation

`pnpm/action-setup` installs pnpm to a custom directory (e.g., `$HOME/setup-pnpm/`). On persistent self-hosted runners, this installation can become corrupted — files deleted, permissions changed, or version mismatches when the action upgrades.

**Symptoms:**

```
Error: Cannot find module '/home/runner/setup-pnpm/node_modules/.pnpm/pnpm@10.32.1/node_modules/pnpm/dist/worker.js'
```

All `pnpm install` steps fail with `MODULE_NOT_FOUND` errors.

**Fix:** Recreate the installation directory on the runner:

```bash
rm -rf $HOME/setup-pnpm
mkdir -p $HOME/setup-pnpm
cd $HOME/setup-pnpm
npm init -y
npm install pnpm@10
```

**Prevention:** Since the self-hosted runner already has pnpm available (via corepack or nodenv), consider whether `pnpm/action-setup` is even needed. If `pnpm` is already on PATH, the action's only purpose is version pinning — which `corepack` handles via the `packageManager` field in `package.json`.

**Alternative:** Remove `pnpm/action-setup` from workflows and rely on corepack:

```yaml
# Instead of pnpm/action-setup, just enable corepack:
- name: Enable corepack
  run: corepack enable

# corepack reads packageManager from package.json automatically
- run: pnpm install --frozen-lockfile
```
