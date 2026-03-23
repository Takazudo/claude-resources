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
  Also covers general Tauri v2 Rust backend patterns:
  (8) Mutex safety in Tauri commands,
  (9) Settings caching with external edit detection,
  (10) PTY/process cleanup on window destroy,
  (11) File watcher debounce patterns.
---

# Tauri v2 Wrapper App Development

Patterns for building lightweight macOS wrapper apps that wrap local dev servers using Tauri v2. Based on production experience building a doc viewer app with bundled Node.js sidecar.

## Research-First Approach (IMPORTANT)

Tauri is still a new and rapidly evolving framework. APIs, best practices, and available features change frequently between versions. **Before implementing any workaround or hacky solution:**

1. **Search official Tauri docs first** — Use web search to check `tauri.app` documentation for the current recommended approach. What required a workaround in v2.0 may have a proper API in v2.1+.
2. **Check Tauri GitHub issues/discussions** — Search `github.com/tauri-apps/tauri` for issues and discussions. Someone likely hit the same problem and there may be an official fix or recommended pattern.
3. **Search community resources** — Check Discord archives, Stack Overflow, and blog posts for community-tested solutions. Tauri's community is active and often has practical solutions ahead of official docs.
4. **Verify version compatibility** — Always check which Tauri version the solution targets. A solution for `tauri@2.0` may not apply to `tauri@2.2`.

**Do NOT assume the patterns in this skill are still the best approach.** Always verify against current official documentation before applying them. If a cleaner official solution exists, prefer it over the patterns documented here.

## Architecture Overview

```
app/
├── Cargo.toml
├── build.rs                  # tauri_build::build()
├── tauri.conf.json           # externalBin, bundle config
├── capabilities/default.json # WebView permissions
├── binaries/                 # Downloaded Node.js binary (gitignored)
├── scripts/download-node.sh  # Binary download with SHA256 verification
├── frontend/index.html       # Loading spinner (shown during initial build)
├── test-launch.sh            # Launch test (open → verify → repeat)
└── src/main.rs               # Sidecar lifecycle, menus, window
```

## Dev Mode vs Production Mode

Use `beforeDevCommand` + `devUrl` for development (system node), bundled sidecar for production.

### Dev Mode (`cargo tauri dev`)

Tauri's `beforeDevCommand` starts the dev server using system node/pnpm — no binary download needed:

```json
{
  "build": {
    "frontendDist": "./frontend",
    "beforeDevCommand": "cd doc && pnpm dev:stable",
    "devUrl": "http://localhost:4892/docs/claude"
  }
}
```

**CRITICAL: `beforeDevCommand` CWD is the git repo root**, NOT the directory containing `tauri.conf.json`. If your app is at `app/` and your doc site is at `doc/`, use `cd doc`, NOT `cd ../doc`.

In `main.rs`, skip sidecar spawn and wait in dev mode:

```rust
const IS_DEV: bool = cfg!(debug_assertions);

fn main() {
    let sidecar = if IS_DEV {
        None // Tauri's beforeDevCommand handles the dev server
    } else {
        Some(spawn_sidecar())
    };
    // ...
    // In setup:
    if !IS_DEV {
        wait_for_build(Duration::from_secs(120));
    }
    // Window creation, menus — same in both modes
}
```

### Production Mode (Bundled Sidecar)

**Do NOT rely on host pnpm/nodenv/zshrc.** Bundle the Node.js binary as a Tauri `externalBin` sidecar for self-contained operation.

### Why Not Shell-Based Approach (Production)

The shell approach (`/bin/zsh -c "source ~/.zshrc; pnpm dev"`) has critical problems:

- Breaks when launched from Finder (minimal PATH, no shell profile loaded)
- Depends on nodenv/pnpm being installed
- Different behavior between terminal launch and Finder/Spotlight launch
- Fragile PATH resolution

### Bundled Node.js Approach (Production)

1. Download Node.js standalone binary for the target platform
2. Configure as Tauri `externalBin` — gets bundled into `.app`
3. Invoke directly: `Command::new(node_path).args(["scripts/dev-stable.js"])`
4. No shell, no PATH issues, works from Finder

