#!/usr/bin/env bash
# gco-run.sh: Run GitHub Copilot CLI in read-only mode
# Usage: gco-run.sh "<prompt>" <output-file> [stderr-file]
#
# Env vars:
#   GCO_MODEL        Primary model (default: claude-opus-4.6).
#                    Set to "gpt-4.1" to force cheap mode (used by /gcoc-* skills).
#
# Behavior:
#   - On "no quota" (HTTP 402) from the primary model, automatically retries
#     with gpt-4.1 (zero-multiplier free model on the Pro plan) and appends
#     "GCO_USED_FALLBACK=gpt-4.1 ..." to the stderr file so the caller can
#     inform the user.
set -euo pipefail

PROMPT="$1"
OUTPUT_FILE="$2"
STDERR_FILE="${3:-/dev/null}"

MODEL="${GCO_MODEL:-claude-opus-4.6}"
FALLBACK_MODEL="gpt-4.1"

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

run_copilot() {
  local model="$1"
  ${TIMEOUT_CMD:+$TIMEOUT_CMD} ${TIMEOUT_CMD:+900} $COPILOT_CMD \
    -p "$FULL_PROMPT" \
    -s \
    --no-ask-user \
    --model "$model" \
    --deny-tool='write' \
    --allow-all-tools \
    > "$OUTPUT_FILE" \
    2>"$STDERR_FILE"
}

# First attempt with the primary model
set +e
run_copilot "$MODEL"
RC=$?
set -e

# If Copilot returned a no-quota error (402), retry with the free gpt-4.1 model.
# Skip retry if primary was already gpt-4.1 — nothing cheaper to fall back to.
if grep -qiE "no quota|quota exceeded|402 you have no quota" "$OUTPUT_FILE" "$STDERR_FILE" 2>/dev/null; then
  if [ "$MODEL" != "$FALLBACK_MODEL" ]; then
    set +e
    run_copilot "$FALLBACK_MODEL"
    RC=$?
    set -e
    echo "GCO_USED_FALLBACK=$FALLBACK_MODEL (primary model '$MODEL' returned 402 no-quota)" >> "$STDERR_FILE"
  fi
fi

exit $RC
