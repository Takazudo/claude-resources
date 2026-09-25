#!/usr/bin/env bash
#
# heavy-guard.sh — machine-wide admission control for heavy local test runs
# (b4push, e2e / Playwright suites, long builds) across every concurrent agent
# session: Claude Code AND Codex, manager AND child, any repo.
#
# Purpose
#   Two or three heavy suites running at once exhaust memory and go red for
#   reasons that have nothing to do with the code under test. Tests must stay
#   machine-spec independent, so the machine knowledge lives HERE, in the
#   scheduler: a slot semaphore (how many heavy runs at once) plus a memory
#   gate (do not start until the machine has headroom). The guard also labels
#   the outcome so a red run can be told apart from a starved one.
#
#   There is deliberately no organizer daemon. Slots are fd-based flock(2)
#   locks, so an agent that dies mid-run (API error, token limit, killed
#   terminal) frees its slot the instant its process goes away — no heartbeat,
#   no stale-lock GC. --max-run covers the other failure: a run that hangs.
#
# Usage
#   heavy-guard.sh [options] -- <command...>
#
#   Intended to be called from a project's own script (scripts/run-b4push.sh
#   wraps its heavy steps) so serialization does not depend on an agent
#   remembering a rule. See /dev-b4push for the fail-open resolution snippet.
#
# Options / env
#   --slots N        Concurrent heavy runs (env HEAVY_GUARD_SLOTS, default 1).
#                    ALL callers must agree on N — set it per machine in the
#                    shell profile, not per call.
#   --wait SECS      Max seconds to queue for a slot + memory headroom
#                    (env HEAVY_GUARD_WAIT, default 1800). On timeout: exit 75.
#   --max-run SECS   Hard cap on the wrapped command (env HEAVY_GUARD_MAX_RUN,
#                    default 1800; 0 disables). On expiry the command's process
#                    group gets TERM, then KILL after 10s; exit 124.
#   --min-mem-mb MB  Do not start until this much memory is available
#                    (env HEAVY_GUARD_MIN_MEM_MB, default 2048; 0 disables).
#   --label TEXT     Name for the ledger / verdict line (default: the command).
#
#   HEAVY_GUARD_LOW_MEM_MB  Low-water mark (default 512). A failing run whose
#                    available memory dipped below it is labelled ENV_SUSPECT.
#   HEAVY_GUARD_DIR  State dir (default $HOME/.agent-guard/heavy). Neutral
#                    location on purpose: ~/.claude and ~/.codex each carry a
#                    copy of this script and MUST share one lock dir.
#   HEAVY_GUARD_HELD Set to 1 for the wrapped command. A nested guarded call
#                    runs directly — re-acquiring would deadlock on 1 slot.
#
# Verdict line (stderr, last line) and ledger ($HEAVY_GUARD_DIR/runs.jsonl)
#   heavy-guard: verdict=PASS|FAIL|ENV_SUSPECT exit=N secs=N min_mem_mb=N reason=...
#
#   ENV_SUSPECT = the failure carries an environment signature: exit 137
#   (SIGKILL — the OOM killer's mark), exit 124 (--max-run expiry), or a
#   non-zero exit while available memory fell below the low-water mark. It is
#   a HINT for the deferral policy (skills/.shared heavy-test-policy.md), never
#   a pass: the exit code is always passed through unchanged.
#
# Exit codes
#   *    The wrapped command's exit code, passed through.
#   75   EX_TEMPFAIL — no slot / no memory headroom within --wait. Contention,
#        not a test failure. Never bypass by running unguarded.
#   124  --max-run expired.
#   2    Usage error.

HEAVY_GUARD_DIR="${HEAVY_GUARD_DIR:-$HOME/.agent-guard/heavy}"

usage() {
  cat >&2 <<'EOF'
usage: heavy-guard.sh [--slots N] [--wait SECS] [--max-run SECS]
                      [--min-mem-mb MB] [--label TEXT] -- <command...>
       heavy-guard.sh status
EOF
}

is_uint() {
  case "$1" in
    '' | *[!0-9]*) return 1 ;;
  esac
  return 0
}

