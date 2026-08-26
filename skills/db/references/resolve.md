# Dropbox resolution engine

Shared by `/db` (base = `$DROPBOX_ROOT`) and `/ss` (base = `$DROPBOX_SCREENSHOTS_DIR`). The calling skill supplies **BASE**; everything below is identical for both.

## Contents

- [Why this exists](#why-this-exists)
- [Portable stat helpers](#portable-stat-helpers)
- [Mode resolution order](#mode-resolution-order)
- [Directory mode](#directory-mode)
- [File and multi-file mode](#file-and-multi-file-mode)
- [Opening resolved files by type](#opening-resolved-files-by-type)
- [Presenting results](#presenting-results)
- [Loaded material is intentional context](#loaded-material-is-intentional-context)

## Why this exists

Dropbox is a *syncing* filesystem, so a path that does not exist yet is not the same as a path that does not exist. The user usually shares a file and invokes the skill within seconds, ahead of sync. Reading the directory directly — without the settle and retry logic below — silently returns stale or partial results, which is why manual `ls`/`Read` on these directories is the wrong tool.

Two failure modes matter:

- **Not yet synced.** The file appears seconds to minutes later. Poll; do not conclude "not found" on the first miss.
- **Online-only placeholder.** The entry exists with correct name and size but no local content. Reading one byte forces materialization.

## Portable stat helpers

These directories are reachable from macOS (BSD `stat`) and WSL2 (GNU `stat`), whose flags differ. A naive `stat -f %m "$f" 2>/dev/null || stat -c %Y "$f"` is **not** safe: under GNU, `-f` means "show filesystem status", so it exits non-zero *after* writing a filesystem-info block to stdout, corrupting the captured value. Redefine these in any bash snippet that needs metadata — each Bash call is a fresh shell:

```bash
mtime_of() {
  local m
  m=$(stat -f %m "$1" 2>/dev/null)
  if [ $? -ne 0 ] || [ -z "$m" ]; then m=$(stat -c %Y "$1" 2>/dev/null); fi
  echo "$m"
}
size_of() {
  local s
  s=$(stat -f %z "$1" 2>/dev/null)
  if [ $? -ne 0 ] || [ -z "$s" ]; then s=$(stat -c %s "$1" 2>/dev/null); fi
  echo "$s"
}
```

Prefer `find` over `ls` with brace globs — an unmatched glob is a hard error in zsh and takes the whole command with it.

## Mode resolution order

Try these in order against the argument; first hit wins.

1. **Trailing slash, or resolves to a directory** (`BASE/<arg>` or an absolute path) → [directory mode](#directory-mode).
2. **Whole-string exact file match** — `BASE/<arg>` or an absolute path. This wins even when the name contains spaces; never split it.
3. **Empty argument** → the caller decides (`/db` lists the root; `/ss` loads the latest screenshot).
4. **Explicit multiple paths** — quoted, or comma-separated, or several extension-terminated groups → [multi-file mode](#file-and-multi-file-mode).
5. **Anything else** → exact relative path first, then case-insensitive recursive substring search; newest match wins.

When the invocation embeds the argument in a longer sentence (`/db webdaw/ use its docs for the prototype`), take the shortest clearly path-like expression right after the command as the argument — not the rest of the prose. A trailing slash is an explicit directory signal.

Splitting a bare string into multiple filenames is only safe when every token group ends in a known extension (`png jpg jpeg gif webp tiff pdf html txt json css js svg md`). If trailing tokens have no extension, the split is unreliable — treat the whole argument as one name.

## Directory mode

A Dropbox directory may still be growing while it is read, so inventory it, wait for it to settle, then materialize:

1. Resolve the exact directory, then sleep 3 seconds.
2. Inventory recursively with `find`.
3. Poll every 5 seconds comparing the `(file count, total bytes)` signature. Settled = unchanged for two consecutive rounds. Give up after 24 rounds and say so rather than claiming completeness.
4. Read one byte from every file to materialize online-only placeholders; retry unreadable ones until they work or the timeout hits.
5. Present a relative-path tree with per-file sizes.

```bash
DIR="<resolved dir>"
snapshot() {
  local count=0 total=0 f size
  while IFS= read -r -d '' f; do
    size=$(size_of "$f") || continue
    count=$((count + 1)); total=$((total + size))
  done < <(find "$DIR" -type f -print0 2>/dev/null)
  printf '%s/%s\n' "$count" "$total"
}

sleep 3
previous=""; stable=0
for i in $(seq 1 24); do
  current=$(snapshot)
  if [ "$current" = "$previous" ]; then
    stable=$((stable + 1)); [ "$stable" -ge 2 ] && break
  else
    stable=0
  fi
  previous="$current"; sleep 5
done

while IFS= read -r -d '' f; do
  head -c 1 "$f" >/dev/null 2>&1 || printf 'UNREADABLE: %s\n' "$f"
done < <(find "$DIR" -type f -print0 2>/dev/null)
```

**Do not bulk-read the folder.** A folder can hold hundreds of megabytes; reading it blindly blows up the context for no gain.

Read without being asked only small, high-signal files that identify the bundle — a `README` / `Read Me.txt`, a manifest, an `index.json` — capped at a few KB. Never auto-read every image in the folder, large JSON/CSV, binaries (fonts, archives, video), or anything over ~100 KB. When a large file is clearly the point of the folder, name it and its size and let the user confirm first.

When the request already states the purpose and points at an obvious small set, open those and continue without asking again; otherwise present the inventory and ask what to open.

## File and multi-file mode

Resolve each requested name independently, preserving the order the user typed:

- Try the absolute path, or `BASE/<relative-path>`, exactly.
- Otherwise search recursively, case-insensitive substring. Strip a supplied extension to form the search term and try obvious singular/plural variants (`screenshot` ↔ `screenshots`).
- Several matches → newest by `mtime_of`.
- Poll all still-missing exact targets **together**, every 5 seconds for up to 24 rounds — one shared loop, never a full 2-minute loop per file in sequence.

```bash
# TARGETS: newline-separated resolved paths
for i in $(seq 1 24); do
  MISSING=$(printf '%s\n' "$TARGETS" | while IFS= read -r t; do [ -f "$t" ] || echo "$t"; done)
  [ -z "$MISSING" ] && break
  sleep 5
done
```

Present everything that resolved and list unresolved names explicitly. Never silently drop a name the user typed.

## Opening resolved files by type

Route by type instead of treating everything as text:

| Type | How to open |
| --- | --- |
| Images (`png jpg jpeg gif webp tiff`) | Read visually |
| Text, code, HTML, SVG, JSON, Markdown | Read as text |
| PDF | Read with the `pages` parameter |
| DOCX / spreadsheet / presentation | Use the applicable document skill; inspect the real content, don't guess from the filename |
| Audio / video | Use a media-capable tool, or inventory it and state the limitation |
| Archive / unknown binary | Inventory first; never dump bytes into the conversation |

## Presenting results

Acknowledge resolved items by filename or path **relative to BASE** — not the full Dropbox path, which is long, machine-specific, and useless to paste elsewhere. Then say what you're doing with them, or ask if intent is genuinely ambiguous.

## Loaded material is intentional context

Never resolve material and then continue as if it were irrelevant. The user shared these files *for this task*; even when the content looks unrelated to the prior conversation, they may be introducing new context or switching topics.

Directory mode allows selective *reading*, never selective *relevance*.

If results look obviously stale (timestamps hours old, content clearly from another session), do one of two things — never neither:

1. **Wait and recheck.** Sleep 120s and re-list, accepting mtimes up to `CUTOFF + 180`. New files that appear are almost certainly the intended ones.
2. **Ask.** Present what was found with its timestamp and ask whether it's the right file or whether to keep waiting.
