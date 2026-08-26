# ZUDO_DEPS_PINS.md — provenance tracking for vendored / generated artifacts

Some projects consume a first-party package **without a `package.json` dependency**: a doc site
scaffolded from zudo-doc's generator, HTML/CSS partially copied from an upstream template, a
config file lifted from another repo. The registry resolver cannot see these — there is no pinned
version anywhere — so provenance is recorded in a **`ZUDO_DEPS_PINS.md`** file at the consumer
repo root. This file is the single source of truth for "which upstream commit did our vendored
stuff come from", and every sync updates it.

## When the skill engages this file

- **Every `/dev-bump-zudo-deps` run checks for `ZUDO_DEPS_PINS.md` at the project root** — even
  when `resolve-bumps.mjs` finds zero registry deps. Registry bumps and vendored syncs are two
  halves of the same "update the takazudo toolchain" task.
- If the file exists → run the update workflow below for each entry.
- If the file does not exist **and** this run is updating vendored artifacts (the user asked, or
  vendored zudo artifacts are evidently present) → create it as part of the work. Do NOT create
  an empty pins file in projects that have no vendored artifacts.

## File format

Markdown, hand-editable, greppable. One `##` section per upstream, fixed bullet keys:

```markdown
# ZUDO_DEPS_PINS

Provenance for artifacts vendored or generated from first-party (takazudo/zudolab) upstreams.
Updated by /dev-bump-zudo-deps on every sync — keep `pinned:` accurate.

## zudo-doc
- repo: zudolab/zudo-doc
- what: generated doc-site scaffold, partially customized
- files: doc/src/layouts/, doc/src/styles/base.css
- source: templates/default/ (upstream paths the files derive from)
- track: main (what "upstream latest" means: a branch, or `releases`)
- pinned: 3f2a9c14e8b2a1d0c9f7e6b5a4d3c2b1a0f9e8d7 (v0.4.2)
- updated: 2026-08-24
- sync: npx zudo-doc generate doc/   (optional: the established regenerate/copy command)
- notes: header nav customized locally in doc/src/layouts/Base.astro — re-apply after regenerating
```

Key rules:

- `repo:` — `owner/name`, first-party orgs only (`Takazudo/*`, `zudolab/*`).
- `what:` — one line: what kind of artifact and how it got here (generated / copied / adapted).
- `files:` — the **local** paths covered by this entry (dirs or files, comma-separated).
- `source:` — the **upstream** paths those files derive from (an explicit upstream → local
  mapping when they differ). Optional but strongly recommended: it is what lets the update diff
  be scoped. Omit only when the whole repo is the source.
- `track:` — what "upstream latest" means for this entry: a branch name (default-branch HEAD) or
  `releases` (newest release tag). Without it, "latest" is ambiguous.
- `pinned:` — the **full immutable commit hash** (display a short form elsewhere if you like),
  plus the tag/version in parens when one exists. When provenance is genuinely lost, do NOT
  dress an observed HEAD up as a pin — record honestly:
  `pinned: unknown` on its own, plus a separate
  `observed-head: <full hash> (recorded 2026-08-24)` line. The observed head is explicitly
  non-authoritative — a ceiling, not provenance. After the first successful reconciliation,
  replace both with the real new pin.
- `updated:` — date of the last sync (or of the recording, for `unknown`).
- `sync:` — optional: the established regenerate/copy command, once one exists, so the next
  updater doesn't rediscover it.
- `notes:` — local customizations that must survive a re-generate/re-copy, and anything else the
  next updater must know. This is the key that prevents a sync from silently destroying local
  work — keep it current.

Keep the file small: entries only for real vendored upstreams, one section each, no prose beyond
the keys. `grep -A7 '^## zudo-doc' ZUDO_DEPS_PINS.md` should return a complete entry.

## Update workflow (per entry)

