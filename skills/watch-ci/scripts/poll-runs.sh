#!/bin/bash
# Poll GitHub workflow runs on a branch+commit until terminal, then notify and exit.
# Usage: poll-runs.sh <branch> <commit-sha> [max-minutes]
# Exit: 0 = all passed, 1 = some failed, 2 = timeout, 3 = inconclusive, 64 = bad args.
#
# THREE FALSE-PASS GUARDS (same class of bug as poll-pr-checks.sh):
#
#   1. A `skipped` run is not a passing run. The old arithmetic was
#      `passed = total - pending - failed`, which folded skips into the pass count.
#      We now count `success` explicitly and track skips separately.
#
#   2. `gh run list --commit <sha>` has been observed to OMIT queued runs that
#      `--branch <name>` does return — so filtering server-side by commit can make
#      a queued workflow invisible and let an unrelated finished run read as the
#      whole story. We list by branch and filter on headSha client-side instead.
#
#   3. The run list lags a push by a few seconds, so a terminal-looking state must
#      hold for SETTLE_CYCLES consecutive polls before we believe it.
#
# A state where nothing produced a result (only skips) is reported as INCONCLUSIVE
# (exit 3), never as a pass — the caller decides what that means.
#
# This script polls for a result; it does not decide whether a run was expected to
# exist in the first place. If $COMMIT never gets a matching run at all (total stays 0
# every cycle), that is invisible here and just times out (exit 2) — the caller (watch-ci
# SKILL.md Step 2b) is responsible for running the push-trigger-check determination
# BEFORE launching this script, so it only launches when a run is actually expected or
# already exists. See references/push-trigger-check.md.

set -uo pipefail

BRANCH="${1:?branch required}"
COMMIT="${2:?commit-sha required}"
MAX_MIN="${3:-60}"
NOTIFY="$HOME/.claude/skills/watch-ci/scripts/notify.sh"
SLEEP_SECONDS=30
SETTLE_CYCLES=2
LABEL="$BRANCH @ ${COMMIT:0:7}"

deadline=$(($(date +%s) + MAX_MIN * 60))
settled=0

while [ "$(date +%s)" -lt "$deadline" ]; do
  # List by branch and match the commit in jq — see guard 2 above. Accept a short
  # SHA argument by prefix-matching the full headSha GitHub returns.
  json=$(gh run list --branch "$BRANCH" --limit 40 \
      --json name,headSha,status,conclusion 2>/dev/null \
    | jq --arg sha "$COMMIT" '[.[] | select(.headSha | startswith($sha))]' 2>/dev/null) || json="[]"
  [ -n "$json" ] || json="[]"

  total=$(echo "$json" | jq 'length')
  pending=$(echo "$json" | jq '[.[] | select(.status != "completed")] | length')
  failed=$(echo "$json" | jq '[.[] | select(.status == "completed" and (.conclusion == "failure" or .conclusion == "cancelled" or .conclusion == "timed_out" or .conclusion == "action_required"))] | length')
  skipped=$(echo "$json" | jq '[.[] | select(.status == "completed" and .conclusion == "skipped")] | length')
  passed=$(echo "$json" | jq '[.[] | select(.status == "completed" and .conclusion == "success")] | length')
  failed_names=$(echo "$json" | jq -r '[.[] | select(.status == "completed" and (.conclusion == "failure" or .conclusion == "cancelled" or .conclusion == "timed_out" or .conclusion == "action_required")) | .name] | join(", ")')

  echo "[$(date +%H:%M:%S)] $LABEL: ${passed} pass, ${failed} fail, ${skipped} skip, ${pending} unfinished"

  if [ "$pending" -eq 0 ] && [ "$total" -gt 0 ]; then
    settled=$((settled + 1))
    if [ "$settled" -ge "$SETTLE_CYCLES" ]; then
      if [ "$failed" -gt 0 ]; then
        bash "$NOTIFY" error "CI failed: $failed_names. $LABEL"
        echo "RESULT: FAILED ($failed_names)"
        exit 1
      fi
      if [ "$passed" -gt 0 ]; then
        bash "$NOTIFY" success "All CI passed! $LABEL"
        echo "RESULT: PASSED ($passed passed, $skipped skipped)"
        exit 0
      fi
      bash "$NOTIFY" warning "CI inconclusive: no runs produced a result (${skipped} skipped). $LABEL"
      echo "RESULT: INCONCLUSIVE (0 passed, $skipped skipped, $total total)"
      exit 3
    fi
  else
    settled=0
  fi

  sleep "$SLEEP_SECONDS"
done

bash "$NOTIFY" warning "CI watch timed out after $MAX_MIN min. $LABEL"
echo "RESULT: TIMEOUT"
exit 2
