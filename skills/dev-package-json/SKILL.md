---
name: dev-package-json
description: >
  Organize and maintain package.json and npm-related config files (.npmrc, etc.) for readability,
  maintainability, and security. Use when: (1) Reorganizing a large package.json scripts section,
  (2) Adding comment separators to group scripts, (3) Extracting complex multi-process commands into
  shell scripts, (4) Setting up multi-environment dev commands (local/preview/production), (5)
  Handling pnpm "Ignored build scripts" warnings or evaluating dependency build scripts, (6)
  Configuring .npmrc security settings (strictDepBuilds, allowBuilds, ignoredBuilds), (7) Managing
  pnpm versions via corepack and packageManager field, (8) Adding predev port cleanup to kill stale
  processes before dev server starts, (9) User mentions 'organize package.json', 'package.json
  readability', 'script sections', 'multi-process dev script', 'build scripts warning', 'npmrc',
  'allowBuilds', 'ignoredBuilds', 'supply chain security', 'corepack', 'packageManager', 'pnpm
  version', 'pnpm self-update', 'predev', 'kill port', or 'port in use'. Keywords: package.json, npm
  scripts, organize, separator, shell script, multi-process, dev environment, .npmrc, pnpm, build
  scripts, security, supply chain, allowBuilds, ignoredBuilds, corepack, packageManager, version
  pinning, predev, port cleanup, kill port, port in use.
---

# package.json & npm Config Management

## Part 1: package.json Scripts Organization

Two techniques for keeping large `scripts` sections readable and maintainable.

### Technique 1: Comment Separator Keys

Add visual section dividers using unused JSON keys:

```json
{
  "scripts": {
    "// ── Core ─────────────────────────────────────────": "",
    "dev": "next dev",
    "build": "next build",
    "// ── Testing ─────────────────────────────────────": "",
    "test": "jest",
    "test:e2e": "playwright test"
  }
}
```

Format: `"// ── Section Name ──────..."` with `─` padding to ~50 chars, value `""`.

### Technique 2: Predev Port Cleanup

Add a `predev` script that kills stale processes on dev server ports before starting. This prevents "port already in use" errors that commonly occur after crashes, orphaned processes, or forgotten terminal sessions.

```json
{
  "scripts": {
    "predev": "lsof -ti :5173,:8787 | xargs kill 2>/dev/null; true",
    "dev": "next dev"
  }
}
```

How it works:
- `lsof -ti :PORT` — finds PIDs listening on specified ports (`-t` = terse/PID-only, `-i` = internet addresses)
- Comma-separated ports: `:5173,:8787` checks multiple ports at once
- `xargs kill` — sends SIGTERM (graceful) to found processes
- `2>/dev/null; true` — silently succeeds when no processes are found
- npm/pnpm auto-runs `predev` before `dev` (lifecycle hook convention)

Adapt port numbers to match your project's dev servers (e.g., `:3000,:8080` for a typical Node.js + API setup).

### Technique 3: External Shell Scripts for Multi-Process Commands

When a command starts 2+ background processes, extract to `scripts/*.sh`.

Template available at `scripts/multi-process-dev.sh.template`. Key pattern:

```bash
#!/bin/bash
set -e
cleanup() {
  kill $PID_1 $PID_2 2>/dev/null
  wait $PID_1 $PID_2 2>/dev/null
}
trap cleanup EXIT INT TERM

if [ "$MODE" = "local" ]; then
  backend-server &
  PID_1=$!
  sleep 3
fi

pnpm dev &
PID_2=$!
wait
```

Call from package.json: `"dev:full": "MODE=local ./scripts/dev-full.sh"`

Make executable: `chmod +x scripts/*.sh`

### Multi-Environment Pattern

For apps with local/preview/production API targets:

```json
{
  "// ── Dev with API (3 environments) ───────────────": "",
  "dev:full": "API_MODE=local ./scripts/dev-full.sh",
  "dev:full:preview": "API_MODE=preview pnpm dev",
  "dev:full:prod": "API_MODE=production pnpm dev"
}
```

### Detailed Patterns

See [references/patterns.md](references/patterns.md) for:
- Full list of suggested section names
- Namespace prefixing for monorepo sub-packages
- Internal/private script conventions (`_` prefix)
- Complete multi-process shell script template with explanations

---

## Part 2: pnpm Version Management with Corepack

### The `packageManager` Field

Pin the exact pnpm version in `package.json`:

```json
{
  "packageManager": "pnpm@10.30.2+sha512.36cdc707e7b..."
}
```

This ensures every developer and CI uses the identical pnpm version. Corepack reads this field and auto-downloads the specified version.

### Setup (Once Per Machine)

```bash
corepack enable
```

After this, running `pnpm install` / `pnpm dev` / etc. just works — corepack intercepts the `pnpm` command and uses the pinned version automatically. No global pnpm install needed.

### Key Rules

- **Never run `pnpm self-update`** — it errors when pnpm is managed by corepack
- **Never run `corepack use pnpm@latest` routinely** — it bumps the version in `package.json` and often regenerates `pnpm-lock.yaml`, creating noisy diffs
- **Only update intentionally** — when the team decides to upgrade, one person runs `corepack use pnpm@<version>`, commits the `package.json` + lockfile changes, and everyone else gets it via `pnpm install`
- **Different repos can pin different versions** — corepack handles per-project version switching automatically

### Common Mistake

AI tools and automation sometimes add `corepack use pnpm@latest` to setup steps. This causes unnecessary version bumps and lockfile churn. Remove it — `corepack enable` + the existing `packageManager` field is sufficient.

---

## Part 3: .npmrc Build Script Security Management

Evaluate and manage dependency build scripts for supply chain security.

See [references/npmrc-build-scripts.md](references/npmrc-build-scripts.md) for:
- The full evaluation workflow for "Ignored build scripts" warnings
- Decision criteria for allowBuilds vs ignoredBuilds
- Common package evaluations (reference table)
- .npmrc configuration patterns
