#!/usr/bin/env bash
# Hand an implementation off to a FRESH Claude Code session in a new tmux window.
#
# Backs the -tocl / --to-claude flag in /big-plan, /x-as-pr, and /x-wt-teams, and
# the standalone /toclaude skill.
# Shared spec: skills/x-wt-teams/references/claude-handoff.md
#
# Sibling of handoff-to-codex.sh. Same job, different target -- and far simpler,
# because `claude` accepts the prompt as a positional argv (`claude [options]
# [prompt]`) and submits it itself. There is no composer to poll for, no paste
# burst to out-wait, and no Enter that gets eaten as a line break. Two things
# still need watching: the directory-trust prompt, and the staged (--no-submit)
# path, which does type into the composer.
#
# Usage:
#   handoff-to-claude.sh --dir <repo-root> --command '<text>' [--name <window>] [--submit] [--model <alias>] [--timeout <sec>] [--session <tmux-session>] [--no-auto-answer]
#
# --submit  passes the command as argv, so Claude Code starts on it by itself.
# Without it the command is typed into the composer and left unsent.
#
# --model   pins the new session's model, default 'opus'. A hand-off exists to
# start implementation work on a clean context, and that work should not silently
# inherit whatever the launching session happened to be dialled down to -- the
# new session gets Opus unless the caller says otherwise. Pass 'inherit' to send
# no --model at all and let the new session take its configured default.
#
# Exit codes (deliberately the same numbering as handoff-to-codex.sh so the two
# scripts read side by side):
#   0  window created, session up, command submitted (--submit) or staged
#   2  not running inside tmux
#   3  claude CLI not found
#   4  the directory-trust prompt is up and was not auto-answered (--no-auto-answer,
#      or its affirmative option was not recognised)
#   5  timed out waiting for the session to come up
#   6  tmux new-window failed, or returned no usable pane id
#   7  claude exited at startup (window closed, or the pane is dead)
#   8  the session came up but the command did not land -- the argv prompt never
#      started (--submit), or the composer keystrokes failed (staged). Under
#      --submit the prompt may still be queued; staged means nothing was typed.
#   64 usage error (missing/unknown/invalid argument) -- a caller bug, no fallback printed
#
# Every nonzero exit except 64 prints a command the user can run by hand.

set -uo pipefail

DIR="" COMMAND="" NAME="" SUBMIT=0 TIMEOUT=60 SESSION="" AUTO_ANSWER=1 MODEL="opus"

# `shift 2` on a flag whose value is missing aborts under `set -u` with a raw
# bash error, escaping the advertised exit-64 contract. Check first.
need_value() {
  [ "$2" -ge 2 ] || { echo "$1 requires a value" >&2; exit 64; }
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dir) need_value "$1" $#; DIR="$2"; shift 2 ;;
    --command) need_value "$1" $#; COMMAND="$2"; shift 2 ;;
    --name) need_value "$1" $#; NAME="$2"; shift 2 ;;
    --model) need_value "$1" $#; MODEL="$2"; shift 2 ;;
    --timeout) need_value "$1" $#; TIMEOUT="$2"; shift 2 ;;
    --session) need_value "$1" $#; SESSION="$2"; shift 2 ;;
    --submit) SUBMIT=1; shift ;;
    --no-auto-answer) AUTO_ANSWER=0; shift ;;
    *) echo "unknown argument: $1" >&2; exit 64 ;;
  esac
done

[ -n "$DIR" ] || { echo "--dir is required" >&2; exit 64; }
[ -n "$COMMAND" ] || { echo "--command is required" >&2; exit 64; }
[ -d "$DIR" ] || { echo "--dir is not a directory: $DIR" >&2; exit 64; }
[ -n "$NAME" ] || NAME="claude"
case "$TIMEOUT" in
  ''|*[!0-9]*) echo "--timeout must be a whole number of seconds: $TIMEOUT" >&2; exit 64 ;;
esac
[ "$TIMEOUT" -gt 0 ] || { echo "--timeout must be greater than 0" >&2; exit 64; }
[ -n "$MODEL" ] || { echo "--model must not be empty (pass 'inherit' to send no --model)" >&2; exit 64; }
case "$MODEL" in
  -*) echo "--model must be an alias or model name, not a flag: $MODEL" >&2; exit 64 ;;
esac

