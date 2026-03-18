---
name: ss
description: >-
  Load screenshot images or other files from Dropbox screenshots directory. Use when user invokes /ss directly.
  Supports /ss 2 (latest 2 images), /ss latest3, /ss filename.png (exact or substring match), /ss full-path.
  Also supports non-image files (e.g., /ss pattern-4-variations.html) to read files shared via the screenshots dir.
disable-model-invocation: true
argument-hint: "[N | latestN | filename]"
allowed-tools: Read, Bash(ls *), Bash(find *), Bash(for *), Bash(stat *)
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
| (empty) | Latest 1 image | `/ss` |

**Default:** When `$ARGUMENTS` is empty or blank, treat it as `1` (load the latest single screenshot). This is the most common use case.

**Non-image files:** When the argument has a non-image extension (e.g., `.html`, `.txt`, `.json`, `.css`, `.js`, `.svg`, `.md`), look for that file in `$DROPBOX_SCREENSHOTS_DIR` and read it as a text file using the Read tool. This is for when the user shares files (not just screenshots) via the Dropbox screenshots directory.

## Find files

### Latest N images (with timestamp cutoff)

List all image files (png, jpg, jpeg, gif, webp, tiff) in the screenshots directory, filter to only those with modification time <= the invocation epoch, sort by modification time descending, take the first N.

```bash
CUTOFF=<invocation_epoch>
ls -t "$DROPBOX_SCREENSHOTS_DIR"/*.{png,jpg,jpeg,gif,webp,tiff} 2>/dev/null | while IFS= read -r f; do
  [ "$(stat -f %m "$f")" -le "$CUTOFF" ] && echo "$f"
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

## Wait for file if not found

The user is confident the file exists or is being created (e.g., just took a screenshot). If the target file does not exist yet:

1. Poll every 5 seconds using `ls` to check if the file appears
2. Continue polling for up to 5 minutes (60 attempts)
3. For "latest N" mode, also retry if fewer than N image files have modification time <= the cutoff
4. If the file appears during polling, proceed normally
5. If timeout is reached, report that the file was not found

Use a bash loop:

```bash
for i in $(seq 1 60); do
  [ -f "$TARGET" ] && break
  sleep 5
done
```

## Present the files

Use the Read tool to read each file. The Read tool supports reading image files (PNG, JPG, etc.) visually, and text files as content.

After reading, briefly acknowledge which file(s) were loaded (filename only, not full path) and ask what the user would like to do with them.

## Wrong file loaded — Dropbox sync delay

After presenting the file(s), if the content seems unrelated to the current conversation context (e.g., the image looks like an old screenshot, not something the user just took), this likely means:

- **The user added files after submitting the prompt** — the file wasn't in the directory when the invocation epoch was captured
- **Dropbox hasn't synced yet** — the file exists on another device but hasn't arrived locally

**When you suspect a mismatch, do both:**

1. **Check recent older files** — List images with modification time slightly before the invocation epoch. The user's intended file may have been timestamped just before they typed `/ss`.
2. **Wait and re-check** — Sleep 10 seconds, then list the directory again for any **new** files that appeared after the invocation epoch. Dropbox sync is fast when online, so files typically arrive within seconds.

```bash
# Re-check for newly synced files
sleep 10
ls -t "$DROPBOX_SCREENSHOTS_DIR"/*.{png,jpg,jpeg,gif,webp,tiff} 2>/dev/null | head -n 3
```

If a new file appears, read it and present it. If nothing new appears after one retry, inform the user and ask them to confirm which file they meant.
