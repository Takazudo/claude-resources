#!/usr/bin/env bash
#
# codex-guard.sh — cross-process N-slot semaphore bounding concurrent codex launches.
#
# Purpose
#   Under /x-wt-teams, N worktree children each run /light-review -> /codex-review and
#   fire codex-companion launches concurrently. Nothing limits how many codex processes
#   run at once machine-wide, so a burst of children can stampede the machine (and
#   codex's own broker-busy retry path spawns EXTRA app-servers under contention). This
#   guard caps concurrent codex launches machine-wide.
#
# Usage
#   codex-guard.sh [--slots N] [--wait SECS] -- <command...>
#
#   --slots N   Number of concurrent slots (default: env CODEX_GUARD_SLOTS, else 2).
#   --wait SECS Seconds to wait for a free slot before giving up (default: env
#               CODEX_GUARD_WAIT, else 300). On timeout the guard exits 75.
#   Both must be positive integers.
#
#   ALL callers must use the SAME --slots value — the slot count is the shared ceiling.
#   Mismatched counts defeat the ceiling (a caller asking for 4 slots can always claim
#   slot-2/slot-3 that a 2-slot caller never touches).
#
# How the slot is held (fd containment — the load-bearing detail)
#   Slots are flock(2) locks over $HOME/.claude/.codex-guard/slot-<i>.lock. fd-based
#   locks self-release when the last fd on the open file description closes, so no
#   stale-lock GC is ever needed — a killed guard frees its slot instantly.
#
#   The GUARD process holds the lock fd and waits for the wrapped command. The wrapped
#   command is spawned with that fd CLOSED (`cmd 200>&-`, i.e. util-linux `flock
#   --close` semantics done by hand for portability). This matters because the codex
#   companion spawns a DETACHED broker: if the broker inherited the lock fd, it would
#   pin the slot for the broker's whole lifetime and the semaphore would silently
#   collapse to zero capacity. With the fd closed for the command (and thus for its
#   detached descendants), the slot frees the moment the wrapped command itself exits.
#
# Fail-open
#   If flock(1) is missing (stock macOS ships none), the guard prints a one-line stderr
#   warning and execs the command UNGUARDED — today's behavior. We must not silently
#   degrade codex to its Claude fallback machine-wide just because flock is absent.
#   Install on macOS with:  brew install flock
#
# Exit codes
#   *   The wrapped command's own exit code, passed through, on normal completion.
#   75  EX_TEMPFAIL — could not acquire a slot within --wait seconds.
#   2   Usage error (bad flag / non-positive-int / missing command).

# Honor an explicit CODEX_GUARD_DIR override so the slot semaphore and any
# coordinating maintenance lock (e.g. codex-sweep.js log rotation) share the SAME
# lock files. Without this, an overridden rotation would lock a different dir and a
# guarded launch could start mid-delete. Default is unchanged.
CODEX_GUARD_DIR="${CODEX_GUARD_DIR:-$HOME/.claude/.codex-guard}"

usage() {
  echo "usage: codex-guard.sh [--slots N] [--wait SECS] -- <command...>" >&2
}

is_positive_int() {
  case "$1" in
    '' | *[!0-9]*) return 1 ;;
  esac
  [ "$1" -gt 0 ] 2>/dev/null
}

SLOTS="${CODEX_GUARD_SLOTS:-2}"
WAIT="${CODEX_GUARD_WAIT:-300}"

while [ $# -gt 0 ]; do
  case "$1" in
    --slots)
      if [ $# -lt 2 ]; then echo "codex-guard: --slots needs a value" >&2; exit 2; fi
      SLOTS="$2"; shift 2 ;;
    --slots=*) SLOTS="${1#*=}"; shift ;;
    --wait)
      if [ $# -lt 2 ]; then echo "codex-guard: --wait needs a value" >&2; exit 2; fi
      WAIT="$2"; shift 2 ;;
    --wait=*) WAIT="${1#*=}"; shift ;;
    --) shift; break ;;
    -h | --help) usage; exit 0 ;;
    -*) echo "codex-guard: unknown option: $1" >&2; usage; exit 2 ;;
    *) break ;;
  esac
done

if ! is_positive_int "$SLOTS"; then
  echo "codex-guard: --slots must be a positive integer (got: '$SLOTS')" >&2
  exit 2
fi
if ! is_positive_int "$WAIT"; then
  echo "codex-guard: --wait must be a positive integer of seconds (got: '$WAIT')" >&2
  exit 2
fi
if [ $# -eq 0 ]; then
  echo "codex-guard: no command given" >&2
  usage
  exit 2
fi

# Fail-open: no flock -> run unguarded (preserves today's behavior on stock macOS).
if ! command -v flock >/dev/null 2>&1; then
  echo "codex-guard: flock not found — running codex UNGUARDED (install: brew install flock)" >&2
  exec "$@"
fi

# Fail-open: cannot create the slot dir -> run unguarded rather than block codex.
if ! mkdir -p "$CODEX_GUARD_DIR" 2>/dev/null; then
  echo "codex-guard: cannot create $CODEX_GUARD_DIR — running codex UNGUARDED" >&2
  exec "$@"
fi

# Try to grab any one free slot without blocking. On success the lock is held on
# fd 200 in THIS process and the function returns 0. fd 200 is the conventional
# flock-in-shell descriptor and is never used by the wrapped codex command.
try_acquire() {
  # Bash-native arithmetic loop, NOT `seq 0 …`: stock macOS ships no `seq`, and a
  # seq failure here would make every acquisition fail (exit 75) even after the
  # user installs flock per this script's header.
  local i
  for ((i = 0; i < 10#$SLOTS; i++)); do
    exec 200>"$CODEX_GUARD_DIR/slot-$i.lock" || continue
    if flock -n 200; then
      return 0
    fi
  done
  # No slot free this pass — drop the fd so we don't leak it across the sleep.
  exec 200>&-
  return 1
}

deadline=$(( $(date +%s) + 10#$WAIT ))
while ! try_acquire; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "codex-guard: timed out after ${WAIT}s waiting for a codex slot (all ${SLOTS} busy)" >&2
    exit 75
  fi
  sleep 0.2
done

# Slot acquired. Run the command with the lock fd CLOSED so the command and its
# detached children never inherit it — the slot frees when the command itself exits.
"$@" 200>&-
exit $?