# 'inherit' is the opt-out, not a model name: it drops --model from the launch so
# the new session falls back to its own configured default. Useful when the pinned
# model is unavailable on the account, which would otherwise kill startup (exit 7).
MODEL_ARGS=(--model "$MODEL")
MODEL_FLAG_TEXT=" --model $MODEL"
MODEL_NOTE=" on model '$MODEL'"
if [ "$MODEL" = "inherit" ]; then
  MODEL_ARGS=()
  MODEL_FLAG_TEXT=""
  MODEL_NOTE=""
fi

# A leading '-' would be parsed by the claude CLI as a flag rather than as the
# prompt. Every real hand-off command starts with '/' or a word, so this can
# only be a caller bug -- and passing it through would silently launch a session
# with no prompt at all.
case "$COMMAND" in
  -*) echo "--command must not start with '-' (the claude CLI would read it as a flag): $COMMAND" >&2; exit 64 ;;
esac

# Collapse newlines/tabs to single spaces. argv itself survives newlines fine,
# but the staged path types into the composer, where Enter SUBMITS -- so a
# multi-line command would fire early and truncated. One deterministic line
# keeps both paths identical. Anything that genuinely needs structure belongs in
# a cclogs file with the path sent instead (see the skill docs).
COLLAPSED="${COMMAND//[$'\n\r\t']/ }"
while [[ "$COLLAPSED" == *"  "* ]]; do COLLAPSED="${COLLAPSED//  / }"; done
if [ "$COMMAND" != "$COLLAPSED" ]; then
  COMMAND="$COLLAPSED"
  echo "Note: collapsed whitespace in the command to a single line." >&2
fi

manual_instructions() {
  cat <<EOF
  cd $(printf "%q" "$DIR") && CLAUDE_CODE_NO_FLICKER=1 claude --dangerously-skip-permissions${MODEL_FLAG_TEXT}
  # then type:  $COMMAND
EOF
}

if [ -z "${TMUX:-}" ]; then
  {
    echo "Not running inside tmux — the Claude Code handoff needs a tmux session to open a window in."
    echo "Run this yourself instead:"
    echo
    manual_instructions
  } >&2
  exit 2
fi

CLAUDE_BIN=$(command -v claude 2>/dev/null)
if [ -z "$CLAUDE_BIN" ]; then
  {
    echo "claude CLI not found on PATH — the handoff cannot open a Claude Code window."
    echo "Install/expose it, then run this yourself:"
    echo
    manual_instructions
  } >&2
  exit 3
fi

# Defaults to the invoking session — that is the "same session" the handoff wants.
[ -n "$SESSION" ] || SESSION=$(tmux display-message -p '#{session_name}')

# tmux runs a MULTI-ARGUMENT command directly, with no intervening shell
# (verified: '$(whoami)', backticks and quotes all reach the child literally).
# So the prompt is passed as its own argv element and never goes through shell
# quoting -- which is the entire class of bug the codex script has to defend
# against when it builds one command string.
# -e sets the env var for this pane only (tmux 3.0+).
# -P -F prints the new pane's id so we can poll exactly this pane.
if [ "$SUBMIT" -eq 1 ]; then
  PANE=$(tmux new-window -t "$SESSION" -n "$NAME" -c "$DIR" -e CLAUDE_CODE_NO_FLICKER=1 \
    -P -F '#{pane_id}' "$CLAUDE_BIN" --dangerously-skip-permissions ${MODEL_ARGS[@]+"${MODEL_ARGS[@]}"} "$COMMAND")
  NEW_WINDOW_STATUS=$?
else
  PANE=$(tmux new-window -t "$SESSION" -n "$NAME" -c "$DIR" -e CLAUDE_CODE_NO_FLICKER=1 \
    -P -F '#{pane_id}' "$CLAUDE_BIN" --dangerously-skip-permissions ${MODEL_ARGS[@]+"${MODEL_ARGS[@]}"})
  NEW_WINDOW_STATUS=$?
fi

# A missing or malformed pane id is fatal, not cosmetic: every later `-t ""`
# would silently resolve to the CURRENT pane -- this very session -- and the
# command would be typed into it.
if [ "$NEW_WINDOW_STATUS" -ne 0 ] || [[ ! "$PANE" =~ ^%[0-9]+$ ]]; then
  {
    echo "Failed to open a tmux window in session '$SESSION' (status $NEW_WINDOW_STATUS, pane id '${PANE:-none}')."
    echo "Run this yourself instead:"
    echo
    manual_instructions
  } >&2
  exit 6
fi
echo "Opened tmux window '$NAME' ($PANE) in session '$SESSION'${MODEL_NOTE}."

