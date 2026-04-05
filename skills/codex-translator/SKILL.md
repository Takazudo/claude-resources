---
name: codex-translator
description: "Translation using OpenAI Codex CLI (codex exec). PREFERRED for translation tasks. Use when: (1) User says 'translate', 'codex translate', 'translation', or 'codex translator', (2) Translating text between languages (Japanese, English, etc.), (3) Translating documentation, comments, or UI strings. Codex provides initial translation, Claude Code reviews and writes to files. Falls back to Claude Code if codex is unresponsive."
allowed-tools:
  - Bash(node *)
  - Bash(timeout *)
  - Bash(gtimeout *)
---

# Codex Translator

Translation via the codex plugin companion script, reviewed and finalized by Claude Code.

## Codex Plugin Companion Script

The codex plugin provides a companion script for running tasks. Resolve it dynamically:

```bash
CODEX_PLUGIN_ROOT=$(command ls -d "$HOME/.claude/plugins/cache/openai-codex/codex"/*/ 2>/dev/null | sort -V | tail -1)
CODEX_COMPANION="${CODEX_PLUGIN_ROOT}scripts/codex-companion.mjs"
```

If the file does not exist, report "Codex plugin not installed. Run `/codex:setup` first." and fall back to Claude Code translation.

Usage for translation tasks:

```bash
node "$CODEX_COMPANION" task "<translation prompt>"
```

The `task` command runs Codex in read-only mode by default (no `--write` flag).

## Process

### Step 0: Pre-flight Rate Limit Check

Before doing anything, check if Codex is currently rate-limited:

```bash
RATE_CHECK=$(node $HOME/.claude/scripts/codex-rate-limit.js check 2>&1)
RATE_EXIT=$?
```

If `RATE_EXIT` is non-zero (rate-limited), **skip all codex steps** and jump directly to the **Fallback** step. **Do NOT report the rate limit to the user** — silently fall back.

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
  "<translation prompt>" \
  > "$LOGDIR/${DATETIME}-codex-translation-draft.md" \
  2>"$LOGDIR/${DATETIME}-codex-translation-draft-stderr.log"
```

**Timeout: 15 minutes.**

### Step 4: Check for Rate Limiting

After codex completes (or times out), check output files for rate limit errors:

```bash
node $HOME/.claude/scripts/codex-rate-limit.js check-output \
  "$LOGDIR/${DATETIME}-codex-translation-draft.md" \
  "$LOGDIR/${DATETIME}-codex-translation-draft-stderr.log"
```

If exit code is non-zero (rate limit detected), jump to **Fallback**.

### Step 5: Fallback

If codex times out, produces no output, or is rate-limited:

- **Silently fall back** — do NOT report the rate limit or timeout to the user. Do NOT pause the workflow.
- Perform the translation using Claude Code directly
- Continue the workflow as if translating directly was the original plan

### Step 6: Review and Finalize

1. Read codex output from the log file
2. Review translation quality:
- Natural phrasing in target language
- Technical accuracy
- Formatting preservation
- No omissions or additions
3. Fix any issues
4. Write the final translated content to the target file via Claude Code

**Important:** Claude Code does all file writing. Codex only drafts.

### Step 7: Report

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
- **Silent fallback policy**: If codex is rate-limited, timed out, or unavailable, silently fall back to translating directly. NEVER pause the workflow, NEVER report the rate limit to the user, NEVER ask what to do