## Critical Patterns

### 1. Node Binary Path Resolution (Dev vs Production)

Tauri strips the target triple from `externalBin` binaries when bundling:

- **Dev mode** (`cargo tauri dev`): `target/debug/node-aarch64-apple-darwin`
- **Production** (`.app` bundle): `Contents/MacOS/node`

```rust
fn node_binary_path() -> std::path::PathBuf {
    let exe = std::env::current_exe().expect("Failed to get current exe path");
    let dir = exe.parent().expect("Failed to get exe directory");
    // Dev mode: Tauri keeps the target triple
    let target_triple = format!("{}-apple-darwin", std::env::consts::ARCH);
    let dev_path = dir.join(format!("node-{}", target_triple));
    if dev_path.exists() {
        return dev_path;
    }
    // Production bundle: Tauri strips the triple
    dir.join("node")
}
```

### 2. Kill Stale Port Before Spawn

If a previous app instance crashed, its node process may still hold the port. Kill it in BOTH layers:

**Rust side** (before spawning sidecar):

```rust
fn kill_port() {
    if let Ok(output) = Command::new("/usr/bin/lsof")
        .args(["-ti", &format!(":{PORT}")])
        .output()
    {
        let pids = String::from_utf8_lossy(&output.stdout);
        for line in pids.trim().lines() {
            if let Ok(pid) = line.trim().parse::<i32>() {
                unsafe { libc::kill(pid, libc::SIGTERM) };
            }
        }
        if !pids.trim().is_empty() {
            thread::sleep(Duration::from_millis(500));
        }
    }
}
```

**JS side** (in dev-stable.js, before server listen):

```javascript
function killPort() {
  try {
    execSync(`lsof -ti :${PORT} | xargs kill 2>/dev/null`, { stdio: "ignore" });
  } catch {}
}
```

### 3. Sidecar Stdout/Stderr Redirection

Use `Stdio::from()` with file handles instead of shell redirection. Truncate the log on each launch to prevent unbounded growth.

```rust
let log_file = fs::OpenOptions::new()
    .create(true)
    .write(true)
    .truncate(true)
    .open(&sidecar_log_path)
    .unwrap_or_else(|e| panic!("Failed to open log: {e}"));
let log_clone = log_file.try_clone().expect("Failed to clone log handle");

let mut cmd = Command::new(&node);
cmd.args(["scripts/dev-stable.js"])
    .current_dir(&doc_dir)
    .stdout(Stdio::from(log_file))
    .stderr(Stdio::from(log_clone));
```

### 4. Process Group for Clean Shutdown

```rust
#[cfg(unix)]
{
    use std::os::unix::process::CommandExt;
    cmd.process_group(0);
}
// Kill: libc::kill(-pid, libc::SIGTERM), wait 500ms, then child.kill()
```

### 5. Wait for Build, Then Open Window

Poll `___ready` endpoint via curl. Create the window ONLY after the build completes — no IPC polling from frontend needed.

```rust
fn wait_for_build(timeout: Duration) {
    let start = Instant::now();
    while start.elapsed() < timeout {
        let code = curl_ready(); // uses /usr/bin/curl
        if code == "200" { return; }
        thread::sleep(Duration::from_secs(1));
    }
}

// In setup:
wait_for_build(Duration::from_secs(120));
let url: tauri::Url = format!("http://localhost:{PORT}/docs/claude").parse().unwrap();
WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
    .title("My App")
    .inner_size(1200.0, 800.0)
    .build()?;
```

This is simpler and more reliable than the IPC approach (no `withGlobalTauri`, no `__TAURI__` polling, no cross-origin issues).

### 6. Binary Existence Check

Panic early with a clear message if the download script wasn't run:

```rust
if !node.exists() {
    panic!("Node binary not found at {}. Run scripts/download-node.sh first.", node.display());
}
```

### 7. macOS Window Close Must Exit

```rust
.run(move |app_handle, event| match &event {
    tauri::RunEvent::WindowEvent {
        event: tauri::WindowEvent::Destroyed, ..
    } => {
        // Kill sidecar, then exit
        if let Ok(mut g) = sidecar_for_exit.lock() {
            if let Some(mut s) = g.take() { kill_sidecar(&mut s); }
        }
        app_handle.exit(0);
    }
    _ => {}
});
```