# --- readiness -------------------------------------------------------------
#
# The TUI renders at roughly 2s on a warm machine; the pane is empty before
# that. Two independent signals, either of which means the session is up:
#   - the bypass-permissions footer, which this script always triggers because
#     it always passes --dangerously-skip-permissions
#   - the startup banner plus a composer line
# The "/rc connecting…" status is Remote Control, not composer readiness, and is
# deliberately NOT used.
session_ready() {
  printf '%s' "$1" | grep -q 'bypass permissions on' && return 0
  printf '%s' "$1" | grep -q 'Claude Code v' && printf '%s\n' "$1" | grep -q '^[[:space:]]*❯' && return 0
  return 1
}

# The directory-trust prompt appears for a directory Claude Code has not been
# trusted in before -- and it appears EVEN under --dangerously-skip-permissions,
# with "No, exit" PRESELECTED. A hand-off into the current repo root never sees
# it (the session running this script already trusted that directory), but a
# worktree or a sibling repo can. Left unanswered it silently swallows the whole
# hand-off.
# Matched on the SHORT, unwrappable markers first: the dialog's box title
# ("Accessing workspace:") and the opening words of its body ("Quick safety
# check"). The full sentence only fits on one captured line at ~80 columns or
# wider -- in a narrower pane it wraps mid-phrase and a single-sentence match
# misses the dialog entirely, which reads as a silent timeout.
trust_prompt_up() {
  printf '%s' "$1" | grep -qE 'Accessing workspace:|Quick safety check|Is this a project you created or one you trust|trust the files in this folder'
}

# Prints "<selected> <target>" (1-based positions among the dialog's options)
# for the affirmative choice, and nothing when it cannot be identified. Never
# guess: an unconditional Enter on this dialog answers whatever happens to be
# selected, and the preselected answer is the one that exits.
#
# The cancel label is NOT always "No, exit" -- a folder with pre-approved
# permission grants gets "No, continue without these permissions" instead
# (cancelLabel in the CLI's TrustDialog). Matching only the literal "No, exit"
# would drop that line from the count, leaving the affirmative at index 1 with
# no marker found -- and a defaulted selection would then press Enter on the
# focused CANCEL. So match any "No, …" option line and require a real marker.
trust_menu_target() {
  printf '%s\n' "$1" | awk '
    /^[[:space:]]*(❯[[:space:]]*)?(No,|Yes, I trust)/ {
      idx++
      if ($0 ~ /❯/) sel = idx
      if (!tgt && tolower($0) ~ /yes, i trust/) tgt = idx
    }
    END { if (tgt && sel) print sel, tgt }'
}

# Moves the selection from option $1 to option $2, then confirms.
menu_choose() {
  local key steps i
  if [ "$2" -ge "$1" ]; then key=Down; steps=$(($2 - $1)); else key=Up; steps=$(($1 - $2)); fi
  for ((i = 0; i < steps; i++)); do tmux send-keys -t "$PANE" "$key"; done
  tmux send-keys -t "$PANE" Enter
}

# A capture can still succeed on a pane whose process has exited when the user
# runs with `remain-on-exit`, so read the flag rather than trusting the capture.
pane_is_dead() {
  [ "$(tmux display-message -p -t "$PANE" '#{pane_dead}' 2>/dev/null)" = "1" ]
}

report_startup_exit() {
  {
    echo "The Claude Code window closed before the session appeared -- 'claude' exited"
    echo "at startup. Run it by hand to see why:"
    echo
    manual_instructions
  } >&2
}

report_trust_prompt_unanswered() {
  {
    echo "Claude Code is asking whether to trust $DIR, and the hand-off will not start"
    echo "until that is answered ($1)."
    if [ "$SUBMIT" -eq 1 ]; then
      # The prompt is already in argv, so answering the dialog starts it by
      # itself. Telling the user to also send the command would run the whole
      # workflow TWICE -- a second set of branches, worktrees and PRs.
      echo "Answer it in the '$NAME' window; the command was passed as an argument, so the"
      echo "session starts on it by itself once the dialog is cleared. Send it by hand ONLY"
      echo "if the session then sits idle with nothing running:"
    else
      echo "Answer it in the '$NAME' window, then send:"
    fi
    echo
    echo "  $COMMAND"
  } >&2
  tmux select-window -t "$PANE"
  exit 4
}

