#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use std::{env, thread};

use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tower_http::services::ServeDir;

const PORT: u16 = 4892;
const DOCS_PATH: &str = "/";
const IS_DEV: bool = cfg!(debug_assertions);

struct Sidecar {
    child: Child,
    pid: u32,
}

struct AppState {
    sidecar: Arc<Mutex<Option<Sidecar>>>,
    node_path: Option<std::path::PathBuf>,
    zoom: Mutex<f64>,
}

// ── Helpers ───────────────────────────────────────

fn home_dir() -> String {
    env::var("HOME").expect("HOME not set")
}

fn log(msg: &str) {
    use std::io::Write;
    let path = format!("{}/.claude/doc/src-tauri/launch.log", home_dir());
    if let Ok(mut f) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        let secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let _ = writeln!(f, "[{secs}] {msg}");
    }
}

fn doc_dir() -> std::path::PathBuf {
    std::path::PathBuf::from(home_dir()).join(".claude").join("doc")
}

fn dist_dir() -> std::path::PathBuf {
    doc_dir().join("dist")
}

fn docs_url() -> String {
    format!("http://localhost:{PORT}{DOCS_PATH}")
}

// ── Node detection ───────────────────────────────

fn find_node() -> Option<std::path::PathBuf> {
    let home = home_dir();

    // 1. Direct paths (system / Homebrew installs)
    let candidates = [
        "/opt/homebrew/bin/node",
        "/usr/local/bin/node",
    ];
    for p in &candidates {
        let path = std::path::PathBuf::from(p);
        if path.exists() {
            log(&format!("find_node: found {}", path.display()));
            return Some(path);
        }
    }

    // 2. Version managers — resolve actual binary (not shim) so it works
    //    without shell env when launched from Finder / launchd.

    // anyenv/nodenv, standalone nodenv
    let nodenv_roots = [
        format!("{home}/.anyenv/envs/nodenv"),
        format!("{home}/.nodenv"),
    ];
    for root in &nodenv_roots {
        if let Some(path) = find_node_in_versions_dir(root, "nodenv") {
            return Some(path);
        }
    }

    // nvm — versions stored in $HOME/.nvm/versions/node/<ver>/bin/node
    let nvm_root = format!("{home}/.nvm");
    if let Some(path) = find_node_in_versions_dir(
        &format!("{nvm_root}/versions/node"), "nvm",
    ) {
        return Some(path);
    }

    // volta — actual binaries in $HOME/.volta/tools/image/node/<ver>/bin/node
    let volta_root = format!("{home}/.volta/tools/image/node");
    if let Some(path) = find_node_in_versions_dir(&volta_root, "volta") {
        return Some(path);
    }

    // fnm — check both modern (Library/Application Support/fnm) and legacy (~/.fnm)
    for fnm_base in &[
        format!("{home}/Library/Application Support/fnm/node-versions"),
        format!("{home}/.fnm/node-versions"),
    ] {
        if let Some(path) = find_node_in_versions_dir(fnm_base, "fnm") {
            return Some(path);
        }
    }

    // 3. Fallback: `which node` (unlikely to find version managers when launched from Finder)
    if let Ok(output) = Command::new("/usr/bin/which").arg("node").output() {
        let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !path_str.is_empty() {
            let path = std::path::PathBuf::from(&path_str);
            if path.exists() {
                log(&format!("find_node: found via which: {}", path.display()));
                return Some(path);
            }
        }
    }
    log("find_node: no node binary found on system");
    None
}

