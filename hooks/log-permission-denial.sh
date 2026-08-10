#!/bin/bash
# Append one JSONL record per blocked tool call to a global ledger, so that
# /permission-review can propose allowlist edits later.
#
# Called from two places, because blocks arrive by two different routes:
#   - the PermissionDenied hook (auto-mode classifier / permissions.deny)
#   - scripts/security/deny-check.sh (its own exit-2 hard blocks)
#
# Runs in subagents too, which is the whole point: a child agent in a worktree
# hits most of the blocks during /x-wt-teams, and the manager never sees them.

source="${1:-unknown}"
log_dir="$HOME/.claude/logs"
log_file="$log_dir/permission-denials.jsonl"
mkdir -p "$log_dir"

input=$(cat)

# Never let a logging failure block or slow a tool call.
{
  jq -c \
    --arg ts "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
    --arg source "$source" \
    --arg cwd "$PWD" \
    '{
       ts: $ts,
       source: $source,
       cwd: $cwd,
       tool: (.tool_name // "unknown"),
       command: (.tool_input.command // .tool_input.file_path // null),
       reason: (.permission_decision_reason // .reason // .message // null)
     }' <<<"$input" >>"$log_file"
} 2>/dev/null || true

exit 0
