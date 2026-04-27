#!/bin/bash
# Poll GitHub workflow runs on a branch+commit every 30s until terminal, then notify and exit.
# Usage: poll-runs.sh <branch> <commit-sha> [max-minutes]
# Exit: 0 = all passed, 1 = some failed, 2 = timeout, 64 = bad args.

set -uo pipefail

BRANCH="${1:?branch required}"
COMMIT="${2:?commit-sha required}"
MAX_MIN="${3:-60}"
NOTIFY="$HOME/.claude/skills/watch-ci/scripts/notify.sh"
SLEEP_SECONDS=30
LABEL="$BRANCH @ ${COMMIT:0:7}"

deadline=$(($(date +%s) + MAX_MIN * 60))

while [ "$(date +%s)" -lt "$deadline" ]; do
  json=$(gh run list --branch "$BRANCH" --commit "$COMMIT" --json name,status,conclusion --limit 20 2>/dev/null || echo "[]")
  total=$(echo "$json" | jq 'length')
  pending=$(echo "$json" | jq '[.[] | select(.status != "completed")] | length')
  failed=$(echo "$json" | jq '[.[] | select(.status == "completed" and (.conclusion == "failure" or .conclusion == "cancelled" or .conclusion == "timed_out" or .conclusion == "action_required"))] | length')
  failed_names=$(echo "$json" | jq -r '[.[] | select(.status == "completed" and (.conclusion == "failure" or .conclusion == "cancelled" or .conclusion == "timed_out" or .conclusion == "action_required")) | .name] | join(", ")')
  passed=$((total - pending - failed))

  echo "[$(date +%H:%M:%S)] $LABEL: $passed/$total ok, $pending pending, $failed failed"

  if [ "$total" -gt 0 ] && [ "$pending" -eq 0 ]; then
    if [ "$failed" -gt 0 ]; then
      bash "$NOTIFY" error "CI failed: $failed_names. $LABEL"
      echo "RESULT: FAILED ($failed_names)"
      exit 1
    fi
    bash "$NOTIFY" success "All CI passed! $LABEL"
    echo "RESULT: PASSED"
    exit 0
  fi

  sleep "$SLEEP_SECONDS"
done

bash "$NOTIFY" warning "CI watch timed out after $MAX_MIN min. $LABEL"
echo "RESULT: TIMEOUT"
exit 2
