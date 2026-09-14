#!/usr/bin/env bash
# Append a dependency verdict to references/verdicts.md, so the next audit in any
# project starts from what previous ones learned.
#
# Usage:
#   record-verdict.sh --dep <name> --ecosystem <rust|js> --verdict <REMOVE|KEEP|DECIDE> \
#                     --project <repo-name> --reason "<one line>"
#
# Idempotent per (dep, project): re-recording the same pair replaces the old row
# rather than appending a duplicate, so a re-run of an audit does not stack rows.
set -euo pipefail

VERDICTS_FILE="${DEV_REDUCE_DEPS_VERDICTS:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/references/verdicts.md}"

DEP="" ECOSYSTEM="" VERDICT="" PROJECT="" REASON=""

while [ $# -gt 0 ]; do
  case "$1" in
    --dep)       DEP="${2:-}";       shift 2 ;;
    --ecosystem) ECOSYSTEM="${2:-}"; shift 2 ;;
    --verdict)   VERDICT="${2:-}";   shift 2 ;;
    --project)   PROJECT="${2:-}";   shift 2 ;;
    --reason)    REASON="${2:-}";    shift 2 ;;
    -h|--help)   sed -n '2,12p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "record-verdict: unknown argument '$1'" >&2; exit 64 ;;
  esac
done

for pair in "dep:$DEP" "ecosystem:$ECOSYSTEM" "verdict:$VERDICT" "project:$PROJECT" "reason:$REASON"; do
  if [ -z "${pair#*:}" ]; then
    echo "record-verdict: missing required --${pair%%:*}" >&2
    exit 64
  fi
done

case "$VERDICT" in
  REMOVE|KEEP|DECIDE) ;;
  *) echo "record-verdict: --verdict must be REMOVE, KEEP, or DECIDE (got '$VERDICT')" >&2; exit 64 ;;
esac

if [ ! -f "$VERDICTS_FILE" ]; then
  echo "record-verdict: verdicts file not found: $VERDICTS_FILE" >&2
  exit 1
fi

# A literal '|' would split the markdown row into extra cells; newlines would end it.
sanitize() { printf '%s' "$1" | tr '\n' ' ' | sed 's/|/\\|/g; s/  */ /g; s/^ //; s/ $//'; }
DEP_S=$(sanitize "$DEP")
REASON_S=$(sanitize "$REASON")
PROJECT_S=$(sanitize "$PROJECT")
ECOSYSTEM_S=$(sanitize "$ECOSYSTEM")

DATE=$(date +%Y-%m-%d)
ROW="| $DATE | \`$DEP_S\` | $ECOSYSTEM_S | $VERDICT | $PROJECT_S | $REASON_S |"

python3 - "$VERDICTS_FILE" "$DEP_S" "$PROJECT_S" "$ROW" <<'PY'
import re, sys

path, dep, project, row = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
lines = open(path).read().split("\n")

# Replace an existing row for the same (dep, project); a verdict that changed on
# re-audit should supersede the old one, not sit beside it contradicting it.
dep_cell = f"| `{dep}` |"
replaced = False
for i, line in enumerate(lines):
    if line.startswith("| ") and dep_cell in line:
        cells = [c.strip() for c in line.split("|")]
        if len(cells) > 5 and cells[5] == project:
            lines[i] = row
            replaced = True
            break

if not replaced:
    # Append after the last row of the Verdicts table.
    last = None
    in_verdicts = False
    for i, line in enumerate(lines):
        if line.strip().startswith("## Verdicts"):
            in_verdicts = True
        elif in_verdicts and line.startswith("| "):
            last = i
    if last is None:
        sys.exit("record-verdict: could not find the Verdicts table")
    lines.insert(last + 1, row)

open(path, "w").write("\n".join(lines))
print("updated" if replaced else "appended")
PY

echo "record-verdict: $DEP ($ECOSYSTEM) → $VERDICT  [$PROJECT]"
