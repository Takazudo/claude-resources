#!/bin/bash

# CI Status Checker
# Usage: check-ci.sh [<pr-number>]
# Returns JSON with overall status and details
# Exit codes: 0=pass, 1=fail, 2=pending, 3=error

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PR_ARG="${1:-}"

# Get checks as JSON
if [ -n "$PR_ARG" ]; then
  CHECKS_JSON=$(gh pr checks "$PR_ARG" --json name,state,bucket,link,workflow 2>&1)
else
  CHECKS_JSON=$(gh pr checks --json name,state,bucket,link,workflow 2>&1)
fi

if [ $? -ne 0 ] && [ $? -ne 8 ]; then
  echo "{\"status\":\"error\",\"message\":\"$CHECKS_JSON\"}"
  exit 3
fi

# Parse with jq-like approach using gh's built-in JSON
TOTAL=$(echo "$CHECKS_JSON" | python3 -c "
import json, sys
checks = json.load(sys.stdin)
buckets = {}
for c in checks:
    b = c.get('bucket', 'unknown')
    buckets[b] = buckets.get(b, 0) + 1

total = len(checks)
passed = buckets.get('pass', 0)
failed = buckets.get('fail', 0)
pending = buckets.get('pending', 0)
skipping = buckets.get('skipping', 0)
cancel = buckets.get('cancel', 0)

if total == 0:
    status = 'no_checks'
elif failed > 0 or cancel > 0:
    status = 'fail'
elif pending > 0:
    status = 'pending'
else:
    status = 'pass'

failed_names = [c['name'] for c in checks if c.get('bucket') in ('fail', 'cancel')]

result = {
    'status': status,
    'total': total,
    'passed': passed,
    'failed': failed,
    'pending': pending,
    'skipping': skipping,
    'cancelled': cancel,
    'failed_checks': failed_names
}
print(json.dumps(result))
" 2>&1)

if [ $? -ne 0 ]; then
  echo "{\"status\":\"error\",\"message\":\"Failed to parse checks\"}"
  exit 3
fi

STATUS=$(echo "$TOTAL" | python3 -c "import json,sys; print(json.load(sys.stdin)['status'])")

echo "$TOTAL"

case "$STATUS" in
  pass) exit 0 ;;
  fail) exit 1 ;;
  pending) exit 2 ;;
  *) exit 3 ;;
esac
