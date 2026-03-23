#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use std::{env, thread};

use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const PORT: u16 = 4892;
const DOCS_PATH: &str = "/docs/claude";
const IS_DEV: bool = cfg!(debug_assertions);

struct Sidecar {
    child: Child,
    pid: u32,
}

struct AppState {
    sidecar: Arc<Mutex<Option<Sidecar>>>,
    zoom: Mutex<f64>,
}

// ── Helpers ───────────────────────────────────────

fn home_dir() -> String {
    env::var("HOME").expect("HOME not set")
}

fn log(msg: &str) {
    use std::io::Write;
    let path = format!("{}/.claude/app/launch.log", home_dir());
    if let Ok(mut f) = std::fs::OpenOptions::new()
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

// ── Sidecar management ────────────────────────────

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

fn node_binary_path() -> std::path::PathBuf {
    let exe = std::env::current_exe().expect("Failed to get current exe path");
    let dir = exe.parent().expect("Failed to get exe directory");
    // Dev mode: Tauri keeps the target triple in the filename
    let target_triple = format!("{}-apple-darwin", std::env::consts::ARCH);
    let dev_path = dir.join(format!("node-{}", target_triple));
    if dev_path.exists() {
        return dev_path;
    }
    // Production bundle: Tauri strips the target triple
    dir.join("node")
}

fn spawn_sidecar() -> Sidecar {
    kill_port();
    let dir = doc_dir();
    let sidecar_log_path = format!("{}/.claude/app/sidecar.log", home_dir());

    log(&format!("spawn_sidecar: dir={} exists={}", dir.display(), dir.exists()));

    let node = node_binary_path();
    log(&format!("spawn_sidecar: node={} exists={}", node.display(), node.exists()));

    if !node.exists() {
        let msg = format!(
            "Node binary not found at {}. Run app/scripts/download-node.sh first.",
            node.display()
        );
        log(&msg);
        panic!("{msg}");
    }

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

    let mut cmd = Command::new(&node);
    cmd.args(["scripts/dev-stable.js"])
        .current_dir(&dir)
        .stdout(Stdio::from(log_file))
        .stderr(Stdio::from(log_file_clone));

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }

    let child = cmd.spawn().expect("Failed to spawn node sidecar");
    let pid = child.id();
    log(&format!("spawn_sidecar: pid={pid}"));

    Sidecar { child, pid }
}

fn kill_sidecar(sidecar: &mut Sidecar) {
    #[cfg(unix)]
    {
        if let Ok(pid) = i32::try_from(sidecar.pid) {
            unsafe { libc::kill(-pid, libc::SIGTERM) };
        }
    }
    thread::sleep(Duration::from_millis(500));
    match sidecar.child.try_wait() {
        Ok(Some(_)) => {}
        _ => {
            let _ = sidecar.child.kill();
            let _ = sidecar.child.wait();
        }
    }
}

/// Check ___ready endpoint via curl. Returns HTTP status code as string.
fn curl_ready() -> String {
    Command::new("/usr/bin/curl")
        .args([
            "-s", "-o", "/dev/null", "-w", "%{http_code}",
            &format!("http://localhost:{PORT}/___ready"),
        ])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|_| "err".to_string())
}

/// Wait until ___ready returns 200, up to timeout.
fn wait_for_build(timeout: Duration) {
    log("wait_for_build: start");
    let start = Instant::now();
    while start.elapsed() < timeout {
        let code = curl_ready();
        log(&format!("curl: {code} ({}s)", start.elapsed().as_secs()));
        if code == "200" {
            log("wait_for_build: ready");
            thread::sleep(Duration::from_secs(1));
            return;
        }
        thread::sleep(Duration::from_secs(1));
    }
    log("wait_for_build: TIMEOUT");
}

// ── Refresh ───────────────────────────────────────

fn do_refresh(app_handle: &AppHandle) {
    if !IS_DEV {
        // Production: restart sidecar
        let state = app_handle.state::<AppState>();
        {
            let mut guard = state.sidecar.lock().unwrap();
            if let Some(mut old) = guard.take() {
                kill_sidecar(&mut old);
            }
            *guard = Some(spawn_sidecar());
        }
        let mut ready = false;
        let start = Instant::now();
        while start.elapsed() < Duration::from_secs(15) {
            let code = curl_ready();
            if code == "200" {
                ready = true;
                break;
            }
            thread::sleep(Duration::from_millis(500));
        }
        if !ready {
            log("do_refresh: TIMEOUT waiting for server");
        }
    }

    // Both modes: navigate to the docs URL
    if let Some(w) = app_handle.get_webview_window("main") {
        let url = format!("http://localhost:{PORT}{DOCS_PATH}");
        let _ = w.navigate(url.parse().unwrap());
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
    let sidecar = if IS_DEV {
        None // Dev mode: Tauri's beforeDevCommand handles the dev server
    } else {
        Some(spawn_sidecar()) // Production: spawn bundled node sidecar
    };
    let app_state = AppState {
        sidecar: Arc::new(Mutex::new(sidecar)),
        zoom: Mutex::new(1.0),
    };
    let sidecar_for_exit = app_state.sidecar.clone();

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![refresh])
        .setup(|app| {
            // ── Menu ──
            let app_menu = SubmenuBuilder::new(app, "Claude Resources")
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

            // Wait for server only in production (dev mode: Tauri handles via devUrl)
            if !IS_DEV {
                wait_for_build(Duration::from_secs(120));
            }

            let url: tauri::Url = format!("http://localhost:{PORT}{DOCS_PATH}")
                .parse()
                .unwrap();
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("Claude Resources")
                .inner_size(1200.0, 800.0)
                .build()?;

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
    fn node_binary_path_fallback_is_node() {
        // When the dev-named binary doesn't exist (typical in test env),
        // node_binary_path falls back to "node" in the exe directory.
        let p = node_binary_path();
        assert_eq!(
            p.file_name().unwrap().to_str().unwrap(),
            "node",
            "Fallback binary name should be 'node'"
        );
    }

    #[test]
    fn node_binary_path_is_absolute() {
        let p = node_binary_path();
        assert!(p.is_absolute(), "node_binary_path must be absolute");
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
    fn tauri_conf_devurl_uses_same_path() {
        let conf = read_tauri_conf();
        let dev_url = conf["build"]["devUrl"].as_str().expect("devUrl must be a string");
        assert!(
            dev_url.contains(DOCS_PATH),
            "devUrl '{dev_url}' should reference DOCS_PATH '{DOCS_PATH}'"
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
        let url_str = format!("http://localhost:{PORT}{DOCS_PATH}");
        let url: Result<tauri::Url, _> = url_str.parse();
        assert!(url.is_ok(), "Docs URL should be parseable: {url_str}");
    }
}
