---
name: gh-actions-wisdom
description: "GitHub Actions workflow best practices and pitfalls reference. Use when: (1) Writing or reviewing .yml workflows, (2) Setting up CI/CD pipelines, (3) Debugging slow, expensive, or stuck workflow runs, (4) User says 'gh actions', 'github actions', 'workflow best practices', (5) Before creating or modifying any .github/workflows/ file. Keywords: GitHub Actions, CI/CD, workflow, timeout, concurrency, security, caching."
---

# GitHub Actions Wisdom

Reference best practices before writing or reviewing any GitHub Actions workflow.
Load topic-specific references as needed from `references/`.

## Runner Context Matters

Several rules below depend on whether your jobs run on **ephemeral cloud runners** (GitHub-hosted `ubuntu-latest`, RunsOn, BuildJet, Namespace, etc. — fresh VM per job, wiped between runs) or **persistent self-hosted runners** (long-lived machines with state that carries across runs). Advice that is correct in one context can be a hard-to-debug bug in the other.

| Concern                            | Ephemeral cloud runners                              | Persistent self-hosted runners                              |
| ---------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| `actions/cache` for build tools    | **Use it** — disk is wiped between runs              | Avoid — local disk is already the cache                     |
| `set-safe-directory: false`        | **Don't set** — containers need the default          | Set it — avoids `~/.gitconfig` pollution                    |
| Manual workspace cleanup steps     | Not needed — fresh VM each run                       | Often needed — workspace persists                           |
| `chown` workspace at job end       | Not needed — VM is destroyed                         | Sometimes needed for next-run access                        |
| `detect-runner` fallback pattern   | Obsolete — the cloud runner IS the runner            | Useful when mixing self-hosted + GitHub-hosted              |

**Migration warning.** When moving a workflow from self-hosted to ephemeral (or vice versa), audit every step and option that was added "for the runner". Leftover self-hosted-isms on a cloud runner produce mysterious failures: `pnpm: command not found` (no setup step because pnpm was preinstalled), `Cache not found` between jobs (cache backend differs), `fatal: detected dubious ownership` (because `set-safe-directory: false` is now actively wrong), etc. Specific rules below are gated by runner context where it matters.

## Critical Rules (Always Apply)

### 1. Always Set `timeout-minutes`

The default timeout is **360 minutes (6 hours)**. A stuck job silently burns runner minutes.

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 15 # ALWAYS set this
```

Recommended values:

| Job type         | timeout-minutes |
| ---------------- | --------------- |
| Lint / typecheck | 5-10            |
| Unit tests       | 10-15           |
| Build            | 15-30           |
| E2E tests        | 30-60           |
| Docker build     | 15-30           |
| Deploy           | 10-15           |
| Notification     | 5               |

### 2. Always Set Concurrency Control

Prevent redundant runs and protect production deploys.

```yaml
# PR checks: cancel previous runs on new push
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

# Production deploy: never cancel in-progress
concurrency:
  group: deploy-production
  cancel-in-progress: false
```

### 3. Always Declare Permissions

Never rely on default permissions. Declare explicitly per workflow or per job.

```yaml
permissions:
  contents: read

jobs:
  deploy:
    permissions:
      contents: read
      deployments: write
```

### 4. Pin Actions to Full SHA

Tags are mutable. The March 2025 `tj-actions/changed-files` supply chain attack (CVE-2025-30066) compromised 23,000+ repos via rewritten tags.

```yaml
# Bad - tag can be rewritten
- uses: actions/checkout@v4

# Good - immutable SHA
- uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
```

**Caveat**: Some repos (e.g., `pnpm/action-setup`) have force-pushed, invalidating previously pinned SHAs. If CI fails with `Unable to resolve action ... unable to find version`, look up the current SHA via `gh api repos/OWNER/REPO/git/ref/tags/vX.Y.Z`. See [references/security.md](references/security.md) for the full diagnostic procedure.

### 5. Do NOT Cache Package Managers (pnpm/npm/yarn)

Do **not** use `cache: 'pnpm'` (or `cache: 'npm'`, `cache: 'yarn'`) in `actions/setup-node`. GitHub Actions cache restore is often **slower** than a fresh `pnpm install` from npm's CDN. npm's CDN is highly optimized for package downloads, while GitHub's cache API has significant overhead for large stores (especially 1GB+). Benchmarking confirmed: direct install from CDN consistently beats cache restore + install.

```yaml
# BAD - cache restore adds overhead, slower than fresh install
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

This is especially true for **self-hosted runners** where the pnpm store is already local — caching to GitHub's remote cache and restoring it is pointless overhead.

