#!/bin/bash
INPUT=$(cat)

TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty')

# Extract last assistant text message, truncate to 140 chars
MSG=""
if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  MSG=$(tac "$TRANSCRIPT_PATH" \
    | jq -r 'select(.type == "assistant") | .message.content[] | select(.type == "text") | .text' 2>/dev/null \
    | head -1 \
    | tr '\n' ' ' \
    | cut -c1-140)
fi

# Escape double quotes and backslashes for JSON
MSG=$(echo "$MSG" | sed 's/\\/\\\\/g; s/"/\\"/g')

curl -s -X POST "https://maker.ifttt.com/trigger/Claude%20Code/with/key/${IFTTT_WEBHOOK_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"value1\": \"Done! ../$(basename "$PWD")/\", \"value2\": \"$MSG\"}" \
  > /dev/null 2>&1
exit 0
