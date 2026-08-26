# Upstream impact assessment — changelog + code diff per bumped package

Full procedure for the "Assess upstream changes" step. Goal: before (or while) applying a bump,
know **what actually changed upstream** between the currently-pinned version and the target, so
consumer-side edits (renamed options, new required config, changed template markup) are made
deliberately instead of discovered as build breakage.

This is **hints-gathering, not an audit**. Timebox it: changelog first, diff second, and when the
diff is huge, read the changelog + the package's public surface only. Never let this step balloon
into reading an entire upstream repo.

## 0. Scope guard

- Only for `bump` rows from `resolve-bumps.mjs` (old → new both known).
- **"Old" is the version actually installed, not necessarily the manifest spec's lower bound.**
  For a ranged spec (`^1.2.0`), read the lockfile — the project may already be running `1.2.7`,
  and comparing from `1.2.0` overstates the upgrade. Exact pins (the common case for `-next.*`
  lines) need no lookup.
- Only follow upstream repos in the first-party orgs: `Takazudo/*` or `zudolab/*`. If
  `repository.url` points anywhere else, skip the code-diff half (changelog/release notes only)
  and say so in the report.
- All recon is **read-only**: nothing in this step edits the consumer project, and nothing ever
  commits, installs, or writes inside an upstream clone.

## 1. Resolve the upstream repo

Query the **version-specific** repository object for both endpoints:

```bash
npm view <pkg>@<new> repository --json
# .url  → e.g. git+https://github.com/Takazudo/zudo-front-builder.git → Takazudo/zudo-front-builder
# .directory → the package's dir inside a monorepo (changesets sets this; empty for single-package repos)
```

If old and new versions name **different repos** (a package that moved), skip the repository
compare entirely and rely on the tarball diff + changelog.

## 2. Resolve the two commits (old + new)

Try in this order; **verify every hash actually exists in the repo before using it** — a hash you
cannot verify is unresolved, not "probably fine":

1. **`gitHead`** (primary):

   ```bash
   OLD_SHA=$(npm view <pkg>@<old> gitHead)
   NEW_SHA=$(npm view <pkg>@<new> gitHead)
   gh api "repos/<owner>/<repo>/commits/$OLD_SHA" --jq .sha   # 404 → hash not in this repo
   ```

   `gitHead` is a **candidate, not authoritative provenance**. Failure modes: absent (published
   without git metadata, or via some CI paths); pointing at a commit that was never pushed
   (published from a dirty / local-only state); and even when valid, the tarball need not equal
   the commit tree exactly (`prepack`/`prepare` scripts run at publish). The
   `gh api commits/<sha>` check catches the first two; the tarball-vs-tree gap is why the `npm
   diff` step below comes first.

2. **Git tags** (fallback). List once, then match per version:

   ```bash
   git ls-remote --tags "https://github.com/<owner>/<repo>.git" | cat
   ```

   Match **exact refs** in this order: the full changesets tag `<pkg>@<ver>` including scope
   (e.g. `@takazudo/zfb@1.4.0`), then the unscoped form (`zfb@1.4.0`), then repo-wide `v<ver>` /
   `<ver>` (ambiguous in a monorepo — lowest confidence). Annotated tags appear twice in
   `ls-remote` output; prefer the peeled `^{}` line's SHA when you need a commit id, otherwise
   use the tag name itself as the diff endpoint.

3. **Unresolvable** → changelog-only mode. State plainly in the report that the code diff was
   skipped for this package and why. Do NOT guess a commit by date or by "nearest tag".

If only the OLD endpoint is unresolvable but tags exist for nearby versions, diff from the nearest
older resolvable tag and note the approximation.

## 3. Read the changelog slice

The changelog between old and new is the highest-signal, cheapest artifact — read it before any
code diff:

```bash
# package-dir CHANGELOG.md at the NEW ref (changesets writes per-package changelogs)
gh api -H "Accept: application/vnd.github.raw" \
  "repos/<owner>/<repo>/contents/<pkg-dir>/CHANGELOG.md?ref=<NEW_REF>"
```

Read from the new version's heading down to (not including) the old version's heading. If there is
no CHANGELOG.md, try GitHub releases (`gh release list -R <owner>/<repo>`, then `gh release view
<tag>`). Most first-party projects also have hosted docs (e.g. zfb → zfb.takazudomodular.com) —
use them to understand a feature the changelog names, not as a substitute for the changelog.

