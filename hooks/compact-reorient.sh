#!/bin/bash
# Keep a long-running workflow session oriented across a context compaction.
#
# The problem: /x-wt-teams (and to a lesser degree /x-as-pr, /big-plan) runs for
# hours as a manager session. When the context is compacted mid-workflow, the
# step-level state goes with it — which step, which tracking issue, which topics
# already merged — and the session re-does completed work or drifts. The real
# progress ledger survives on disk or on GitHub; only the *pointer to it* is lost.
#
# Two events, two different jobs (both verified against the CLI binary v2.1.235 —
# the public docs are ambiguous here and imply the wrong answer):
#
#   PreCompact   -> a hook's plain stdout becomes `newCustomInstructions`, merged
#                   into the summarization prompt. Used here to tell the
#                   summarizer what it must not drop.
#   SessionStart -> fires again with source "compact" as part of the
#                   post-compaction context rebuild, and its results are spliced
#                   into the new message list as `hookResults`. This is the only
#                   place text can be injected where the model will see it.
#
# NOT PostCompact: it fires at the right moment and even receives the summary,
# but its handler returns only {userDisplayMessage} — terminal output for the
# user, never visible to the model. It looks like the right hook and is not.
#
# SessionStart hooks are skipped for subagents, so this only ever fires for the
# manager session. That is the intended scope: children are short-lived and
# report back through git + SendMessage.
#
# Everything here is offline and best-effort. A compaction must never be delayed
# or broken by this hook, so every step is failure-swallowed and the script
# always exits 0 — an exit 2 on the PreCompact leg would BLOCK the compaction.

set +e

# A pointer nobody has touched in this long is not describing live work; the
# session has almost certainly moved on to something else.
STALE_AFTER_SECONDS=$((7 * 24 * 3600))
# Past this, still show the pointer but say plainly that it may be out of date.
UNCERTAIN_AFTER_SECONDS=$((6 * 3600))
# A local-mode ledger on its own (no pointer file) is only weak evidence of live
# work, so it has to be recent to trigger anything by itself.
LEDGER_TRIGGER_SECONDS=$((12 * 3600))

input=$(cat)

json_field() { jq -r "${1} // empty" <<<"$input" 2>/dev/null; }

event=$(json_field '.hook_event_name')
session_id=$(json_field '.session_id')
hook_cwd=$(json_field '.cwd')
[ -n "$hook_cwd" ] && [ -d "$hook_cwd" ] && cd "$hook_cwd" 2>/dev/null

now=$(date +%s)

# macOS and WSL disagree on stat(1). `bsd_form || gnu_form` inside one command
# substitution is NOT a safe fallback: GNU stat reads `-f` as --file-system and
# `%m` as a filename, so it dumps a multi-line filesystem report for the real
# file to stdout before exiting non-zero — the `||` then appends the correct
# epoch to that garbage. Run one form at a time and accept only all-digits.
file_mtime() {
  local mtime
  mtime=$(stat -c %Y "$1" 2>/dev/null)
  case "$mtime" in '' | *[!0-9]*) mtime=$(stat -f %m "$1" 2>/dev/null) ;; esac
  case "$mtime" in '' | *[!0-9]*) return 1 ;; esac
  printf '%s\n' "$mtime"
}

file_age() {
  local mtime
  mtime=$(file_mtime "$1")
  [ -z "$mtime" ] && return 1
  echo $((now - mtime))
}

human_age() {
  local delta=$1
  [ -z "$delta" ] && return
  if [ "$delta" -lt 0 ]; then echo "just now"
  elif [ "$delta" -lt 3600 ]; then echo "$((delta / 60))m ago"
  elif [ "$delta" -lt 86400 ]; then echo "$((delta / 3600))h ago"
  else echo "$((delta / 86400))d ago"
  fi
}

# ---------------------------------------------------------------------------
# Discovery — offline only. This runs on EVERY compaction, so no `gh`, no
# network, and nothing that can hang.
# ---------------------------------------------------------------------------

