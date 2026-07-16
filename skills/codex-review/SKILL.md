---
name: codex-review
description: "Code review using OpenAI Codex CLI (codex exec review). PREFERRED over /light-review for code review. Use when: (1) User says 'review', 'code review', or 'codex review', (2) After implementation when quality check is needed, (3) Child agents self-reviewing. Runs multiple codex review instances in parallel. Falls back to Claude Code if codex unresponsive."
allowed-tools:
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
${TIMEOUT_CMD:+$TIMEOUT_CMD} ${TIMEOUT_CMD:+1500} node "$CODEX_COMPANION" review --base "$BASE" --wait \
  > "$LOGDIR/${DATETIME}-codex-review.md" \
  2>"$LOGDIR/${DATETIME}-codex-review-stderr.log"
```

Launch as a **background Bash task** with a **25-minute timeout**.

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
  "$TIMEOUT_CMD" -k 15 570 node "$CODEX_COMPANION" review --base "$BASE" --wait \
    > "$LOGDIR/${DATETIME}-codex-review.md" \
    2>"$LOGDIR/${DATETIME}-codex-review-stderr.log"
  CODEX_EXIT=$?
fi
```

- **Do not use `run_in_background` for this call.** It must be a single blocking foreground invocation with the Bash tool timeout parameter set to 600000 ms.
- `-k 15 570`: run for up to 570s, send TERM, then SIGKILL 15s later if the process ignores TERM. This grace period stops a TERM-ignoring codex process from consuming the entire 600000 ms tool budget and getting hard-killed by the harness mid-write.
- **Capture `CODEX_EXIT` (the command's exit status). ANY nonzero exit — including `timeout`'s `124` — triggers the Fallback step (Step 5), even if the output file has partial content.**
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

### Step 5: Fallback — Opus

If codex timed out, produced no output, is rate-limited, or (subagent/child-agent context) exited with **any nonzero status** — including the no-timeout-binary skip case:

- **Silently fall back to Opus** — do NOT report the rate limit or timeout to the user. Do NOT pause the workflow.
- **Interactive / main-session (manager) context**: spawn **2** `code-reviewer` subagents in parallel (like /light-review) with `model: opus`, reviewing the diff against `$BASE`.
- **Subagent / child-agent context**: spawn only **1** `code-reviewer` subagent with `model: opus`, reviewing the diff against `$BASE`. With up to 6 children live at once under `/x-wt-teams`, a 2-per-child fallback would blow the manager's 6-concurrent CPU budget — 1 keeps the fallback affordable at scale. Because a nested `Agent` call from a subagent blocks and returns synchronously, there is no notification dependency here — this stays structurally park-proof regardless of context.
- Opus is the designated Claude-side stand-in for codex throughout these skills — no quota-loud failure mode.
- Continue the workflow as if `/light-review` was invoked instead (adjusted for reviewer count per context, as above)

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

## Timeout Policy

- **Interactive / main-session (manager) context**: 25 minutes (1500s via `gtimeout`/`timeout` command, auto-detected), run as a background Bash task.
- **Subagent / child-agent context**: 570s (9.5 min) foreground Bash call via `$TIMEOUT_CMD -k 15 570`, capped by the Bash tool's 600000 ms foreground maximum. **Never** background this in a child context (see Step 3's context-split intro for why).
- **If codex times out, exits nonzero, or (child context) no timeout binary is available**: Silently fall back to Opus — **2** `code-reviewer` subagents (`model: opus`) in the interactive/manager context, **1** in a subagent/child-agent context.

## Important Notes

- Codex runs in read-only sandbox by default for reviews — it cannot modify files
- All file writing and editing is done by Claude Code, never by codex
- Output files go to `$LOGDIR/${DATETIME}-codex-review-*.md` (timestamped to avoid overwrites)
- Stderr logs go to `$LOGDIR/${DATETIME}-codex-review-*-stderr.log` (for debugging silent failures)
- This skill is preferred over /light-review for code review tasks
- **Never background this call from a subagent.** `run_in_background` / background Bash tasks are only safe in the interactive/main-session (manager) context; in a subagent or child-agent context, Step 3 MUST run as a single foreground call — see "Subagent / child-agent context (MANDATORY)" above.
- **Silent fallback policy**: If codex is rate-limited, timed out, exits nonzero (child context), or is otherwise unavailable, silently fall back to **Opus** — 2 `code-reviewer` subagents at `model: opus` in the interactive/manager context (like `/light-review`), or 1 in a subagent/child-agent context. NEVER pause the workflow, NEVER report the rate limit to the user, NEVER ask what to do. Just continue with the fallback as if nothing happened. Opus is the designated Claude-side stand-in for codex throughout these skills.
