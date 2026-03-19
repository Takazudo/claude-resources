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

# Tauri v2 Wrapper App Development

Patterns for building lightweight macOS wrapper apps that wrap local dev servers using Tauri v2. Based on production experience building a doc viewer app with bundled Node.js sidecar.

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

## Approach: Bundled Node.js Sidecar

**Do NOT rely on host pnpm/nodenv/zshrc.** Bundle the Node.js binary as a Tauri `externalBin` sidecar for self-contained operation.

### Why Not Shell-Based Approach

The shell approach (`/bin/zsh -c "source ~/.zshrc; pnpm dev"`) has critical problems:

- Breaks when launched from Finder (minimal PATH, no shell profile loaded)
- Depends on nodenv/pnpm being installed
- Different behavior between terminal launch and Finder/Spotlight launch
- Fragile PATH resolution

### Bundled Node.js Approach

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

## Common Mistakes to Avoid

1. **Never use `/bin/zsh -c "source ~/.zshrc; pnpm ..."`** — breaks from Finder. Bundle the binary instead.
2. **Never use IPC polling from frontend** — simpler to poll with curl from Rust, then create window after ready.
3. **Never use `WebviewUrl::default()` with IPC** — creates cross-origin issues. Use `WebviewUrl::External(url)` after server is ready.
4. **Never forget to handle dev vs production binary naming** — Tauri strips the target triple in bundles.
5. **Never watch generated content directories** — causes infinite rebuild loops. Filter them explicitly.
6. **Always kill stale port before spawn** — in BOTH Rust and JS layers. Previous crashes leave orphan processes.
7. **Always truncate sidecar log on launch** — append mode causes unbounded file growth across sessions.
8. **Always broadcast rebuild on failure too** — otherwise the spinner overlay stays forever.