/// Find a node binary inside a directory containing version subdirectories.
/// Works for nodenv (`versions/`), nvm (`versions/node/`), volta (`tools/image/node/`), fnm.
///
/// For nodenv roots, also checks the `version` file to prefer the configured global version.
/// Falls back to the highest installed version using numeric semver sort.
fn find_node_in_versions_dir(dir: &str, label: &str) -> Option<std::path::PathBuf> {
    let dir_path = std::path::PathBuf::from(dir);
    if !dir_path.exists() {
        return None;
    }

    // For nodenv roots: the dir is the root, versions are in `versions/`
    // For nvm/volta/fnm: the dir already points at the versions directory
    let versions_dir = if dir_path.join("versions").exists() {
        // nodenv-style root — also check its `version` file for the configured global
        if let Ok(ver) = fs::read_to_string(dir_path.join("version")) {
            let ver = ver.trim();
            let node_path = dir_path.join("versions").join(ver).join("bin").join("node");
            if node_path.exists() {
                log(&format!("find_node: found via {label} ({dir}): {}", node_path.display()));
                return Some(node_path);
            }
        }
        dir_path.join("versions")
    } else {
        dir_path
    };

    // Scan version subdirectories and pick the highest using numeric sort
    if let Ok(entries) = fs::read_dir(&versions_dir) {
        let mut versions: Vec<String> = entries
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().map(|ft| ft.is_dir()).unwrap_or(false))
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect();
        // Sort by numeric version components (handles 9.x vs 20.x correctly)
        versions.sort_by(|a, b| {
            let parse = |s: &str| -> Vec<u64> {
                // Strip leading 'v' (nvm uses "v20.11.0" directory names)
                s.strip_prefix('v').unwrap_or(s)
                    .split('.')
                    .filter_map(|p| p.parse().ok())
                    .collect()
            };
            parse(a).cmp(&parse(b))
        });
        if let Some(ver) = versions.last() {
            let node_path = versions_dir.join(ver).join("bin").join("node");
            if node_path.exists() {
                log(&format!("find_node: found via {label} ({dir}): {}", node_path.display()));
                return Some(node_path);
            }
        }
    }

    None
}

// ── Port cleanup ─────────────────────────────────

fn kill_port() {
    if let Ok(output) = Command::new("/usr/bin/lsof")
        .args(["-ti", &format!(":{PORT}")])
        .output()
    {
        let pids = String::from_utf8_lossy(&output.stdout);
        for line in pids.trim().lines() {
            if let Ok(pid) = line.trim().parse::<i32>() {
                log(&format!("kill_port: killing stale pid {pid} on port {PORT}"));
                unsafe { libc::kill(pid, libc::SIGTERM) };
            }
        }
        if !pids.trim().is_empty() {
            thread::sleep(Duration::from_millis(500));
        }
    }
}

// ── Sidecar management ──────────────────────────

fn spawn_sidecar(node_path: &std::path::Path) -> Sidecar {
    let dir = doc_dir();
    let sidecar_log_path = format!("{}/.claude/doc/src-tauri/sidecar.log", home_dir());

    log(&format!(
        "spawn_sidecar: node={} dir={} exists={}",
        node_path.display(),
        dir.display(),
        dir.exists()
    ));

    let log_file = fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&sidecar_log_path)
        .unwrap_or_else(|e| {
            log(&format!("Failed to open sidecar log: {e}"));
            panic!("Failed to open sidecar log at {sidecar_log_path}: {e}");
        });
    let log_file_clone = log_file
        .try_clone()
        .expect("Failed to clone sidecar log file handle");

    let mut cmd = Command::new(node_path);
    cmd.args(["scripts/dev-stable.js"])
        .current_dir(&dir)
        .stdout(Stdio::from(log_file))
        .stderr(Stdio::from(log_file_clone));

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }

    let child = cmd.spawn().unwrap_or_else(|e| {
        log(&format!("Failed to spawn sidecar (node={}): {e}", node_path.display()));
        panic!("Failed to spawn node sidecar: {e}");
    });
    let pid = child.id();
    log(&format!("spawn_sidecar: pid={pid}"));

    Sidecar { child, pid }
}

