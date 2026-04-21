---
name: gcoc
description: "GitHub Copilot CLI (cheap mode) — same as /gco but forces the free gpt-4.1 model. Use when: (1) User says 'gcoc', 'copilot cheap', or 'ask copilot cheap', (2) Premium quota is low/exhausted and you want to skip the opus attempt and go straight to free gpt-4.1, (3) The task doesn't need opus-level reasoning — simple lookups, quick reviews, translations. Runs read-only (no file writes)."
user-invocable: true
argument-hint: <prompt>
allowed-tools:
  - Bash(bash *)
  - Bash(timeout *)
  - Bash(gtimeout *)
  - Bash(node *)
---

# GitHub Copilot Cheap Mode

Same behavior as [/gco](../gco/SKILL.md) — read-only sub-agent for review, research, and investigation — but forces the free `gpt-4.1` model from the start. No Premium Requests consumed.

## When to Use

- Premium Request quota is low or exhausted on the Pro plan
- The task is simple enough that opus-level reasoning is overkill
- You want a deterministic "cheap run" with zero risk of Premium consumption

## How It Differs from /gco

- Model: `gpt-4.1` (forced via `GCO_MODEL=gpt-4.1`) — not `claude-opus-4.6`
- No fallback needed — `gpt-4.1` is already the cheapest tier
- Everything else (read-only enforcement, timeout, output handling) is identical

## Process

Follow the exact same process as [/gco](../gco/SKILL.md), but prefix the `gco-run.sh` invocation with `GCO_MODEL=gpt-4.1`:

```bash
LOGDIR=$(node $HOME/.claude/scripts/get-logdir.js)
mkdir -p "$LOGDIR"
DATETIME=$(date +%Y%m%d_%H%M%S)
SLUG="<short-topic-slug>"

GCO_MODEL=gpt-4.1 \
  bash $HOME/.claude/skills/gco/scripts/gco-run.sh \
  "<prompt>" \
  "$LOGDIR/${DATETIME}-gcoc-${SLUG}.md" \
  "$LOGDIR/${DATETIME}-gcoc-${SLUG}-stderr.log"
```

Run as a **background Bash task** with 15-minute timeout.

## Collect and Present Results

1. Read the output file
2. If empty or missing, check stderr log for errors
3. Synthesize and present findings to the user
4. Include the log file path for reference

**Do NOT** report "used gpt-4.1 because of no quota" — the user deliberately chose cheap mode, it's not a fallback.

## Important Notes

- Copilot cannot modify files — all writes are done by Claude Code
- NEVER use `~` in paths — use `$HOME`
- Output and stderr go to `$LOGDIR/${DATETIME}-gcoc-*` (timestamped)
- If copilot is not installed, report "Copilot CLI not found. Install with: gh extension install github/gh-copilot"
