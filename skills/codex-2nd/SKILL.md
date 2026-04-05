---
name: codex-2nd
description: "Get a second opinion from OpenAI Codex CLI on a plan or approach. Use when: (1) During planning phase of /x-as-pr or /x-wt-teams to validate the approach, (2) User says 'codex 2nd', 'second opinion', or 'codex opinion', (3) When exploring a codebase and want an alternative perspective before committing to a plan. Sends context and plan to codex, collects feedback, and returns it for plan refinement. Called automatically by /x-as-pr and /x-wt-teams during their planning phase."
allowed-tools:
  - Bash(node *)
  - Bash(timeout *)
  - Bash(gtimeout *)
---

# Codex 2nd Opinion

Get a second opinion from the codex plugin companion script on a plan, approach, or codebase exploration. Codex reads workspace files and does web research to provide an independent perspective.

## Codex Plugin Companion Script

The codex plugin provides a companion script for running tasks. Resolve it dynamically:

```bash
CODEX_PLUGIN_ROOT=$(command ls -d "$HOME/.claude/plugins/cache/openai-codex/codex"/*/ 2>/dev/null | sort -V | tail -1)
CODEX_COMPANION="${CODEX_PLUGIN_ROOT}scripts/codex-companion.mjs"
```

If the file does not exist, report "Codex plugin not installed — skipping second opinion" and continue without it.

Usage for second opinion tasks:

```bash
node "$CODEX_COMPANION" task "<prompt>"
```

The `task` command runs Codex in read-only mode by default (no `--write` flag).

## Process

### Step 0: Pre-flight Rate Limit Check

Before doing anything, check if Codex is currently rate-limited:

```bash
RATE_CHECK=$(node $HOME/.claude/scripts/codex-rate-limit.js check 2>&1)
RATE_EXIT=$?
```

If `RATE_EXIT` is non-zero (rate-limited), **skip entirely and silently continue** without it. Do NOT report the rate limit to the user or pause the workflow.

### Step 1: Build Context Prompt

Construct a prompt that includes:

- The current plan or approach being considered
- Key files or areas of the codebase involved
- Specific questions or concerns to address

```
You are reviewing a development plan. Provide a second opinion.

## Context
<what the project is, what repo we're in>

## Current Plan
<the plan or approach being considered>

## Questions
1. Are there any risks, edge cases, or issues with this approach?
2. Is there a simpler or better alternative?
3. Are there any files or areas of the codebase that should be considered but aren't mentioned?
4. Any other suggestions or concerns?

Be concise and practical. Focus on actionable feedback. If the plan looks solid, say so briefly — don't invent problems.
```

### Step 2: Run Codex

```bash
LOGDIR=$(node $HOME/.claude/scripts/get-logdir.js)
mkdir -p "$LOGDIR"
DATETIME=$(date +%Y%m%d_%H%M%S)

# Resolve codex companion script
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

${TIMEOUT_CMD:+$TIMEOUT_CMD} ${TIMEOUT_CMD:+900} node "$CODEX_COMPANION" task \
  "<prompt>" \
  > "$LOGDIR/${DATETIME}-codex-2nd.md" \
  2>"$LOGDIR/${DATETIME}-codex-2nd-stderr.log"
```

**Timeout: 15 minutes.**

### Step 3: Collect Results

1. Check for rate limiting in output files:

   ```bash
   node $HOME/.claude/scripts/codex-rate-limit.js check-output \
     "$LOGDIR/${DATETIME}-codex-2nd.md" \
     "$LOGDIR/${DATETIME}-codex-2nd-stderr.log"
   ```

   If rate limit detected, silently skip — continue without the second opinion.

2. Read the output file
3. If empty or missing, check stderr log for errors
4. If codex timed out or failed, silently continue without it

### Step 4: Return Feedback

Return the codex feedback to the caller. The caller decides whether to incorporate it into the plan.

**No fallback needed.** Unlike other codex skills, if codex fails here, just skip it — the plan proceeds without the second opinion. This is advisory, not critical.

## Timeout Policy

- **Timeout**: 15 minutes (900s)
- **If codex times out**: Skip — report "no second opinion available" and continue
- **No fallback agent** — this is a nice-to-have, not a blocker

## When Called by /x-as-pr or /x-wt-teams

These skills call `/codex-2nd` during their planning phase:

1. After understanding the task and forming an initial plan
2. Send the plan to codex for feedback
3. If useful feedback is returned, update the plan
4. Optionally re-run `/codex-2nd` with the updated plan (up to 3 iterations total)
5. Finalize the plan and proceed with implementation

## Important Notes

- Codex reads workspace files for context — no need to paste file contents into the prompt
- All file writing done by Claude Code, never by codex
- This is advisory — never block the workflow if codex is unresponsive
- **Silent fallback policy**: If codex is rate-limited, timed out, or unavailable, silently skip without reporting to the user. NEVER pause the workflow or ask what to do
- NEVER use `~` in paths — use `$HOME`