### 6. `set-safe-directory`: leave default on ephemeral runners, set `false` on self-hosted

`actions/checkout` defaults `set-safe-directory` to `true`, which runs `git config --global --add safe.directory` on every run.

**Ephemeral cloud runners** — leave the default (`true`). Each run is a fresh VM, so there is no gitconfig to pollute. The default is also required for container jobs whose UID differs from the host runner user; without it, git inside the container errors with `fatal: detected dubious ownership` when it tries to operate on the mounted workspace.

```yaml
# GOOD on ephemeral runners — let checkout do its default thing
- uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
```

**Persistent self-hosted runners** — set it to `false`. Otherwise `~/.gitconfig` accumulates a duplicate `safe.directory` entry on every run, polluting the shared gitconfig across every repo on that machine.

```yaml
# GOOD on self-hosted runners — prevent gitconfig pollution
- uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
  with:
    set-safe-directory: false
```

When migrating self-hosted → ephemeral, **forgetting to remove `set-safe-directory: false`** is a common gotcha. Non-container jobs may still work (the runner user owns the workspace), but the moment a job runs in a container, git inside hits dubious-ownership and fails with confusing errors.

#### Container jobs need an extra manual step (regardless of runner type)

`actions/checkout` (a node action) writes safe.directory to the node-action HOME (`/root/.gitconfig` inside many containers). Shell `run:` steps inside the container have a different HOME (`/github/home`), so they read a different gitconfig and don't see the safe.directory entry. Lifecycle scripts (`pnpm install` calling `prepare` → `lefthook install` → git) then fail with `fatal: detected dubious ownership`.

For **container jobs**, add a manual step before checkout that writes safe.directory to the shell-side gitconfig:

```yaml
test:
  runs-on: ubuntu-latest
  container:
    image: foo:bar
  steps:
    - name: Mark workspace as safe for git
      run: git config --global --add safe.directory "$GITHUB_WORKSPACE"

    - uses: actions/checkout@v4
    # ... rest of the job
```

This is orthogonal to the `set-safe-directory` option — it covers shell-step git invocations, which checkout's option doesn't reliably reach in container jobs. Plain (non-container) jobs do not need it.

### 7. `actions/cache` for build tools: yes on ephemeral, no on self-hosted

**Persistent self-hosted runners** — build tool caches (Cargo, Go modules, Gradle, etc.) already persist on the runner's local disk. Using `actions/cache` uploads them to GitHub's remote cache API on every run and creates duplicate entries, wasting storage.

```yaml
# BAD on self-hosted — uploads local cache to remote on every run
- uses: actions/cache@v4
  with:
    path: ~/.cargo/registry
    key: cargo-${{ hashFiles('Cargo.lock') }}

# GOOD on self-hosted — just use the local disk cache directly
# (no actions/cache step needed)
```

**Ephemeral cloud runners** — disk is wiped between runs, so `actions/cache` is essential to avoid re-downloading the dependency tree from scratch every time. Use it for `~/.cargo/registry`, `~/.gradle/caches`, the Go module cache, etc.

```yaml
# GOOD on ephemeral runners — survives across runs
- uses: actions/cache@v4
  with:
    path: ~/.cargo/registry
    key: cargo-${{ runner.os }}-${{ hashFiles('Cargo.lock') }}
```

Note: rule 5 ("Don't cache package managers in `setup-node`") still applies on both runner types — that rule is about npm package downloads where the CDN is faster than cache restore. Rule 7 is about general build-tool caches.

### 8. Avoid `curl | sh` Installers — Use Prebuilt-Binary Actions

Installer scripts like `curl https://.../init.sh | sh` (wasm-pack, rustup, many language toolchains) do **one** HTTP request with no retry. A single transient 5xx from the redirect target (e.g., a GitHub release asset) kills the entire workflow. Seen in the wild: rustwasm.github.io → `github.com/rustwasm/wasm-pack/releases/...` returning 504 mid-deploy.

```yaml
# BAD — one curl, no retry, fails on any 5xx
- name: Install wasm-pack
  run: curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

# GOOD — prebuilt binary from GitHub releases, with retries + runner caching
- uses: taiki-e/install-action@v2
  with:
    tool: wasm-pack
```

`taiki-e/install-action` covers most Rust/Go/Node tools (`wasm-pack`, `cargo-nextest`, `just`, `mdbook`, etc.). For tools it doesn't cover, use `actions/cache` on a pinned-version binary, or wrap the curl in a retry loop with `curl --retry 5 --retry-all-errors --retry-delay 5`.

### 9. Use Cache (Not Artifacts) for Inter-Job Data Sharing

