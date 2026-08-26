#!/usr/bin/env bash
# Hand an implementation off to Codex CLI in a new tmux window.
#
# Backs the -toco / --to-codex flag in /big-plan, /x-as-pr, and /x-wt-teams.
# Shared spec: skills/x-wt-teams/references/codex-handoff.md
#
# Usage:
#   handoff-to-codex.sh --dir <repo-root> --command '<text>' [--name <window>] [--submit] [--timeout <sec>] [--no-auto-answer]
#
# Codex's startup prompts are answered automatically (spec: "Startup prompts"):
# the directory-trust menu gets YES, an update offer gets NO. --no-auto-answer
# restores the old behaviour of stopping at them with exit 4.
#
# Exit codes:
#   0  window created, Codex ready, command staged (and submitted with --submit)
#   2  not running inside tmux
#   3  codex CLI not found
#   4  a Codex startup prompt is up and was not auto-answered (--no-auto-answer,
#      or an update prompt with no recognisable "No" option)
#   5  timed out waiting for the Codex composer
#   6  tmux new-window failed
#   7  Codex exited at startup (window closed before the composer appeared)
#   8  command typed, but Codex did not start on it after 3 Enter presses
#      (the draft is left in the composer for the user to submit)
#   64 usage error (missing/unknown argument) -- a caller bug, no fallback printed

set -uo pipefail

DIR="" COMMAND="" NAME="" SUBMIT=0 TIMEOUT=60 SESSION="" AUTO_ANSWER=1

while [ $# -gt 0 ]; do
  case "$1" in
    --dir) DIR="$2"; shift 2 ;;
    --command) COMMAND="$2"; shift 2 ;;
    --name) NAME="$2"; shift 2 ;;
    --submit) SUBMIT=1; shift ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    --session) SESSION="$2"; shift 2 ;;
    --no-auto-answer) AUTO_ANSWER=0; shift ;;
    *) echo "unknown argument: $1" >&2; exit 64 ;;
  esac
done

[ -n "$DIR" ] || { echo "--dir is required" >&2; exit 64; }
[ -n "$COMMAND" ] || { echo "--command is required" >&2; exit 64; }
[ -n "$NAME" ] || NAME="codex"

# Collapse newlines/tabs in --command. Skill invocations never contain one, but
# a free-text instruction forwarded from /x-as-pr -toco can. Codex's composer
# takes a literal newline as a line break, NOT as a submit (verified), so this
# is about sending one deterministic line rather than fixing an early-submit
# bug. grep cannot detect this -- a newline separates lines, it is never inside
# one -- so compare against the substituted string instead.
COLLAPSED="${COMMAND//[$'\n\r\t']/ }"
while [[ "$COLLAPSED" == *"  "* ]]; do COLLAPSED="${COLLAPSED//  / }"; done
if [ "$COMMAND" != "$COLLAPSED" ]; then
  COMMAND="$COLLAPSED"
  echo "Note: collapsed whitespace in the command to a single line." >&2
fi

if [ -z "${TMUX:-}" ]; then
  cat >&2 <<EOF
Not running inside tmux — the Codex handoff needs a tmux session to open a window in.
Run this yourself instead:

  cd $DIR && codex
  # then type:  $COMMAND
EOF
  exit 2
fi

if ! command -v codex >/dev/null 2>&1; then
  cat >&2 <<EOF
codex CLI not found on PATH — the handoff cannot open a Codex window.
Install/expose it, then run this yourself:

  cd $DIR && codex
  # then type:  $COMMAND
EOF
  exit 3
fi

# Defaults to the invoking session — that is the "same session" the handoff wants.
[ -n "$SESSION" ] || SESSION=$(tmux display-message -p '#{session_name}')

# -P -F prints the new pane's id so we can poll exactly this pane.
PANE=$(tmux new-window -t "$SESSION" -n "$NAME" -c "$DIR" -P -F '#{pane_id}' 'codex')
# An empty pane id means new-window failed. Every later -t "" would silently
# resolve to the CURRENT pane -- i.e. this very session -- and the command would
# be typed into it. Bail instead.
if [ -z "$PANE" ]; then
  cat >&2 <<EOF
Failed to open a tmux window in session '$SESSION'. Run this yourself instead:

  cd $DIR && codex
  # then type:  $COMMAND
EOF
  exit 6
fi
echo "Opened tmux window '$NAME' ($PANE) in session '$SESSION'."

# Codex needs ~10-14s before it accepts input; keystrokes sent earlier are
# silently swallowed, so poll for the composer rather than sleeping blind.
#
# Two startup prompts can sit in front of the composer, and text typed while one
# is up goes into the prompt, not the composer:
#   - the directory-trust menu ("Do you trust the contents of this directory?")
#     -> answered YES: project-local config, hooks, and exec policies must load
#   - an update offer, a numbered menu or a "[y/N]" line mentioning "update"
#     -> answered NO: updating mid-handoff is never what the user asked for
# Each is answered once. Codex renders inline, so an answered menu stays visible
# in the pane; the *_ANSWERED flags keep it from being answered again.

