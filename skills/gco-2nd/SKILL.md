---
name: gco-2nd
description: "Get a second opinion from GitHub Copilot CLI on a plan or approach. Use when: (1) During planning phase of /x-as-pr or /x-wt-teams to validate the approach, (2) User says 'gco 2nd', 'copilot 2nd', or 'copilot opinion', (3) When exploring a codebase and want an alternative perspective before committing to a plan."
allowed-tools:
  - Bash(bash *)
  - Bash(timeout *)
  - Bash(gtimeout *)
  - Bash(node *)
---

# GCO 2nd Opinion

Get a second opinion from GitHub Copilot CLI on a plan, approach, or codebase exploration.

## Process

### Step 0: Pre-flight Rate Limit Check

Before doing anything, check if Copilot is currently rate-limited:

```bash
RATE_CHECK=$(node $HOME/.claude/scripts/gco-rate-limit.js check 2>&1)
RATE_EXIT=$?
```

If `RATE_EXIT` is non-zero (rate-limited), **skip entirely and silently continue** without it. Do NOT report the rate limit to the user or pause the workflow.

### Step 1: Build Context Prompt

Construct a prompt that includes:

- The current plan or approach being considered
- Key files or areas of the codebase involved
- Specific questions or concerns

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

### Step 2: Run Copilot

```bash
LOGDIR=$(node $HOME/.claude/scripts/get-logdir.js)
mkdir -p "$LOGDIR"
DATETIME=$(date +%Y%m%d_%H%M%S)

bash $HOME/.claude/skills/gco/scripts/gco-run.sh \
  "<prompt>" \
  "$LOGDIR/${DATETIME}-gco-2nd.md" \
  "$LOGDIR/${DATETIME}-gco-2nd-stderr.log"
```

**Timeout: 15 minutes.**

### Step 3: Collect Results

1. Check for rate limiting in output files:

   ```bash
   node $HOME/.claude/scripts/gco-rate-limit.js check-output \
     "$LOGDIR/${DATETIME}-gco-2nd.md" \
     "$LOGDIR/${DATETIME}-gco-2nd-stderr.log"
   ```

   If rate limit detected, silently skip — continue without the second opinion.

2. Read the output file
3. If empty or missing, check stderr log for errors
4. If Copilot timed out or failed, silently skip

### Step 4: Return Feedback

Return the Copilot feedback to the caller. The caller decides whether to incorporate it into the plan.

**No fallback needed.** If Copilot fails, skip — the plan proceeds without the second opinion. This is advisory, not critical.

## When Called by /x-as-pr or /x-wt-teams

1. After forming an initial plan, send it to Copilot for feedback
2. If useful feedback is returned, update the plan
3. Optionally re-run with the updated plan (up to 3 iterations total)
4. Finalize and proceed with implementation

## Important Notes

- Copilot reads workspace files for context — no need to paste file contents into the prompt
- All file writing done by Claude Code, never by Copilot
- This is advisory — never block the workflow if Copilot is unresponsive
- **Silent skip policy**: If Copilot is unavailable, silently skip without reporting to the user. NEVER pause the workflow
- NEVER use `~` in paths — use `$HOME`
