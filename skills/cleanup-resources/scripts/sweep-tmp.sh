#!/usr/bin/env bash
# Sweep stale, ephemeral build-tool artifacts out of temp dirs to reclaim disk.
#
# ALLOWLIST-ONLY + AGE-GATED by design. It deletes ONLY top-level entries whose
# name matches one of STALE_PATTERNS AND that have not been modified recently.
# So an in-progress build (whose session dir has a fresh mtime) is never hit,
# and unrelated temp files never match. This is why it is safe to run
# unattended at the end of a workflow.
#
# The concrete case this exists for: zudo-front-builder (zfb) leaves
# `zfb-shadow-session-*` dirs (5-8G each) in $TMPDIR on exit; a few dev sessions
# fill the disk. Add a pattern below when you find another tool that leaks large
# session/cache dirs into a temp dir.
#
# Usage:
#   sweep-tmp.sh                   # dry-run: report what WOULD be reclaimed
#   sweep-tmp.sh --apply           # actually delete
#   sweep-tmp.sh --min-age-min 120 # only entries idle >120min (default 60)
set -euo pipefail

# --- the allowlist: top-level names only, no slashes. Extend as needed. ---
STALE_PATTERNS=(
  'zfb-shadow-session-*'   # zudo-front-builder ephemeral build sessions
)

MIN_AGE_MIN="${SWEEP_MIN_AGE_MIN:-60}"
APPLY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --min-age-min) shift; MIN_AGE_MIN="${1:-}" ;;
    -h|--help) grep '^#' "$0" | sed 's/^#\{1,\} \{0,1\}//'; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
  shift
done

case "$MIN_AGE_MIN" in
  ''|*[!0-9]*) echo "min-age-min must be a non-negative integer" >&2; exit 2 ;;
esac

# --- base dirs to scan (validated, deduped by real path) ---
BASES=()
for b in "${TMPDIR:-}" "/tmp"; do
  [ -n "$b" ] || continue
  b="${b%/}"                                   # strip trailing slash
  [ -n "$b" ] && [ "$b" != "/" ] || continue   # never the filesystem root
  [ -d "$b" ] || continue
  rp="$(cd "$b" 2>/dev/null && pwd -P)" || continue
  [ -n "$rp" ] && [ "$rp" != "/" ] || continue
  seen=0
  for s in ${BASES[@]+"${BASES[@]}"}; do [ "$s" = "$rp" ] && seen=1 && break; done
  [ "$seen" = 1 ] || BASES+=("$rp")
done

if [ "${#BASES[@]}" -eq 0 ]; then
  echo "no valid temp base dirs to scan"; exit 0
fi

echo "sweep-tmp: mode=$([ "$APPLY" = 1 ] && echo APPLY || echo DRY-RUN)  min-age=${MIN_AGE_MIN}min"
echo "bases:    ${BASES[*]}"
echo "patterns: ${STALE_PATTERNS[*]}"
echo

matched=()
for base in "${BASES[@]}"; do
  for pat in "${STALE_PATTERNS[@]}"; do
    case "$pat" in
      ''|*/*|'*') echo "skip unsafe pattern: '$pat'" >&2; continue ;;
    esac
    while IFS= read -r p; do
      [ -n "$p" ] && matched+=("$p")
    done < <(find "$base" -maxdepth 1 -mindepth 1 -name "$pat" -mmin +"$MIN_AGE_MIN" 2>/dev/null)
  done
done

if [ "${#matched[@]}" -eq 0 ]; then
  echo "nothing to sweep — no stale matches."
  exit 0
fi

echo "matched ${#matched[@]} entry(ies):"
du -sh "${matched[@]}" 2>/dev/null | sort -rh || true
size_total="$(du -sch "${matched[@]}" 2>/dev/null | tail -1 | awk '{print $1}')" || true
echo

if [ "$APPLY" = 1 ]; then
  for p in "${matched[@]}"; do
    rm -rf -- "$p" || echo "WARN: could not remove $p" >&2
  done
  echo "reclaimed ~${size_total:-?} (${#matched[@]} entries removed)."
else
  echo "would reclaim ~${size_total:-?}. Re-run with --apply to delete."
fi
