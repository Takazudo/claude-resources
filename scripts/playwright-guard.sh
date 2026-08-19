#!/usr/bin/env bash
#
# playwright-guard.sh — machine-wide N-slot semaphore serializing Playwright /
# browser-automation work across concurrent Claude Code sessions.
#
# Purpose
#   Two sessions launching Playwright-heavy testing at the same time thrash the
#   machine (one Chromium + trace/snapshot pipeline each) and end up waiting on
#   each other anyway. /x-wt-teams serializes browser checks only WITHIN one run;
#   nothing coordinates ACROSS sessions. This guard is the cross-session queue —
#   the same shape as codex-guard.sh, which solved this for codex launches.
#
# Usage — wrap mode (preferred: lock spans exactly one command)
#   playwright-guard.sh [--slots N] [--wait SECS] -- <command...>
#
#   Acquires a slot, runs the command, releases on exit. The command runs with
#   PW_GUARD_HELD=1 exported so nested guarded scripts (headless-check.js,
#   verify-styles.mjs auto-guard) skip re-acquiring — with the 1-slot default a
#   nested acquire would deadlock against its own parent until timeout.
#
# Usage — session mode (for Playwright CLI's persistent open→close browser
#   sessions that span multiple separate shell invocations)
#   playwright-guard.sh acquire [--wait SECS] [--ttl SECS]   # prints holder PID
#   playwright-guard.sh release <PID> | --all
#   playwright-guard.sh status
#
#   `acquire` grabs a slot, then hands the lock fd to a detached holder process
#   and exits. The lock stays held until `release <PID>` kills the holder or the
#   TTL (default 900s) expires — the TTL is the stale-session self-heal: a
#   session that forgets to release blocks others for at most TTL seconds.
#   `release` of an already-dead holder just cleans up its pid file. If acquire
#   ran unguarded (no lock backend), it prints NOTHING on stdout — callers must
#   treat empty output as "no lock taken, nothing to release".
#
#   While holding a session lock, run browser commands with PW_GUARD_HELD=1
#   exported — auto-guarded scripts (headless-check.js, verify-styles.mjs) run
#   in fresh shells that don't inherit it, and with the 1-slot default an
#   unmarked nested acquire deadlocks against the session's own holder until
#   --wait expires (exit 75 that looks like another session's contention).
#
# Options / env
#   --slots N   Concurrent slots (default: env PW_GUARD_SLOTS, else 1 — a strict
#               machine-wide queue; heavy browser work is meant to run alone).
#   --wait SECS Seconds to wait for a free slot (default: env PW_GUARD_WAIT,
#               else 300). On timeout: exit 75.
#   --ttl SECS  acquire only: holder lifetime (default: env PW_GUARD_TTL, else 900).
#
#   ALL callers must use the SAME --slots value — the slot count is the shared
#   ceiling; mismatched counts defeat it (see codex-guard.sh header).
#
# How the slot is held (fd containment — the load-bearing detail)
#   Slots are flock(2) locks over $HOME/.claude/.playwright-guard/slot-<i>.lock.
#   fd-based locks self-release when the last fd on the open file description
#   closes, so no stale-lock GC is ever needed — a killed guard (or killed Bash
#   tool call) frees its slot instantly.
#
#   Wrap mode: the GUARD process holds the lock fd and waits for the wrapped
#   command, which is spawned with that fd CLOSED (`cmd 200>&-`) so detached
#   descendants (Playwright's browser server outliving the CLI command, etc.)
#   never pin the slot. TERM/INT are forwarded to the wrapped command so a
#   killed guard doesn't release the slot while its child browser lives on.
#
#   Session mode inverts this on purpose: the holder process INHERITS the fd
#   across fork, so the lock survives the acquire call's exit and is released
#   the moment the holder dies (release-kill or TTL sleep ending).
#
# Lock backend — flock(1), or a perl shim on stock macOS
#   flock(1) is used when present (Linux, `brew install flock` on Mac). Stock
#   macOS ships NO flock binary, so the guard falls back to /usr/bin/perl:
#   perl inherits the shell's fd 200, calls flock(2) on it non-blocking, and
#   exits — the lock lives on the SHARED open file description, so it stays
#   held by the shell's fd 200 with identical self-release semantics. Only if
#   BOTH flock and perl are missing does the guard fail open (warn + run
#   unguarded), which should effectively never happen.
#
# Exit codes
#   *   Wrap mode: the wrapped command's exit code, passed through.
#   0   acquire/release/status success (acquire prints the holder PID).
#   75  EX_TEMPFAIL — could not acquire a slot within --wait seconds.
#   2   Usage error.

PW_GUARD_DIR="${PW_GUARD_DIR:-$HOME/.claude/.playwright-guard}"

usage() {
  cat >&2 <<'EOF'
usage: playwright-guard.sh [--slots N] [--wait SECS] -- <command...>
       playwright-guard.sh acquire [--wait SECS] [--ttl SECS]
       playwright-guard.sh release <PID> | --all
       playwright-guard.sh status
EOF
}

is_positive_int() {
  case "$1" in
    '' | *[!0-9]*) return 1 ;;
  esac
  [ "$1" -gt 0 ] 2>/dev/null
}

