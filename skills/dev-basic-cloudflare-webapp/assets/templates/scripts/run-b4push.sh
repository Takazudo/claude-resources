#!/usr/bin/env bash
set -uo pipefail

# Pre-push check suite for __PROJECT_NAME__. Mirrors .github/workflows/ci.yml so
# failures surface locally instead of on the runner — keep the two in sync.
#
# Failures are collected rather than exited on, so one run reports every broken
# step instead of costing a round-trip per fix.

START_TIME=$(date +%s)
FAILURES=()

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

step() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "▶ $1"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

run_step() {
  local label="$1"
  shift
  step "$label"
  if (cd "$ROOT_DIR" && "$@"); then
    echo "✅ $label"
  else
    echo "❌ $label"
    FAILURES+=("$label")
  fi
}

run_step "Step 1/6: Install dependencies (frozen lockfile)" pnpm install --frozen-lockfile
run_step "Step 2/6: Format check"                           pnpm format:check
run_step "Step 3/6: Typecheck"                              pnpm typecheck
run_step "Step 4/6: Lint"                                   pnpm lint
run_step "Step 5/6: Tests"                                  pnpm test
run_step "Step 6/6: Build"                                  pnpm build

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SUMMARY (${DURATION}s)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ ${#FAILURES[@]} -eq 0 ]; then
  echo "✅ All checks passed! Safe to push."
  exit 0
fi

echo "❌ ${#FAILURES[@]} check(s) failed:"
for f in "${FAILURES[@]}"; do
  echo "   - $f"
done
exit 1
