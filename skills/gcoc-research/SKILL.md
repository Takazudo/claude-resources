---
name: gcoc-research
description: "Web research using GitHub Copilot CLI cheap mode — same as /gco-research but forces the free gpt-4.1 model. Use when: (1) User says 'gcoc research' or 'copilot cheap research', (2) Premium quota is exhausted, (3) Research topic is simple and doesn't need opus reasoning."
allowed-tools:
  - Bash(bash *)
  - Bash(timeout *)
  - Bash(gtimeout *)
  - Bash(node *)
---

# GCOC Research (Cheap)

Same behavior as [/gco-research](../gco-research/SKILL.md) — web research synthesized by Claude Code — but forces `gpt-4.1` from the start. No Premium Requests consumed.

## How It Differs from /gco-research

- Model: `gpt-4.1` (forced via `GCO_MODEL=gpt-4.1`)
- Skip the `GCO_USED_FALLBACK=` stderr check — it's the user's deliberate choice, not a fallback

## Process

Follow the exact same process as [/gco-research](../gco-research/SKILL.md).

### Step 1: Understand the Research Topic

Clarify what needs to be researched — specific question, scope, how findings will be used.

### Step 2: Build Research Prompt

Same research prompt as /gco-research (topic, specific questions, request for findings with sources/URLs, alternatives, recommendations, code examples).

### Step 3: Run Copilot with forced cheap model

```bash
LOGDIR=$(node $HOME/.claude/scripts/get-logdir.js)
mkdir -p "$LOGDIR"
DATETIME=$(date +%Y%m%d_%H%M%S)
SLUG="<short-topic-slug>"

GCO_MODEL=gpt-4.1 \
  bash $HOME/.claude/skills/gco/scripts/gco-run.sh \
  "<research prompt>" \
  "$LOGDIR/${DATETIME}-gcoc-research-${SLUG}.md" \
  "$LOGDIR/${DATETIME}-gcoc-research-${SLUG}-stderr.log"
```

**Timeout: 15 minutes.**

### Step 4: Collect Results

1. Read the output file
2. If empty or missing, check stderr log for errors
3. If Copilot timed out or failed, jump to **Fallback**
4. Do NOT check for `GCO_USED_FALLBACK=` marker — the cheap model is intentional

### Step 5: Fallback

Same as /gco-research — if Copilot timed out, produced no output, or is not installed, spawn a `researcher` subagent.

### Step 6: Synthesize

Organize findings, verify key claims where possible, present with source references.

### Step 7: Save Research Log

```bash
node $HOME/.claude/scripts/save-file.js "{logdir}/{timestamp}-research-{topic}.md" "<content>"
pnpm dlx @takazudo/mdx-formatter --write <file>
```

## Important Notes

- Copilot does native web research — no need to paste content into the prompt
- All file writing done by Claude Code, never by Copilot
- `gpt-4.1` has zero Premium multiplier on the Pro plan — safe to use when quota is tight
- NEVER use `~` in paths — use `$HOME`
