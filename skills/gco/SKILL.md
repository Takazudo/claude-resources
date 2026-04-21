---
name: gco
description: "Run GitHub Copilot CLI as a read-only sub-agent from Claude Code. Use when: (1) User says 'gco', 'copilot', or 'ask copilot', (2) Delegating code review to Copilot, (3) Delegating research or investigation to Copilot, (4) Getting a second opinion from Copilot on code or architecture. Copilot runs in read-only mode (no file writes) with claude-opus-4.6 model."
user-invocable: true
argument-hint: <prompt>
allowed-tools:
  - Bash(bash *)
  - Bash(timeout *)
  - Bash(gtimeout *)
  - Bash(node *)
---

# GitHub Copilot Read-Only Sub-Agent

Run GitHub Copilot CLI in read-only mode for code review, research, and investigation tasks.

## How It Works

- Copilot runs non-interactively with `-p` (prompt) and `-s` (silent output)
- Read-only enforced via `--deny-tool='write'` (hard tool-level block) and read-only preamble in prompt
- Uses `--no-ask-user` and `--allow-all-tools` for fully autonomous execution
- Model: `claude-opus-4.6` (primary), auto-fallback to `gpt-4.1` (free tier) on no-quota
- Timeout: 15 minutes

## Cheap variant

If you already know Premium quota is low and want to skip the opus attempt, use `/gcoc` instead — identical behavior but forces the free `gpt-4.1` model from the start.

## Process

### Step 1: Build the Prompt

Take the user's request and use it as the copilot prompt. If the user provides `/gco` with arguments, use those as the prompt directly.

### Step 2: Run Copilot

```bash
LOGDIR=$(node $HOME/.claude/scripts/get-logdir.js)
mkdir -p "$LOGDIR"
DATETIME=$(date +%Y%m%d_%H%M%S)
SLUG="<short-topic-slug>"

bash $HOME/.claude/skills/gco/scripts/gco-run.sh \
  "<prompt>" \
  "$LOGDIR/${DATETIME}-gco-${SLUG}.md" \
  "$LOGDIR/${DATETIME}-gco-${SLUG}-stderr.log"
```

Run as a **background Bash task** with 15-minute timeout.

### Step 3: Collect and Present Results

1. Read the output file (`$LOGDIR/${DATETIME}-gco-${SLUG}.md`)
2. If empty or missing, check stderr log for errors
3. **Check the stderr log for a `GCO_USED_FALLBACK=` line.** If present, `gco-run.sh` auto-retried with `gpt-4.1` because the primary model was out of quota. Notify the user with one line: **"Used gpt-4.1 instead of claude-opus-4.6 because of no quota."** Proceed with the output — it is still valid.
4. Synthesize and present findings to the user
5. Include the log file path for reference

## Important Notes

- Copilot cannot modify files — all writes are done by Claude Code
- NEVER use `~` in paths — use `$HOME`
- Output and stderr go to `$LOGDIR/${DATETIME}-gco-*` (timestamped)
- If copilot is not installed, report "Copilot CLI not found. Install with: gh extension install github/gh-copilot" and fall back to Claude Code tools
