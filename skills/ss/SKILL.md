---
name: ss
description: "Load screenshot images or other files from Dropbox screenshots directory. Use when user invokes /ss directly. NEVER manually list/read files from the screenshots dir — this skill handles Dropbox sync delays, freshness checks, retry logic that manual reads miss. Supports: /ss 2 (latest 2), /ss latest3, /ss filename.png (exact/substring), /ss full-path, /ss a.png b.png (multiple files). Also non-image files (e.g., /ss pattern-4-variations.html)."
disable-model-invocation: false
argument-hint: "[N | latestN | filename | file1 file2 ...]"
allowed-tools: Read, Bash(ls *), Bash(find *), Bash(for *), Bash(stat *), Bash(sleep *)
---

# Screenshot Loader

Load screenshot images or other files from the Dropbox screenshots directory and present them in the conversation. Also supports non-image files (HTML, text, etc.) that the user shares via this directory.

## Resolve screenshots directory

Use `$DROPBOX_SCREENSHOTS_DIR` env var (set in `.zshrc` for both macOS and WSL2).

## Invocation timestamp

The following epoch was captured at the moment this command was invoked:

**Invocation epoch:** !`date +%s`

Use this as a cutoff for "Latest N" mode — only consider image files whose modification time is **<= this epoch**. This prevents picking up screenshots that appeared after the user typed `/ss`.

## Parse arguments

`$ARGUMENTS` determines which files to load:

| Pattern | Meaning | Example |
| --- | --- | --- |
| Bare number (`2`, `3`) | Latest N images at invocation time | `/ss 2` |
| `latestN` | Latest N images at invocation time | `/ss latest3` |
| Full path starting with `/` | Exact file | `/ss '/Users/.../file.png'` |
| Non-image filename (`.html`, `.txt`, etc.) | Read a non-image file from screenshots dir | `/ss pattern-4-variations.html` |
| Other string (exact) | Exact filename in screenshots dir | `/ss Screenshot 2026-03-14 at 3.27.17.png` |
| Other string (partial) | Substring search in filenames | `/ss foo-bar-moo.png` |
| **Multiple filenames** | Load every named file (see below) | `/ss a.png b.png c.html` |
| (empty) | Latest 1 image | `/ss` |

**Default:** When `$ARGUMENTS` is empty or blank, treat it as `1` (load the latest single screenshot). This is the most common use case.

## Multi-file detection

Filenames can themselves contain spaces (`Screenshot 2026-03-14 at 3.27.17.png`), so a plain "split on whitespace" is wrong. Decide single vs. multiple with this algorithm, in order:

1. **Whole-string exact match wins.** If `$DROPBOX_SCREENSHOTS_DIR/$ARGUMENTS` exists as a file (or `$ARGUMENTS` is an existing absolute path), it is ONE file. Stop — never split it.
2. **Latest-N forms are never multi.** A bare number or `latestN` stays in Latest N mode.
3. **Group by extension boundary.** Split `$ARGUMENTS` on whitespace, then walk the tokens left to right, accumulating them into the current group. When a token ends with a known file extension (`.png .jpg .jpeg .gif .webp .tiff .html .txt .json .css .js .svg .md`, case-insensitive), close the current group and start a new one.
- Tokens left over at the end (a trailing run with no extension) mean the split is unreliable — discard the grouping and treat `$ARGUMENTS` as a single filename.
- If exactly **one** group results → single-file mode (existing behavior).
- If **two or more** groups result → multi-file mode: each group is one filename.
4. **Quotes are explicit separators.** If the user quoted arguments (`/ss 'a b.png' 'c d.png'`), respect the quoting and treat each quoted string as one filename regardless of extensions.
5. **Commas also separate.** If `$ARGUMENTS` contains commas between filename-looking chunks (`/ss a.png, b.png`), split on commas and trim.

Worked examples:

| Input | Result |
| --- | --- |
| `foo.png bar.png` | 2 files: `foo.png`, `bar.png` |
| `Screenshot 2026-03-14 at 3.27.17.png` | 1 file (only one extension token) |
| `Screenshot 2026-03-14 at 3.27.17.png other.png` | 2 files: `Screenshot 2026-03-14 at 3.27.17.png`, `other.png` |
| `a.png b.png c.html` | 3 files, the last read as text |
| `foo-bar-moo` | 1 file (no extension token → whole string) |
| `2` | Latest 2 images (not multi) |

## Multi-file mode

Resolve **each** filename independently using the existing single-file rules — exact match first, then substring search (with plural/singular variants), then the retry loop for Dropbox sync. Non-image entries are read as text; image entries are read visually.

- Resolve all entries before presenting, so the user sees one combined result.
- If some entries resolve and others do not, present the ones that resolved and list the unresolved names explicitly. Never silently drop a name the user typed.
- Preserve the order the user typed the filenames in when presenting.

