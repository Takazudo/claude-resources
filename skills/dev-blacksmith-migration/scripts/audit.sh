#!/usr/bin/env bash
# Audit a repo's .github/workflows/ for self-hosted-runner-isms that need
# attention before/during a Blacksmith migration. Read-only; never modifies files.
#
# Usage: bash audit.sh [repo-root]
# Default repo-root is current directory.

set -euo pipefail

ROOT="${1:-$(pwd)}"
WF_DIR="$ROOT/.github/workflows"

if [[ ! -d "$WF_DIR" ]]; then
  echo "No .github/workflows/ directory at $ROOT — nothing to audit."
  exit 0
fi

bold() { printf '\n\033[1m%s\033[0m\n' "$1"; }
dim()  { printf '\033[2m%s\033[0m\n' "$1"; }

cd "$ROOT"

bold "Workflow files"
ls -1 "$WF_DIR"

bold "All runs-on: values"
grep -nH '^[[:space:]]*runs-on:' .github/workflows/*.y*ml 2>/dev/null || dim "(none — no runs-on lines found)"

bold "detect-runner references (workflow file, job calls, needs:)"
grep -nHE 'detect-runner|RUNNER_CHECK_TOKEN' .github/workflows/*.y*ml 2>/dev/null || dim "(none)"

bold "set-safe-directory: false (self-hosted leftover; remove for ephemeral)"
grep -nH 'set-safe-directory:[[:space:]]*false' .github/workflows/*.y*ml 2>/dev/null || dim "(none)"

bold "Manual safe.directory steps (KEEP for container jobs, regardless of runner)"
grep -nH 'safe\.directory' .github/workflows/*.y*ml 2>/dev/null | grep -v 'set-safe-directory' || dim "(none)"

bold "Workspace cleanup steps that ephemeral runners do not need"
grep -nHE 'Clean workspace|Fix workspace permissions|chown.*GITHUB_WORKSPACE' .github/workflows/*.y*ml 2>/dev/null || dim "(none)"

bold "Container jobs (need the manual safe.directory step — see Step 6)"
grep -nHE '^[[:space:]]*container:' .github/workflows/*.y*ml 2>/dev/null || dim "(none — no container jobs)"

bold "Inter-job data sharing patterns"
echo "  cache/save (uploads):"
grep -nH 'actions/cache/save' .github/workflows/*.y*ml 2>/dev/null || dim "  (none)"
echo "  cache/restore (downloads):"
grep -nH 'actions/cache/restore' .github/workflows/*.y*ml 2>/dev/null || dim "  (none)"
echo "  upload-artifact:"
grep -nH 'actions/upload-artifact' .github/workflows/*.y*ml 2>/dev/null || dim "  (none)"
echo "  download-artifact:"
grep -nH 'actions/download-artifact' .github/workflows/*.y*ml 2>/dev/null || dim "  (none)"

bold "Existing extras= on runs-on labels (audit before adding more)"
grep -nH 'extras=' .github/workflows/*.y*ml 2>/dev/null || dim "(none)"

bold "Jobs without their own actions/checkout (deploy-only candidates)"
# Quick heuristic: list every job header, then list jobs whose body contains
# no actions/checkout. Not perfect (a job might checkout via reusable workflow)
# but flags candidates worth eyeballing.
for f in .github/workflows/*.y*ml; do
  awk -v file="$f" '
    /^[a-zA-Z0-9_-]+:$/ && in_jobs { current=$1; sub(":","", current); has_co=0; next }
    /^jobs:[[:space:]]*$/ { in_jobs=1; next }
    in_jobs && /actions\/checkout/ { has_co=1 }
    in_jobs && /^[a-zA-Z0-9_-]+:[[:space:]]*$/ && current && !has_co {
      printf "%s: job %s — no actions/checkout in this job\n", file, current
      current=""
    }
    END {
      if (current && !has_co) printf "%s: job %s — no actions/checkout in this job\n", file, current
    }
  ' "$f" 2>/dev/null
done

bold "Done"
echo "Cross-reference each finding with the matching SKILL.md step before editing."
