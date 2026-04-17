---
name: gco-stack-trace-read
user-invocable: true
description: "Stack trace / error analysis using GitHub Copilot CLI. Use when: (1) User says 'read stack trace', 'debug this error', 'what does this trace mean', (2) User pastes a stack trace or error output, (3) User provides a file path containing an error log. Passes the trace to Copilot for structured debugging pointers. Does NOT attempt fixes — diagnostic only. Falls back to Claude-direct analysis if Copilot unavailable."
argument-hint: <trace-or-file-path>
allowed-tools:
  - Bash(bash *)
  - Bash(node *)
  - Bash(timeout *)
  - Bash(gtimeout *)
---

# GCO Stack Trace Read

Diagnostic analysis of a stack trace or error output via GitHub Copilot CLI.
**Read-only — no file modifications.**

## Process

### Step 0: Pre-flight Rate Limit Check

```bash
RATE_CHECK=$(node $HOME/.claude/scripts/gco-rate-limit.js check 2>&1)
```

If output starts with `degraded:`, notify the user Copilot is in low-cost mode but **proceed anyway** — still usable.

If the check itself fails (node error, script missing), **skip silently** and proceed. Do NOT block on rate-check failure.

### Step 1: Resolve the Trace Input

The argument may be:

- **Inline trace text** — a multi-line block pasted directly
- **File path** — read the file content

```bash
# If argument looks like a file path (no newlines, path-like):
if [ -f "<argument>" ]; then
  TRACE_TEXT=$(cat "<argument>")
else
  TRACE_TEXT="<inline argument text>"
fi
```

If no argument was provided, ask the user to paste the trace or provide a file path.

### Step 2: Build the Prompt

The prompt passed to `gco-pure.sh` must **not** include the trace text — `gco-pure.sh` appends stdin to the prompt automatically. The prompt should end with the `Stack trace / error:` header.

Assign `PROMPT` to the following literal text:

```bash
PROMPT="You are a debugging assistant. Analyze the following stack trace / error output.

Do NOT suggest code fixes or patches. Return a structured diagnostic report only.

Respond with exactly these three sections:

## Likely causes
Ranked bullets — most probable first. Each bullet: one sentence explaining what could cause this error, and why.

## Files / lines to inspect
File paths and line numbers mentioned in the trace, plus any implicated callsites. Format: \`path/to/file.ext:line\` — one per bullet. If no line numbers are available, list the file.

## Suggested next steps
Concrete debugging actions: add a log statement here, check this condition, verify this env var, reproduce with this input, etc. No code — just directions.

Stack trace / error:"
```

`gco-pure.sh` will append `\n\n<TRACE_TEXT>` after this header automatically (via stdin).

### Step 3: Run Copilot

```bash
LOGDIR=$(node "$HOME/.claude/scripts/get-logdir.js")
mkdir -p "$LOGDIR"
DATETIME=$(date +%Y%m%d_%H%M%S)

printf '%s' "$TRACE_TEXT" | \
  bash "$HOME/.claude/skills/gco/scripts/gco-pure.sh" \
    "$PROMPT" \
    > "$LOGDIR/${DATETIME}-gco-stack-trace.md" \
    2> "$LOGDIR/${DATETIME}-gco-stack-trace-stderr.log"
```

`$PROMPT` is the variable assigned in Step 2. `$TRACE_TEXT` is the resolved trace from Step 1.

`gco-pure.sh` already has a 15-minute internal timeout. Run as a **background Bash task**.

### Step 4: Check Rate Limit in Output

```bash
node "$HOME/.claude/scripts/gco-rate-limit.js" check-output \
  "$LOGDIR/${DATETIME}-gco-stack-trace.md" \
  "$LOGDIR/${DATETIME}-gco-stack-trace-stderr.log"
```

If non-zero exit (rate limit detected): **silently fall back** — proceed to Step 5 without notifying the user.

### Step 5: Fallback

If Copilot timed out, produced **no usable output**, rate limit was detected, or Copilot is **not installed**:

- **Silently fall back** — do NOT report the rate limit, timeout, or fallback to the user. Do NOT pause the workflow.
- Perform Claude-direct analysis of the trace: identify likely causes, files/lines to inspect, and suggested next steps using the same three-section structure
- Continue as if direct analysis was the original plan

### Step 6: Present Results

1. Read `$LOGDIR/${DATETIME}-gco-stack-trace.md`
2. Present the three-section report to the user
3. Include the log file path for reference
4. Do NOT attempt any code fixes — this skill is diagnostic only

## Important Notes

- **No file modifications** — this skill only reads and reports
- Pass the trace to `gco-pure.sh` via stdin (pipe), not as a second argument, to avoid shell escaping issues with large traces
- NEVER use `~` in paths — use `$HOME`
- `gco-pure.sh` uses `--available-tools` with no list = zero tools (read-only, no web access)
- Output: `$LOGDIR/${DATETIME}-gco-stack-trace.md`
