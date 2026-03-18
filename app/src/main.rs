#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::TcpStream;
use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use std::{env, thread};

use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// A running sidecar process with its PID.
struct Sidecar {
    child: Child,
    pid: u32,
}

/// Managed state holding the sidecar process and zoom level.
struct AppState {
    sidecar: Arc<Mutex<Option<Sidecar>>>,
    zoom: Mutex<f64>,
}

/// Spawn `pnpm dev:stable` in the doc/ directory as a new process group.
/// Uses a login shell to inherit the user's PATH (needed when launched from Finder).
fn spawn_dev_server() -> Child {
    let doc_dir = env::var("HOME")
        .map(|h| std::path::PathBuf::from(h).join(".claude").join("doc"))
        .expect("HOME environment variable not set");

    let mut cmd = Command::new("/bin/zsh");
    cmd.args(["-l", "-c", "pnpm dev:stable"])
        .current_dir(&doc_dir);

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }

    cmd.spawn().expect("Failed to spawn pnpm dev:stable")
}

/// Send SIGTERM to the process group, wait briefly, then SIGKILL if still alive.
fn shutdown_process_tree(pid: u32, child: &mut Child) {
    #[cfg(unix)]
    {
        if let Ok(pid_i32) = i32::try_from(pid) {
            unsafe { libc::kill(-pid_i32, libc::SIGTERM) };
        }
    }
    thread::sleep(Duration::from_millis(500));
    match child.try_wait() {
        Ok(Some(_)) => {}
        _ => {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

/// Kill the current dev server and start a new one.
fn restart_sidecar(state: &AppState) {
    let mut guard = state.sidecar.lock().unwrap();
    if let Some(mut old) = guard.take() {
        println!("[tauri] Stopping dev server (pid {})...", old.pid);
        shutdown_process_tree(old.pid, &mut old.child);
    }
    let new_child = spawn_dev_server();
    let new_pid = new_child.id();
    println!("[tauri] Started new dev server (pid {new_pid})");
    *guard = Some(Sidecar {
        child: new_child,
        pid: new_pid,
    });
}

/// Restart the sidecar and reload the WebView.
fn do_refresh(app_handle: &AppHandle) {
    let state = app_handle.state::<AppState>();
    restart_sidecar(&state);
    // dev-stable.js serves loading page while rebuilding, so just navigate there
    if let Some(window) = app_handle.get_webview_window("main") {
        let url: tauri::Url = "http://localhost:4892/docs/claude".parse().unwrap();
        let _ = window.navigate(url);
    }
}

/// Set the zoom level and apply it to the WebView.
fn apply_zoom(app_handle: &AppHandle, level: f64) {
    let state = app_handle.state::<AppState>();
    *state.zoom.lock().unwrap() = level;
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.eval(&format!("document.body.style.zoom = '{level}'"));
    }
}

/// Tauri command: restart the dev server and reload the WebView.
#[tauri::command]
fn refresh(app_handle: AppHandle) {
    do_refresh(&app_handle);
}

/// Tauri command: navigate the main window to the docs URL.
#[tauri::command]
fn navigate_to_docs(app_handle: AppHandle) {
    if let Some(window) = app_handle.get_webview_window("main") {
        let url: tauri::Url = "http://localhost:4892/docs/claude".parse().unwrap();
        let _ = window.navigate(url);
    }
}

/// Tauri command: check if the dev server build is complete.
#[tauri::command]
fn check_ready() -> bool {
    if let Ok(mut stream) = TcpStream::connect("127.0.0.1:4892") {
        use std::io::{Read, Write};
        let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
        if stream
            .write_all(b"GET /___ready HTTP/1.0\r\n\r\n")
            .is_ok()
        {
            let mut buf = [0u8; 256];
            if let Ok(n) = stream.read(&mut buf) {
                let s = String::from_utf8_lossy(&buf[..n]);
                return s.starts_with("HTTP/1.1 200") || s.starts_with("HTTP/1.0 200");
            }
        }
    }
    false
}

fn main() {
    let child = spawn_dev_server();
    let pid = child.id();

    let app_state = AppState {
        sidecar: Arc::new(Mutex::new(Some(Sidecar { child, pid }))),
        zoom: Mutex::new(1.0),
    };

    let sidecar_for_exit = app_state.sidecar.clone();

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![refresh, check_ready, navigate_to_docs])
        .setup(|app| {
            // --- Menu bar ---
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

            let refresh_item = MenuItemBuilder::with_id("refresh", "Refresh")
                .accelerator("CmdOrCtrl+R")
                .build(app)?;
            let devtools_item =
                MenuItemBuilder::with_id("devtools", "Toggle Developer Tools")
                    .accelerator("CmdOrCtrl+Alt+I")
                    .build(app)?;
            let actual_size = MenuItemBuilder::with_id("actual_size", "Actual Size")
                .accelerator("CmdOrCtrl+0")
                .build(app)?;
            let zoom_in = MenuItemBuilder::with_id("zoom_in", "Zoom In")
                .accelerator("CmdOrCtrl+=")
                .build(app)?;
            let zoom_out = MenuItemBuilder::with_id("zoom_out", "Zoom Out")
                .accelerator("CmdOrCtrl+-")
                .build(app)?;

            let view_menu = SubmenuBuilder::new(app, "View")
                .item(&refresh_item)
                .item(&devtools_item)
                .separator()
                .item(&actual_size)
                .item(&zoom_in)
                .item(&zoom_out)
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&app_menu)
                .item(&edit_menu)
                .item(&view_menu)
                .build()?;

            app.set_menu(menu)?;

            // --- Menu event handler ---
            app.on_menu_event(|app_handle, event| match event.id().as_ref() {
                "refresh" => do_refresh(app_handle),
                "devtools" => {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        if window.is_devtools_open() {
                            window.close_devtools();
                        } else {
                            window.open_devtools();
                        }
                    }
                }
                "actual_size" => apply_zoom(app_handle, 1.0),
                "zoom_in" => {
                    let state = app_handle.state::<AppState>();
                    let level = (*state.zoom.lock().unwrap() + 0.1).min(3.0);
                    apply_zoom(app_handle, level);
                }
                "zoom_out" => {
                    let state = app_handle.state::<AppState>();
                    let level = (*state.zoom.lock().unwrap() - 0.1).max(0.1);
                    apply_zoom(app_handle, level);
                }
                _ => {}
            });

            // --- Window: load bundled loading page, JS polls localhost and redirects ---
            WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("Claude Resources")
                .inner_size(1200.0, 800.0)
                .build()?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |app_handle, event| match &event {
            // Quit the app when the window is closed (macOS: red X only hides the window by default)
            tauri::RunEvent::WindowEvent {
                event: tauri::WindowEvent::Destroyed,
                ..
            } => {
                app_handle.exit(0);
            }
            tauri::RunEvent::Exit => {
                if let Ok(mut g) = sidecar_for_exit.lock() {
                    if let Some(mut s) = g.take() {
                        shutdown_process_tree(s.pid, &mut s.child);
                    }
                }
            }
            _ => {}
        });
}
