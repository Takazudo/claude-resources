#!/usr/bin/env bash
set -euo pipefail

# Before-push comprehensive check script
# Runs all quality checks, builds, and tests to ensure everything is clean

START_TIME=$(date +%s)
FAILURES=()

step() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "▶ $1"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

pass() {
  echo "✅ $1"
}

fail() {
  echo "❌ $1"
  FAILURES+=("$1")
}

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# ── Step 1: Code quality checks ─────────────────
step "Step 1/N: Code quality checks"
if (cd "$ROOT_DIR" && pnpm check); then
  pass "Code quality passed"
else
  fail "Code quality checks"
fi

# ── Step 2: Build ───────────────────────────────
step "Step 2/N: Build"
if (cd "$ROOT_DIR" && pnpm build); then
  pass "Build passed"
else
  fail "Build"
fi

# ── Step 3: Tests ───────────────────────────────
step "Step 3/N: Tests"
if (cd "$ROOT_DIR" && pnpm test); then
  pass "All tests passed"
else
  fail "Tests"
fi

# ── Summary ─────────────────────────────────────
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SUMMARY (${DURATION}s)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

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