`upload-artifact`/`download-artifact` counts toward **shared org storage** (often limited). For passing build output between jobs in the same workflow, use `actions/cache` instead — it has a **separate 10 GB per-repo limit**.

```yaml
# BAD — artifacts accumulate in shared org storage
- uses: actions/upload-artifact@v4
  with:
    name: build-output
    path: dist/
    retention-days: 1

# GOOD — cache uses separate per-repo quota
- uses: actions/cache/save@v4
  with:
    path: dist/
    key: build-${{ github.run_id }}

# In the downstream job:
- uses: actions/cache/restore@v4
  with:
    path: dist/
    key: build-${{ github.run_id }}
```

If the build and deploy steps can run on the same runner, merging them into a single job is even simpler.

**Caveat for cloud runners that proxy the cache layer** (e.g., RunsOn with `extras=s3-cache+magic-cache`) — the runner injects a sidecar at `ACTIONS_RESULTS_URL` that intercepts both v2 cache and v4 artifact API calls. The sidecar speaks the cache protocol but **does not always speak the v4 artifact protocol**. With magic-cache enabled, `actions/upload-artifact@v4` may fail with `Unexpected token '...' is not valid JSON` because the sidecar returns plain-text errors for artifact endpoints.

If you hit this, the symptoms vary by transport:

- **Cache-based passing across instances**: works only if the sidecar is reachable. From inside a container job whose docker network is isolated from the runner host, the sidecar's host IP is unreachable → `Cache not found` even when the upstream job successfully saved.
- **Artifact-based passing**: works if you remove the proxy interception (drop `magic-cache` from the `runs-on` label) so v4 artifact calls reach `api.github.com` directly.

When in doubt on a cloud runner that proxies caching, prefer `upload-artifact`/`download-artifact` over `actions/cache` and disable any cache-proxy extras. Artifacts go straight to the GitHub API which is reachable from any container or instance.

## Quick Reference by Topic

For detailed guidance, read the appropriate reference file:

- **Timeouts and resource limits**: See [references/timeouts.md](references/timeouts.md)
- **Security**: See [references/security.md](references/security.md) - action pinning, `pull_request_target`, script injection, secrets, OIDC
- **Performance**: See [references/performance.md](references/performance.md) - caching, path filters, matrix, parallelization
- **Reliability**: See [references/reliability.md](references/reliability.md) - retries, error handling, conditional execution
- **Anti-patterns**: See [references/anti-patterns.md](references/anti-patterns.md) - common foot guns and how to avoid them
- **Workflow organization**: See [references/organization.md](references/organization.md) - reusable workflows, composite actions, splitting strategies

## Debugging: Local First, Push Second

**Never debug CI issues by pushing and waiting.** CI runs consume time (10-15 min per cycle) and runner minutes. Always verify locally first:

```bash
# Run the same checks CI runs, locally
pnpm check          # typecheck + lint + format
pnpm build          # production build
pnpm test           # unit tests

# Only after ALL pass locally:
git push
# Then monitor:
/watch-ci
```

**The workflow**: fix locally → verify locally → push once → `/watch-ci`. If CI fails after local verification, it's either an environment difference (Node version, missing env vars) or a path/dependency issue specific to CI — much easier to diagnose than a code bug.

## Workflow Review Checklist

When reviewing or writing a workflow, verify:

1. Every job has `timeout-minutes`
2. `concurrency` group is set with appropriate `cancel-in-progress`
3. `permissions` are declared (least privilege)
4. Third-party actions pinned to SHA with version comment
5. `pull_request_target` is NOT used with PR code checkout
6. No string interpolation of user-controlled values in `run:` blocks
7. Secrets passed individually, not via `secrets: inherit`
8. No `cache:` parameter in `setup-node` (fresh install from CDN is faster — see rule 5)
9. Path filters used where possible to skip irrelevant runs
10. Deploy steps have retry logic for network operations
11. `actions/checkout` matches the runner type — default on ephemeral, `set-safe-directory: false` on self-hosted only (see rule 6)
12. `actions/cache` for build tools matches the runner type — used on ephemeral, NOT on self-hosted (see rule 7)
13. No `curl | sh` installers — use `taiki-e/install-action` or similar with retries (see rule 8)
14. Inter-job data sharing uses `actions/cache` not `upload-artifact` to avoid org storage limits — but switch to artifacts when a cloud runner's cache-proxy sidecar (e.g. RunsOn `magic-cache`) breaks v4 caching from container jobs (see rule 9)
15. When migrating between self-hosted and ephemeral runners, audit every step for runner-type-specific options that may now be wrong (see "Runner Context Matters")
