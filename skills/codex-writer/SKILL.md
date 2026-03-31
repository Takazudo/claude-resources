---
name: codex-writer
description: "Document writing assistance using OpenAI Codex CLI (codex exec). PREFERRED over general writing tasks. Use when: (1) User says 'write document', 'write docs', 'codex write', or 'codex writer', (2) Writing README, documentation, or technical content, (3) Drafting text content that benefits from a second AI perspective. Codex drafts content, Claude Code reviews and writes to files. Falls back to Claude Code if codex is unresponsive."
allowed-tools:
  - Bash(codex *)
  - Bash(timeout *)
  - Bash(gtimeout *)
  - Bash(cat *)
---

# Codex Writer

Draft documents via `codex exec`, then review and write to files via Claude Code.

## Codex CLI Usage

```bash
codex exec --sandbox read-only --ephemeral -o <output-file> "<prompt>"
```

Key flags:

- `--sandbox read-only`: Codex cannot write files
- `--ephemeral`: No session persistence
- `-o <file>`: Capture output to file

## Process

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

# Detect timeout command (gtimeout on macOS via coreutils, timeout on Linux/WSL)
if command -v gtimeout &>/dev/null; then
  TIMEOUT_CMD="gtimeout"
elif command -v timeout &>/dev/null; then
  TIMEOUT_CMD="timeout"
else
  TIMEOUT_CMD=""
  echo "ERROR: neither gtimeout nor timeout found. On macOS: brew install coreutils | On WSL/Linux: sudo apt install coreutils"
fi

${TIMEOUT_CMD:+$TIMEOUT_CMD} ${TIMEOUT_CMD:+900} codex exec --sandbox read-only --ephemeral \
  -o "$LOGDIR/${DATETIME}-codex-writer-draft.md" \
  "<detailed prompt here>" \
  2>"$LOGDIR/${DATETIME}-codex-writer-draft-stderr.log"
```

**Timeout: 15 minutes.** Codex reads workspace files for context but cannot write.

### Step 4: Fallback

If codex times out or produces no output:

- Report: "Codex CLI unresponsive. Writing document directly in Claude Code."
- Draft the document using Claude Code instead

### Step 5: Review and Refine

1. Read the codex output from `$LOGDIR/codex-writer-draft.md`
2. Review for quality, accuracy, and adherence to the request
3. Fix any issues, improve structure, correct factual errors
4. Write the final content to the target file using Claude Code

**Important:** Claude Code always does the final file writing. Codex only provides a draft.

### Step 6: Report

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
