---
name: gco-review
description: "Code review using GitHub Copilot CLI. Use when: (1) User says 'gco review' or 'copilot review', (2) After implementation for quality check, (3) Child agents self-reviewing. Runs Copilot to review the diff, synthesizes findings. Falls back to Claude Code if Copilot unavailable."
allowed-tools:
  - Bash(bash *)
  - Bash(timeout *)
  - Bash(gtimeout *)
  - Bash(node *)
  - Bash(git *)
  - Bash(gh *)
---

# GCO Review

Code review via GitHub Copilot CLI, synthesized by Claude Code.

## Process

### Step 0: Pre-flight Rate Limit Check

Before doing anything, check if Copilot is currently in degraded mode:

```bash
RATE_CHECK=$(node $HOME/.claude/scripts/gco-rate-limit.js check 2>&1)
```

If the output starts with `degraded:`, **notify the user** that Copilot is in low-cost mode (auto-downgraded model, free for Pro users) but **proceed with Copilot anyway** — it is still usable. Do NOT skip or fall back.

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

Generate the diff and build a review prompt:

```bash
DIFF=$(git diff "$BASE"...HEAD)
```

Construct the prompt:

```
Review the following code changes (diff against $BASE branch).

Focus on:
1. Bugs, logic errors, and potential runtime failures
2. Security vulnerabilities (injection, XSS, auth issues)
3. Performance problems
4. Missing error handling at system boundaries
5. Breaking changes or regressions

For each finding, provide:
- File and approximate location
- Severity (high/medium/low)
- What the issue is and why it matters
- Suggested fix

Be concise. If the code looks good, say so briefly — don't invent problems.

Diff:
<the diff content>
```

### Step 3: Run Copilot

```bash
LOGDIR=$(node $HOME/.claude/scripts/get-logdir.js)
mkdir -p "$LOGDIR"
DATETIME=$(date +%Y%m%d_%H%M%S)

bash $HOME/.claude/skills/gco/scripts/gco-run.sh \
  "<prompt>" \
  "$LOGDIR/${DATETIME}-gco-review.md" \
  "$LOGDIR/${DATETIME}-gco-review-stderr.log"
```

Run as a **background Bash task** with 15-minute timeout.

### Step 4: Collect Results and Check for Quota Fallback

After Copilot completes (or times out):

1. **Check for quota fallback** — grep the stderr log for `GCO_USED_FALLBACK=`:

   ```bash
   grep '^GCO_USED_FALLBACK=' "$LOGDIR/${DATETIME}-gco-review-stderr.log"
   ```

   If found, `gco-run.sh` auto-retried with `gpt-4.1` because the primary model was out of quota. **Notify the user** with one line: **"Used gpt-4.1 instead of claude-opus-4.6 because of no quota."** Proceed — the output is still valid.

2. Read the output file (`$LOGDIR/${DATETIME}-gco-review.md`)
3. If empty or missing, check stderr log for errors
4. If Copilot failed or timed out, jump to **Fallback**

### Step 5: Fallback

If Copilot timed out, produced **no usable output**, or is **not installed**:

- **Notify the user** about the fallback
- Spawn **2 `code-reviewer` subagents** in parallel (like /light-review) to review the diff against `$BASE`
- Continue as if `/light-review` was invoked
- Note: Quota exhaustion alone is NOT a fallback trigger — `gco-run.sh` auto-retries with `gpt-4.1` (free) and produces valid output

### Step 6: Synthesize and Report

1. Read output and organize findings
2. Categorize by priority (high / medium / low)
3. Present a clear summary
4. Include log file paths for reference

### Step 7: Apply Fixes

- **High priority**: Implement automatically
- **Medium priority**: Implement if clearly safe, otherwise ask
- **Low priority**: Ask user

### Step 8: Commit Changes

If fixes were applied, commit with a descriptive message.

## Important Notes

- Copilot cannot modify files — all writes done by Claude Code
- NEVER use `~` in paths — use `$HOME`
- Output files: `$LOGDIR/${DATETIME}-gco-review.md` (timestamped)
- **Quota fallback policy**: When the primary model returns HTTP 402 no-quota, `gco-run.sh` automatically retries with `gpt-4.1` (free zero-multiplier model on the Pro plan) and writes `GCO_USED_FALLBACK=gpt-4.1 ...` to the stderr file. Claude MUST check stderr for this marker and tell the user "Used gpt-4.1 instead of claude-opus-4.6 because of no quota." Output is still valid — do not fall back to 2-reviewer Claude Code unless Copilot actually fails (timeout, no output, not installed)
- **Cheap variant**: Use `/gcoc-review` to skip opus entirely and run gpt-4.1 from the start