SLOTS="${HEAVY_GUARD_SLOTS:-1}"
WAIT="${HEAVY_GUARD_WAIT:-1800}"
MAX_RUN="${HEAVY_GUARD_MAX_RUN:-1800}"
MIN_MEM_MB="${HEAVY_GUARD_MIN_MEM_MB:-2048}"
LOW_MEM_MB="${HEAVY_GUARD_LOW_MEM_MB:-512}"
LABEL=""

MODE="wrap"
if [ "${1:-}" = "status" ]; then MODE="status"; shift; fi

while [ $# -gt 0 ]; do
  case "$1" in
    --slots | --wait | --max-run | --min-mem-mb | --label)
      if [ $# -lt 2 ]; then echo "heavy-guard: $1 needs a value" >&2; exit 2; fi
      case "$1" in
        --slots) SLOTS="$2" ;;
        --wait) WAIT="$2" ;;
        --max-run) MAX_RUN="$2" ;;
        --min-mem-mb) MIN_MEM_MB="$2" ;;
        --label) LABEL="$2" ;;
      esac
      shift 2 ;;
    --slots=*) SLOTS="${1#*=}"; shift ;;
    --wait=*) WAIT="${1#*=}"; shift ;;
    --max-run=*) MAX_RUN="${1#*=}"; shift ;;
    --min-mem-mb=*) MIN_MEM_MB="${1#*=}"; shift ;;
    --label=*) LABEL="${1#*=}"; shift ;;
    --) shift; break ;;
    -h | --help) usage; exit 0 ;;
    -*) echo "heavy-guard: unknown option: $1" >&2; usage; exit 2 ;;
    *) break ;;
  esac
done

for pair in "slots:$SLOTS" "wait:$WAIT" "max-run:$MAX_RUN" "min-mem-mb:$MIN_MEM_MB" "low-mem-mb:$LOW_MEM_MB"; do
  if ! is_uint "${pair#*:}"; then
    echo "heavy-guard: --${pair%%:*} must be a non-negative integer (got: '${pair#*:}')" >&2
    exit 2
  fi
done
if [ "$((10#$SLOTS))" -lt 1 ]; then
  echo "heavy-guard: --slots must be at least 1" >&2
  exit 2
fi

# --- lock backend (same contract as playwright-guard.sh) ---------------------

FLOCK_BIN="$(command -v flock 2>/dev/null || true)"
PERL_BIN="$(command -v perl 2>/dev/null || true)"

# Non-blocking exclusive flock(2) on fd 200 of the CALLING shell. Stock macOS
# has no flock(1); perl inherits fd 200, flocks it, and exits — the lock lives
# on the shared open file description and stays held by this shell's fd 200.
flock_nb_200() {
  if [ -n "$FLOCK_BIN" ]; then
    "$FLOCK_BIN" -n 200
  else
    "$PERL_BIN" -e 'use Fcntl qw(:flock); open(my $fh, ">&=", 200) or exit 1; exit(flock($fh, LOCK_EX|LOCK_NB) ? 0 : 1);'
  fi
}

# --- memory ------------------------------------------------------------------

# Available memory in MB, or empty when it cannot be measured (gate is skipped).
mem_avail_mb() {
  if [ -r /proc/meminfo ]; then
    awk '/^MemAvailable:/ { printf "%d", $2 / 1024; exit }' /proc/meminfo
  elif command -v vm_stat >/dev/null 2>&1; then
    # macOS has no MemAvailable; free + inactive + speculative is the closest
    # equivalent (pages the kernel can hand out without swapping).
    vm_stat | awk '
      /page size of/ { ps = $8 }
      /^Pages free:/ { f = $3 }
      /^Pages inactive:/ { i = $3 }
      /^Pages speculative:/ { s = $3 }
      END { if (ps > 0) printf "%d", (f + i + s) * ps / 1048576 }'
  fi
}

# --- status ------------------------------------------------------------------

