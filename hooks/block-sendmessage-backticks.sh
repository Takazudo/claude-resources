#!/bin/bash

# PreToolUse hook: block SendMessage tool calls whose `message` or `summary`
# contains a backtick. Workaround for Claude Code v2.1.117 Ink rendering bug
# #51855 — an inline code span in a teammate message crashes the recap pane
# with "<Box> can't be nested inside <Text>" and tears down the whole team
# directory.
#
# Contract (Claude Code PreToolUse hook):
#   - stdin:  JSON with .tool_name and .tool_input
#   - exit 0: allow
#   - exit 2: block; stderr is shown back to the calling agent so it can retry

input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name' 2>/dev/null || echo "")

if [ "$tool_name" != "SendMessage" ]; then
  exit 0
fi

# `.tool_input.message` may be a plain string OR a protocol object
# (shutdown_request, plan_approval_response, etc.). Only policy-check strings —
# protocol objects never render as Ink text.
message_type=$(echo "$input" | jq -r '.tool_input.message | type' 2>/dev/null || echo "null")

if [ "$message_type" = "string" ]; then
  message_value=$(echo "$input" | jq -r '.tool_input.message' 2>/dev/null || echo "")
  if printf '%s' "$message_value" | grep -q '`'; then
    cat >&2 <<'ERR'
Error: SendMessage `message` contains a backtick.

Claude Code v2.1.117 has an unfixed Ink rendering bug
(https://github.com/anthropics/claude-code/issues/51855): inline code spans in
teammate messages crash the recap pane and tear down the whole team directory.
One stray backtick in one message can kill a parallel run.

Retry with plain prose — no backticks, no triple-backtick code fences, no inline
markdown code formatting. Reference file paths, function names, shell commands,
and identifiers as unquoted words.

  Bad:  "Committed the fix to `src/api.ts` — run `pnpm test`"
  Good: "Committed the fix to src/api.ts — run pnpm test"

For longer code or diffs, save them to a log file and reference the path.
ERR
    exit 2
  fi
fi

summary_value=$(echo "$input" | jq -r '.tool_input.summary // ""' 2>/dev/null || echo "")
if printf '%s' "$summary_value" | grep -q '`'; then
  cat >&2 <<'ERR'
Error: SendMessage `summary` contains a backtick.

Same Ink rendering bug as above (#51855). Rewrite the summary as plain prose —
no backticks, no code formatting.
ERR
  exit 2
fi

exit 0
