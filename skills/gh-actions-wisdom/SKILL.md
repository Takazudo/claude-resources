---
name: gh-actions-wisdom
description: >-
  GitHub Actions workflow best practices and pitfalls reference. Use when: (1) Writing or reviewing
  GitHub Actions workflows (.yml), (2) Setting up CI/CD pipelines with GitHub Actions, (3) Debugging
  slow, expensive, or stuck workflow runs, (4) User says 'gh actions', 'github actions', 'workflow
  best practices', (5) Before creating or modifying any .github/workflows/ file. Keywords: GitHub
  Actions, CI/CD, workflow, timeout, concurrency, security, caching.
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
8. Dependency caching enabled (`cache: 'pnpm'` in setup-node, etc.)
9. Path filters used where possible to skip irrelevant runs
10. Deploy steps have retry logic for network operations