## SSE Live-Reload for Dev Server

For dev servers that do full rebuilds (not HMR), add SSE-based live-reload:

1. **`/___events` SSE endpoint** — keeps browser connections open
2. **`building` event** — sent when rebuild starts → browser shows spinner overlay
3. **`rebuild` event** — sent when rebuild completes → browser reloads

```javascript
const sseClients = new Set();

// In server handler:
if (pathname === "/___events") {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });
  res.write("data: connected\n\n");
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
  return;
}

// Broadcast:
function broadcastSSE(eventType, data) {
  const msg = `event: ${eventType}\ndata: ${data}\n\n`;
  for (const res of sseClients) {
    try { res.write(msg); } catch { sseClients.delete(res); }
  }
}
```

**Inject into HTML responses:**

```javascript
const LIVE_RELOAD_SCRIPT = `<script>(function(){
var es=new EventSource('/___events');
var dot;
es.addEventListener('building',function(){
  if(dot)return;
  dot=document.createElement('div');
  dot.innerHTML='<div style="width:80px;height:80px;border:4px solid #383838;border-top-color:#d69a66;border-radius:50%;animation:__lrs 0.7s linear infinite"></div>';
  dot.style.cssText='position:fixed;bottom:24px;right:24px;z-index:99999;background:#181818;border:1px solid #333;border-radius:12px;padding:12px;box-shadow:0 2px 12px rgba(0,0,0,0.5)';
  var st=document.createElement('style');st.textContent='@keyframes __lrs{to{transform:rotate(360deg)}}';
  dot.appendChild(st);document.body.appendChild(dot);
});
es.addEventListener('rebuild',function(){location.reload()});
es.onerror=function(){es.close();setTimeout(function(){location.reload()},3000)};
})();</script>`;

// In static file handler, for HTML responses:
if (ct.startsWith("text/html")) {
  html = html.replace("</body>", LIVE_RELOAD_SCRIPT + "</body>");
}
```

### Watcher Infinite Loop Prevention

When the build writes generated files to watched directories (e.g., `src/content/docs/`), the watcher sees those changes and triggers another rebuild → infinite loop.

**Fix:** Filter out generated content paths in the watcher callback:

```javascript
watch(dir, { recursive: true }, (event, filename) => {
  if (!filename) return;
  if (filename.includes("node_modules")) return;
  // Filter generated content — exact dir name AND contents
  if (filename === "content/docs/claude" ||
      filename.startsWith("content/docs/claude/") ||
      filename.startsWith("content/docs/claude-")) return;
  scheduleRebuild();
});
```

**Also broadcast `rebuild` on build failure** to dismiss the spinner:

```javascript
} catch (err) {
  console.error("Rebuild failed:", err.message);
  broadcastRebuild(); // dismiss spinner even on failure
}
```

## Download Script Pattern

```bash
#!/usr/bin/env bash
set -euo pipefail
NODE_VERSION="v24.13.0"
TARGET_TRIPLE="aarch64-apple-darwin"
URL="https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-darwin-arm64.tar.gz"
EXPECTED_SHA256="d595961e..."  # from nodejs.org/dist/vX.Y.Z/SHASUMS256.txt

# Download, verify checksum, extract binary
curl -fSL "$URL" -o node.tar.gz
ACTUAL=$(shasum -a 256 node.tar.gz | cut -d ' ' -f 1)
[[ "$ACTUAL" == "$EXPECTED_SHA256" ]] || { echo "SHA256 mismatch!"; exit 1; }
tar -xzf node.tar.gz --strip-components=2 "node-${NODE_VERSION}-darwin-arm64/bin/node"
mv node "binaries/node-${TARGET_TRIPLE}"
chmod +x "binaries/node-${TARGET_TRIPLE}"
```

## Project Setup

See [references/setup.md](references/setup.md) for Cargo.toml, tauri.conf.json, capabilities, and build commands.

## Testing

**Launch test** — verify app opens and serves content:

```bash
# test-launch.sh: open app, poll ___ready, verify title, repeat N times
APP_PATH="${APP_OVERRIDE:-/Applications/My App.app}"
open "$APP_PATH"
# Poll http://localhost:PORT/___ready for 200
# Then verify page title with curl
```

**SSE live-reload tests** (Node.js built-in test runner):

```bash
node --test scripts/__tests__/watch-dirs.test.js        # unit: directory config
node --test scripts/__tests__/live-reload.test.js        # e2e: SSE, rebuild, content update
```

## General Tauri v2 Rust Backend Patterns

These patterns apply to any Tauri v2 app with a Rust backend, not just sidecar wrapper apps.

### 8. Mutex Safety in Tauri Commands

Never use `.lock().unwrap()` on `Mutex<T>` in Tauri commands. A poisoned mutex will crash the entire app. Use `.map_err()` to return a graceful error instead:

```rust
fn get_project_root_string(state: &State<'_, AppState>) -> Result<String, String> {
    state
        .project_root
        .lock()
        .map(|r| r.clone())
        .map_err(|e| format!("Failed to lock project root: {}", e))
}
```

Apply this to every `Mutex::lock()` call in command handlers. For non-command contexts where you need best-effort access, use `.unwrap_or_else(|e| e.into_inner())`.

### 9. Settings Caching with External Edit Detection

Avoid re-reading settings from disk on every command call. Cache in `AppState` with mtime-based invalidation so external edits are still detected:

```rust
pub struct AppState {
    pub settings_cache: Mutex<Option<serde_json::Value>>,
    pub settings_mtime: Mutex<u64>,
    // ...
}

pub fn read_settings(root: &str, state: &State<'_, AppState>) -> Option<serde_json::Value> {
    let settings_path = Path::new(root).join(".settings.json");
    let current_mtime = mtime_ms(&settings_path);
    let stored_mtime = state.settings_mtime.lock().ok().map(|m| *m).unwrap_or(0);

    let mut cache = state.settings_cache.lock().ok()?;
    if let Some(ref cached) = *cache {
        if current_mtime == stored_mtime {
            return Some(cached.clone());
        }
    }
    // Cache miss or mtime changed — re-read
    let content = fs::read_to_string(&settings_path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&content).ok()?;
    *cache = Some(value.clone());
    if let Ok(mut m) = state.settings_mtime.lock() { *m = current_mtime; }
    Some(value)
}
```

On save, update both the cache and the stored mtime so the next read doesn't re-read unnecessarily.

### 10. PTY/Process Cleanup on Window Destroy

For apps that spawn terminal processes (PTY), clean them up when the window is destroyed to prevent orphaned processes:

```rust
.on_window_event(move |window, event| {
    if let tauri::WindowEvent::Destroyed = event {
        // Only clean up for the main window, not splash screens
        if window.label() == "main" {
            let state = window.state::<AppState>();
            commands::terminal::kill_all_ptys(&state);
        }
    }
})
```

Key points:

- Guard on window label to avoid cleanup on splash/secondary windows
- The `kill_all_ptys` function should iterate all PTY instances and send SIGTERM
- Also applies to any spawned child processes (not just PTYs)

### 11. Generic File Watcher Debounce

When watching files for external changes, debounce events to avoid excessive processing. Extract a reusable helper instead of duplicating the pattern:

```rust
fn debounced_watch_loop<T, F, E>(
    rx: mpsc::Receiver<Event>,
    debounce: Duration,
    matches_event: F,  // returns Some(T) if event is relevant
    on_emit: E,        // called with T after debounce
) where
    T: Send,
    F: Fn(&Event) -> Option<T>,
    E: Fn(T),
{
    let mut pending: Option<T> = None;
    let mut last_event_time = Instant::now();
    loop {
        match rx.recv_timeout(debounce) {
            Ok(event) => {
                if let EventKind::Create(_) | EventKind::Modify(_) = event.kind {
                    if let Some(val) = matches_event(&event) {
                        pending = Some(val);
                        last_event_time = Instant::now();
                    }
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if pending.is_some() && last_event_time.elapsed() >= debounce {
                    if let Some(val) = pending.take() { on_emit(val); }
                }
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }
}
```

