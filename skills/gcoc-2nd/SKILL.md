---
name: gcoc-2nd
description: "Second opinion from GitHub Copilot CLI cheap mode — same as /gco-2nd but forces the free gpt-4.1 model. Use when: (1) User says 'gcoc 2nd' or 'copilot cheap 2nd', (2) Premium quota is exhausted, (3) Plan is simple enough that gpt-4.1 feedback suffices."
allowed-tools:
  - Bash(bash *)
  - Bash(timeout *)
  - Bash(gtimeout *)
  - Bash(node *)
---

# GCOC 2nd Opinion (Cheap)

Same behavior as [/gco-2nd](../gco-2nd/SKILL.md) — advisory second opinion on a plan or approach — but forces `gpt-4.1` from the start. No Premium Requests consumed.

## How It Differs from /gco-2nd

- Model: `gpt-4.1` (forced via `GCO_MODEL=gpt-4.1`)
- Skip the `GCO_USED_FALLBACK=` stderr check — it's the user's deliberate choice, not a fallback

## Process

Follow the exact same process as [/gco-2nd](../gco-2nd/SKILL.md).

### Step 1: Build Context Prompt

Same prompt structure as /gco-2nd — context, current plan, questions about risks / alternatives / missing areas / other suggestions.

### Step 2: Run Copilot with forced cheap model

```bash
LOGDIR=$(node $HOME/.claude/scripts/get-logdir.js)
mkdir -p "$LOGDIR"
DATETIME=$(date +%Y%m%d_%H%M%S)

GCO_MODEL=gpt-4.1 \
  bash $HOME/.claude/skills/gco/scripts/gco-run.sh \
  "<prompt>" \
  "$LOGDIR/${DATETIME}-gcoc-2nd.md" \
  "$LOGDIR/${DATETIME}-gcoc-2nd-stderr.log"
```

**Timeout: 15 minutes.**

### Step 3: Collect Results

1. Read the output file
2. If empty or missing, check stderr log for errors
3. If Copilot timed out or produced no output, skip — the plan proceeds without the second opinion
4. Do NOT check for `GCO_USED_FALLBACK=` marker — the cheap model is intentional

### Step 4: Return Feedback

Return the Copilot feedback to the caller. The caller decides whether to incorporate it.

**No fallback needed.** Advisory only — if Copilot fails, skip silently.

## Important Notes

- Copilot reads workspace files for context — no need to paste file contents into the prompt
- All file writing done by Claude Code, never by Copilot
- This is advisory — never block the workflow if Copilot is unresponsive
- `gpt-4.1` has zero Premium multiplier on the Pro plan — safe to use when quota is tight
- NEVER use `~` in paths — use `$HOME`
