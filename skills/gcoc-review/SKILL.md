---
name: gcoc-review
description: "Code review using GitHub Copilot CLI cheap mode — same as /gco-review but forces the free gpt-4.1 model. Use when: (1) User says 'gcoc review' or 'copilot cheap review', (2) Premium quota is exhausted and you want zero Premium consumption, (3) Diff is small/simple."
allowed-tools:
  - Bash(bash *)
  - Bash(timeout *)
  - Bash(gtimeout *)
  - Bash(node *)
  - Bash(git *)
  - Bash(gh *)
---

# GCOC Review (Cheap)

Same behavior as [/gco-review](../gco-review/SKILL.md) — Copilot-driven code review synthesized by Claude Code — but forces `gpt-4.1` from the start. No Premium Requests consumed.

## How It Differs from /gco-review

- Model: `gpt-4.1` (forced via `GCO_MODEL=gpt-4.1`)
- Skip the `GCO_USED_FALLBACK=` stderr check — it's the user's deliberate choice, not a fallback

## Process

Follow the exact same process as [/gco-review](../gco-review/SKILL.md), but prefix the `gco-run.sh` invocation with `GCO_MODEL=gpt-4.1`.

### Step 1: Determine Base Branch

```bash
BRANCH=$(git branch --show-current)
BASE=$(gh pr view --json baseRefName -q '.baseRefName' 2>/dev/null)
```

If no PR, use default branch:

```bash
BASE=$(git remote show origin | grep 'HEAD branch' | awk '{print $NF}')
```

### Step 2: Build Review Prompt

Generate the diff and build a review prompt (identical to /gco-review — focus on bugs, security, performance, error handling, breaking changes).

### Step 3: Run Copilot with forced cheap model

```bash
LOGDIR=$(node $HOME/.claude/scripts/get-logdir.js)
mkdir -p "$LOGDIR"
DATETIME=$(date +%Y%m%d_%H%M%S)

GCO_MODEL=gpt-4.1 \
  bash $HOME/.claude/skills/gco/scripts/gco-run.sh \
  "<prompt>" \
  "$LOGDIR/${DATETIME}-gcoc-review.md" \
  "$LOGDIR/${DATETIME}-gcoc-review-stderr.log"
```

Run as a **background Bash task** with 15-minute timeout.

### Step 4: Collect and Categorize

1. Read the output file
2. If empty or missing, check stderr log; if Copilot timed out or failed, jump to **Fallback**
3. Do NOT check for `GCO_USED_FALLBACK=` marker — the cheap model is intentional, not a fallback

### Step 5: Fallback

Same as /gco-review — if Copilot timed out, produced no output, or is not installed, spawn 2 `code-reviewer` subagents to review the diff against `$BASE`.

### Step 6: Synthesize and Report

Organize findings by priority (high / medium / low), present a clear summary, include log file paths.

### Step 7: Apply Fixes

- **High priority**: Implement automatically
- **Medium priority**: Implement if clearly safe, otherwise ask
- **Low priority**: Ask user

### Step 8: Commit Changes

If fixes were applied, commit with a descriptive message.

## Important Notes

- Copilot cannot modify files — all writes done by Claude Code
- NEVER use `~` in paths — use `$HOME`
- Output files: `$LOGDIR/${DATETIME}-gcoc-review.md` (timestamped)
- `gpt-4.1` has zero Premium multiplier on the Pro plan — safe to use when quota is tight
