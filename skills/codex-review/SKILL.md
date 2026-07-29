---
name: codex-review
description: "Code review using OpenAI Codex CLI (codex exec review). PREFERRED over /light-review for code review. Use when: (1) User says 'review', 'code review', or 'codex review', (2) After implementation when quality check is needed, (3) Child agents self-reviewing. Runs multiple codex review instances in parallel. Falls back to Claude Code if codex unresponsive."
allowed-tools:
  - Bash(bash $HOME/.claude/scripts/codex-guard.sh *)
  - Bash(node *)
  - Bash(timeout *)
  - Bash(gtimeout *)
  - Bash(git *)
  - Bash(gh *)
---

# Codex Review

Code review via the codex plugin companion script. Runs codex review, collects results, and synthesizes findings.

## Codex Plugin Companion Script

The codex plugin provides a companion script for running reviews. Resolve it dynamically:

```bash
CODEX_PLUGIN_ROOT=$(command ls -d "$HOME/.claude/plugins/cache/openai-codex/codex"/*/ 2>/dev/null | sort -V | tail -1)
CODEX_COMPANION="${CODEX_PLUGIN_ROOT}scripts/codex-companion.mjs"
```

If the directory or file does not exist, report "Codex plugin not installed. Run `/codex:setup` first." and fall back to Claude Code review.

Usage:

```bash
node "$CODEX_COMPANION" review --base <branch> --wait
```

Key flags:

- `--base <branch>`: Review changes against this base branch
- `--wait`: Run in foreground (block until complete)
- `--scope auto|working-tree|branch`: Scope selection (default: auto)

## Concurrency guard

Every codex launch below is wrapped in `bash $HOME/.claude/scripts/codex-guard.sh --wait <secs> -- <launch...>`. The guard is a machine-wide flock semaphore with **2 slots** (its default): at most two codex processes run concurrently across all worktrees/agents, so a `/x-wt-teams` burst of children each self-reviewing can't stampede the machine. All callers rely on the same default slot count — do not pass a per-caller `--slots`.

