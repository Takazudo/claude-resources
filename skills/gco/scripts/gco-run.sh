#!/usr/bin/env bash
# gco-run.sh: Run GitHub Copilot CLI in read-only mode
# Usage: gco-run.sh "<prompt>" <output-file> [stderr-file]
set -euo pipefail

PROMPT="$1"
OUTPUT_FILE="$2"
STDERR_FILE="${3:-/dev/null}"

# Read-only preamble
RO_PREAMBLE="You are operating in read-only mode. Your role is research and review only.
Rules:
- Never create, edit, or delete files
- Never run commands that modify the system (no git commits, no installs, no writes)
- You may run read-only commands: cat, ls, grep, git log, git diff, git show, etc.
- You may search the web for research
- Provide analysis, suggestions, and findings as text output only

Task:"

FULL_PROMPT="${RO_PREAMBLE}
${PROMPT}"

# Detect timeout command (gtimeout on macOS via coreutils, timeout on Linux/WSL)
if command -v gtimeout &>/dev/null; then
  TIMEOUT_CMD="gtimeout"
elif command -v timeout &>/dev/null; then
  TIMEOUT_CMD="timeout"
else
  TIMEOUT_CMD=""
fi

# Detect copilot command (standalone or gh extension)
if command -v copilot &>/dev/null; then
  COPILOT_CMD="copilot"
elif gh copilot --version &>/dev/null 2>&1; then
  COPILOT_CMD="gh copilot"
else
  echo "Copilot CLI not found. Install with: gh extension install github/gh-copilot" >&2
  exit 1
fi

${TIMEOUT_CMD:+$TIMEOUT_CMD} ${TIMEOUT_CMD:+900} $COPILOT_CMD \
  -p "$FULL_PROMPT" \
  -s \
  --no-ask-user \
  --model claude-opus-4.6 \
  --deny-tool='write' \
  --allow-all-tools \
  > "$OUTPUT_FILE" \
  2>"$STDERR_FILE"
