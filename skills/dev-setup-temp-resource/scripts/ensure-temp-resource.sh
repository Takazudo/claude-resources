#!/usr/bin/env bash
# Idempotently set up the committed `_temp-resource/` convention in the current repo.
# Safe to re-run. Creates the dir + README, verifies it is NOT gitignored (it MUST be
# committed so a later session — incl. Claude Code web with no Dropbox — gets it via git),
# adds it to ignore lists for the tooling that scans the tree (format / lint / test), and
# reports the configs it cannot patch blindly so you can finish them by hand.
#
# Why ignore-support matters: a stray prototype (.ts/.tsx/.md/.html) under _temp-resource/
# must not trip lint / typecheck / format-check / test collection in CI. Most repo tooling is
# path-scoped and won't see a root dir — but the broad scanners (markdown formatters, repo-wide
# linters, root test configs) will, so they need an explicit exclude.
#
# Usage:  bash ensure-temp-resource.sh            # run from the repo root
#         bash ensure-temp-resource.sh <repo-dir>
set -euo pipefail

REPO="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "$REPO"
DIR="_temp-resource"
mkdir -p "$DIR"

# --- README (only if missing; don't clobber an edited one) ---
if [ ! -f "$DIR/README.md" ]; then
  cat > "$DIR/README.md" <<'EOF'
# _temp-resource/

Committed scratch resources handed from one Claude Code session to a **later** session
via git — the reliable channel when Dropbox/cclogs is unavailable (e.g. Claude Code web).

## Rule

- One subdir per topic, named `<issue-number>-<topic-slug>/`
  (e.g. `_temp-resource/4444-tweak-header/`). The number is the GitHub issue
  (the **epic** for `/big-plan`, the single issue for `/x-as-pr`).
- Put prototypes, design references, fixtures, sample data — anything a downstream
  session needs that is not already in the repo or expressible inline in the issue.
- Reference files by this in-repo path from the issue body (portable across machines + web).

## Lifecycle

- **Committed** (NOT gitignored) so it travels on the branch/PR.
- **Temporary** — delete the topic subdir when the delegated work merges, so it does not
  reach the default branch. Harmless if left behind: repo tooling excludes this dir.

See the `dev-setup-temp-resource` skill for the full handoff protocol.
EOF
  echo "created  $DIR/README.md"
else
  echo "kept     $DIR/README.md (already present)"
fi

# --- .gitignore: it must NOT be ignored (must be committed) ---
if [ -f .gitignore ] && grep -qE "^/?_temp-resource/?($|\s|\*)" .gitignore; then
  echo "WARN     .gitignore appears to ignore _temp-resource — it MUST be committed; remove that line"
else
  echo "ok       _temp-resource is not gitignored"
fi

# --- file-based ignore lists (idempotent append where the file already exists) ---
for f in .prettierignore .eslintignore .stylelintignore; do
  if [ -f "$f" ] && ! grep -qxF "_temp-resource/" "$f"; then
    printf '\n_temp-resource/\n' >> "$f"
    echo "patched  $f (+ _temp-resource/)"
  fi
done

# --- auto-patch known plain-JSON tool configs (add to their array, idempotent) ---
# These tools auto-load their config and scan the tree, so a root exclude is required.
# IMPORTANT: edit the config's own array — do NOT pass a CLI `--ignore`/`--exclude` flag in
# package.json, because for these tools the flag REPLACES the config's list and silently
# re-exposes everything else the config was excluding.
patch_json_array() {
  local file="$1" key="$2" val="$3"
  [ -f "$file" ] || return 0
  node - "$file" "$key" "$val" <<'NODE'
const fs = require("fs");
const [file, key, val] = process.argv.slice(2);
let j;
try { j = JSON.parse(fs.readFileSync(file, "utf8")); }
catch { console.log("SKIP     " + file + " (not plain JSON — patch its `" + key + "` by hand)"); process.exit(0); }
const arr = Array.isArray(j[key]) ? j[key] : (j[key] = []);
if (arr.includes(val)) { console.log("ok       " + file + " already excludes " + val); process.exit(0); }
arr.push(val);
fs.writeFileSync(file, JSON.stringify(j, null, 2) + "\n");
console.log("patched  " + file + " (" + key + " += " + val + ")");
NODE
}
# @takazudo/mdx-formatter — key is `exclude` (NOT `ignore`); auto-loaded from repo root.
patch_json_array ".mdx-formatter.json" "exclude" "_temp-resource/**"
# @takazudo/design-token-lint — key is `ignore`.
patch_json_array ".design-token-lint.json" "ignore" "**/_temp-resource/**"

# --- report the configs that vary too much to patch blindly (lint / test / typecheck) ---
echo ""
echo "Verify these EXCLUDE _temp-resource so scratch files don't break CI (add the exclude yourself):"
report_glob() { local m; for m in $1; do [ -e "$m" ] && echo "  - $m  → $2"; done; return 0; }
report_glob "eslint.config.*"   'add "_temp-resource/**" to an `ignores` entry (flat config)'
report_glob ".eslintrc*"        'add "_temp-resource/**" to `ignorePatterns`'
report_glob "biome.json*"       'add "_temp-resource/**" to `files.ignore`'
report_glob "vitest.config.*"   'add "_temp-resource/**" to `test.exclude`'
report_glob "vitest.workspace.*" 'ensure no project glob pulls in _temp-resource'
report_glob "vite.config.*"     'if it defines `test`, add "_temp-resource/**" to `test.exclude`'
report_glob "jest.config.*"     'add "_temp-resource/**" to `testPathIgnorePatterns`'
report_glob "playwright.config.*" 'usually testDir-scoped (safe); confirm testDir is not the repo root'
report_glob "tsconfig*.json"    'add "_temp-resource" to `exclude` (only if its `include` globs the repo root)'
echo ""
echo "Note: most monorepo checks are package-scoped (pnpm --filter ...) and never see a root"
echo "dir — verify each above rather than patching reflexively. Then commit this setup."
