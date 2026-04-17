#!/usr/bin/env bash
# gco-pr-body.sh: Draft a PR body via GitHub Copilot CLI
# Usage: gco-pr-body.sh <base-branch>
# Prints drafted Markdown to stdout.
# Exits 1 with a usage message on invalid invocation.
# Exits 1 silently on Copilot failure (caller should fall back).
set -euo pipefail

BASE="${1:-}"
if [[ -z "$BASE" ]]; then
  echo "Usage: gco-pr-body.sh <base-branch>" >&2
  exit 1
fi

# Guard against branch names that could inject unexpected shell commands into
# the Copilot prompt (Copilot runs git commands directly with --allow-all-tools).
if [[ ! "$BASE" =~ ^[A-Za-z0-9._/@-]+$ ]]; then
  echo "Invalid base branch name: $BASE" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="$(mktemp "${TMPDIR:-/tmp}/gco-pr-body.XXXXXX")"
STDERR_FILE="$(mktemp "${TMPDIR:-/tmp}/gco-pr-body.XXXXXX")"
trap 'rm -f "$OUTPUT_FILE" "$STDERR_FILE"' EXIT

PROMPT="You are helping draft a GitHub pull request description.

Analyze the changes between \`$BASE\` and HEAD using these git commands
(two-dot range for commits, three-dot merge-base diff for file changes):
  git log $BASE..HEAD --oneline
  git diff $BASE...HEAD --stat
  git diff $BASE...HEAD

Then write a PR body with EXACTLY these three sections:

## Summary
(2-4 bullet points describing the main changes)

## Changes
(Detailed list of what was done, grouped by category if needed)

## Test Plan
(How to verify the changes work correctly)

Rules:
- Output ONLY the Markdown body (no title, no preamble, no explanation)
- Do not reference file paths unless necessary for clarity
- Keep it concise but complete"

# Pass stderr file so install-hints (e.g. "copilot not found") reach the user.
"$SCRIPT_DIR/gco-run.sh" "$PROMPT" "$OUTPUT_FILE" "$STDERR_FILE" || exit 1

# Treat empty Copilot output as failure so callers get a single clean signal.
if [[ ! -s "$OUTPUT_FILE" ]]; then
  exit 1
fi

cat "$OUTPUT_FILE"
