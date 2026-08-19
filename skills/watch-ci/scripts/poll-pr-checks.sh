#!/bin/bash
# Poll GitHub PR checks until genuinely terminal, then notify and exit.
# Usage: poll-pr-checks.sh <pr-number> [max-minutes]
# Exit: 0 = all passed, 1 = some failed, 2 = timeout, 3 = inconclusive, 64 = bad args.
#
# THREE FALSE-PASS GUARDS (all three were observed failing in the field — a PR was
# reported "All CI passed" while its real workflow had not even started):
#
#   1. A SKIPPED check is not a passing check. The old arithmetic was
#      `passed = total - pending - failed`, which silently folded skips into the
#      pass count. A lone third-party `skipping` check therefore read as "1/1 ok".
#      We now count the `pass` bucket explicitly and track skips separately.
#
#   2. `gh pr checks` only reports checks GitHub has REGISTERED so far. A workflow
#      that is queued (or waiting on a concurrency group) is invisible to it, so a
#      PR whose real CI has not started can look green off one unrelated check.
#      We cross-check `gh run list` for the head SHA and refuse to conclude while
#      any run for that commit is not `completed`.
#
#   3. Even the run list lags commit push by a few seconds. So a terminal-looking
#      state must hold for SETTLE_CYCLES consecutive polls before we believe it.
#
# A state where nothing actually ran (no passes, no failures — only skips, or no
# checks at all) is reported as INCONCLUSIVE (exit 3), never as a pass. That is a
# legitimate outcome for a fully path-filtered PR, but the caller must decide;
# calling it "passed" is what caused the original bug.

set -uo pipefail

PR_NUMBER="${1:?pr-number required}"
MAX_MIN="${2:-60}"
NOTIFY="$HOME/.claude/skills/watch-ci/scripts/notify.sh"
SLEEP_SECONDS=30
SETTLE_CYCLES=2

deadline=$(($(date +%s) + MAX_MIN * 60))
settled=0

while [ "$(date +%s)" -lt "$deadline" ]; do
  # Re-read every cycle: a push mid-watch moves the head SHA, and we want to
  # follow the new commit rather than report on a stale one.
  meta=$(gh pr view "$PR_NUMBER" --json headRefName,headRefOid 2>/dev/null || echo '{}')
  branch=$(echo "$meta" | jq -r '.headRefName // empty')
  head_sha=$(echo "$meta" | jq -r '.headRefOid // empty')

  json=$(gh pr checks "$PR_NUMBER" --json name,bucket 2>/dev/null || echo "[]")
  total=$(echo "$json" | jq 'length')
  pending=$(echo "$json" | jq '[.[] | select(.bucket == "pending")] | length')
  failed=$(echo "$json" | jq '[.[] | select(.bucket == "fail" or .bucket == "cancel")] | length')
  skipped=$(echo "$json" | jq '[.[] | select(.bucket == "skipping" or .bucket == "skipped")] | length')
  passed=$(echo "$json" | jq '[.[] | select(.bucket == "pass")] | length')
  failed_names=$(echo "$json" | jq -r '[.[] | select(.bucket == "fail" or .bucket == "cancel") | .name] | join(", ")')

  # Workflow runs for this exact commit, including ones GitHub has queued but not
  # yet surfaced as PR checks. Filter client-side: the server-side `--commit`
  # filter has been observed to omit queued runs that `--branch` does return.
  active_runs=0
  if [ -n "$branch" ] && [ -n "$head_sha" ]; then
    active_runs=$(gh run list --branch "$branch" --limit 40 \
        --json headSha,status 2>/dev/null \
      | jq --arg sha "$head_sha" \
          '[.[] | select(.headSha == $sha) | select(.status != "completed")] | length' \
      2>/dev/null) || active_runs=0
    [ -n "$active_runs" ] || active_runs=0
  fi

  echo "[$(date +%H:%M:%S)] PR #$PR_NUMBER: ${passed} pass, ${failed} fail, ${skipped} skip, ${pending} pending, ${active_runs} run(s) unfinished"

  if [ "$pending" -eq 0 ] && [ "$active_runs" -eq 0 ] && [ "$total" -gt 0 ]; then
    settled=$((settled + 1))
    if [ "$settled" -ge "$SETTLE_CYCLES" ]; then
      if [ "$failed" -gt 0 ]; then
        bash "$NOTIFY" error "CI failed: $failed_names. PR #$PR_NUMBER"
        echo "RESULT: FAILED ($failed_names)"
        exit 1
      fi
      if [ "$passed" -gt 0 ]; then
        bash "$NOTIFY" success "All CI passed! PR #$PR_NUMBER"
        echo "RESULT: PASSED ($passed passed, $skipped skipped)"
        exit 0
      fi
      # Nothing actually ran. Do NOT call this a pass.
      bash "$NOTIFY" warning "CI inconclusive: no checks ran (${skipped} skipped). PR #$PR_NUMBER"
      echo "RESULT: INCONCLUSIVE (0 passed, $skipped skipped, $total total — no workflow produced a result)"
      exit 3
    fi
  else
    settled=0
  fi

  sleep "$SLEEP_SECONDS"
done

bash "$NOTIFY" warning "CI watch timed out after $MAX_MIN min. PR #$PR_NUMBER"
echo "RESULT: TIMEOUT"
exit 2
