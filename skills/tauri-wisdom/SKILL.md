---
name: tauri-wisdom
description: |
  Tauri v2 app development patterns for lightweight macOS wrapper apps around local dev servers.
  Use when: (1) Building Tauri apps as wrappers around web apps or dev servers,
  (2) Spawning sidecar processes (Node.js, pnpm) from Tauri,
  (3) Handling macOS PATH issues when launching from Finder,
  (4) Showing loading screens while sidecar builds,
  (5) WebView navigation and IPC between bundled HTML and Rust,
  (6) Building .app bundles with cargo tauri build,
  (7) User mentions 'tauri', 'tauri app', or 'tauri wrapper'.
---

# Tauri v2 Development

## Tauri vs Electron

- **Tauri**: ~5-10MB, uses OS WebKit, Rust backend. Lightweight but you handle all platform differences. Does NOT bundle Node.js.
- **Electron**: ~150MB, bundles Chromium + Node.js. Heavy but works identically everywhere.

Choose Tauri for personal dev tools where the host has Node.js. Choose Electron for distributed apps.

## Common Pattern: Sidecar Dev Server Wrapper

```
app/
├── Cargo.toml
├── build.rs               # tauri_build::build()
├── tauri.conf.json
├── capabilities/default.json
├── frontend/index.html    # Bundled loading page
└── src/main.rs            # Sidecar + menu + IPC
```

The `frontend/` is served via Tauri's custom protocol (`tauri://localhost`). The loading page polls Rust via IPC until the dev server is ready, then Rust navigates the WebView to `http://localhost:<PORT>`.

## Critical Pitfalls

### 1. macOS Finder Launch: PATH Not Available

macOS GUI apps don't inherit shell PATH. `pnpm`, `node` won't be found.

```rust
// WRONG — pnpm not in PATH when launched from Finder
Command::new("pnpm").args(["dev"]).spawn()

// CORRECT — login shell inherits user's PATH
Command::new("/bin/zsh").args(["-l", "-c", "pnpm dev"]).spawn()
```

### 2. WebView Cannot Load http://localhost Directly

`WebviewUrl::External("http://localhost:PORT")` often shows blank white page.

**Fix**: Use bundled `frontend/index.html` via `WebviewUrl::default()`. HTML polls Rust via IPC, then Rust navigates with `window.navigate()`.

### 3. Bundled HTML Cannot fetch() to localhost

`tauri://localhost` origin blocks `fetch()` to `http://localhost:PORT`. Console shows "Could not connect" even though curl works.

**Fix**: Use Tauri IPC (`window.__TAURI__.core.invoke()`) to call Rust command that does HTTP check.

### 4. window.\_\_TAURI\_\_ Undefined by Default

Add `"withGlobalTauri": true` to `tauri.conf.json` `app` section.

### 5. JS location.href Cannot Navigate tauri:// to http://

Use Rust command with `window.navigate()`:

```rust
#[tauri::command]
fn navigate_to_docs(app_handle: AppHandle) {
    if let Some(w) = app_handle.get_webview_window("main") {
        let url: tauri::Url = "http://localhost:4892/docs".parse().unwrap();
        let _ = w.navigate(url);
    }
}
```

### 6. data: URLs Require Feature Flag

`data:text/html,...` panics without `"webview-data-url"` in Tauri features. Prefer bundled frontend instead.

### 7. macOS Window Close Doesn't Quit

Clicking red X hides window, app stays in Dock. Reopening shows nothing.

```rust
.run(move |app_handle, event| match &event {
    tauri::RunEvent::WindowEvent {
        event: tauri::WindowEvent::Destroyed, ..
    } => { app_handle.exit(0); }
    tauri::RunEvent::Exit => { /* cleanup sidecar */ }
    _ => {}
});
```

### 8. Use process\_group(0) Not Unsafe pre\_exec

```rust
// Stable API since Rust 1.82 — no unsafe needed
use std::os::unix::process::CommandExt;
cmd.process_group(0);
// Then kill group: libc::kill(-pid, libc::SIGTERM)
```

### 9. Stale Port From Previous Instance

Kill in the dev server script before starting:

```javascript
import { execSync } from "node:child_process";
try {
  execSync(`lsof -ti :${PORT} | xargs kill 2>/dev/null`, { stdio: "ignore" });
} catch {}
```

## Working Code

See [references/complete-app.md](references/complete-app.md) for production-ready Rust main.rs and [references/dev-stable.md](references/dev-stable.md) for the Node.js dev server with loading page.

## Project Setup

### Cargo.toml

```toml
[package]
name = "my-app"
version = "0.1.0"
edition = "2021"

[dependencies]
tauri = { version = "2", features = ["devtools"] }
libc = "0.2"

[build-dependencies]
tauri-build = { version = "2", features = [] }
```

### tauri.conf.json

```json
{
  "productName": "My App",
  "version": "0.1.0",
  "identifier": "com.example.my-app",
  "build": { "frontendDist": "./frontend" },
  "app": {
    "withGlobalTauri": true,
    "windows": [],
    "security": { "csp": null }
  },
  "bundle": {
    "active": true, "targets": "all", "icon": [],
    "category": "DeveloperTool",
    "macOS": { "minimumSystemVersion": "10.15" }
  }
}
```

### capabilities/default.json

```json
{
  "identifier": "default",
  "windows": ["main"],
  "remote": { "urls": ["http://localhost:*/*"] },
  "permissions": ["core:default"]
}
```

### Build and Install

```bash
cargo install tauri-cli  # one-time
cd app && cargo tauri build
cp -r target/release/bundle/macos/My\ App.app /Applications/
```