SLOTS="${PW_GUARD_SLOTS:-1}"
WAIT="${PW_GUARD_WAIT:-300}"
TTL="${PW_GUARD_TTL:-900}"

MODE="wrap"
case "${1:-}" in
  acquire | release | status) MODE="$1"; shift ;;
esac

RELEASE_ALL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --slots)
      if [ $# -lt 2 ]; then echo "playwright-guard: --slots needs a value" >&2; exit 2; fi
      SLOTS="$2"; shift 2 ;;
    --slots=*) SLOTS="${1#*=}"; shift ;;
    --wait)
      if [ $# -lt 2 ]; then echo "playwright-guard: --wait needs a value" >&2; exit 2; fi
      WAIT="$2"; shift 2 ;;
    --wait=*) WAIT="${1#*=}"; shift ;;
    --ttl)
      if [ $# -lt 2 ]; then echo "playwright-guard: --ttl needs a value" >&2; exit 2; fi
      TTL="$2"; shift 2 ;;
    --ttl=*) TTL="${1#*=}"; shift ;;
    --all)
      if [ "$MODE" = "release" ]; then RELEASE_ALL=1; shift; else
        echo "playwright-guard: --all only valid with release" >&2; exit 2; fi ;;
    --) shift; break ;;
    -h | --help) usage; exit 0 ;;
    -*) echo "playwright-guard: unknown option: $1" >&2; usage; exit 2 ;;
    *) break ;;
  esac
done

if ! is_positive_int "$SLOTS"; then
  echo "playwright-guard: --slots must be a positive integer (got: '$SLOTS')" >&2
  exit 2
fi
if ! is_positive_int "$WAIT"; then
  echo "playwright-guard: --wait must be a positive integer of seconds (got: '$WAIT')" >&2
  exit 2
fi
if ! is_positive_int "$TTL"; then
  echo "playwright-guard: --ttl must be a positive integer of seconds (got: '$TTL')" >&2
  exit 2
fi

# --- lock backend ------------------------------------------------------------

FLOCK_BIN="$(command -v flock 2>/dev/null || true)"
PERL_BIN="$(command -v perl 2>/dev/null || true)"

have_lock_backend() {
  [ -n "$FLOCK_BIN" ] || [ -n "$PERL_BIN" ]
}

# Non-blocking exclusive flock(2) on fd 200 of the CALLING shell. With the perl
# shim, perl inherits fd 200 across fork, flocks it, and exits: the lock lives
# on the shared open file description and stays held by this shell's fd 200.
flock_nb_200() {
  if [ -n "$FLOCK_BIN" ]; then
    "$FLOCK_BIN" -n 200
  else
    "$PERL_BIN" -e 'use Fcntl qw(:flock); open(my $fh, ">&=", 200) or exit 1; exit(flock($fh, LOCK_EX|LOCK_NB) ? 0 : 1);'
  fi
}

# --- release / status --------------------------------------------------------

# A holder keeps the original script invocation as its command line (forked
# subshell, no exec), so "playwright-guard" in ps output identifies it. This
# guards `release` against killing an unrelated process after PID reuse.
holder_alive() {
  kill -0 "$1" 2>/dev/null &&
    ps -o command= -p "$1" 2>/dev/null | grep -q "playwright-guard"
}

release_one() {
  local pid="$1"
  if holder_alive "$pid"; then kill "$pid" 2>/dev/null; fi
  rm -f "$PW_GUARD_DIR/session-$pid.pid"
  echo "playwright-guard: released session $pid"
}

if [ "$MODE" = "release" ]; then
  if [ -n "$RELEASE_ALL" ]; then
    found=0
    for f in "$PW_GUARD_DIR"/session-*.pid; do
      [ -e "$f" ] || continue
      found=1
      pid="${f##*/session-}"; pid="${pid%.pid}"
      release_one "$pid"
    done
    [ "$found" = 1 ] || echo "playwright-guard: no sessions to release"
    exit 0
  fi
  pid="${1:-}"
  if ! is_positive_int "$pid"; then
    echo "playwright-guard: release needs a holder PID (or --all)" >&2
    exit 2
  fi
  release_one "$pid"
  exit 0
fi

