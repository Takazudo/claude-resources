#!/usr/bin/env bash
# gcom-msg.sh: Draft a conventional-commit message from staged diff via Copilot
# Usage: gcom-msg.sh
# Prints drafted commit message to stdout; caller stages files first
set -euo pipefail

DIFF=$(git diff --cached)

if [ -z "$DIFF" ]; then
  echo "No staged changes. Stage files with git add before running gcom-msg.sh." >&2
  exit 1
fi

PROMPT="You are a git commit message writer. Given the following git diff, write a conventional commit message.

Rules:
- Format: <type>(<optional scope>): <short subject> (under 72 chars)
- Types: feat, fix, docs, refactor, chore, test, style, perf, build, ci
- Add a blank line then an optional body paragraph if the change needs explanation
- Body: explain WHY, not WHAT; keep under 100 chars per line
- No period at end of subject
- Output only the commit message text — no explanations, no code fences

Diff to summarize:"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! RESULT=$(printf '%s\n' "$DIFF" | "$SCRIPT_DIR/gco-pure.sh" "$PROMPT"); then
  echo "gco-pure.sh failed" >&2
  exit 1
fi

if [ -z "$RESULT" ]; then
  echo "Copilot returned empty output" >&2
  exit 1
fi

printf '%s\n' "$RESULT"
