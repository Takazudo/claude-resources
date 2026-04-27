#!/bin/bash
# Poll GitHub PR checks every 30s until terminal, then notify and exit.
# Usage: poll-pr-checks.sh <pr-number> [max-minutes]
# Exit: 0 = all passed, 1 = some failed, 2 = timeout, 64 = bad args.

set -uo pipefail

PR_NUMBER="${1:?pr-number required}"
MAX_MIN="${2:-60}"
NOTIFY="$HOME/.claude/skills/watch-ci/scripts/notify.sh"
SLEEP_SECONDS=30

deadline=$(($(date +%s) + MAX_MIN * 60))

while [ "$(date +%s)" -lt "$deadline" ]; do
  json=$(gh pr checks "$PR_NUMBER" --json name,bucket 2>/dev/null || echo "[]")
  total=$(echo "$json" | jq 'length')
  pending=$(echo "$json" | jq '[.[] | select(.bucket == "pending")] | length')
  failed=$(echo "$json" | jq '[.[] | select(.bucket == "fail" or .bucket == "cancel")] | length')
  failed_names=$(echo "$json" | jq -r '[.[] | select(.bucket == "fail" or .bucket == "cancel") | .name] | join(", ")')
  passed=$((total - pending - failed))

  echo "[$(date +%H:%M:%S)] PR #$PR_NUMBER: $passed/$total ok, $pending pending, $failed failed"

  if [ "$total" -gt 0 ] && [ "$pending" -eq 0 ]; then
    if [ "$failed" -gt 0 ]; then
      bash "$NOTIFY" error "CI failed: $failed_names. PR #$PR_NUMBER"
      echo "RESULT: FAILED ($failed_names)"
      exit 1
    fi
    bash "$NOTIFY" success "All CI passed! PR #$PR_NUMBER"
    echo "RESULT: PASSED"
    exit 0
  fi

  sleep "$SLEEP_SECONDS"
done

bash "$NOTIFY" warning "CI watch timed out after $MAX_MIN min. PR #$PR_NUMBER"
echo "RESULT: TIMEOUT"
exit 2