# Prints "<selected> <target>" (1-based option numbers) for the LAST numbered
# menu on screen whose option text matches $2 (case-insensitive ERE), nothing
# when there is no such menu or no matching option. Only the last menu counts
# because answered menus stay on screen above the live one. The selected option
# carries the '›' marker; a menu without one is assumed to start on option 1.
menu_target() {
  printf '%s\n' "$1" | awk -v want="$2" '
    /^[›>]?[[:space:]]*[0-9]+\.[[:space:]]/ {
      if (!inblock) { sel = 0; tgt = 0; inblock = 1 }
      n = $0; sub(/^[›>]?[[:space:]]*/, "", n); idx = n + 0
      if ($0 ~ /^[›>]/) sel = idx
      if (!tgt && tolower($0) ~ want) tgt = idx
      next
    }
    { inblock = 0 }
    END { if (tgt && !sel) sel = 1; if (tgt) print sel, tgt }'
}

# True when the LAST numbered menu on screen is introduced, within the 6 lines
# above its first option, by a line matching $2 (case-insensitive ERE).
menu_intro_matches() {
  printf '%s\n' "$1" | awk -v want="$2" '
    { line[NR] = tolower($0) }
    /^[›>]?[[:space:]]*[0-9]+\.[[:space:]]/ { if (!inblock) { start = NR; inblock = 1 }; next }
    { inblock = 0 }
    END {
      if (!start) exit 1
      for (i = start - 6; i < start; i++) if (i > 0 && line[i] ~ want) exit 0
      exit 1
    }'
}

# Moves the menu selection from option $2 to option $3 with arrow keys, then
# confirms with Enter.
menu_choose() {
  local pane="$1" sel="$2" tgt="$3" key steps i
  if [ "$tgt" -ge "$sel" ]; then key=Down; steps=$((tgt - sel)); else key=Up; steps=$((sel - tgt)); fi
  for ((i = 0; i < steps; i++)); do tmux send-keys -t "$pane" "$key"; done
  tmux send-keys -t "$pane" Enter
}

# True once the composer accepts input. The status bar under the composer
# ("Context NN% left") is the primary signal, but a long directory path pushes
# it past the visible width, so also accept: the last banner reports a loaded
# model (not "loading") and the first non-blank line under the last composer
# placeholder is a status line, not the pre-ready "? for shortcuts" hint.
composer_ready() {
  printf '%s' "$1" | grep -q 'Context.*left' && return 0
  printf '%s\n' "$1" | awk '
    /^│ model:/ { loaded = ($0 !~ /loading/) }
    /Ask Codex to do anything/ { ph = NR }
    { line[NR] = $0 }
    END {
      if (!loaded || !ph) exit 1
      for (i = ph + 1; i <= NR && i <= ph + 3; i++) {
        if (line[i] ~ /^[[:space:]]*$/) continue
        exit (line[i] ~ /for shortcuts/) ? 1 : 0
      }
      exit 1
    }'
}

# Codex's composer treats keystrokes that arrive in a burst as a paste, and an
# Enter inside that burst is inserted as a line break instead of submitting --
# seen as the command on one line, the cursor on an empty second line, nothing
# running. So let the burst settle before Enter, confirm the draft was taken,
# and press Enter again if it was not (a stray line break in the draft is
# harmless; a Backspace to remove it is not, since the first Enter may simply
# have been dropped). HANDOFF_SUBMIT_DELAY exists for testing that path.
SUBMIT_DELAY="${HANDOFF_SUBMIT_DELAY:-1}"
SUBMIT_TRIES=3

# True once Codex has taken the draft: a turn is running ("esc to interrupt"),
# or the empty-composer placeholder renders BELOW the command's last echo. The
# text merely being absent is not enough -- while Codex is still buffering the
# paste burst it renders nothing, and treating that as "submitted" is exactly
# the false positive that would skip the retry.
draft_consumed() {
  printf '%s\n' "$1" | awk -v needle="$2" '
    index($0, needle) { last = NR }
    /esc to interrupt/ { running = 1 }
    /Ask Codex to do anything/ { ph = NR }
    END { exit (running || (last && ph > last)) ? 0 : 1 }'
}

submit_to_codex() {
  local attempt _
  sleep "$SUBMIT_DELAY"
  for ((attempt = 1; attempt <= SUBMIT_TRIES; attempt++)); do
    tmux send-keys -t "$PANE" Enter
    for _ in 1 2 3 4 5 6; do
      sleep 0.5
      SCREEN=$(tmux capture-pane -t "$PANE" -p 2>/dev/null) || return 1
      if draft_consumed "$SCREEN" "${COMMAND:0:24}"; then
        [ "$attempt" -gt 1 ] && echo "Enter was taken as a line break at first; Codex accepted it on press $attempt."
        return 0
      fi
    done
  done
  return 1
}