Key points:

- Use `Option<T>` return from `matches_event` to keep all captured variables `Send`-safe (avoid `RefCell` which is `!Send`)
- The generic approach eliminates duplication across multiple watchers (messages, draft, pins)
- Pair with write markers (`mark_draft_write`, `mark_pin_write`) to distinguish app-originated writes from external changes

### 12. Write Marker Pattern for File Watchers

When the app writes files that it also watches, the watcher sees the app's own writes as "external changes." Use a mtime-based marker to suppress false positives:

```rust
// Before writing: record current mtime
pub fn mark_draft_write(state: &State<'_, AppState>) {
    if let Ok(ws) = state.watchers.lock() {
        let mtime = mtime_ms(&draft_path);
        if let Ok(mut m) = ws.draft_write_mtime.lock() { *m = mtime; }
    }
}

// In watcher callback: compare mtime to detect external vs app writes
let current_mtime = mtime_ms(&file_path);
let last = *mtime_arc.lock().unwrap_or_else(|e| e.into_inner());
if current_mtime > last {
    // External change — emit event to frontend
    app_handle.emit("draft:externalChange", payload);
}
```

Call `mark_*_write` after every `fs::write` in your commands — including `draft_clear` (file deletion also changes the watcher state).

### 13. Menu Event Handlers Must Not Block UI

`on_menu_event` runs on the main thread. If a handler contains a poll loop (e.g., waiting for sidecar restart), it freezes the entire window. Spawn a background thread:

```rust
app.on_menu_event(|app_handle, event| match event.id().as_ref() {
    "refresh" => {
        let handle = app_handle.clone();
        thread::spawn(move || do_refresh(&handle));
    }
    // ...
});
```

### 14. Poll Loop Timeout Logging — Use Boolean Flag

Checking `elapsed >= timeout` after a poll loop has a TOCTOU race: if the success response arrives near the timeout boundary, the elapsed check can fire even though the loop broke on success.

```rust
// WRONG — can false-positive
while start.elapsed() < Duration::from_secs(15) {
    if curl_ready() == "200" { break; }
    thread::sleep(Duration::from_millis(500));
}
if start.elapsed() >= Duration::from_secs(15) {
    log("TIMEOUT"); // May fire even on success!
}

// CORRECT — boolean flag
let mut ready = false;
while start.elapsed() < Duration::from_secs(15) {
    if curl_ready() == "200" { ready = true; break; }
    thread::sleep(Duration::from_millis(500));
}
if !ready { log("TIMEOUT"); }
```

## Common Mistakes to Avoid

1. **Never use `/bin/zsh -c "source ~/.zshrc; pnpm ..."`** — breaks from Finder. Bundle the binary instead (production only).
2. **Never use IPC polling from frontend** — simpler to poll with curl from Rust, then create window after ready.
3. **Never use `WebviewUrl::default()` with IPC** — creates cross-origin issues. Use `WebviewUrl::External(url)` after server is ready.
4. **Never forget to handle dev vs production binary naming** — Tauri strips the target triple in bundles.
5. **Never watch generated content directories** — causes infinite rebuild loops. Filter them explicitly.
6. **Always kill stale port before spawn** — in BOTH Rust and JS layers. Previous crashes leave orphan processes.
7. **Always truncate sidecar log on launch** — append mode causes unbounded file growth across sessions.
8. **Always broadcast rebuild on failure too** — otherwise the spinner overlay stays forever.
9. **Never use `.lock().unwrap()` on Mutex in Tauri commands** — a poisoned mutex will panic and crash the app. Use `.map_err()`.
10. **Always mark app-originated writes** — without write markers, file watchers emit false "externally modified" events on every save.
11. **`beforeDevCommand` CWD is repo root** — NOT the `tauri.conf.json` directory. Use `cd doc`, not `cd ../doc` if your project structure is `repo/app/` + `repo/doc/`.
12. **Never block UI in menu event handlers** — use `thread::spawn` for any handler that does I/O, polling, or sleeps.
13. **Use boolean flags for poll loop timeout logging** — not elapsed-time re-checks (TOCTOU race).
