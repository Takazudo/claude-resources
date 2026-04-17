#!/usr/bin/env bash
# gco-pure.sh: Pure-function Copilot wrapper with zero tool access
# Usage: echo "<text>" | gco-pure.sh "<prompt>"
#        gco-pure.sh "<prompt>" <input-file>
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: gco-pure.sh <prompt> [input-file]" >&2
  exit 1
fi

PROMPT="$1"
INPUT_FILE="${2:-}"

# Pre-flight rate-limit check — silent fallback if degraded or check fails
if command -v node &>/dev/null && [ -f "$HOME/.claude/scripts/gco-rate-limit.js" ]; then
  _RATE_STATUS=$(node "$HOME/.claude/scripts/gco-rate-limit.js" check 2>/dev/null) || exit 1
  case "$_RATE_STATUS" in
    degraded:*) exit 1 ;;
  esac
fi

# Require standalone copilot CLI (gh copilot extension lacks -p/--model/--available-tools)
if ! command -v copilot &>/dev/null; then
  echo "copilot CLI not found. Install the standalone GitHub Copilot CLI." >&2
  exit 1
fi

# Build timeout prefix array (gtimeout on macOS/coreutils, timeout on Linux)
TIMEOUT=()
if command -v gtimeout &>/dev/null; then
  TIMEOUT=(gtimeout 900)
elif command -v timeout &>/dev/null; then
  TIMEOUT=(timeout 900)
fi

# Read input from file or stdin
if [ -n "$INPUT_FILE" ]; then
  if [ ! -r "$INPUT_FILE" ]; then
    echo "Input file not readable: $INPUT_FILE" >&2
    exit 1
  fi
  INPUT_TEXT=$(cat "$INPUT_FILE")
else
  INPUT_TEXT=$(cat)
fi

FULL_PROMPT="${PROMPT}

${INPUT_TEXT}"

# --available-tools with no list = zero tools available to the model
"${TIMEOUT[@]}" copilot \
  -p "$FULL_PROMPT" \
  -s \
  --no-ask-user \
  --model gpt-4.1 \
  --available-tools
