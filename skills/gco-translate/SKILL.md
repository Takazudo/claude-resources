---
name: gco-translate
description: "Translation using GitHub Copilot CLI (free GPT-4.1 tier). PREFERRED when Codex quota is low. Use when: (1) User says 'gco translate', 'copilot translate', or '/gco-translate', (2) Translating text between languages (Japanese, English, etc.), (3) Translating documentation, comments, or UI strings with zero token cost. Copilot provides initial translation draft, Claude Code reviews and writes to files. Falls back to Claude Code if Copilot is unresponsive or rate-limited."
user-invocable: true
allowed-tools:
  - Bash(bash *)
  - Bash(node *)
  - Bash(timeout *)
  - Bash(gtimeout *)
---

# gco-translate

Translation via GitHub Copilot CLI (`gco-pure.sh`), reviewed and finalized by Claude Code. Uses GPT-4.1 on the free Copilot tier.

## Companion Script

```bash
GCO_PURE="$HOME/.claude/skills/gco/scripts/gco-pure.sh"
```

If the file does not exist or is not executable, report "gco-pure.sh not found. Ensure base/copilot-text-tools branch is merged." and fall back to Claude Code translation.

`gco-pure.sh` passes **zero tool flags** to Copilot — the model cannot read files or execute code. All file I/O is handled by Claude Code.

## Process

### Step 0: Copilot Mode Check

Check Copilot's current rate-limit state (informational only):

```bash
RATE_CHECK=$(node "$HOME/.claude/scripts/gco-rate-limit.js" check 2>&1)
```

`gco-rate-limit.js check` always exits 0. Output is either `ok` or `degraded: …` (Copilot in low-cost mode, still usable). Proceed regardless — this is informational context only.

### Step 1: Understand the Translation Task

- Source language and target language
- Source text (inline argument, file path, or selection)
- Context (technical docs, UI strings, blog post, etc.)
- Tone preferences (formal, casual, technical)

**Inline syntax**: `/gco-translate translate "hello" from en to ja`
**File syntax**: `/gco-translate translate path/to/source.md from en to ja`

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

For file translation: Claude reads the source file content first. For content over ~100KB, write it to a temp file and pass as the second positional arg to `gco-pure.sh`.

### Step 3: Run Copilot

```bash
GCO_PURE="$HOME/.claude/skills/gco/scripts/gco-pure.sh"
LOGDIR=$(node "$HOME/.claude/scripts/get-logdir.js")
mkdir -p "$LOGDIR"
DATETIME=$(date +%Y%m%d_%H%M%S)

DRAFT_LOG="$LOGDIR/${DATETIME}-gco-translate-draft.md"
STDERR_LOG="$LOGDIR/${DATETIME}-gco-translate-draft-stderr.log"

# Guard: ensure gco-pure.sh exists — if missing, skip to Step 5 (fallback)
if [ ! -x "$GCO_PURE" ]; then
  echo "gco-pure.sh not found or not executable: $GCO_PURE" >&2
  exit 1  # caller (Claude) catches this and proceeds to Step 5
fi

# Inline translation: pipe source text via stdin
printf '%s' "<source text>" \
  | bash "$GCO_PURE" "<translation prompt>" \
  > "$DRAFT_LOG" \
  2>"$STDERR_LOG"

# File translation (preferred for files, avoids shell-escaping issues):
# bash "$GCO_PURE" "<translation prompt>" "<source-file-path>" \
#   > "$DRAFT_LOG" \
#   2>"$STDERR_LOG"
```

`gco-pure.sh` handles its own 15-minute internal timeout. No outer timeout needed.

### Step 4: Check for Rate Limiting or Empty Output

After Copilot completes, check output files:

```bash
node "$HOME/.claude/scripts/gco-rate-limit.js" check-output \
  "$DRAFT_LOG" \
  "$STDERR_LOG"
RATE_OUT_EXIT=$?
```

**If `RATE_OUT_EXIT` is non-zero** (rate limit pattern detected), proceed to **Step 5: Fallback**.

Then check if draft output is empty:

```bash
DRAFT_CONTENT=$(cat "$DRAFT_LOG" 2>/dev/null)
```

**If `DRAFT_CONTENT` is empty or blank**, proceed to **Step 5: Fallback**. Do not continue to Step 6 with an empty draft.

### Step 5: Fallback

If `gco-pure.sh` is not found, Copilot times out, produces no output, or rate limit is detected:

- **Silently fall back** — do NOT report the rate limit or timeout to the user. Do NOT pause the workflow.
- Perform the translation using Claude Code directly
- Continue the workflow as if translating directly was the original plan

### Step 6: Review and Finalize

1. Read Copilot output from the draft log file (or use Claude's direct translation if fallback)
2. Review translation quality:
- Natural phrasing in target language
- Technical accuracy
- Formatting preservation (markdown, code blocks, HTML)
- No omissions or additions
3. Fix any issues

**For inline translation**: output the final translation to stdout.

**For file translation**: Claude writes the output file directly. Copilot never touches the filesystem.

### Step 7: Report

Present the translation to the user. For file translation, show the output file path. Include the draft log path for debugging.

## Timeout Policy

- `gco-pure.sh` has an internal 15-minute (900s) timeout — no outer wrapper needed
- **If Copilot times out or produces no output**: Claude Code translates directly
- `gco-pure.sh` runs with `--available-tools` (empty list) — zero tool access to Copilot

## Important Notes

- Copilot provides the initial translation draft; Claude Code reviews for quality and handles all file operations
- For large source files (>100KB), use the `gco-pure.sh "<prompt>" "<file-path>"` form (second positional arg) instead of stdin to avoid shell-escaping issues
- Supports any language pair — specify source and target explicitly
- **Silent fallback policy**: If Copilot is rate-limited, timed out, or unavailable, silently fall back to translating directly. NEVER pause the workflow, NEVER report the rate limit to the user, NEVER ask what to do
- Draft log is always saved to `$LOGDIR/${DATETIME}-gco-translate-draft.md` for debugging even in fallback scenarios
