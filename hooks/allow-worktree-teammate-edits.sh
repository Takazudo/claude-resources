#!/bin/bash
# PreToolUse hook: auto-approve Edit/Write/NotebookEdit when either the session
# cwd OR the target file path is inside an x-wt-teams worktree.
#
# Why: /x-wt-teams spawns child Claude Code sessions as agent-team teammates.
# Per code.claude.com/docs/en/agent-teams, teammates inherit the lead's
# permission mode and you cannot set per-teammate modes at spawn time. Two
# independent failure modes trigger permission prompts that hang the teammate:
#
# 1. The lead runs in `auto` / `default` mode, so the teammate Claude Code
#    session inherits that mode and every Edit requires confirmation.
# 2. The teammate is spawned via Task+team_name, so its process cwd is the
#    LEAD's cwd (typically the repo root) — not the worktree it is logically
#    working in. Even though tool calls target files under worktrees/<topic>/,
#    the session cwd never reflects that.
#
# Scope: matches when either field contains a path segment literally named
# "worktrees" with a topic directory beneath it (the layout x-wt-teams Step 3
# creates: worktrees/<topic>/). Regular sessions and subagents whose cwd AND
# target file both sit outside worktrees go through the normal permission
# flow. This covers both frontend-worktree-child (which already has
# permissionMode: acceptEdits) and general-purpose teammates used for
# non-frontend topics, regardless of which agent type the manager chose.

set -euo pipefail

INPUT=$(cat)
CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty')
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')

WORKTREE_RE='/worktrees/[^/]+(/|$)'

if { [[ -n "$CWD" ]] && [[ "$CWD" =~ $WORKTREE_RE ]]; } \
  || { [[ -n "$FILE_PATH" ]] && [[ "$FILE_PATH" =~ $WORKTREE_RE ]]; }; then
  cat <<'JSON'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "x-wt-teams teammate: auto-approve file edit inside worktree"
  }
}
JSON
fi

exit 0