**Non-image files:** When the argument has a non-image extension (e.g., `.html`, `.txt`, `.json`, `.css`, `.js`, `.svg`, `.md`), look for that file in `$DROPBOX_SCREENSHOTS_DIR` and read it as a text file using the Read tool. This is for when the user shares files (not just screenshots) via the Dropbox screenshots directory.

## Portable mtime helper

`$DROPBOX_SCREENSHOTS_DIR` syncs to both macOS (BSD `stat`) and WSL2/Linux (GNU `stat`), and their flags for "modification time as epoch seconds" differ (`stat -f %m` vs `stat -c %Y`). Naively falling back with `stat -f %m "$f" 2>/dev/null || stat -c %Y "$f"` is not safe: GNU `stat -f` means "show filesystem status" (not "format"), so it still exits non-zero but leaks a garbage filesystem-info block to stdout first, corrupting the captured value. Define this function once at the top of any bash snippet below that needs a file's mtime — each Bash tool call runs in a fresh shell, so redefine it per invocation:

```bash
mtime_of() {
  local m
  m=$(stat -f %m "$1" 2>/dev/null)
  if [ $? -ne 0 ] || [ -z "$m" ]; then
    m=$(stat -c %Y "$1" 2>/dev/null)
  fi
  echo "$m"
}
```

All `stat` calls below use this `mtime_of` helper instead of calling `stat` directly.

## Find files

### Latest N images (with timestamp cutoff)

List all image files (png, jpg, jpeg, gif, webp, tiff) in the screenshots directory, filter to only those with modification time <= the invocation epoch, sort by modification time descending, take the first N.

```bash
CUTOFF=<invocation_epoch>
ls -t "$DROPBOX_SCREENSHOTS_DIR"/*.{png,jpg,jpeg,gif,webp,tiff} 2>/dev/null | while IFS= read -r f; do
  [ "$(mtime_of "$f")" -le "$CUTOFF" ] && echo "$f"
done | head -n $N
```

This ensures that even if new screenshots appear while Claude is processing, only files that existed at invocation time are selected.

### Non-image file

When the argument has a non-image extension (not `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.tiff`):

1. Look for the exact file at `$DROPBOX_SCREENSHOTS_DIR/<filename>`
2. If not found, do a substring search across **all** files (not just images) in the directory
3. Read the file with the Read tool (it will be read as text, not presented visually)

### Specific filename (image)

1. First, try exact match: `$DROPBOX_SCREENSHOTS_DIR/<filename>`
2. If the exact file does not exist, perform a **substring search** across all image files in the screenshots directory:
- Strip the extension from the argument to get the search term (e.g., `foo-bar-moo.png` → `foo-bar-moo`)
- Search filenames (case-insensitive) that contain the search term as a substring
- Also try **plural/singular variants**: if the search term contains a word, try both its singular and plural forms (e.g., `screenshot` ↔ `screenshots`, `image` ↔ `images`)
- If multiple files match, pick the most recently modified one
- If no matches found, proceed to the "Wait for file" step using the exact path

```bash
# Substring search example
SEARCH="foo-bar-moo"
find "$DROPBOX_SCREENSHOTS_DIR" -maxdepth 1 -type f \( -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.gif" -o -iname "*.webp" -o -iname "*.tiff" \) -iname "*${SEARCH}*" -print0 | xargs -0 ls -t 2>/dev/null | head -n 1
```

### Full path

Use the path as-is.

## Wait for file — Dropbox sync delay handling

The user typically takes a screenshot and immediately runs `/ss`. Dropbox sync introduces a delay of a few seconds (sometimes longer), so the file may not exist locally yet. This section handles that proactively.

### Initial delay for "Latest N" mode

For "Latest N" mode (bare number, `latestN`, or empty argument), **always sleep 3 seconds before the first file lookup**. This gives Dropbox a moment to sync the new screenshot. This simple delay avoids the most common case where old files are returned because the new one hasn't arrived yet.

```bash
# Always do this before the first file listing in "Latest N" mode
sleep 3
```

### Freshness check for "Latest N" mode

After listing files, check whether the results are **fresh enough** relative to the invocation epoch. A screenshot the user just took should have a modification time within ~60 seconds of the invocation epoch.

**Freshness rule:** At least one of the N files must have a modification time within 120 seconds before the invocation epoch. If ALL files are older than 120 seconds before the invocation epoch, the user's new screenshot likely hasn't synced yet — retry.

```bash
CUTOFF=<invocation_epoch>
FRESHNESS_THRESHOLD=$((CUTOFF - 120))
# After getting the N files, check the newest one:
NEWEST_MTIME=$(mtime_of "$NEWEST_FILE")
if [ "$NEWEST_MTIME" -lt "$FRESHNESS_THRESHOLD" ]; then
  # All results are stale — the new screenshot hasn't synced yet, retry
fi
```