READY=0 TRUST_ANSWERED=0 TRUST_SEEN=0
DEADLINE=$((SECONDS + TIMEOUT))
while [ "$SECONDS" -lt "$DEADLINE" ]; do
  if ! SCREEN=$(tmux capture-pane -t "$PANE" -p 2>/dev/null) || pane_is_dead; then
    report_startup_exit
    exit 7
  fi

  # Readiness is checked FIRST because the trust markers are deliberately
  # broad (they have to survive line wrapping) and could in principle match
  # text outside the dialog. The two states are mutually exclusive in
  # practice -- the modal hides the banner and the footer -- so a ready
  # session is proof the dialog is not up, and testing it first means a
  # spurious trust match can never trap the loop until the deadline.
  if session_ready "$SCREEN"; then
    READY=1
    break
  fi

  if [ "$TRUST_ANSWERED" -eq 0 ] && trust_prompt_up "$SCREEN"; then
    TRUST_SEEN=1
    [ "$AUTO_ANSWER" -eq 0 ] && report_trust_prompt_unanswered '--no-auto-answer'
    read -r SEL TGT <<<"$(trust_menu_target "$SCREEN")"
    if [ -n "${TGT:-}" ]; then
      menu_choose "$SEL" "$TGT"
      TRUST_ANSWERED=1
      echo "Answered Claude Code's directory-trust prompt: Yes, I trust this folder ($DIR)."
    fi
    # If the affirmative option is not parseable yet, fall through and look
    # again: the question can render a frame before its options do, and
    # bailing on that first frame would fail a prompt that was answerable a
    # moment later. A genuinely unrecognisable dialog runs out the deadline
    # and is reported below.
    sleep 1
    continue
  fi

  sleep 1
done

if [ "$READY" -ne 1 ]; then
  # A trust prompt that was seen but never answered is its own failure, and a
  # more actionable one than a bare timeout.
  [ "$TRUST_SEEN" -eq 1 ] && [ "$TRUST_ANSWERED" -eq 0 ] \
    && report_trust_prompt_unanswered 'affirmative option not recognised'
  {
    echo "Timed out after ${TIMEOUT}s waiting for the Claude Code session in window '$NAME'"
    echo "(trust prompt answered: $TRUST_ANSWERED)."
    if [ "$SUBMIT" -eq 1 ]; then
      echo "The window is open and the prompt was passed as an argument, so it may still be"
      echo "queued behind a startup prompt -- LOOK AT THE WINDOW before doing anything."
      echo "Only if the session is idle with nothing running, send:"
    else
      echo "The window is open — check it for a prompt, then send this by hand:"
    fi
    echo
    echo "  $COMMAND"
  } >&2
  tmux select-window -t "$PANE"
  exit 5
fi

# --- deliver ---------------------------------------------------------------

if [ "$SUBMIT" -eq 1 ]; then
  # The prompt went in as argv, so there is nothing to type -- only to confirm
  # that Claude Code actually started on it. A submitted prompt echoes above the
  # composer, and a running turn shows the interrupt hint. Absence of both after
  # the grace period means the argv never took, which is worth failing on: the
  # caller would otherwise report a hand-off that never happened.
  STARTED=0
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    SCREEN=$(tmux capture-pane -t "$PANE" -p 2>/dev/null) || break
    if printf '%s' "$SCREEN" | grep -qF -- "${COMMAND:0:24}" || printf '%s' "$SCREEN" | grep -q 'esc to interrupt'; then
      STARTED=1
      break
    fi
    sleep 1
  done
  if [ "$STARTED" -ne 1 ]; then
    {
      echo "Claude Code came up in window '$NAME' but nothing appeared for the command."
      echo "LOOK AT THE WINDOW before resending -- the prompt was passed as an argument and"
      echo "may be queued. Only if the session is idle with nothing running, send:"
      echo
      echo "  $COMMAND"
    } >&2
    tmux select-window -t "$PANE"
    exit 8
  fi
  echo "Submitted to Claude Code: $COMMAND"
else
  # -l sends the string literally, so '/' and '-' are not read as key names.
  # No Enter: the point of the staged path is that the user reads it first.
  if ! tmux send-keys -t "$PANE" -l -- "$COMMAND"; then
    {
      echo "Could not type the command into the Claude Code composer in window '$NAME'."
      echo "Send it by hand there:"
      echo
      echo "  $COMMAND"
    } >&2
    tmux select-window -t "$PANE"
    exit 8
  fi
  echo "Staged in the Claude Code composer (not submitted): $COMMAND"
fi

tmux select-window -t "$PANE"
echo "Focused window '$NAME'."
