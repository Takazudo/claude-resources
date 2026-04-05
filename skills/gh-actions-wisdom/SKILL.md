---
name: gh-actions-wisdom
description: "GitHub Actions workflow best practices and pitfalls reference. Use when: (1) Writing or reviewing GitHub Actions workflows (.yml), (2) Setting up CI/CD pipelines with GitHub Actions, (3) Debugging slow, expensive, or stuck workflow runs, (4) User says 'gh actions', 'github actions', 'workflow best practices', (5) Before creating or modifying any .github/workflows/ file. Keywords: GitHub Actions, CI/CD, workflow, timeout, concurrency, security, caching."
---

# GitHub Actions Wisdom

Reference best practices before writing or reviewing any GitHub Actions workflow.
Load topic-specific references as needed from `references/`.

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

### 6. Set `set-safe-directory: false` on Self-Hosted Runners

`actions/checkout` defaults `set-safe-directory` to `true`, which runs `git config --global --add safe.directory` on **every CI run**. On self-hosted runners this appends duplicate entries to `~/.gitconfig` indefinitely, polluting the shared gitconfig across all repos on that machine.

```yaml
# GOOD — prevent gitconfig pollution on self-hosted runners
- uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
  with:
    set-safe-directory: false
```

The `safe.directory` setting is unnecessary when the runner user owns the workspace directory.

### 7. Don't Use `actions/cache` for Build Tools on Self-Hosted Runners

On self-hosted runners, build tool caches (Cargo, Go modules, Gradle, etc.) **already persist on disk**. Using `actions/cache` uploads them to GitHub's remote cache API on every run and creates duplicate entries, wasting storage.

```yaml
# BAD on self-hosted — uploads local cache to remote on every run
- uses: actions/cache@v4
  with:
    path: ~/.cargo/registry
    key: cargo-${{ hashFiles('Cargo.lock') }}

# GOOD on self-hosted — just use the local disk cache directly
# (no actions/cache step needed)
```

### 8. Use Cache (Not Artifacts) for Inter-Job Data Sharing

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
11. `actions/checkout` has `set-safe-directory: false` on self-hosted runners (see rule 6)
12. No `actions/cache` for build tools on self-hosted runners — disk cache is already local (see rule 7)
13. Inter-job data sharing uses `actions/cache` not `upload-artifact` to avoid org storage limits (see rule 8)