NO_OPTION_RE='(^|[^a-z])(no|not now|skip|later|never|dismiss|don.t update)([^a-z]|$)'

READY=0 TRUST_ANSWERED=0 UPDATE_ANSWERED=0
DEADLINE=$((SECONDS + TIMEOUT))
while [ "$SECONDS" -lt "$DEADLINE" ]; do
  if ! SCREEN=$(tmux capture-pane -t "$PANE" -p 2>/dev/null); then
    cat >&2 <<EOF
The Codex window closed before the composer appeared -- 'codex' exited at startup
(not logged in, or it failed for another reason). Run it by hand to see why:

  cd $DIR && codex
  # then type:  $COMMAND
EOF
    exit 7
  fi

  # Directory-trust menu: "Yes, continue" is option 1 and preselected.
  if [ "$TRUST_ANSWERED" -eq 0 ] && printf '%s' "$SCREEN" | grep -q 'Do you trust the contents'; then
    if [ "$AUTO_ANSWER" -eq 0 ]; then
      cat >&2 <<EOF
Codex is asking whether to trust $DIR, and the command would be typed into that
prompt instead of the composer (--no-auto-answer). Answer it in the '$NAME'
window, then send:

  $COMMAND
EOF
      tmux select-window -t "$PANE"
      exit 4
    fi
    read -r SEL TGT <<<"$(menu_target "$SCREEN" 'yes')"
    [ -n "${TGT:-}" ] || { SEL=1; TGT=1; }
    menu_choose "$PANE" "$SEL" "$TGT"
    TRUST_ANSWERED=1
    echo "Answered Codex's directory-trust prompt: Yes, continue ($DIR)."
    sleep 1
    continue
  fi

  # Update offer: a "[y/N]"-style line, or a numbered menu introduced by a line
  # that mentions an update. Either way the answer is No.
  if [ "$UPDATE_ANSWERED" -eq 0 ]; then
    UPDATE_KIND=""
    if printf '%s\n' "$SCREEN" | grep -qiE 'update.*[[(][yY]/[nN][])]'; then
      UPDATE_KIND=yn
    elif menu_intro_matches "$SCREEN" 'update'; then
      UPDATE_KIND=menu
    fi
    if [ -n "$UPDATE_KIND" ]; then
      SEL="" TGT=""
      [ "$UPDATE_KIND" = menu ] && read -r SEL TGT <<<"$(menu_target "$SCREEN" "$NO_OPTION_RE")"
      if [ "$AUTO_ANSWER" -eq 0 ] || { [ "$UPDATE_KIND" = menu ] && [ -z "${TGT:-}" ]; }; then
        cat >&2 <<EOF
Codex is showing an update prompt in window '$NAME' and it was not declined
automatically ($([ "$AUTO_ANSWER" -eq 0 ] && echo '--no-auto-answer' || echo 'no "No" option recognised')).
Decline it there, then send:

  $COMMAND
EOF
        tmux select-window -t "$PANE"
        exit 4
      fi
      if [ "$UPDATE_KIND" = yn ]; then
        tmux send-keys -t "$PANE" -l -- 'n'
        tmux send-keys -t "$PANE" Enter
        echo "Declined Codex's update prompt: n."
      else
        menu_choose "$PANE" "$SEL" "$TGT"
        echo "Declined Codex's update prompt: option $TGT."
      fi
      UPDATE_ANSWERED=1
      sleep 1
      continue
    fi
  fi

  if composer_ready "$SCREEN"; then
    READY=1
    break
  fi
  sleep 1
done

if [ "$READY" -ne 1 ]; then
  cat >&2 <<EOF
Timed out after ${TIMEOUT}s waiting for the Codex composer in window '$NAME'
(trust prompt answered: $TRUST_ANSWERED, update prompt declined: $UPDATE_ANSWERED).
The window is open — check it for a prompt and send this by hand:

  $COMMAND
EOF
  tmux select-window -t "$PANE"
  exit 5
fi

# -l sends the string literally, so '$' and '-' are not read as key names.
tmux send-keys -t "$PANE" -l -- "$COMMAND"

if [ "$SUBMIT" -eq 1 ]; then
  if submit_to_codex; then
    echo "Submitted to Codex: $COMMAND"
  else
    cat >&2 <<EOF
Typed the command into the Codex composer in window '$NAME', but Codex did not
start on it after $SUBMIT_TRIES Enter presses. The draft is still in the composer --
press Enter there yourself:

  $COMMAND
EOF
    tmux select-window -t "$PANE"
    exit 8
  fi
else
  echo "Staged in the Codex composer (not submitted): $COMMAND"
fi

tmux select-window -t "$PANE"
echo "Focused window '$NAME'."
