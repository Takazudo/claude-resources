---
name: ss
description: >-
  Load screenshot images from Dropbox screenshots directory. Use when user invokes /ss directly.
  Supports /ss 2 (latest 2 images), /ss latest3, /ss filename.png, /ss full-path.
disable-model-invocation: true
argument-hint: "[N | latestN | filename]"
allowed-tools: Read, Bash(ls *), Bash(find *), Bash(for *)
---

# Screenshot Loader

Load screenshot images from the Dropbox screenshots directory and present them in the conversation.

## Resolve screenshots directory

Use `$DROPBOX_SCREENSHOTS_DIR` env var (set in `.zshrc` for both macOS and WSL2).

## Parse arguments

`$ARGUMENTS` determines which files to load:

| Pattern | Meaning | Example |
| --- | --- | --- |
| Bare number (`2`, `3`) | Latest N images | `/ss 2` |
| `latestN` | Latest N images | `/ss latest3` |
| Full path starting with `/` | Exact file | `/ss '/Users/.../file.png'` |
| Other string | Filename in screenshots dir | `/ss Screenshot 2026-03-14 at 3.27.17.png` |
| (empty) | Latest 1 image | `/ss` |

## Find files

### Latest N images

List all image files (png, jpg, jpeg, gif, webp, tiff) in the screenshots directory, sort by modification time descending, take the first N.

```bash
ls -t "$DROPBOX_SCREENSHOTS_DIR"/*.{png,jpg,jpeg,gif,webp,tiff} 2>/dev/null | head -n $N
```

### Specific filename

Construct the full path: `$DROPBOX_SCREENSHOTS_DIR/<filename>`.

### Full path

Use the path as-is.

## Wait for file if not found

The user is confident the file exists or is being created (e.g., just took a screenshot). If the target file does not exist yet:

1. Poll every 5 seconds using `ls` to check if the file appears
2. Continue polling for up to 5 minutes (60 attempts)
3. For "latest N" mode, also retry if the directory has fewer than N image files
4. If the file appears during polling, proceed normally
5. If timeout is reached, report that the file was not found

Use a bash loop:

```bash
for i in $(seq 1 60); do
  [ -f "$TARGET" ] && break
  sleep 5
done
```

## Present the images

Use the Read tool to read each image file. The Read tool supports reading image files (PNG, JPG, etc.) and will present them visually.

After reading, briefly acknowledge which file(s) were loaded (filename only, not full path) and ask what the user would like to do with the image(s).
