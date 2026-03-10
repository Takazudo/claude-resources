---
name: b4push-wisdom
description: >-
  Complete guide for setting up before-push validation (b4push) and CI checking in any project.
  Covers: analyzing project structure, creating run-b4push.sh script, adding package.json entry,
  creating project-specific b4push skill, and setting up GitHub Actions CI workflow.
  Use when: (1) User says 'set up b4push', 'add CI', 'before push checks', (2) Setting up a new
  project's validation workflow, (3) User wants to add CI + local validation to a project.
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
---

# B4Push Wisdom — Full Validation Setup Guide

Set up comprehensive before-push validation and CI for any project. This covers three parts:
1. **b4push script** — local validation before pushing
2. **b4push skill** — Claude Code skill to run b4push with auto-fix
3. **CI workflow** — GitHub Actions to enforce checks on PRs and main

## Step 1: Analyze the project

Read `package.json` and explore the project structure to understand:

- **Package manager**: Check for `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`
- **Available scripts**: `check`, `build`, `test`, `lint`, `format`, `typecheck`
- **Workspace packages**: Check `pnpm-workspace.yaml` for sub-packages with their own tests
- **Doc site**: Look for `doc/`, `docs/`, `website/` directories with their own `package.json`
- **E2E tests**: Check for `playwright.config.*`, `cypress.config.*`
- **Data generation**: Check for `generate-*` scripts

## Step 2: Determine b4push steps

Common patterns (adapt to project):

| Step | Command | When to include |
| --- | --- | --- |
| Workspace tests | `pnpm --filter "@scope/*" test` | If pnpm workspace with test scripts |
| App unit tests | `pnpm --filter app-name test:unit` | If app has unit tests |
| Code quality | `pnpm check` or `pnpm lint && pnpm format` | Always |
| TypeScript | `pnpm typecheck` or `pnpm --filter name typecheck` | If TypeScript |
| Build | `pnpm build` | If build script exists |
| Doc quality | `cd doc && pnpm check` | If doc site has check script |
| Doc build | `cd doc && pnpm build` | If doc site exists |
| E2E tests | Start server + run playwright | If e2e tests exist |

## Step 3: Create `scripts/run-b4push.sh`

Use this template structure:

```bash
#!/usr/bin/env bash
set -euo pipefail

START_TIME=$(date +%s)
FAILURES=()

step() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "▶ $1"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

pass() { echo "✅ $1"; }
fail() { echo "❌ $1"; FAILURES+=("$1"); }

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Steps here — each wrapped in:
# step "Step N/M: Description"
# if (cd "$ROOT_DIR" && command); then
#   pass "Description passed"
# else
#   fail "Description"
# fi

# Summary
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SUMMARY (${DURATION}s)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ ${#FAILURES[@]} -eq 0 ]; then
  echo "✅ All checks passed! Safe to push."
  exit 0
else
  echo "❌ ${#FAILURES[@]} check(s) failed:"
  for f in "${FAILURES[@]}"; do
    echo "   - $f"
  done
  exit 1
fi
```

Key rules:
- `set -euo pipefail` for strict error handling
- Continue all steps even if some fail (collect in FAILURES array)
- Subshell execution `(cd "$ROOT_DIR" && command)` to isolate
- Summary at the end with elapsed time

Make executable: `chmod +x scripts/run-b4push.sh`

## Step 4: Add package.json script

```json
{
  "scripts": {
    "b4push": "./scripts/run-b4push.sh"
  }
}
```

## Step 5: Create project-specific b4push skill

Create `.claude/skills/b4push/skill.md`:

```markdown
---
name: b4push
description: >-
  Run comprehensive pre-push validation covering [list steps]. Use when: (1) Completing a PR
  or feature implementation, (2) Before pushing significant changes, (3) After large refactors,
  (4) User says 'b4push', 'before push', 'check everything', or 'ready to push'.
user-invocable: true
allowed-tools:
  - Bash
---

# Before Push Check

Run `pnpm b4push` from the project root. This executes `scripts/run-b4push.sh`:

1. [Step list with descriptions]

Takes ~[duration]. All steps must pass.

## On failure

1. Read the failure output to identify which step failed
2. Auto-fix what you can:
   - Formatting: `pnpm check:fix` or `cd doc && pnpm check:fix`
   - Lint: `pnpm lint:fix` or `cd doc && pnpm lint:fix`
3. Re-run `pnpm b4push` to confirm all checks pass
4. Report the final status
```

## Step 6: Create GitHub Actions CI workflow (optional)

If the project uses GitHub and doesn't have CI yet, create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
    types: [opened, synchronize, reopened]
    branches: [main]
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.head_ref || github.ref }}
  cancel-in-progress: true

jobs:
  checks:
    name: Checks
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      # Mirror the b4push steps here
      - name: [Step description]
        run: [command]
```

The CI workflow should mirror the b4push steps so local and CI validation are consistent.

Key CI patterns:
- Cancel previous runs for same PR (`concurrency` group)
- Use `pnpm/action-setup@v4` + `actions/setup-node@v4` with cache
- `pnpm install --frozen-lockfile` for reproducible installs
- Each step as a separate `run` for clear failure identification

## Step 7: Test

Run `pnpm b4push` to verify all steps execute correctly. Fix any issues found.

## Reference projects

These projects have working b4push setups:
- **message (zudomessages)**: 4 steps (workspace tests, app tests, doc checks, doc build), ~1-2 min
- **mdx-formatter**: 6 steps (quality, build, test, doc data, doc quality, doc build), ~40s
- **zmod**: 9 steps including e2e with production server, ~3-4 min
- **zpanels**: Dual-track (quick ~3-5 min, full with e2e ~10-15 min)
