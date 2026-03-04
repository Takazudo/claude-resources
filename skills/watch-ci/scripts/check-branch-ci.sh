#!/bin/bash

# Branch CI Status Checker
# Usage: check-branch-ci.sh <branch> [<commit-sha>]
# Checks the status of workflow runs on a branch, optionally filtered by commit SHA
# Returns JSON with overall status and details
# Exit codes: 0=pass, 1=fail, 2=pending, 3=error

BRANCH="${1:-}"
COMMIT_SHA="${2:-}"

if [ -z "$BRANCH" ]; then
  echo '{"status":"error","message":"Branch name is required"}'
  exit 3
fi

# Get workflow runs for the branch
if [ -n "$COMMIT_SHA" ]; then
  RUNS_JSON=$(gh run list --branch "$BRANCH" --commit "$COMMIT_SHA" --json databaseId,name,status,conclusion,headSha --limit 20 2>&1)
else
  RUNS_JSON=$(gh run list --branch "$BRANCH" --json databaseId,name,status,conclusion,headSha --limit 10 2>&1)
fi

if [ $? -ne 0 ]; then
  echo "{\"status\":\"error\",\"message\":\"$RUNS_JSON\"}"
  exit 3
fi

# Parse with python3
RESULT=$(echo "$RUNS_JSON" | python3 -c "
import json, sys

runs = json.load(sys.stdin)
total = len(runs)

if total == 0:
    print(json.dumps({'status': 'no_checks', 'total': 0, 'passed': 0, 'failed': 0, 'pending': 0, 'cancelled': 0, 'failed_checks': [], 'runs': []}))
    sys.exit(0)

passed = 0
failed = 0
pending = 0
cancelled = 0
failed_names = []
run_details = []

for r in runs:
    name = r.get('name', 'unknown')
    status = r.get('status', '')
    conclusion = r.get('conclusion', '')
    run_id = r.get('databaseId', '')

    if status in ('in_progress', 'queued', 'waiting', 'requested', 'pending'):
        pending += 1
    elif conclusion == 'success':
        passed += 1
    elif conclusion in ('failure', 'timed_out'):
        failed += 1
        failed_names.append(name)
    elif conclusion == 'cancelled':
        cancelled += 1
    elif conclusion == 'skipped':
        passed += 1  # treat skipped as non-blocking
    else:
        pending += 1  # unknown status treated as pending

    run_details.append({'id': run_id, 'name': name, 'status': status, 'conclusion': conclusion})

if total == 0:
    overall = 'no_checks'
elif failed > 0:
    overall = 'fail'
elif pending > 0:
    overall = 'pending'
else:
    overall = 'pass'

result = {
    'status': overall,
    'total': total,
    'passed': passed,
    'failed': failed,
    'pending': pending,
    'cancelled': cancelled,
    'failed_checks': failed_names,
    'runs': run_details
}
print(json.dumps(result))
" 2>&1)

if [ $? -ne 0 ]; then
  echo '{"status":"error","message":"Failed to parse runs"}'
  exit 3
fi

STATUS=$(echo "$RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin)['status'])")

echo "$RESULT"

case "$STATUS" in
  pass) exit 0 ;;
  fail) exit 1 ;;
  pending) exit 2 ;;
  *) exit 3 ;;
esac