### Retry loop

If the file is not found (specific filename mode) or the freshness check fails (Latest N mode), poll with retries:

1. **Poll every 5 seconds** for up to **2 minutes** (24 attempts)
2. For **specific filename mode**: check if the target file exists (`[ -f "$TARGET" ]`)
3. For **"Latest N" mode**: re-list files and re-check the freshness rule (at least one file within 120 seconds of invocation epoch)
4. If the file appears or freshness check passes during polling, proceed normally
5. If timeout is reached, report that the file was not found (or that only older files were found) and ask the user to confirm

For **multi-file mode**, run one shared retry loop that checks all still-missing targets each round, and break as soon as every target exists — do not run a full 2-minute loop per file in sequence.

```bash
# Multi-file mode: TARGETS is a newline-separated list of resolved paths
for i in $(seq 1 24); do
  MISSING=$(printf '%s\n' "$TARGETS" | while IFS= read -r t; do [ -f "$t" ] || echo "$t"; done)
  [ -z "$MISSING" ] && break
  sleep 5
done
```

```bash
# Specific filename mode
for i in $(seq 1 24); do
  [ -f "$TARGET" ] && break
  sleep 5
done

# Latest N mode (after initial 3-second delay already elapsed)
for i in $(seq 1 24); do
  # Re-run the file listing and freshness check
  FILES=$(ls -t "$DROPBOX_SCREENSHOTS_DIR"/*.{png,jpg,jpeg,gif,webp,tiff} 2>/dev/null | while IFS= read -r f; do
    [ "$(mtime_of "$f")" -le "$CUTOFF" ] && echo "$f"
  done | head -n $N)
  NEWEST=$(echo "$FILES" | head -n 1)
  [ -n "$NEWEST" ] && [ "$(mtime_of "$NEWEST")" -ge "$FRESHNESS_THRESHOLD" ] && break
  sleep 5
done
```

### Summary of the wait flow for "Latest N" mode

1. Sleep 3 seconds (initial delay)
2. List files, apply timestamp cutoff, take top N
3. Check freshness: is the newest file within 120 seconds of invocation epoch?
4. If fresh enough, proceed to present files
5. If stale, enter retry loop (poll every 5s, up to 2 minutes)
6. If timeout, present what was found but warn the user that these may be older files

## Present the files

Use the Read tool to read each file. The Read tool supports reading image files (PNG, JPG, etc.) visually, and text files as content. In multi-file mode, read every resolved file — one Read per file — before responding.

After reading, briefly acknowledge which file(s) were loaded (filename only, not full path) and ask what the user would like to do with them.

## CRITICAL: Relevance check — never silently ignore loaded files

**After presenting files, you MUST treat them as the user's intended files.** The user just took these screenshots and ran `/ss` — they expect you to work with whatever was loaded.

**NEVER do this:**

- Load files, decide they "don't seem related," and ignore them
- Skip the screenshots and continue with the conversation as if `/ss` wasn't invoked
- Say "these don't appear to be relevant" and move on

**The user's screenshots ARE the context.** Even if the content seems unrelated to the prior conversation, the user may be introducing new context, switching topics, or showing something you don't yet understand.

### If files seem potentially mismatched (e.g., clearly old/stale screenshots)

Only if the files are **obviously stale** (e.g., timestamps are many hours old, content is clearly from a different session), follow this two-step recovery:

**Step 1: Wait and recheck (Dropbox sync delay)**

The user's actual screenshot may still be syncing. Wait 2 minutes, then re-list the directory for newer files:

```bash
# Wait for potential Dropbox sync delay
sleep 120

# Re-check for newly synced files (allow mtime up to 180s after invocation epoch)
LATE_CUTOFF=$((CUTOFF + 180))
ls -t "$DROPBOX_SCREENSHOTS_DIR"/*.{png,jpg,jpeg,gif,webp,tiff} 2>/dev/null | while IFS= read -r f; do
  MTIME=$(mtime_of "$f")
  [ "$MTIME" -le "$LATE_CUTOFF" ] && [ "$MTIME" -gt "$CUTOFF" ] && echo "[NEW] $f"
done | head -n 3
```

If new files appeared, read and present them — these are likely the intended screenshots.

**Step 2: Ask the user**

If no new files appeared after waiting, present what you have and **ask the user to confirm**:

> "I loaded [filenames]. These screenshots appear to be from [timestamp]. Are these the ones you meant, or should I wait longer for a newer screenshot to sync?"

**Never skip both steps.** If you suspect the files are wrong, you MUST either wait-and-recheck OR ask the user. Silently ignoring the user's `/ss` invocation is never acceptable.
