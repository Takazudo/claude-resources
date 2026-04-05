# src-tauri/ — CCResDoc Tauri Wrapper

Tauri v2 macOS app that wraps the doc site (port 4892) in a native window.

## Quick Start

```bash
# Dev mode — uses system node/pnpm for the dev server
cargo tauri dev

# Production build
cargo tauri build
```

## Architecture

- **Tauri v2** thin wrapper with dual-path production mode
- **Dev mode**: Tauri's `beforeDevCommand` runs `pnpm dev:stable` using system node; `devUrl` polls until server is ready
- **Production (with node)**: Spawns system node to run `dev-stable.js` — full build, watch, SSE live-reload
- **Production (without node)**: Falls back to axum static file server serving `$HOME/.claude/doc/dist/`
- **Single file**: `src/main.rs` handles node detection, sidecar/server lifecycle, menus, window management

## How It Works

### Dev mode (`cargo tauri dev`)

1. Tauri runs `beforeDevCommand`: `pnpm dev:stable` (system node, CWD is doc/)
2. Tauri polls `devUrl` (`http://localhost:4892/`) until the server responds
3. Window opens pointing at the dev server
4. Cmd+R navigates to the docs URL (server stays running)
5. On window close, Tauri kills the `beforeDevCommand` child process

### Production (bundled `.app`)

1. `main()` calls `kill_port(4892)` to clean stale processes
2. `find_node()` searches for system node in order: Homebrew paths → anyenv/nodenv versions → standalone nodenv versions → nvm → volta → fnm → `which node`
3. **If node found**: Spawns `node scripts/dev-stable.js` as sidecar (builds Astro site, serves, watches, SSE live-reload). Waits up to 120s for `___ready`.
4. **If node not found**: Starts axum static file server on port 4892 serving `$HOME/.claude/doc/dist/`. Waits up to 30s. No build, no watch.
5. Window opens pointing at `http://localhost:4892/`
6. Cmd+R: If sidecar mode, kills and respawns sidecar. If axum mode, just navigates.
7. On window close: kills sidecar (if running), then exits

### Without node

If node is not installed, the app serves pre-built static files. You must build the doc site first:

```bash
pnpm install && pnpm build
```

## Key Files

- `src/main.rs` — all Rust code (node detection, sidecar/axum server, menus, window, zoom)
- `frontend/index.html` — loading spinner shown while waiting for doc site
- `capabilities/default.json` — allows WebView to access localhost:4892
- `test-launch.sh` — launch test (open app, verify docs load, repeat N times)

## Process Management

- `find_node()` — searches Homebrew paths, version managers (anyenv/nodenv, nodenv, nvm, volta, fnm), then `which node`
- `find_node_in_versions_dir()` — resolves actual node binary from a versions directory (nodenv, nvm, volta, fnm); uses numeric semver sort for fallback
- `kill_port()` — SIGTERM stale processes on port 4892 before startup
- `process_group(0)` — sidecar runs in its own process group
- `kill_sidecar()` — SIGTERM to process group, wait 500ms, SIGKILL if still alive
- Sidecar stdout/stderr → `src-tauri/sidecar.log` (truncated on each launch)

## Testing

```bash
APP_OVERRIDE="/Applications/CCResDoc.app" bash test-launch.sh 3
```

## Platform

macOS arm64 only. See issue #11 comments for what's needed for Windows/Linux support.