git_branch=$(git branch --show-current 2>/dev/null)
git_root=$(git rev-parse --show-toplevel 2>/dev/null)
in_worktree=""
if [ -n "$git_root" ]; then
  git_dir=$(git rev-parse --git-dir 2>/dev/null)
  # A worktree checkout has .git as a file pointing into the main repo, which
  # `git rev-parse --git-dir` resolves to a path under .git/worktrees/.
  case "$git_dir" in *"/worktrees/"*) in_worktree="yes" ;; esac
fi

pointer_file=""
pointer_age_h=""
pointer_delta=""
if [ -n "$session_id" ]; then
  candidate="$HOME/.claude/orientation/${session_id}.json"
  if [ -f "$candidate" ]; then
    pointer_delta=$(file_age "$candidate")
    p_root=$(jq -r '.repoRoot // empty' "$candidate" 2>/dev/null)
    # Drop the pointer when it is ancient, or when it was written for a different
    # repository than the one we are sitting in now — a confidently wrong tracker
    # is worse than no tracker.
    if [ -n "$pointer_delta" ] && [ "$pointer_delta" -lt "$STALE_AFTER_SECONDS" ]; then
      if [ -z "$p_root" ] || [ -z "$git_root" ] || [ "$p_root" = "$git_root" ]; then
        pointer_file="$candidate"
        pointer_age_h=$(human_age "$pointer_delta")
      fi
    fi
  fi
fi