if [ "$MODE" = "status" ]; then
  if ! have_lock_backend; then
    echo "playwright-guard: no lock backend (flock or perl) — guard inactive"
    exit 0
  fi
  for ((i = 0; i < 10#$SLOTS; i++)); do
    f="$PW_GUARD_DIR/slot-$i.lock"
    if [ ! -e "$f" ]; then
      echo "slot-$i: free (never used)"
    elif ( exec 200>"$f" && flock_nb_200 ); then
      echo "slot-$i: free"
    else
      echo "slot-$i: BUSY"
    fi
  done
  for f in "$PW_GUARD_DIR"/session-*.pid; do
    [ -e "$f" ] || continue
    pid="${f##*/session-}"; pid="${pid%.pid}"
    if holder_alive "$pid"; then
      echo "session $pid: alive ($(cat "$f" 2>/dev/null))"
    else
      echo "session $pid: stale pid file (holder gone — lock already free)"
      rm -f "$f"
    fi
  done
  exit 0
fi

# --- wrap / acquire ----------------------------------------------------------

if [ "$MODE" = "wrap" ] && [ $# -eq 0 ]; then
  echo "playwright-guard: no command given" >&2
  usage
  exit 2
fi

# Nested guarded call (auto-guarded script inside an already-guarded command or
# an acquired session): run directly — re-acquiring would deadlock on 1 slot.
if [ "${PW_GUARD_HELD:-}" = "1" ]; then
  if [ "$MODE" = "acquire" ]; then
    echo "playwright-guard: already inside a guarded context — no session started" >&2
    exit 0
  fi
  exec "$@"
fi

# Fail-open (no backend / no dir): run unguarded rather than break browser
# checks. PW_GUARD_HELD is still exported so auto-guarded scripts downstream
# don't re-exec themselves through the guard forever.
run_unguarded() {
  if [ "$MODE" = "acquire" ]; then
    # Deliberately NOTHING on stdout: an empty capture tells the caller no
    # lock was taken (a fake PID here would make release kill something else).
    exit 0
  fi
  PW_GUARD_HELD=1 exec "$@"
}

if ! have_lock_backend; then
  echo "playwright-guard: neither flock nor perl found — running UNGUARDED (install: brew install flock)" >&2
  run_unguarded "$@"
fi

if ! mkdir -p -m 700 "$PW_GUARD_DIR" 2>/dev/null; then
  echo "playwright-guard: cannot create $PW_GUARD_DIR — running UNGUARDED" >&2
  run_unguarded "$@"
fi

# Try to grab any one free slot without blocking. On success the lock is held
# on fd 200 in THIS process. Bash-native loop, not `seq` (absent on stock macOS).
try_acquire() {
  local i
  for ((i = 0; i < 10#$SLOTS; i++)); do
    exec 200>"$PW_GUARD_DIR/slot-$i.lock" || continue
    if flock_nb_200; then
      return 0
    fi
  done
  exec 200>&-
  return 1
}

deadline=$(( $(date +%s) + 10#$WAIT ))
announced=""
while ! try_acquire; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "playwright-guard: timed out after ${WAIT}s waiting for a Playwright slot (all ${SLOTS} busy — another session is running browser work)" >&2
    exit 75
  fi
  if [ -z "$announced" ]; then
    echo "playwright-guard: waiting for a Playwright slot (another session is running browser work; will wait up to ${WAIT}s)..." >&2
    announced=1
  fi
  sleep 0.2
done

if [ "$MODE" = "acquire" ]; then
  # Hand the lock to a detached holder: the forked subshell inherits fd 200, so
  # the flock survives this process's exit and releases the instant the holder
  # dies (release-kill or TTL sleep ending). stdio is detached so an inherited
  # pipe can't keep the caller's shell/tool call open; the holder removes its
  # own pid file on TTL expiry so a later `release --all` never kills a reused
  # PID. No `exec sleep` — keeping the script's command line in ps is what lets
  # holder_alive() verify identity before killing.
  # `sleep` runs with fd 200 CLOSED — only the holder subshell itself pins the
  # slot, so `release` (kill of the subshell) frees the lock instantly instead
  # of leaving an orphaned sleep holding it for the rest of the TTL.
  (
    exec </dev/null >/dev/null 2>&1
    trap '' HUP
    sleep "$TTL" 200>&-
    rm -f "$PW_GUARD_DIR/session-$BASHPID.pid"
  ) &
  HOLDER_PID=$!
  echo "started=$(date +%s) ttl=${TTL}" > "$PW_GUARD_DIR/session-$HOLDER_PID.pid"
  echo "$HOLDER_PID"
  echo "playwright-guard: session lock held by PID $HOLDER_PID (auto-expires in ${TTL}s; release with: bash \$HOME/.claude/scripts/playwright-guard.sh release $HOLDER_PID)" >&2
  echo "playwright-guard: run your browser commands with PW_GUARD_HELD=1 exported — otherwise auto-guarded scripts deadlock against this session's own lock" >&2
  # Close our fd 200 so ONLY the holder pins the slot.
  exec 200>&-
  exit 0
fi

# Wrap mode: run with the lock fd CLOSED so the command and its detached
# children never inherit it — the slot frees when the command itself exits.
# PW_GUARD_HELD marks the guarded context for nested auto-guarded scripts.
# The child runs in the background with TERM/INT forwarded: if the guard is
# killed (e.g. Bash tool timeout), the browser child is taken down with it
# instead of surviving into the slot the next waiter just acquired. `<&0` keeps
# the caller's stdin — bash defaults a background child's stdin to /dev/null,
# which would break stdin-driven wrapped commands (headless-check.js JSON mode).
PW_GUARD_HELD=1 "$@" <&0 200>&- &
CHILD=$!
trap 'kill -TERM "$CHILD" 2>/dev/null' TERM INT HUP
status=0
while :; do
  if wait "$CHILD"; then status=0; else status=$?; fi
  kill -0 "$CHILD" 2>/dev/null || break
done
exit "$status"
