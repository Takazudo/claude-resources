# Tauri Project Setup

## Cargo.toml

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

## build.rs

```rust
fn main() {
    tauri_build::build()
}
```

## tauri.conf.json

```json
{
  "productName": "My App",
  "version": "0.1.0",
  "identifier": "com.example.my-app",
  "build": { "frontendDist": "./frontend" },
  "app": {
    "windows": [],
    "security": { "csp": null }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [],
    "category": "DeveloperTool",
    "externalBin": ["binaries/node"],
    "macOS": { "minimumSystemVersion": "10.15" }
  }
}
```

Notes:

- `"windows": []` — no window created in config; Rust creates it after sidecar is ready
- `"csp": null` — disables CSP so WebView can load localhost
- `"externalBin"` — bundles the Node.js binary; source is at `binaries/node-<target-triple>`, Tauri strips the triple in production builds
- No `"withGlobalTauri"` needed — we don't use IPC from frontend

## capabilities/default.json

```json
{
  "identifier": "default",
  "windows": ["main"],
  "remote": { "urls": ["http://localhost:*/*"] },
  "permissions": ["core:default"]
}
```

## app/.gitignore

```
/target/
/gen/
/binaries/
```

The `binaries/` directory contains the downloaded Node.js binary (~112MB) and should not be committed.

## Build and Install

```bash
# One-time: download Node.js binary
bash scripts/download-node.sh

# Build .app bundle
cargo tauri build

# Install
cp -R target/release/bundle/macos/My\ App.app /Applications/
xattr -cr "/Applications/My App.app"  # clear quarantine
```

## Dev Mode

```bash
cargo tauri dev  # hot-reloads Rust, uses dev-mode binary path
```
