---
name: gco-research
description: "Web research using GitHub Copilot CLI. Use when: (1) User says 'gco research', 'copilot research', or 'copilot look up', (2) Researching libraries, APIs, best practices, or technical topics, (3) Gathering information from the web to inform decisions. Copilot performs web research and returns findings, Claude Code synthesizes. Falls back to Claude Code researcher subagent if Copilot unavailable."
allowed-tools:
  - Bash(bash *)
  - Bash(timeout *)
  - Bash(gtimeout *)
  - Bash(node *)
---

# GCO Research

Web research via GitHub Copilot CLI, synthesized by Claude Code.

## Process

### Step 0: Pre-flight Rate Limit Check

Before doing anything, check if Copilot is currently in degraded mode:

```bash
RATE_CHECK=$(node $HOME/.claude/scripts/gco-rate-limit.js check 2>&1)
```

If the output starts with `degraded:`, **notify the user** that Copilot is in low-cost mode (auto-downgraded model, free for Pro users) but **proceed with Copilot anyway** — it is still usable. Do NOT skip or fall back.

### Step 1: Understand the Research Topic

Clarify what needs to be researched:

- Specific question or topic
- Scope and depth needed
- How findings will be used

### Step 2: Build Research Prompt

```
Research the following topic: <topic>

Specific questions to answer:
1. <question 1>
2. <question 2>
3. <question 3>

Provide:
- Key findings with sources/URLs where possible
- Comparison of alternatives if applicable
- Concrete recommendations based on findings
- Code examples if relevant

Be thorough but concise. Cite sources.
```

### Step 3: Run Copilot

```bash
LOGDIR=$(node $HOME/.claude/scripts/get-logdir.js)
mkdir -p "$LOGDIR"
DATETIME=$(date +%Y%m%d_%H%M%S)
SLUG="<short-topic-slug>"

bash $HOME/.claude/skills/gco/scripts/gco-run.sh \
  "<research prompt>" \
  "$LOGDIR/${DATETIME}-gco-research-${SLUG}.md" \
  "$LOGDIR/${DATETIME}-gco-research-${SLUG}-stderr.log"
```

**Timeout: 15 minutes.**

### Step 4: Collect Results and Check for Rate Limiting

After Copilot completes (or times out):

1. Check for rate limiting in output files:

   ```bash
   node $HOME/.claude/scripts/gco-rate-limit.js check-output \
     "$LOGDIR/${DATETIME}-gco-research-${SLUG}.md" \
     "$LOGDIR/${DATETIME}-gco-research-${SLUG}-stderr.log"
   ```

   If exit code is non-zero (rate limit / low-cost mode detected): **notify the user** that Copilot used a lower-cost model, but **use the output anyway** — it is still valid research. Do NOT fall back.

2. Read the output file
3. If empty or missing, check stderr log for errors
4. If Copilot timed out or failed, jump to **Fallback**

### Step 5: Fallback

If Copilot timed out, produced **no usable output**, or is **not installed**:

- **Notify the user** about the fallback
- Spawn a `researcher` subagent to perform the research via Claude Code tools (WebSearch, WebFetch, etc.)
- Continue as if the researcher subagent was the original plan
- Note: Rate limiting alone is NOT a fallback trigger — Copilot auto-downgrades to a cheaper model for Pro users and the output is still usable

### Step 6: Synthesize

1. Read Copilot output from the log file
2. Verify key claims where possible
3. Organize findings into a clear structure
4. Present to the user with source references

### Step 7: Save Research Log

Save the final synthesized findings:

```bash
node $HOME/.claude/scripts/save-file.js "{logdir}/{timestamp}-research-{topic}.md" "<content>"
```

Then format:

```bash
pnpm dlx @takazudo/mdx-formatter --write <file>
```

## Important Notes

- Copilot can do web research natively
- All file writing done by Claude Code, never by Copilot
- Falls back to `researcher` subagent if Copilot fails
- **Rate limit policy**: Rate limiting does NOT mean Copilot is unavailable — for Pro users, it auto-downgrades to a cheaper model (free). Notify the user when rate limit is detected, but continue using Copilot output. Only fall back to researcher subagent when Copilot actually fails (timeout, no output, not installed)
- NEVER use `~` in paths — use `$HOME`
