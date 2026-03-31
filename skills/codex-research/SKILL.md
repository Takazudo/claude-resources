---
name: codex-research
description: "Web research using OpenAI Codex CLI (codex exec). PREFERRED over general web research tasks. Use when: (1) User says 'research', 'codex research', 'look up', or 'investigate', (2) Researching libraries, APIs, best practices, or technical topics, (3) Gathering information from the web to inform decisions. Codex performs web research and returns findings, Claude Code synthesizes. Falls back to Claude Code researcher subagent if codex is unresponsive."
allowed-tools:
  - Bash(codex *)
  - Bash(timeout *)
  - Bash(gtimeout *)
  - Bash(cat *)
---

# Codex Research

Web research via `codex exec`, synthesized by Claude Code.

## Codex CLI Usage

```bash
codex exec --sandbox read-only --ephemeral -o <output-file> "<research prompt>"
```

Codex can perform web searches and read workspace files for context.

## Process

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

# Detect timeout command (gtimeout on macOS via coreutils, timeout on Linux/WSL)
if command -v gtimeout &>/dev/null; then
  TIMEOUT_CMD="gtimeout"
elif command -v timeout &>/dev/null; then
  TIMEOUT_CMD="timeout"
else
  TIMEOUT_CMD=""
  echo "ERROR: neither gtimeout nor timeout found. On macOS: brew install coreutils | On WSL/Linux: sudo apt install coreutils"
fi

${TIMEOUT_CMD:+$TIMEOUT_CMD} ${TIMEOUT_CMD:+1200} codex exec --sandbox read-only --ephemeral \
  -o "$LOGDIR/${DATETIME}-codex-research-{topic-slug}.md" \
  "<research prompt>" \
  2>"$LOGDIR/${DATETIME}-codex-research-{topic-slug}-stderr.log"
```

**Timeout: 20 minutes.** Research can take longer than other tasks.

### Step 4: Fallback

If codex times out or produces no output:

- Report: "Codex CLI unresponsive. Falling back to Claude Code research."
- Spawn a `researcher` subagent to perform the research via Claude Code tools (WebSearch, WebFetch, etc.)

### Step 5: Synthesize

1. Read codex output from the log file
2. Verify key claims where possible
3. Organize findings into a clear structure
4. Present to the user with source references

### Step 6: Save Research Log

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
- NEVER use `~` in paths — use `$HOME`
