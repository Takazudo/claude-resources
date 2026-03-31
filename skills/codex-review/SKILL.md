---
name: codex-review
description: "Code review using OpenAI Codex CLI (codex exec review). PREFERRED over /light-review for code review tasks. Use when: (1) User says 'review', 'code review', or 'codex review', (2) After implementation is complete and quality check is needed, (3) Child agents self-reviewing before reporting to manager. Runs multiple codex review instances in parallel for comprehensive coverage. Falls back to Claude Code if codex is unresponsive."
allowed-tools:
  - Bash(codex *)
  - Bash(timeout *)
  - Bash(gtimeout *)
  - Bash(git *)
  - Bash(gh *)
---

# Codex Review

Code review via `codex exec review`. Runs multiple parallel codex review instances with different focus areas, collects results, and synthesizes findings.

## Codex CLI Usage

```bash
codex exec review --base <branch> -o <output-file> --ephemeral
```

**IMPORTANT**: `--base <BRANCH>` and `[PROMPT]` are mutually exclusive in codex CLI. When using `--base`, do NOT pass any prompt (no positional arg, no stdin). Codex performs a comprehensive review by default.

Key flags:

- `--base <branch>`: Review changes against this base branch
- `-o <file>`: Write final message to file (for capturing output)
- `--ephemeral`: No session persistence
- Codex runs in read-only sandbox by default for reviews

## Process

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

# Detect timeout command (gtimeout on macOS via coreutils, timeout on Linux/WSL)
if command -v gtimeout &>/dev/null; then
  TIMEOUT_CMD="gtimeout"
elif command -v timeout &>/dev/null; then
  TIMEOUT_CMD="timeout"
else
  TIMEOUT_CMD=""
  echo "ERROR: neither gtimeout nor timeout found. On macOS: brew install coreutils | On WSL/Linux: sudo apt install coreutils"
fi
```

Use `$DATETIME` in all output filenames below to avoid overwriting previous runs.

### Step 3: Run Codex Review

Run a single `codex exec review` with `--base` (no prompt — `--base` and `[PROMPT]` are mutually exclusive). Codex performs a comprehensive review by default.

```bash
${TIMEOUT_CMD:+$TIMEOUT_CMD} ${TIMEOUT_CMD:+900} codex exec review --base "$BASE" --ephemeral \
  -o "$LOGDIR/${DATETIME}-codex-review.md" \
  2>"$LOGDIR/${DATETIME}-codex-review-stderr.log"
```

Launch as a **background Bash task** with a **15-minute timeout**.

### Step 4: Collect Results

After codex completes (or times out):

1. Check the output file (`$LOGDIR/${DATETIME}-codex-review.md`) exists and has content
2. If missing or empty, read the stderr log (`$LOGDIR/${DATETIME}-codex-review-stderr.log`) to diagnose why
3. Report any stderr contents to the user (auth errors, API failures, etc.)

### Step 5: Fallback

If codex timed out or produced no output:

- Report: "Codex CLI unresponsive. Falling back to Claude Code review."
- Run a quick Claude Code review of the diff using the code-reviewer subagent pattern (like /light-review with 2 reviewers)

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