fn kill_sidecar(sidecar: &mut Sidecar) {
    log(&format!("kill_sidecar: pid={}", sidecar.pid));
    #[cfg(unix)]
    {
        if let Ok(pid) = i32::try_from(sidecar.pid) {
            unsafe { libc::kill(-pid, libc::SIGTERM) };
        }
    }
    thread::sleep(Duration::from_millis(500));
    match sidecar.child.try_wait() {
        Ok(Some(_)) => {
            log("kill_sidecar: process already exited");
        }
        _ => {
            log("kill_sidecar: escalating to SIGKILL");
            let _ = sidecar.child.kill();
            let _ = sidecar.child.wait();
        }
    }
}

// ── Static file server (fallback) ────────────────

async fn ready_handler() -> impl IntoResponse {
    if dist_dir().join("index.html").exists() {
        (axum::http::StatusCode::OK, "ready")
    } else {
        (axum::http::StatusCode::SERVICE_UNAVAILABLE, "not ready")
    }
}

fn start_server() {
    thread::spawn(|| {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("Failed to create tokio runtime");
        rt.block_on(async {
            let dist = dist_dir();
            log(&format!("start_server: serving from {}", dist.display()));
            let app = Router::new()
                .route("/___ready", get(ready_handler))
                .fallback_service(ServeDir::new(&dist));
            let addr = format!("127.0.0.1:{PORT}");
            let listener = match tokio::net::TcpListener::bind(&addr).await {
                Ok(l) => l,
                Err(e) => {
                    log(&format!("start_server: FAILED to bind {addr}: {e}"));
                    return;
                }
            };
            log(&format!("start_server: listening on {addr}"));
            if let Err(e) = axum::serve(listener, app).await {
                log(&format!("Server error: {e}"));
            }
        });
    });
}

// ── Readiness polling ────────────────────────────

/// Poll ___ready endpoint via curl. Returns HTTP status code as string.
fn curl_ready() -> String {
    Command::new("/usr/bin/curl")
        .args([
            "-s",
            "-o",
            "/dev/null",
            "-w",
            "%{http_code}",
            &format!("http://localhost:{PORT}/___ready"),
        ])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|_| "err".to_string())
}

/// Wait until ___ready returns 200, up to timeout.
fn wait_for_ready(timeout: Duration) {
    log("wait_for_ready: start");
    let start = Instant::now();
    let mut ready = false;
    while start.elapsed() < timeout {
        let code = curl_ready();
        log(&format!("curl: {code} ({}s)", start.elapsed().as_secs()));
        if code == "200" {
            log("wait_for_ready: ready");
            ready = true;
            break;
        }
        thread::sleep(Duration::from_secs(1));
    }
    if !ready {
        log("wait_for_ready: TIMEOUT — doc site may not be built");
    }
}

// ── Refresh ───────────────────────────────────────

fn do_refresh(app_handle: &AppHandle) {
    if !IS_DEV {
        let state = app_handle.state::<AppState>();
        // Sidecar mode: restart and wait. Axum mode: no restart needed (always ready).
        if let Some(ref node_path) = state.node_path {
            let node_path = node_path.clone();
            let mut guard = state.sidecar.lock().unwrap();
            if let Some(mut old) = guard.take() {
                kill_sidecar(&mut old);
            }
            kill_port();
            *guard = Some(spawn_sidecar(&node_path));
            drop(guard);
            wait_for_ready(Duration::from_secs(15));
        }
    }

    if let Some(w) = app_handle.get_webview_window("main") {
        let _ = w.navigate(docs_url().parse().expect("BUG: docs_url produced an invalid URL"));
    }
}

fn apply_zoom(app_handle: &AppHandle, level: f64) {
    let state = app_handle.state::<AppState>();
    *state.zoom.lock().unwrap() = level;
    if let Some(w) = app_handle.get_webview_window("main") {
        let _ = w.eval(&format!("document.body.style.zoom = '{level}'"));
    }
}

#[tauri::command]
fn refresh(app_handle: AppHandle) {
    do_refresh(&app_handle);
}

// ── Main ──────────────────────────────────────────