0. **Pre-flight.** If the skill was invoked with `--dry-run`, this whole workflow is read-only:
   report what a sync would do, write nothing (no artifact copies, no pin updates). And if the
   working tree has **uncommitted local edits under the entry's `files:` paths**, pause and ask —
   syncing over uncommitted work makes the reconciliation undiffable.
1. **Read the entry.** `repo`, `source`, `track`, `pinned`, `notes` define the whole job.
2. **Resolve upstream latest** — per `track:`: the branch HEAD, or the newest release:

   ```bash
   git ls-remote "https://github.com/<owner>/<repo>.git" HEAD
   gh release list -R <owner>/<repo> --limit 1
   ```

3. **Up-to-date?** If `pinned` equals latest → report the entry as current, done.
4. **Diff pinned..latest, scoped to `source:`** — same mechanics as the registry-dep impact step
   (see `upstream-impact.md` §5: compare API first, blobless clone to the session scratchpad as
   fallback; read-only recon, never clone into the consumer repo):

   ```bash
   gh api "repos/<owner>/<repo>/compare/<pinned>...<latest-ref>" --jq '[.files[].filename]'
   ```

   If nothing under `source:` changed → bump `pinned:`/`updated:` to latest and you are done: the
   upstream moved, but not the parts this project vendors.
5. **Choose the sync strategy** for real changes. All three are forms of a **three-way
   reconciliation** — old upstream (`pinned`), current local, new upstream — never a blind
   replacement of local files with upstream ones. In preference order:
   - **Regenerate** — when the artifact came from a generator and the generator can be re-run
     (use `sync:` if recorded). Re-apply the local customizations listed in `notes:` afterward,
     then diff against the pre-sync state to confirm nothing local was lost.
   - **Re-copy + re-apply** — when files were copied verbatim: copy the new upstream files over,
     re-apply `notes:` customizations.
   - **Manual merge** — when local files diverged too far to regenerate/re-copy: apply the
     upstream diff (pinned → latest) hunk-by-hunk onto the local files. This is the most
     error-prone path; keep it scoped to what the diff actually touched.
6. **Verify** — build / typecheck / visual check as the project defines, same bar as a registry
   bump.
7. **Update the entry — only after step 6 verification passed.** Set `pinned:` to the new full
   hash (+ tag), `updated:` to today, and revise `notes:` if the set of local customizations
   changed. Commit the pins file **in the same commit** as the synced artifacts, so the file can
   never describe a state the repo isn't in. A failed verify means no pin update — fix or revert
   the sync instead.

## Creating the file when it's missing

1. Identify the vendored artifacts (the user names them, or they are evident — e.g. a `doc/`
   scaffold matching zudo-doc's generator output).
2. Best-effort provenance for `pinned:`, cheapest first:
   - a version/commit already recorded somewhere in the project (a generator banner comment, a
     lockfile from the time, an old commit message);
   - a quick content match against upstream tags (only if cheap — one or two candidate versions);
   - otherwise `pinned: unknown` + `observed-head: <full hash> (recorded <date>)`. Do not burn
     time bisecting upstream history to find the exact ancestor.
3. Write one entry per upstream, fill `notes:` with the local customizations you can identify
   (diff local files against the upstream `source:` paths at the recorded ref — divergences ARE
   the customizations).
4. Commit the new file. From now on every sync keeps it current.

## Failure modes these rules exist to prevent

Seen in the wild when agents improvised this workflow:

- **Regenerating over local customizations** — the artifact was "updated" and hand-made changes
  vanished. Hence `notes:` is mandatory upkeep and step 5 always re-applies + re-diffs.
- **Guessed provenance stated as fact** — an agent picked a plausible-looking old version and
  "diffed" from it, producing a confidently wrong merge. Hence the explicit `unknown` convention:
  an honest ceiling beats a fabricated pin.
- **Pins file updated without syncing (or vice versa)** — the file and the artifacts drift apart.
  Hence step 7's same-commit rule.
- **Recon clones left inside the consumer repo** — nested checkouts confuse tooling and invite
  accidental cross-repo edits. Clones go to the session scratchpad and are deleted after.
