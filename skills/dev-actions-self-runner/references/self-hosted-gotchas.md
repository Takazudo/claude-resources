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

## Playwright --with-deps Requires Passwordless sudo

`pnpm dlx playwright install --with-deps chromium` installs OS-level dependencies (libgbm, libnss3, etc.) using `apt-get`, which requires `sudo`. On self-hosted runners, this fails if the runner user doesn't have passwordless sudo.

**Symptoms:**

```
sudo: a terminal is required to read the password
sudo: a password is required
Failed to install browsers
```

**Fix:** Configure passwordless sudo for the runner user:

```bash
# On the runner machine (WSL2):
sudo visudo
# Add: <your-username> ALL=(ALL) NOPASSWD: ALL
```

Or pre-install Playwright dependencies once and use `playwright install chromium` (without `--with-deps`) in CI.

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

## pnpm/action-setup Corrupted Installation

`pnpm/action-setup` installs pnpm to a custom directory (e.g., `~/setup-pnpm/`). On persistent self-hosted runners, this installation can become corrupted — files deleted, permissions changed, or version mismatches when the action upgrades.

**Symptoms:**

```
Error: Cannot find module '/home/runner/setup-pnpm/node_modules/.pnpm/pnpm@10.32.1/node_modules/pnpm/dist/worker.js'
```

All `pnpm install` steps fail with `MODULE_NOT_FOUND` errors.

**Fix:** Recreate the installation directory on the runner:

```bash
rm -rf ~/setup-pnpm
mkdir -p ~/setup-pnpm
cd ~/setup-pnpm
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
