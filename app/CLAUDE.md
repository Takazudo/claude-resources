# app/ — Claude Resources Tauri Wrapper

Tauri v2 macOS app that wraps the doc site (port 4892) in a native window with bundled Node.js.

## Quick Start

```bash
bash scripts/download-node.sh   # download Node.js binary (~112MB, one-time)
cargo tauri dev                  # dev mode
cargo tauri build                # production .app bundle
```

## Architecture

- **Tauri v2** thin wrapper — spawns `node scripts/dev-stable.js` as a sidecar
- **Bundled Node.js** via `externalBin` — no pnpm/nodenv/.zshrc dependency at runtime
- **Single file**: `src/main.rs` (~330 lines) handles sidecar lifecycle, menus, window management

## How It Works

1. `main()` → `spawn_sidecar()` → `kill_port(4892)` → launches bundled `node` with `doc/scripts/dev-stable.js`
2. `wait_for_build()` polls `http://localhost:4892/___ready` (up to 120s)
3. Window opens pointing at `http://localhost:4892/docs/claude`
4. Cmd+R kills sidecar, respawns, navigates to loading page
5. On window close, sidecar process group is killed via SIGTERM

## Key Files

- `src/main.rs` — all Rust code (sidecar spawn/kill, menus, window, zoom)
- `scripts/download-node.sh` — downloads Node.js v24.13.0 macOS arm64 with SHA256 verification
- `binaries/` — downloaded Node.js binary (gitignored, ~112MB)
- `tauri.conf.json` — Tauri config with `externalBin: ["binaries/node"]`
- `frontend/index.html` — loading spinner shown while sidecar builds
- `capabilities/default.json` — allows WebView to access localhost:4892
- `test-launch.sh` — launch test (open app, verify docs load, repeat N times)

## Node Binary

The binary is NOT committed (112MB). Run `scripts/download-node.sh` after clone:
- Downloads from nodejs.org with SHA256 checksum verification
- Places at `binaries/node-aarch64-apple-darwin` (Tauri dev naming)
- Tauri build copies it to `Contents/MacOS/node` (strips target triple)
- `node_binary_path()` in main.rs tries dev name first, falls back to production name

## Process Management

- `kill_port()` — SIGTERM stale processes on port 4892 before sidecar spawn
- `process_group(0)` — sidecar runs in its own process group
- `kill_sidecar()` — SIGTERM to process group, wait 500ms, SIGKILL if still alive
- Sidecar stdout/stderr → `app/sidecar.log` (truncated on each launch)

## Testing

```bash
APP_OVERRIDE="/Applications/Claude Resources.app" bash test-launch.sh 3
```

## Platform

macOS arm64 only. See issue #11 comments for what's needed for Windows/Linux support.
