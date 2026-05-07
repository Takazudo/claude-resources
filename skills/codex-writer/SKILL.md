---
name: codex-writer
description: "Document writing using OpenAI Codex CLI (codex exec). PREFERRED over general writing tasks. Use when: (1) User says 'write document', 'write docs', 'codex write', or 'codex writer', (2) Writing README, documentation, or technical content, (3) Drafting text content. Codex drafts, Claude Code reviews and writes. Falls back to Claude Code if codex unresponsive."
allowed-tools:
  - Bash(node *)
  - Bash(timeout *)
  - Bash(gtimeout *)
---

# Codex Writer

Draft documents via the codex plugin companion script, then review and write to files via Claude Code.

## Codex Plugin Companion Script

The codex plugin provides a companion script for running tasks. Resolve it dynamically:

```bash
CODEX_PLUGIN_ROOT=$(command ls -d "$HOME/.claude/plugins/cache/openai-codex/codex"/*/ 2>/dev/null | sort -V | tail -1)
CODEX_COMPANION="${CODEX_PLUGIN_ROOT}scripts/codex-companion.mjs"
```

If the file does not exist, report "Codex plugin not installed. Run `/codex:setup` first." and fall back to Claude Code writing.

Usage for writing tasks:

```bash
node "$CODEX_COMPANION" task "<writing prompt>"
```

The `task` command runs Codex in read-only mode by default (no `--write` flag). Codex reads workspace files for context but Claude Code handles all file writing.

## Process

### Step 0: Pre-flight Rate Limit Check

Before doing anything, check if Codex is currently rate-limited:

```bash
RATE_CHECK=$(node $HOME/.claude/scripts/codex-rate-limit.js check 2>&1)
RATE_EXIT=$?
```

If `RATE_EXIT` is non-zero (rate-limited), **skip all codex steps** and jump directly to the **Fallback** step. **Do NOT report the rate limit to the user** — silently fall back.

### Step 1: Understand the Task

Gather context about what needs to be written:

- Document type (README, API docs, blog post, etc.)
- Target audience
- Files to reference for context

### Step 2: Build Prompt

Build a detailed prompt including:

- What to write
- Context from the codebase (file list, key patterns, existing docs)
- Tone and style guidelines
- Length constraints

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

${TIMEOUT_CMD:+$TIMEOUT_CMD} ${TIMEOUT_CMD:+900} node "$CODEX_COMPANION" task \
  "<detailed prompt here>" \
  > "$LOGDIR/${DATETIME}-codex-writer-draft.md" \
  2>"$LOGDIR/${DATETIME}-codex-writer-draft-stderr.log"
```

**Timeout: 15 minutes.** Codex reads workspace files for context but cannot write.

### Step 4: Check for Rate Limiting

After codex completes (or times out), check output files for rate limit errors:

```bash
node $HOME/.claude/scripts/codex-rate-limit.js check-output \
  "$LOGDIR/${DATETIME}-codex-writer-draft.md" \
  "$LOGDIR/${DATETIME}-codex-writer-draft-stderr.log"
```

If exit code is non-zero (rate limit detected), jump to **Fallback**.

### Step 5: Fallback

If codex times out, produces no output, or is rate-limited:

- **Silently fall back** — do NOT report the rate limit or timeout to the user. Do NOT pause the workflow.
- Draft the document using Claude Code directly, or spawn a `markdown-writer` subagent
- Continue the workflow as if writing directly was the original plan

### Step 6: Review and Refine

1. Read the codex output from the log file
2. Review for quality, accuracy, and adherence to the request
3. Fix any issues, improve structure, correct factual errors
4. Write the final content to the target file using Claude Code

**Important:** Claude Code always does the final file writing. Codex only provides a draft.

### Step 7: Report

Tell the user what was written and where. Include the draft log path for reference.

## Timeout Policy

- **Timeout**: 15 minutes (900s)
- **If codex times out**: Claude Code writes the document directly
- Codex is used for drafting only — Claude Code handles all file operations

## Important Notes

- Codex runs in read-only mode — it cannot create or modify files
- Codex can read workspace files to understand codebase context
- Claude Code reviews all codex output before writing to files
- Draft output saved to `$LOGDIR/codex-writer-draft.md`
- **Silent fallback policy**: If codex is rate-limited, timed out, or unavailable, silently fall back to writing directly. NEVER pause the workflow, NEVER report the rate limit to the user, NEVER ask what to do