fn main() {
    let found_node = if IS_DEV { None } else { find_node() };

    let sidecar: Option<Sidecar> = if IS_DEV {
        None
    } else {
        kill_port();
        if let Some(ref node_path) = found_node {
            log("main: system node found, spawning sidecar for build+watch");
            Some(spawn_sidecar(node_path))
        } else {
            log("main: no node found, falling back to axum static server");
            start_server();
            None
        }
    };

    let has_sidecar = sidecar.is_some();

    let app_state = AppState {
        sidecar: Arc::new(Mutex::new(sidecar)),
        node_path: found_node,
        zoom: Mutex::new(1.0),
    };
    let sidecar_for_exit = app_state.sidecar.clone();

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![refresh])
        .setup(move |app| {
            // ── Menu ──
            let app_menu = SubmenuBuilder::new(app, "CCResDoc")
                .about(None)
                .separator()
                .quit()
                .build()?;

            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;

            let view_menu = SubmenuBuilder::new(app, "View")
                .item(
                    &MenuItemBuilder::with_id("refresh", "Refresh")
                        .accelerator("CmdOrCtrl+R")
                        .build(app)?,
                )
                .item(
                    &MenuItemBuilder::with_id("devtools", "Toggle Developer Tools")
                        .accelerator("CmdOrCtrl+Alt+I")
                        .build(app)?,
                )
                .separator()
                .item(
                    &MenuItemBuilder::with_id("actual_size", "Actual Size")
                        .accelerator("CmdOrCtrl+0")
                        .build(app)?,
                )
                .item(
                    &MenuItemBuilder::with_id("zoom_in", "Zoom In")
                        .accelerator("CmdOrCtrl+=")
                        .build(app)?,
                )
                .item(
                    &MenuItemBuilder::with_id("zoom_out", "Zoom Out")
                        .accelerator("CmdOrCtrl+-")
                        .build(app)?,
                )
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&app_menu)
                .item(&edit_menu)
                .item(&view_menu)
                .build()?;

            app.set_menu(menu)?;

            app.on_menu_event(|app_handle, event| match event.id().as_ref() {
                "refresh" => {
                    let handle = app_handle.clone();
                    thread::spawn(move || do_refresh(&handle));
                }
                "devtools" => {
                    if let Some(w) = app_handle.get_webview_window("main") {
                        if w.is_devtools_open() {
                            w.close_devtools();
                        } else {
                            w.open_devtools();
                        }
                    }
                }
                "actual_size" => apply_zoom(app_handle, 1.0),
                "zoom_in" => {
                    let state = app_handle.state::<AppState>();
                    let z = (*state.zoom.lock().unwrap() + 0.1).min(3.0);
                    apply_zoom(app_handle, z);
                }
                "zoom_out" => {
                    let state = app_handle.state::<AppState>();
                    let z = (*state.zoom.lock().unwrap() - 0.1).max(0.1);
                    apply_zoom(app_handle, z);
                }
                _ => {}
            });

            // Show window immediately with loading page, then navigate
            // once the server is ready (avoids frozen-looking app during build)
            if IS_DEV {
                let url: tauri::Url = docs_url().parse().expect("BUG: docs_url produced an invalid URL");
                WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                    .title("CCResDoc")
                    .inner_size(1200.0, 800.0)
                    .build()?;
            } else {
                WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                    .title("CCResDoc")
                    .inner_size(1200.0, 800.0)
                    .build()?;

                let timeout = if has_sidecar { 120 } else { 30 };
                let handle = app.handle().clone();
                thread::spawn(move || {
                    wait_for_ready(Duration::from_secs(timeout));
                    if let Some(w) = handle.get_webview_window("main") {
                        let url: tauri::Url = docs_url().parse().expect("BUG: docs_url produced an invalid URL");
                        let _ = w.navigate(url);
                    }
                });
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |app_handle, event| match &event {
            tauri::RunEvent::WindowEvent {
                event: tauri::WindowEvent::Destroyed,
                ..
            } => {
                if !IS_DEV {
                    if let Ok(mut g) = sidecar_for_exit.lock() {
                        if let Some(mut s) = g.take() {
                            kill_sidecar(&mut s);
                        }
                    }
                }
                app_handle.exit(0);
            }
            _ => {}
        });
}