## 4. Diff the published tarballs (`npm diff`) — the primary technical check

Before any repository archaeology, diff **what consumers actually receive** — the published
tarballs. This needs no repo, no commits, no tags, and reflects the real artifact (including
build output that never matches the source tree):

```bash
npm diff --diff=<pkg>@<old> --diff=<pkg>@<new> --diff-name-only   # survey first
npm diff --diff=<pkg>@<old> --diff=<pkg>@<new> package.json       # then targeted files
```

Survey the name-only list, then pull patches for the files that matter (see the checklist below).
For many bumps this step alone answers the impact question, and the repository diff in the next
section is only needed when you want the *why* behind a change — source context, commit messages,
or files that exist upstream but not in the tarball (templates, generator internals).

## 5. Repository diff between the two points

Default — **compare API, no clone**:

```bash
gh api "repos/<owner>/<repo>/compare/<OLD_REF>...<NEW_REF>" \
  --jq '{total_commits, files: [.files[] | {filename, status, additions, deletions}]}'
```

Notes:

- The endpoint is `BASE...HEAD` (three dots — the only form the API supports). That is exactly
  right when the old release commit is an ancestor of the new one (the normal case on one release
  line); if the two points have **diverged**, `...` shows only the head side — use the clone
  fallback's plain two-tree `git diff OLD NEW`, since upgrade impact is the difference between
  the two snapshots.
- **Truncation limits**: the `files` list caps at 300 entries even with pagination, `patch` is
  omitted for large files, and unpaginated commit listing caps at 250.
- In a monorepo, filter attention to the package's directory (`repository.directory` from step 1)
  plus root-level config that affects consumers. When filtering, check **both `filename` and
  `previous_filename`** so renames into or out of the package dir aren't missed.
- Pull individual patches only for the files that matter (see "what to look for") — the full
  response with all patches can be huge; the `--jq` above deliberately drops patches, fetch them
  per-file or via the clone fallback.

Fall back to the clone whenever: the comparison is non-linear; `files` hit 300 (possible
truncation); a relevant file has no usable `patch`; the API errors or times out; or an endpoint
resolves as a commit that the API won't accept as a ref.

Fallback — **blobless clone in the session scratchpad** (big/truncated diffs, or many packages
from the same repo):

```bash
TMP="<session-scratchpad>/upstream-<repo>"    # NEVER inside the consumer project
git clone --filter=blob:none --no-checkout "https://github.com/<owner>/<repo>.git" "$TMP"
git -C "$TMP" diff --stat <OLD_REF> <NEW_REF> -- <pkg-dir>
git -C "$TMP" diff <OLD_REF> <NEW_REF> -- <pkg-dir>/<interesting-file>
rm -rf "$TMP"    # delete when done — it is throwaway recon
```

The clone is read-only recon: never commit, install, build, or run scripts inside it, and never
clone into the consumer repo (a nested checkout confuses tooling and risks accidental edits).

## 6. What to look for (the consumer-impact checklist)

Skim the diff for the **public surface**, not the internals:

- `package.json`: `peerDependencies` changes (drive the peer-coupling step), `exports` / `main` /
  `bin` changes (renamed or removed entry points), `engines` bumps.
- Config schema / options: renamed or removed options, new required fields, changed defaults.
- Templates / generated output (for generator-type packages like zudo-doc): changed markup
  structure, renamed CSS classes or custom properties, moved asset paths.
- Migration notes, `BREAKING` markers, major-version headings in the changelog.

## 7. Output — the per-package impact note

For each bumped package, produce a short note (a few lines) feeding the apply/verify steps and the
final report:

```
@takazudo/zfb 1.2.0 → 1.4.0 (Takazudo/zudo-front-builder, zfb@1.2.0..zfb@1.4.0)
- changelog: adds X, deprecates `foo` option (renamed to `bar`)
- consumer impact: rename `foo:` → `bar:` in zfb.config.*; no other action
- (or) consumer impact: none found — plain bump
- (or) code diff skipped: gitHead unverifiable and no matching tags — changelog only
```

"None found" is a valid and common outcome — say it and move on. The point of this step is that
whatever breaks in the verify step later is now diagnosable against a known upstream diff instead
of being a surprise.