The guard sits **outside** the whole `timeout … node "$CODEX_COMPANION" …` invocation (the companion's broker-busy retry path can spawn an extra app-server under contention, so serialization must wrap the entire thing). It holds the slot for the wrapped command's lifetime and closes the lock fd for the command, so codex's detached broker never pins a slot.

**Guard-timeout → fallback contract:** if no slot frees within `--wait`, the guard exits **75** without running codex. The manager launch uses `--wait 300` (patient — it wants codex's cross-model review). The child/subagent launch uses `--wait 90`: a child that can't get a slot quickly exits 75, which — like any other nonzero codex exit — silently drops to the child's **foreground self-review** fallback (Step 5). That is the intended "lighter child self-review under parallelism" behavior, not an error.

## Process

### Step 0: Pre-flight Rate Limit Check

Before doing anything, check if Codex is currently rate-limited:

```bash
RATE_CHECK=$(node $HOME/.claude/scripts/codex-rate-limit.js check 2>&1)
RATE_EXIT=$?
```

If `RATE_EXIT` is non-zero (rate-limited), **skip all codex steps** and jump directly to the **Fallback** step. **Do NOT report the rate limit to the user** — silently fall back.

### Step 1: Determine Base Branch

```bash
BRANCH=$(git branch --show-current)
BASE=$(gh pr view --json baseRefName -q '.baseRefName' 2>/dev/null)
```

If no PR, use default branch:

```bash
BASE=$(git remote show origin | grep 'HEAD branch' | awk '{print $NF}')
```

### Step 2: Prepare Environment

```bash
LOGDIR=$(node $HOME/.claude/scripts/get-logdir.js)
mkdir -p "$LOGDIR"
DATETIME=$(date +%Y%m%d_%H%M%S)

# Resolve codex companion script (pick latest version if multiple exist)
CODEX_PLUGIN_ROOT=$(command ls -d "$HOME/.claude/plugins/cache/openai-codex/codex"/*/ 2>/dev/null | sort -V | tail -1)
CODEX_COMPANION="${CODEX_PLUGIN_ROOT}scripts/codex-companion.mjs"

# Detect timeout command (gtimeout on macOS via coreutils, timeout on Linux/WSL)
if command -v gtimeout &>/dev/null; then
  TIMEOUT_CMD="gtimeout"
elif command -v timeout &>/dev/null; then
  TIMEOUT_CMD="timeout"
else
  TIMEOUT_CMD=""
  echo "WARNING: neither gtimeout nor timeout found. Running without timeout."
fi
```

Use `$DATETIME` in all output filenames below to avoid overwriting previous runs.

### Step 3: Run Codex Review

**First, determine which context you're running in — this changes how Step 3 executes:**

- **Interactive / main-session (manager) context**: you are the top-level session the user is talking to directly (not a worktree child, not a team member spawned by `/x-wt-teams` or similar). Background-task completion notifications are delivered here, so backgrounding is safe.
- **Subagent / child-agent context**: you were spawned as a worktree child, a team member, or were otherwise instructed to run reviews in the foreground. Do not background this call: a subagent that ends its turn waiting for a background completion notification is never re-invoked; in practice the signal surfaces to the manager session and the child **parks** (observed field behavior). Use the foreground procedure below instead.

If you are unsure which context you're in, treat it as a subagent context — the foreground path is always safe to use, it just trades a 25-minute budget for a 10-minute one (absorbed by the fallback).

#### Interactive / main-session (manager) context only

Run the companion script's review command with `--base` and `--wait`:

```bash
bash $HOME/.claude/scripts/codex-guard.sh --wait 300 -- \
  ${TIMEOUT_CMD:+$TIMEOUT_CMD} ${TIMEOUT_CMD:+1500} node "$CODEX_COMPANION" review --base "$BASE" --wait \
  > "$LOGDIR/${DATETIME}-codex-review.md" \
  2>"$LOGDIR/${DATETIME}-codex-review-stderr.log"
```

Launch as a **background Bash task** with a **25-minute timeout**. The `codex-guard.sh` wrapper (see "Concurrency guard" below) bounds machine-wide concurrent codex launches; `--wait 300` gives the manager launch up to 5 minutes to claim a slot before it would give up (exit 75).

#### Subagent / child-agent context (MANDATORY)

The Bash tool's foreground timeout caps at 10 minutes (600000 ms) — below codex's normal 25-minute budget — but a subagent must not background this call under any circumstance (see the context-split intro above). Run it as a **single foreground Bash call** instead, with the tool timeout set to its maximum (600000 ms):

```bash
if [ -z "$TIMEOUT_CMD" ]; then
  # Neither timeout nor gtimeout is available — do not run codex uncontrolled in a
  # child context (the Bash tool would kill the call and the agent couldn't recover
  # cleanly). Skip straight to the Fallback step.
  echo "SKIP_CODEX_NO_TIMEOUT_BINARY"
  CODEX_EXIT=1
else
  bash $HOME/.claude/scripts/codex-guard.sh --wait 90 -- \
    "$TIMEOUT_CMD" -k 15 480 node "$CODEX_COMPANION" review --base "$BASE" --wait \
    > "$LOGDIR/${DATETIME}-codex-review.md" \
    2>"$LOGDIR/${DATETIME}-codex-review-stderr.log"
  CODEX_EXIT=$?
fi
```

- **Do not use `run_in_background` for this call.** It must be a single blocking foreground invocation with the Bash tool timeout parameter set to 600000 ms.
- `-k 15 480`: run for up to 480s, send TERM, then SIGKILL 15s later if the process ignores TERM. The whole child budget must fit the Bash tool's 600000 ms foreground cap: guard `--wait 90` + 480s run + 15s kill grace = 585s < 600s. Do not raise this run cap — a larger value pushes the guard-wait + run + kill-grace total over the 600000 ms cap, so under slot contention the harness would hard-kill the call before `CODEX_EXIT` is captured. This grace period also stops a TERM-ignoring codex process from consuming the entire tool budget and getting hard-killed mid-write.
- **Capture `CODEX_EXIT` (the command's exit status). ANY nonzero exit — including `timeout`'s `124` and the guard's slot-wait `75` — triggers the Fallback step (Step 5), even if the output file has partial content.** A `75` means the machine-wide codex slots were all busy for 90s; the child rides its foreground self-review fallback rather than piling on more concurrent codex load (see "Concurrency guard" below).
- If neither `timeout` nor `gtimeout` is available (`$TIMEOUT_CMD` is empty), **skip codex entirely and go straight to Fallback** — do not attempt to run codex without a timeout wrapper in a child context.

### Step 4: Collect Results and Check for Rate Limiting

After codex completes (or times out):

1. Check for rate limiting in the output files:

   ```bash
   node $HOME/.claude/scripts/codex-rate-limit.js check-output \
     "$LOGDIR/${DATETIME}-codex-review.md" \
     "$LOGDIR/${DATETIME}-codex-review-stderr.log"
   ```

   If exit code is non-zero (rate limit detected), jump to **Fallback**.

2. Check the output file (`$LOGDIR/${DATETIME}-codex-review.md`) exists and has content
3. If missing or empty, read the stderr log (`$LOGDIR/${DATETIME}-codex-review-stderr.log`) to diagnose why
4. Report any stderr contents to the user (auth errors, API failures, etc.)

### Step 5: Fallback

If codex timed out, produced no output, is rate-limited, or (subagent/child-agent context) exited with **any nonzero status** — including the no-timeout-binary skip case:

- **Fall back silently** — do NOT report the rate limit or timeout to the user. Do NOT pause the workflow.
- **Interactive / main-session (manager) context**: spawn **2** `code-reviewer` subagents in parallel (like /light-review) with `model: opus`, reviewing the diff against `$BASE`. Opus is the designated Claude-side stand-in for codex throughout these skills — no quota-loud failure mode. Continue the workflow as if `/light-review` was invoked instead.
- **Subagent / child-agent context**: **do NOT spawn any subagent.** Review the diff yourself, in the foreground: read `git diff "$BASE"...HEAD`, make one bugs/logic pass and one quality/structure pass over the changed files, apply clearly-useful fixes, and commit. Then continue.

  A nested `Agent` call is **not** available to you here. It returns an **async handle even with `run_in_background: false`**, and its completion notification routes to the **manager**, not to you — so a child that dispatches a fallback reviewer and ends its turn parks, with its work committed but never reported. (An earlier version of this step claimed the opposite and called it "structurally park-proof"; that was wrong and caused exactly this failure in the field.) See the canonical rule: **a subagent must never end its turn waiting on anything it did not itself synchronously complete** — `$HOME/.claude/skills/x-wt-teams/references/execution-modes.md` → "Invariant". A self-done foreground review is strictly better than a parked turn, and it also sidesteps the CPU-budget problem — up to 6 live children each spawning nested reviewers would blow the manager's 6-concurrent budget.

### Step 6: Synthesize and Report

1. Read codex output and organize findings
2. Categorize by priority (high / medium / low)
3. Present a clear summary to the caller
4. Include log file paths for reference

### Step 7: Apply Fixes

- **High priority**: Implement automatically
- **Medium priority**: Implement if clearly safe, otherwise ask
- **Low priority**: Ask user

### Step 8: Commit Changes

If fixes were applied, commit with a descriptive message.

### Step 9: Reap this workspace's broker (child/subagent context — EVERY exit path)

**Child/subagent context only** (skip in interactive / main-session context — its SessionEnd hook handles cleanup). Once the review has concluded by **any** exit path — codex success, `timeout`'s `124`, the guard's `75`, the no-timeout skip, or a rate-limit / foreground self-review fallback (including the Step 0 rate-limit jump) — reap this workspace's detached codex broker before you report back:

```bash
node $HOME/.claude/scripts/codex-sweep.js --workspace "$PWD"
```

Reap the workspace the review actually ran in. If your shell's working directory may not be your own worktree — e.g. a team-child session whose cwd stays the lead's — pass your assigned worktree's **absolute path** here instead of `$PWD`, so you reap your own broker and not the lead's.

A child session never fires the plugin's SessionEnd hook, so its broker + app-server pair would otherwise leak (orphaned to PPID 1, exhausting `fs.inotify.max_user_instances` on WSL2 → Vite EMFILE). Run it unconditionally — it is a quiet no-op when no broker exists, and the plugin's `ensureBrokerSession` self-heals if codex is needed again, so an early reap is safe.

## Timeout Policy

- **Interactive / main-session (manager) context**: 25 minutes (1500s via `gtimeout`/`timeout` command, auto-detected), run as a background Bash task.
- **Subagent / child-agent context**: 480s (8 min) foreground Bash call via `$TIMEOUT_CMD -k 15 480`. The full child budget (guard `--wait 90` + 480s run + 15s kill grace = 585s) stays under the Bash tool's 600000 ms foreground maximum, so the call can't be hard-killed before its exit status is captured. **Never** background this in a child context (see Step 3's context-split intro for why).
- **If codex times out, exits nonzero, or (child context) no timeout binary is available**: Fall back silently — **2** `code-reviewer` subagents (`model: opus`) in the interactive/manager context; a **foreground self-review with no subagent** in a subagent/child-agent context (a nested `Agent` call would park the child — see Step 5).

## Important Notes

- Codex runs in read-only sandbox by default for reviews — it cannot modify files
- All file writing and editing is done by Claude Code, never by codex
- Output files go to `$LOGDIR/${DATETIME}-codex-review-*.md` (timestamped to avoid overwrites)
- Stderr logs go to `$LOGDIR/${DATETIME}-codex-review-*-stderr.log` (for debugging silent failures)
- This skill is preferred over /light-review for code review tasks
- **Never background this call from a subagent.** `run_in_background` / background Bash tasks are only safe in the interactive/main-session (manager) context; in a subagent or child-agent context, Step 3 MUST run as a single foreground call — see "Subagent / child-agent context (MANDATORY)" above.
- **Silent fallback policy**: If codex is rate-limited, timed out, exits nonzero (child context), or is otherwise unavailable, fall back silently — in the interactive/manager context to **Opus**, 2 `code-reviewer` subagents at `model: opus` (like `/light-review`); in a subagent/child-agent context to a **foreground self-review that spawns nothing** (Step 5). NEVER pause the workflow, NEVER report the rate limit to the user, NEVER ask what to do. Just continue with the fallback as if nothing happened. Opus is the designated Claude-side stand-in for codex throughout these skills wherever a subagent may be spawned at all.