// ── Tests ─────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn read_tauri_conf() -> serde_json::Value {
        let conf_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tauri.conf.json");
        let raw = std::fs::read_to_string(&conf_path).expect("Failed to read tauri.conf.json");
        serde_json::from_str(&raw).expect("Failed to parse tauri.conf.json")
    }

    #[test]
    fn docs_path_starts_with_slash() {
        assert!(DOCS_PATH.starts_with('/'), "DOCS_PATH must start with /");
    }

    #[test]
    fn doc_dir_ends_with_claude_doc() {
        let d = doc_dir();
        assert!(
            d.ends_with(".claude/doc"),
            "doc_dir should end with .claude/doc, got: {}",
            d.display()
        );
    }

    #[test]
    fn dist_dir_ends_with_dist() {
        let d = dist_dir();
        assert!(
            d.ends_with(".claude/doc/dist"),
            "dist_dir should end with .claude/doc/dist, got: {}",
            d.display()
        );
    }

    #[test]
    fn find_node_returns_valid_path_or_none() {
        let result = find_node();
        if let Some(ref path) = result {
            assert!(path.is_absolute(), "node path should be absolute");
            assert!(path.exists(), "returned node path should exist");
            assert_eq!(
                path.file_name().unwrap().to_str().unwrap(),
                "node",
                "binary should be named 'node'"
            );
        }
    }

    #[test]
    fn find_node_in_versions_dir_returns_none_for_missing_root() {
        assert!(find_node_in_versions_dir("/nonexistent/path", "test").is_none());
    }

    #[test]
    fn find_node_detects_anyenv_nodenv() {
        // If anyenv/nodenv is installed on this machine, find_node should find it
        let home = home_dir();
        let root = format!("{home}/.anyenv/envs/nodenv");
        if PathBuf::from(&root).join("versions").exists() {
            let result = find_node_in_versions_dir(&root, "nodenv");
            assert!(result.is_some(), "should find node in anyenv/nodenv");
            let path = result.unwrap();
            assert!(path.exists(), "resolved node binary should exist");
            assert_eq!(
                path.file_name().unwrap().to_str().unwrap(),
                "node",
                "binary should be named 'node'"
            );
        }
    }

    #[test]
    fn tauri_conf_devurl_uses_same_port() {
        let conf = read_tauri_conf();
        let dev_url = conf["build"]["devUrl"].as_str().expect("devUrl must be a string");
        let expected = format!("localhost:{PORT}");
        assert!(
            dev_url.contains(&expected),
            "devUrl '{dev_url}' should reference port {PORT}"
        );
    }

    #[test]
    fn tauri_conf_devurl_matches_docs_url() {
        let conf = read_tauri_conf();
        let dev_url = conf["build"]["devUrl"].as_str().expect("devUrl must be a string");
        let expected = docs_url();
        assert_eq!(
            dev_url, expected,
            "devUrl '{dev_url}' should equal docs_url '{expected}'"
        );
    }

    #[test]
    fn tauri_conf_has_before_dev_command() {
        let conf = read_tauri_conf();
        let cmd = conf["build"]["beforeDevCommand"]
            .as_str()
            .expect("beforeDevCommand must be a string");
        assert!(!cmd.is_empty(), "beforeDevCommand must not be empty");
    }

    #[test]
    fn tauri_conf_before_dev_command_runs_dev_stable() {
        let conf = read_tauri_conf();
        let cmd = conf["build"]["beforeDevCommand"]
            .as_str()
            .expect("beforeDevCommand must be a string");
        assert!(
            cmd.contains("pnpm dev:stable"),
            "beforeDevCommand '{cmd}' should run pnpm dev:stable"
        );
    }

    #[test]
    fn docs_url_format_is_valid() {
        let url_str = docs_url();
        let url: Result<tauri::Url, _> = url_str.parse();
        assert!(url.is_ok(), "Docs URL should be parseable: {url_str}");
    }
}
