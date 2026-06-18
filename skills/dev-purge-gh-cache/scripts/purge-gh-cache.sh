#!/usr/bin/env bash
# Purge GitHub Actions caches across every non-archived repo for one or more owners.
#
#   purge-gh-cache.sh [--survey-only|-n] [--parallel N] <owner> [owner...]
#
# Owners may be users or orgs. Survey -> delete (gh cache delete --all) -> verify.
# Verification uses `gh cache list` (real-time). Do NOT trust the
# `actions/cache/usage` API endpoint here: GitHub recomputes it on a delay, so it
# keeps reporting the old size for up to ~24h after caches are actually gone.
set -uo pipefail

# ---- internal workers, re-invoked via xargs to parallelize ----------------
# (re-invoking $0 avoids `export -f`, which does not survive into xargs
#  subshells when the parent shell is zsh.)
case "${1:-}" in
  __count)
    json=$(gh cache list -R "$2" --limit 1000 --json id,sizeInBytes 2>/dev/null)
    [ -z "$json" ] && json='[]'
    printf '%s\t%s\t%s\n' "$2" \
      "$(jq 'length' <<<"$json" 2>/dev/null || echo 0)" \
      "$(jq '[.[].sizeInBytes] | add // 0' <<<"$json" 2>/dev/null || echo 0)"
    exit 0 ;;
  __delete)
    # exits 1 with "No caches to delete" when already empty — harmless
    gh cache delete --all -R "$2" >/dev/null 2>&1 || true
    exit 0 ;;
esac

# ---- arg parsing ----------------------------------------------------------
survey_only=0
parallel=8
owners=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    -n|--survey-only) survey_only=1 ;;
    --parallel) shift; parallel="$1" ;;
    -h|--help) sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "unknown flag: $1" >&2; exit 2 ;;
    *) owners+=("$1") ;;
  esac
  shift
done
[ "${#owners[@]}" -eq 0 ] && { echo "usage: purge-gh-cache.sh [--survey-only] <owner> [owner...]" >&2; exit 2; }

# ---- preflight ------------------------------------------------------------
command -v gh >/dev/null || { echo "gh CLI not found" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq not found" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh not authenticated — run: gh auth login" >&2; exit 1; }

repos_file=$(mktemp); survey_file=$(mktemp); targets_file=$(mktemp); verify_file=$(mktemp)
trap 'rm -f "$repos_file" "$survey_file" "$targets_file" "$verify_file"' EXIT

# ---- collect non-archived repos for all owners ----------------------------
for owner in "${owners[@]}"; do
  gh repo list "$owner" --limit 1000 --json nameWithOwner,isArchived \
    --jq '.[] | select(.isArchived==false) | .nameWithOwner'
done | sort -u > "$repos_file"
total_repos=$(grep -c . "$repos_file" || true)
echo "Scanning $total_repos non-archived repos across: ${owners[*]}"

# ---- survey (real-time, authoritative) ------------------------------------
xargs -P "$parallel" -I {} bash "$0" __count {} < "$repos_file" > "$survey_file"
echo
echo "=== Repos with caches ==="
sort -t$'\t' -k3 -rn "$survey_file" \
  | awk -F'\t' '$2>0 {printf "  %-50s %3d caches  %9.1f MB\n", $1, $2, $3/1048576}'
awk -F'\t' '$2>0{r++} {c+=$2; b+=$3} END{
  printf "\nTotal: %d caches, %.1f MB in %d repos (of %d scanned)\n", c, b/1048576, r, NR}' "$survey_file"

if [ "$survey_only" -eq 1 ]; then
  echo "(survey-only: nothing deleted)"
  exit 0
fi

awk -F'\t' '$2>0 {print $1}' "$survey_file" > "$targets_file"
n_targets=$(grep -c . "$targets_file" || true)
[ "$n_targets" -eq 0 ] && { echo "No caches to purge."; exit 0; }

# ---- delete ---------------------------------------------------------------
echo
echo "Purging caches in $n_targets repos..."
xargs -P "$parallel" -I {} bash "$0" __delete {} < "$targets_file"

# ---- verify (gh cache list, NOT the lagging usage endpoint) ---------------
xargs -P "$parallel" -I {} bash "$0" __count {} < "$targets_file" > "$verify_file"
remaining=$(awk -F'\t' '$2>0' "$verify_file" | grep -c . || true)
echo
if [ "$remaining" -eq 0 ]; then
  echo "✅ ALL CLEAR: 0 live caches remain in the $n_targets purged repos."
else
  echo "⚠️  $remaining repo(s) still report caches — re-run or inspect:"
  sort -t$'\t' -k3 -rn "$verify_file" \
    | awk -F'\t' '$2>0 {printf "  %-50s %3d caches\n", $1, $2}'
  exit 1
fi