# Newest local-mode ledger for this repo, if the workflow is running --local.
ledger=""
ledger_age_h=""
ledger_recent=""
if [ -n "$git_root" ]; then
  logdir=$(node "$HOME/.claude/scripts/get-logdir.js" 2>/dev/null)
  if [ -n "$logdir" ] && [ -d "$logdir/local-workflow" ]; then
    ledger=$(ls -t "$logdir"/local-workflow/*/progress.md 2>/dev/null | head -1)
    if [ -n "$ledger" ]; then
      ledger_delta=$(file_age "$ledger")
      ledger_age_h=$(human_age "$ledger_delta")
      if [ -n "$ledger_delta" ] && [ "$ledger_delta" -lt "$LEDGER_TRIGGER_SECONDS" ]; then
        ledger_recent="yes"
      else
        # Old ledgers are the likeliest source of confidently stale guidance —
        # every past --local run leaves one lying around forever.
        ledger=""
      fi
    fi
  fi
fi

# A `base/*` branch is created only by /x-wt-teams, so it is a reliable
# mid-workflow signal on its own. `topic/*` and `issue-#*` are deliberately NOT
# treated as signals — they are ordinary day-to-day branches, and firing on them
# would inject this block into every compaction of every normal dev session.
workflow_branch=""
case "$git_branch" in base/*) workflow_branch="yes" ;; esac

# Nothing found means this is not a workflow session. Stay completely silent —
# an unconditional hook would put noise into the summary of every session.
if [ -z "$pointer_file" ] && [ -z "$ledger_recent" ] && [ -z "$workflow_branch" ]; then
  exit 0
fi

# ---------------------------------------------------------------------------
# Build the pointer list shared by both legs.
# ---------------------------------------------------------------------------

pointers=""
add_line() { pointers="${pointers}${1}
"; }

pointer_status=""
if [ -n "$pointer_file" ]; then
  p_workflow=$(jq -r '.workflow // empty' "$pointer_file" 2>/dev/null)
  p_issue=$(jq -r '.issue // empty' "$pointer_file" 2>/dev/null)
  p_issue_url=$(jq -r '.issueUrl // empty' "$pointer_file" 2>/dev/null)
  p_repo=$(jq -r '.repo // empty' "$pointer_file" 2>/dev/null)
  p_local_dir=$(jq -r '.localDir // empty' "$pointer_file" 2>/dev/null)
  p_base=$(jq -r '.baseBranch // empty' "$pointer_file" 2>/dev/null)
  p_branch=$(jq -r '.branch // empty' "$pointer_file" 2>/dev/null)
  p_pr=$(jq -r '.pr // empty' "$pointer_file" 2>/dev/null)
  p_step=$(jq -r '.step // empty' "$pointer_file" 2>/dev/null)
  p_note=$(jq -r '.note // empty' "$pointer_file" 2>/dev/null)
  pointer_status=$(jq -r '.status // empty' "$pointer_file" 2>/dev/null)

  add_line "Workflow pointer for this session (last updated ${pointer_age_h:-unknown}):"
  [ -n "$p_workflow" ] && add_line "- workflow: $p_workflow"
  [ -n "$p_step" ] && add_line "- last recorded step: $p_step"
  if [ -n "$p_issue" ]; then
    add_line "- tracking issue: #${p_issue} — re-read it with \`gh issue view ${p_issue}\`; it holds the TODO checklist and the progress comments"
  elif [ -n "$p_issue_url" ]; then
    add_line "- tracking issue: ${p_issue_url} — re-read it before acting"
  fi
  [ -n "$p_repo" ] && add_line "- repo: $p_repo"
  [ -n "$p_local_dir" ] && add_line "- coordination dir: ${p_local_dir} — re-read progress.md and plan.md there"
  [ -n "$p_base" ] && add_line "- base branch: $p_base"
  [ -n "$p_branch" ] && add_line "- working branch: $p_branch — it already exists, do not re-create it"
  [ -n "$p_pr" ] && add_line "- PR: $p_pr"
  [ -n "$p_note" ] && add_line "- note: $p_note"
  if [ -n "$pointer_delta" ] && [ "$pointer_delta" -ge "$UNCERTAIN_AFTER_SECONDS" ]; then
    add_line "- (this pointer has not been updated in a while — verify it still describes live work before acting on it)"
  fi
  add_line ""
fi

if [ -n "$ledger" ]; then
  add_line "Local-mode progress ledger (modified ${ledger_age_h:-unknown}):"
  add_line "- $ledger"
  add_line ""
fi

add_line "Environment:"
add_line "- cwd: ${hook_cwd:-$PWD}"
[ -n "$git_branch" ] && add_line "- git branch: ${git_branch}${in_worktree:+ (inside a git worktree)}"

# ---------------------------------------------------------------------------
# PreCompact — stdout becomes extra instructions for the summarizer.
# ---------------------------------------------------------------------------

if [ "$event" = "PreCompact" ]; then
  # Kept deliberately short: these instructions are merged into the
  # summarization prompt, and a long checklist competes with the actual content.
  cat <<EOF
This session is running a long multi-step development workflow. Preserve these
verbatim instead of compressing them into prose — losing any one of them makes
the session redo finished work:

- The tracking issue number / URL and any local coordination dir path.
- The TODO checklist, and exactly which items are already checked off.
- The current workflow step number and name.
- Every branch and PR in play, and which are already merged, closed, or deleted.

Pointers known at compaction time:

${pointers}
EOF
  exit 0
fi

# ---------------------------------------------------------------------------
# SessionStart (source "compact") — additionalContext is spliced into the
# rebuilt context, so this is what the model actually reads after compaction.
# ---------------------------------------------------------------------------

if [ "$event" = "SessionStart" ]; then
  if [ "$pointer_status" = "complete" ]; then
    lead="A workflow ran earlier in this session and is already marked COMPLETE. Do NOT
resume it and do NOT re-run its steps. The pointers below are history — use them
only if the user's current request refers back to that work."
  else
    lead="Your context was just compacted, so step-level progress may be missing or
subtly wrong. Before taking any further action on this workflow: re-read the
tracker named below and reconstruct what is already finished. Do NOT restart
completed steps, and do NOT recreate branches, PRs, or issues that already exist
— check first. The tracker on disk or on GitHub is the source of truth; the
summary above is not."
  fi

  context="## Context was compacted — re-orient before acting

${lead}

${pointers}
If the work described above is already finished, or the user has since moved on
to something else, ignore this block and continue with their current request."

  # jq --arg handles the newlines and quoting; hand-rolled escaping here is how
  # this leg would silently start emitting invalid JSON. Build it first and only
  # print on success, so a jq failure yields nothing rather than half a document.
  payload=$(jq -n --arg ctx "$context" \
    '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}' 2>/dev/null)
  [ -n "$payload" ] && printf '%s\n' "$payload"

  exit 0
fi

exit 0
