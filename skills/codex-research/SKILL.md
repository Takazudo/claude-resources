---
name: codex-research
description: "Web research using OpenAI Codex CLI (codex exec). PREFERRED over general web research. Use when: (1) User says 'research', 'codex research', 'look up', or 'investigate', (2) Researching libraries, APIs, best practices, or technical topics, (3) Gathering information from the web. Codex performs research, Claude Code synthesizes. Falls back to Claude Code researcher subagent if codex unresponsive."
allowed-tools:
  - Bash(node *)
  - Bash(timeout *)
  - Bash(gtimeout *)
---

# Codex Research

Web research via the codex plugin companion script, synthesized by Claude Code.

## Codex Plugin Companion Script

The codex plugin provides a companion script for running tasks. Resolve it dynamically:

```bash
CODEX_PLUGIN_ROOT=$(command ls -d "$HOME/.claude/plugins/cache/openai-codex/codex"/*/ 2>/dev/null | sort -V | tail -1)
CODEX_COMPANION="${CODEX_PLUGIN_ROOT}scripts/codex-companion.mjs"
```

If the file does not exist, report "Codex plugin not installed. Run `/codex:setup` first." and fall back to Claude Code research.

Usage for research tasks:

```bash
node "$CODEX_COMPANION" task "<research prompt>"
```

The `task` command runs Codex in read-only mode by default (no `--write` flag), which is appropriate for research.

## Process

### Step 0: Pre-flight Rate Limit Check

Before doing anything, check if Codex is currently rate-limited:

```bash
RATE_CHECK=$(node $HOME/.claude/scripts/codex-rate-limit.js check 2>&1)
RATE_EXIT=$?
```

If `RATE_EXIT` is non-zero (rate-limited), **skip all codex steps** and jump directly to the **Fallback** step. **Do NOT report the rate limit to the user** — silently fall back.

### Step 1: Understand the Research Topic

Clarify what needs to be researched:

- Specific question or topic
- Scope and depth needed
- How findings will be used

### Step 2: Build Research Prompt

Craft a focused prompt:

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

### Step 3: Run Codex

```bash
LOGDIR=$(node $HOME/.claude/scripts/get-logdir.js)
mkdir -p "$LOGDIR"
DATETIME=$(date +%Y%m%d_%H%M%S)

# Resolve codex companion script
CODEX_PLUGIN_ROOT=$(command ls -d "$HOME/.claude/plugins/cache/openai-codex/codex"/*/ 2>/dev/null | sort -V | tail -1)
CODEX_COMPANION="${CODEX_PLUGIN_ROOT}scripts/codex-companion.mjs"

# Detect timeout command (gtimeout on macOS via coreutils, timeout on Linux/WSL)
if command -v gtimeout &>/dev/null; then
  TIMEOUT_CMD="gtimeout"
elif command -v timeout &>/dev/null; then
  TIMEOUT_CMD="timeout"
else
  TIMEOUT_CMD=""
  echo "WARNING: neither gtimeout nor timeout found. Running without timeout."
fi

${TIMEOUT_CMD:+$TIMEOUT_CMD} ${TIMEOUT_CMD:+1200} node "$CODEX_COMPANION" task \
  "<research prompt>" \
  > "$LOGDIR/${DATETIME}-codex-research-{topic-slug}.md" \
  2>"$LOGDIR/${DATETIME}-codex-research-{topic-slug}-stderr.log"
```

**Timeout: 20 minutes.** Research can take longer than other tasks.

### Step 4: Check for Rate Limiting

After codex completes (or times out), check output files for rate limit errors:

```bash
node $HOME/.claude/scripts/codex-rate-limit.js check-output \
  "$LOGDIR/${DATETIME}-codex-research-{topic-slug}.md" \
  "$LOGDIR/${DATETIME}-codex-research-{topic-slug}-stderr.log"
```

If exit code is non-zero (rate limit detected), jump to **Fallback**.

### Step 5: Fallback

If codex times out, produces no output, or is rate-limited:

- **Silently fall back** — do NOT report the rate limit or timeout to the user. Do NOT pause the workflow.
- Spawn a `researcher` subagent to perform the research via Claude Code tools (WebSearch, WebFetch, etc.)
- Continue the workflow as if the researcher subagent was the original plan

### Step 6: Synthesize

1. Read codex output from the log file
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

## Timeout Policy

- **Timeout**: 20 minutes (1200s) — research needs more time than other tasks
- **If codex times out**: Fall back to Claude Code `researcher` subagent
- Research is read-only — codex cannot modify files

## Important Notes

- Codex can do web research natively
- All file writing done by Claude Code, never by codex
- Long timeout (20 min) because research can take time
- Falls back to `researcher` subagent if codex fails
- **Silent fallback policy**: If codex is rate-limited, timed out, or unavailable, silently fall back to the researcher subagent. NEVER pause the workflow, NEVER report the rate limit to the user, NEVER ask what to do
- NEVER use `~` in paths — use `$HOME`
