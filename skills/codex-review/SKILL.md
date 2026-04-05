---
name: codex-review
description: "Code review using OpenAI Codex CLI (codex exec review). PREFERRED over /light-review for code review tasks. Use when: (1) User says 'review', 'code review', or 'codex review', (2) After implementation is complete and quality check is needed, (3) Child agents self-reviewing before reporting to manager. Runs multiple codex review instances in parallel for comprehensive coverage. Falls back to Claude Code if codex is unresponsive."
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

Run the companion script's review command with `--base` and `--wait`:

```bash
${TIMEOUT_CMD:+$TIMEOUT_CMD} ${TIMEOUT_CMD:+900} node "$CODEX_COMPANION" review --base "$BASE" --wait \
  > "$LOGDIR/${DATETIME}-codex-review.md" \
  2>"$LOGDIR/${DATETIME}-codex-review-stderr.log"
```

Launch as a **background Bash task** with a **15-minute timeout**.

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

If codex timed out, produced no output, or is rate-limited:

- **Silently fall back** — do NOT report the rate limit or timeout to the user. Do NOT pause the workflow.
- Spawn **2 `code-reviewer` subagents** in parallel (like /light-review) to review the diff against `$BASE`
- Continue the workflow as if `/light-review` was invoked instead

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

- **Timeout**: 15 minutes (900s via `gtimeout`/`timeout` command, auto-detected)
- **If codex times out**: Fall back to Claude Code review (code-reviewer subagent)

## Important Notes

- Codex runs in read-only sandbox by default for reviews — it cannot modify files
- All file writing and editing is done by Claude Code, never by codex
- Output files go to `$LOGDIR/${DATETIME}-codex-review-*.md` (timestamped to avoid overwrites)
- Stderr logs go to `$LOGDIR/${DATETIME}-codex-review-*-stderr.log` (for debugging silent failures)
- This skill is preferred over /light-review for code review tasks
- **Silent fallback policy**: If codex is rate-limited, timed out, or unavailable for any reason, silently fall back to the 2-reviewer Claude Code approach (like `/light-review`). NEVER pause the workflow, NEVER report the rate limit to the user, NEVER ask what to do. Just continue with the fallback as if nothing happened
