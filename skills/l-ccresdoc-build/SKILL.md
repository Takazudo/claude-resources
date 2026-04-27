---
name: l-ccresdoc-build
description: "Build and install the CCResDoc Tauri app locally. Use when: (1) User says 'build ccresdoc', 'rebuild ccresdoc', 'install ccresdoc', or 'l-ccresdoc-build', (2) User wants a fresh CCResDoc.app after changing Rust, frontend loading page, or doc site code under $HOME/.claude/doc/. Runs cargo clean -p, cargo tauri build, then kills the running app, moves the old bundle aside, copies the fresh one to /Applications, clears quarantine, and verifies the binary timestamp."
---

# Local CCResDoc Build & Install

Cache-clean build of the CCResDoc Tauri app at `$HOME/.claude/doc/src-tauri/`, plus safe install to `/Applications/CCResDoc.app`.

## Why a skill

`cp -rf` does NOT reliably update a macOS `.app` bundle — the old binary inside `Contents/MacOS/` can survive the copy. And Cargo sometimes reuses the cached release binary even after frontend changes in `$HOME/.claude/doc/dist/`. Run the steps below in order; do not substitute `cp -rf` or skip the clean.

## Step 1 — Clean cargo cache for the ccresdoc crate

```bash
cd $HOME/.claude/doc/src-tauri && cargo clean -p ccresdoc --release
```

`-p ccresdoc` cleans only this crate's artifacts (seconds), not all Rust deps. `--release` is required because `cargo tauri build` uses the release profile.

## Step 2 — Build

```bash
cd $HOME/.claude/doc/src-tauri && cargo tauri build
```

Takes ~1–2 minutes on cold cache. Outputs:

- `$HOME/.claude/doc/src-tauri/target/release/bundle/macos/CCResDoc.app`
- `$HOME/.claude/doc/src-tauri/target/release/bundle/dmg/CCResDoc_0.1.0_aarch64.dmg`

## Step 3 — Kill, move old bundle aside, copy fresh

Use `mv` instead of `rm -rf` so the old bundle is replaced atomically (and recoverable from `/tmp` if the copy fails). Use `cp -R` (not `cp -rf`) on a path that no longer exists.

```bash
killall ccresdoc 2>/dev/null
killall CCResDoc 2>/dev/null
sleep 1
mv /Applications/CCResDoc.app /tmp/CCResDoc-old-$$.app 2>/dev/null
cp -R $HOME/.claude/doc/src-tauri/target/release/bundle/macos/CCResDoc.app /Applications/CCResDoc.app
xattr -dr com.apple.quarantine /Applications/CCResDoc.app
```

`xattr -dr com.apple.quarantine` only strips the quarantine flag; it does not nuke all extended attributes.

## Step 4 — Verify the installed binary is fresh

```bash
stat -f "%Sm  %N" /Applications/CCResDoc.app/Contents/MacOS/ccresdoc
stat -f "%Sm  %N" $HOME/.claude/doc/src-tauri/target/release/bundle/macos/CCResDoc.app/Contents/MacOS/ccresdoc
```

The two timestamps should match within seconds (installed is slightly later — it was copied right after the build finished). If the installed binary is older than the source, the copy failed — go back to Step 3.

## Step 5 — Launch (optional)

```bash
open /Applications/CCResDoc.app
```

Report the installed binary's timestamp so the user can confirm it's the fresh build.

## Notes

- Binary name inside the bundle is `ccresdoc` (lowercase, from `Cargo.toml`), app name is `CCResDoc.app` (from `tauri.conf.json` `productName`).
- The bundled frontend is only the loading spinner at `src-tauri/frontend/`. The real doc site is served at runtime by the sidecar (node `scripts/dev-stable.js`) or the axum fallback reading `$HOME/.claude/doc/dist/`. So for pure doc-content changes, no rebuild is needed — just rebuild `$HOME/.claude/doc/` (`pnpm build`) and re-open the app.
- Rebuild this app only when Rust code in `src-tauri/src/`, the loading page in `src-tauri/frontend/`, or Tauri config changes.
