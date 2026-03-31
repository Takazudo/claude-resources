---
name: codex-2nd
description: "Get a second opinion from OpenAI Codex CLI on a plan or approach. Use when: (1) During planning phase of /x-as-pr or /x-wt-teams to validate the approach, (2) User says 'codex 2nd', 'second opinion', or 'codex opinion', (3) When exploring a codebase and want an alternative perspective before committing to a plan. Sends context and plan to codex, collects feedback, and returns it for plan refinement. Called automatically by /x-as-pr and /x-wt-teams during their planning phase."
allowed-tools:
  - Bash(codex *)
  - Bash(timeout *)
  - Bash(gtimeout *)
  - Bash(cat *)
disable-model-invocation: true
---

# Codex 2nd Opinion

Get a second opinion from `codex exec` on a plan, approach, or codebase exploration. Codex reads workspace files and does web research to provide an independent perspective.

## Codex CLI Usage

```bash
codex exec --sandbox read-only --ephemeral -o <output-file> "<prompt>"
```

## Process

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

# Detect timeout command (gtimeout on macOS via coreutils, timeout on Linux/WSL)
if command -v gtimeout &>/dev/null; then
  TIMEOUT_CMD="gtimeout"
elif command -v timeout &>/dev/null; then
  TIMEOUT_CMD="timeout"
else
  TIMEOUT_CMD=""
  echo "ERROR: neither gtimeout nor timeout found. On macOS: brew install coreutils | On WSL/Linux: sudo apt install coreutils"
fi

${TIMEOUT_CMD:+$TIMEOUT_CMD} ${TIMEOUT_CMD:+900} codex exec --sandbox read-only --ephemeral \
  -o "$LOGDIR/${DATETIME}-codex-2nd.md" \
  "<prompt>" \
  2>"$LOGDIR/${DATETIME}-codex-2nd-stderr.log"
```

**Timeout: 15 minutes.**

### Step 3: Collect Results

1. Read the output file
2. If empty or missing, check stderr log for errors
3. If codex timed out or failed, report "Codex CLI unresponsive — skipping second opinion" and continue without it

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
- NEVER use `~` in paths — use `$HOME`
