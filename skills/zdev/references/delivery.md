# Session file delivery

Replaces the ChatGPT plugin's fixed Dropbox upload with a user-chosen channel. It covers files
this planning session creates (prototype rounds, accepted source, assets, screenshots,
`brief.md` / `decisions.md` / `plan.md`, the prompt). If no deliverable files exist, create
nothing and state `Artifacts: none required`.

## Working location

Keep the working copy in `$(node "$HOME/.claude/scripts/get-logdir.js")/zdev-<yyyymmdd>-<slug>/`
(on web the cclogs dir is an ephemeral `/tmp` stub — use it or the session scratchpad; delivery
copies out what must survive). Pick one filesystem-safe folder name with a date and slug, and reuse
it for the whole session. Preserve round names (`round-1/`, `round-2/`…).

## Choosing the channel

`-zip`, `-dropbox` and `-temp` may be combined. With none given, ask once at delivery time with
`AskUserQuestion` (multi-select), naming what each channel exposes and recommending one:
Dropbox when the implementer runs on Mac or across machines, ZIP for a one-off, temp PR when a web
implementer must read the files from the repo. Never pick silently. If the user names a channel in
prose, that counts as the flag.

Prototypes may contain private information. Never create public or shared links, never share an
Artifact, and check exposure before each write.

Report the exact path / URL of every delivered file and separate succeeded, pending and failed
items. Never claim an upload or push without a successful tool response. When a channel fails,
name the blocker, fall back to `SendUserFile`, and continue independent planning.

## `-zip`

Zip `brief.md`, `decisions.md`, `plan.md` (if any), `prompt.md`, `accepted/` and `shots/` — not
rejected rounds unless comparison is necessary — into `zdev-<slug>.zip`. List and validate its
contents (`unzip -l`), then send it with `SendUserFile` (`display: "attach"`). The prompt refers to
"the provided `zdev-<slug>.zip`, unpacked at a path the user gives you", and states which contents
are required versus illustrative.

## `-dropbox`

Destination `/cclogs/<repo>/zdev-<yyyymmdd>-<slug>/` — the same tree as `$DROPBOX_CCLOGS_DIR`, so a
Mac implementer reads it as a local path and a cloud implementer through a Dropbox connector. With
`-dropbox`, save each round's files as they are produced, not only at the end.

- **Terminal with a real `$DROPBOX_CCLOGS_DIR`**: the working location already is that folder; no
  upload step.
- **App / web (Dropbox connector)**: summarize the folder and file list and get confirmation (the
  connector requires it; one confirmation may cover the session's planned writes). Create missing
  parent folders in order with `create_folder`, then `create_file` each file. The connector writes
  **UTF-8 text only, ≤5 MB per file**: HTML/CSS/JS/MD go as-is; convert PNG screenshots into one
  `shots.html` of base64 `<img>` data URIs (downscale if needed); a ZIP cannot be uploaded this way.
  Never overwrite: use a versioned name on conflict. Tell the user that deleting the folder reverts
  it.

The prompt gives both the Dropbox path and `$DROPBOX_CCLOGS_DIR/<repo>/zdev-<yyyymmdd>-<slug>/`, and
says a cloud implementer without Dropbox access must ask the user to transfer the files.

## `-temp`

The only GitHub write a planning session may make, and only when chosen.

1. **Check visibility first** (GitHub MCP / `gh api repos/<owner>/<repo>` → `private`). On a public
   repo, stop and ask before writing: the files become world-readable.
2. Follow `dev-setup-temp-resource` for the repo's `_temp-resource/` plumbing. Create
   `zdev/<slug>` from the target base (on Claude Code web: the session's designated branch), commit
   only `_temp-resource/zdev-<slug>/` (brief, decisions, plan, prompt, accepted source, PNG shots),
   push, and open one **draft** PR whose body is the brief summary plus the prompt.
3. The prompt tells the implementer to adopt that PR's branch as its base (or update that PR),
   move anything lasting into production paths, and delete `_temp-resource/zdev-<slug>/` before
   merge. Production code is never part of this commit.
