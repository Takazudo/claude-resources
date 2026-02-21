---
name: b4push
description: >-
  Run comprehensive pre-push validation covering code quality, builds, and tests. Use when: (1)
  Completing a PR or feature implementation, (2) Before pushing significant changes, (3) After large
  refactors or multi-file edits, (4) User says 'b4push', 'before push', 'check everything', 'run all
  checks', or 'ready to push'.
user-invocable: true
allowed-tools:
  - Bash
---

# Before Push Check

Run `pnpm b4push` from the project root. This executes `scripts/run-b4push.sh` which runs all checks in order:

1. __STEP_LIST_HERE__

Takes ~__DURATION__. All steps must pass.

## On failure

1. Read the failure output to identify which step failed
2. Auto-fix what you can:
  - Formatting: `pnpm check:fix` (root) or `cd __DOC_DIR__ && pnpm check:fix` (doc)
  - Lint: `pnpm lint:fix` (root) or `cd __DOC_DIR__ && pnpm lint:fix` (doc)
3. Re-run `pnpm b4push` to confirm all checks pass
4. Report the final status