if [ "$MODE" = "status" ]; then
  echo "mem_avail_mb=$(mem_avail_mb) min_mem_mb=$MIN_MEM_MB slots=$SLOTS dir=$HEAVY_GUARD_DIR"
  if [ -z "$FLOCK_BIN" ] && [ -z "$PERL_BIN" ]; then
    echo "heavy-guard: no lock backend (flock or perl) — guard inactive"
    exit 0
  fi
  for ((i = 0; i < 10#$SLOTS; i++)); do
    f="$HEAVY_GUARD_DIR/slot-$i.lock"
    if [ ! -e "$f" ]; then
      echo "slot-$i: free (never used)"
    elif ( exec 200>>"$f" && flock_nb_200 ); then
      echo "slot-$i: free"
    else
      echo "slot-$i: BUSY ($(cat "$HEAVY_GUARD_DIR/slot-$i.info" 2>/dev/null))"
    fi
  done
  exit 0
fi

# --- wrap --------------------------------------------------------------------

if [ $# -eq 0 ]; then
  echo "heavy-guard: no command given" >&2
  usage
  exit 2
fi
[ -n "$LABEL" ] || LABEL="$*"

if [ "${HEAVY_GUARD_HELD:-}" = "1" ]; then
  exec "$@"
fi

# Fail open: a missing backend or unwritable dir must not break the test run.
if [ -z "$FLOCK_BIN" ] && [ -z "$PERL_BIN" ]; then
  echo "heavy-guard: neither flock nor perl found — running UNGUARDED" >&2
  HEAVY_GUARD_HELD=1 exec "$@"
fi
if ! mkdir -p -m 700 "$HEAVY_GUARD_DIR" 2>/dev/null; then
  echo "heavy-guard: cannot create $HEAVY_GUARD_DIR — running UNGUARDED" >&2
  HEAVY_GUARD_HELD=1 exec "$@"
fi

SLOT=""
try_acquire() {
  local i
  for ((i = 0; i < 10#$SLOTS; i++)); do
    exec 200>>"$HEAVY_GUARD_DIR/slot-$i.lock" || continue
    if flock_nb_200; then
      SLOT="$i"
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
    echo "heavy-guard: timed out after ${WAIT}s waiting for a heavy-test slot (all ${SLOTS} busy — another session is running heavy tests). Contention, not a test failure." >&2
    exit 75
  fi
  if [ -z "$announced" ]; then
    echo "heavy-guard: queued behind another heavy run (up to ${WAIT}s)..." >&2
    announced=1
  fi
  sleep 1
done

# Memory gate — checked while HOLDING the slot, so queued runs start one at a
# time as headroom returns instead of stampeding the moment memory frees up.
if [ "$((10#$MIN_MEM_MB))" -gt 0 ]; then
  announced=""
  while :; do
    avail="$(mem_avail_mb)"
    [ -n "$avail" ] || break
    [ "$avail" -ge "$((10#$MIN_MEM_MB))" ] && break
    if [ "$(date +%s)" -ge "$deadline" ]; then
      echo "heavy-guard: timed out — only ${avail}MB available, need ${MIN_MEM_MB}MB. Machine is memory-starved by something outside the guard. Contention, not a test failure." >&2
      exit 75
    fi
    if [ -z "$announced" ]; then
      echo "heavy-guard: holding slot, waiting for memory (${avail}MB available, need ${MIN_MEM_MB}MB)..." >&2
      announced=1
    fi
    sleep 2
  done
fi

# A SIGKILLed guard cannot remove its own scratch files; sweep dead PIDs' here.
for f in "$HEAVY_GUARD_DIR"/min-mem-* "$HEAVY_GUARD_DIR"/timeout-*; do
  [ -e "$f" ] || continue
  kill -0 "${f##*-}" 2>/dev/null || rm -f "$f"
done

echo "pid=$$ started=$(date +%s) cwd=$PWD label=$LABEL" > "$HEAVY_GUARD_DIR/slot-$SLOT.info" 2>/dev/null

# Everything spawned below runs with fd 200 CLOSED so only this guard process
# pins the slot — a detached descendant (dev server, browser) must not.

MIN_FILE="$HEAVY_GUARD_DIR/min-mem-$$"
(
  min=""
  # $$ is still the guard's PID inside a subshell: stop when the guard is gone.
  while kill -0 $$ 2>/dev/null; do
    cur="$(mem_avail_mb)"
    if [ -n "$cur" ] && { [ -z "$min" ] || [ "$cur" -lt "$min" ]; }; then
      min="$cur"
      echo "$min" > "$MIN_FILE"
    fi
    sleep 2
  done
) 200>&- </dev/null >/dev/null 2>&1 &
SAMPLER=$!

# The command gets its own process group so --max-run and forwarded signals
# reach the whole tree (pnpm → vitest → workers, playwright → browsers).
GROUPED=1
if command -v setsid >/dev/null 2>&1; then
  HEAVY_GUARD_HELD=1 setsid "$@" <&0 200>&- &
elif [ -n "$PERL_BIN" ]; then
  HEAVY_GUARD_HELD=1 "$PERL_BIN" -e 'setpgrp(0, 0); exec @ARGV or exit 127' "$@" <&0 200>&- &
else
  GROUPED=""
  HEAVY_GUARD_HELD=1 "$@" <&0 200>&- &
fi
CHILD=$!
started=$(date +%s)

kill_child() {
  if [ -n "$GROUPED" ]; then
    kill "-$1" -- "-$CHILD" 2>/dev/null || kill "-$1" "$CHILD" 2>/dev/null
  else
    kill "-$1" "$CHILD" 2>/dev/null
  fi
}

TIMEOUT_FLAG="$HEAVY_GUARD_DIR/timeout-$$"
# Watchdog: enforces --max-run, and takes the test tree down if the guard itself
# is SIGKILLed (dead agent) — otherwise the slot would free while the suite
# keeps running, and the next waiter would start on top of it.
(
  while kill -0 "$CHILD" 2>/dev/null; do
    if ! kill -0 $$ 2>/dev/null; then
      kill_child TERM; sleep 10; kill_child KILL
      exit 0
    fi
    if [ "$((10#$MAX_RUN))" -gt 0 ] && [ $(( $(date +%s) - started )) -ge "$((10#$MAX_RUN))" ]; then
      : > "$TIMEOUT_FLAG"
      kill_child TERM; sleep 10; kill_child KILL
      exit 0
    fi
    sleep 1
  done
) 200>&- </dev/null >/dev/null 2>&1 &
WATCHDOG=$!

trap 'kill_child TERM' TERM INT HUP

status=0
while :; do
  if wait "$CHILD"; then status=0; else status=$?; fi
  kill -0 "$CHILD" 2>/dev/null || break
done

kill "$SAMPLER" "$WATCHDOG" 2>/dev/null

timed_out=""
if [ -e "$TIMEOUT_FLAG" ]; then timed_out=1; status=124; fi
min_mem="$(cat "$MIN_FILE" 2>/dev/null)"
rm -f "$MIN_FILE" "$TIMEOUT_FLAG" "$HEAVY_GUARD_DIR/slot-$SLOT.info"
secs=$(( $(date +%s) - started ))

verdict="PASS"; reason="-"
if [ "$status" -ne 0 ]; then
  verdict="FAIL"
  if [ -n "$timed_out" ]; then
    verdict="ENV_SUSPECT"; reason="max-run-${MAX_RUN}s-expired"
  elif [ "$status" -eq 137 ]; then
    verdict="ENV_SUSPECT"; reason="sigkill-likely-oom"
  elif [ -n "$min_mem" ] && [ "$min_mem" -lt "$((10#$LOW_MEM_MB))" ]; then
    verdict="ENV_SUSPECT"; reason="mem-dipped-to-${min_mem}MB"
  fi
fi

echo "heavy-guard: verdict=$verdict exit=$status secs=$secs min_mem_mb=${min_mem:-?} reason=$reason" >&2

json_label="$(printf '%s' "$LABEL" | tr -d '\n' | sed 's/\\/\\\\/g; s/"/\\"/g')"
json_cwd="$(printf '%s' "$PWD" | sed 's/\\/\\\\/g; s/"/\\"/g')"
printf '{"ts":%s,"verdict":"%s","exit":%s,"secs":%s,"min_mem_mb":%s,"reason":"%s","label":"%s","cwd":"%s"}\n' \
  "$(date +%s)" "$verdict" "$status" "$secs" "${min_mem:-null}" "$reason" "$json_label" "$json_cwd" \
  >> "$HEAVY_GUARD_DIR/runs.jsonl" 2>/dev/null

exit "$status"
