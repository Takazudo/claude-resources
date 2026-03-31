---
name: codex-translator
description: "Translation using OpenAI Codex CLI (codex exec). PREFERRED for translation tasks. Use when: (1) User says 'translate', 'codex translate', 'translation', or 'codex translator', (2) Translating text between languages (Japanese, English, etc.), (3) Translating documentation, comments, or UI strings. Codex provides initial translation, Claude Code reviews and writes to files. Falls back to Claude Code if codex is unresponsive."
allowed-tools:
  - Bash(codex *)
  - Bash(timeout *)
  - Bash(gtimeout *)
  - Bash(cat *)
---

# Codex Translator

Translation via `codex exec`, reviewed and finalized by Claude Code.

## Codex CLI Usage

```bash
codex exec --sandbox read-only --ephemeral -o <output-file> "<translation prompt>"
```

## Process

### Step 1: Understand the Translation Task

- Source language and target language
- Source text (inline, file path, or selection)
- Context (technical docs, UI strings, blog post, etc.)
- Tone preferences (formal, casual, technical)

### Step 2: Build Translation Prompt

```
Translate the following text from <source-lang> to <target-lang>.

Context: <what the text is for — technical documentation, UI, blog, etc.>
Tone: <formal/casual/technical>

Rules:
- Preserve technical terms and code references as-is
- Maintain formatting (markdown, HTML tags, etc.)
- Preserve line breaks and paragraph structure
- Use natural phrasing in the target language

Text to translate:
---
<source text>
---
```

If translating a file, include the file content in the prompt.

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
  -o "$LOGDIR/${DATETIME}-codex-translation-draft.md" \
  "<translation prompt>" \
  2>"$LOGDIR/${DATETIME}-codex-translation-draft-stderr.log"
```

**Timeout: 15 minutes.**

### Step 4: Fallback

If codex times out or produces no output:

- Report: "Codex CLI unresponsive. Translating directly in Claude Code."
- Perform the translation using Claude Code

### Step 5: Review and Finalize

1. Read codex output from the log file
2. Review translation quality:
- Natural phrasing in target language
- Technical accuracy
- Formatting preservation
- No omissions or additions
3. Fix any issues
4. Write the final translated content to the target file via Claude Code

**Important:** Claude Code does all file writing. Codex only drafts.

### Step 6: Report

Present the translation to the user. Include the draft log path.

## Timeout Policy

- **Timeout**: 15 minutes (900s)
- **If codex times out**: Claude Code performs translation directly
- Codex runs read-only — cannot modify files

## Important Notes

- Codex provides the initial translation draft
- Claude Code reviews for quality and handles file operations
- For large translations (entire files), read the file content and include it in the prompt
- Supports any language pair — specify source and target explicitly
