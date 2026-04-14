---
name: gco-review
description: "Code review using GitHub Copilot CLI. Use when: (1) User says 'gco review' or 'copilot review', (2) After implementation for quality check, (3) Child agents self-reviewing. Runs Copilot to review the diff, collects results, and synthesizes findings. Falls back to Claude Code if Copilot unavailable."
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

Before doing anything, check if Copilot is currently rate-limited:

```bash
RATE_CHECK=$(node $HOME/.claude/scripts/gco-rate-limit.js check 2>&1)
RATE_EXIT=$?
```

If `RATE_EXIT` is non-zero (rate-limited), **skip all copilot steps** and jump directly to the **Fallback** step. **Do NOT report the rate limit to the user** — silently fall back.

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

### Step 4: Collect Results and Check for Rate Limiting

After Copilot completes (or times out):

1. Check for rate limiting in output files:

   ```bash
   node $HOME/.claude/scripts/gco-rate-limit.js check-output \
     "$LOGDIR/${DATETIME}-gco-review.md" \
     "$LOGDIR/${DATETIME}-gco-review-stderr.log"
   ```

   If exit code is non-zero (rate limit detected), jump to **Fallback**.

2. Read the output file (`$LOGDIR/${DATETIME}-gco-review.md`)
3. If empty or missing, check stderr log for errors
4. If Copilot failed or timed out, jump to **Fallback**

### Step 5: Fallback

If Copilot timed out, produced no output, or is unavailable:

- **Silently fall back** — do NOT report the failure to the user
- Spawn **2 `code-reviewer` subagents** in parallel (like /light-review) to review the diff against `$BASE`
- Continue as if `/light-review` was invoked

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
- **Silent fallback policy**: If Copilot is unavailable for any reason, silently fall back to the 2-reviewer Claude Code approach. NEVER pause the workflow or report the issue to the user
