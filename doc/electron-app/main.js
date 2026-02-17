const { app, dialog, globalShortcut, BrowserWindow } = require("electron");
const { setupMenu } = require("./src/menu");
const { getProjectRoot } = require("./src/config");
const {
  createSplashWindow,
  closeSplashWindow,
  createMainWindow,
  createNewWindow,
  hasWindows,
  setupWindowIPC,
  setWindowFocusCallbacks,
} = require("./src/windows");
const {
  startDevServer,
  stopDevServer,
  isDevServerRunning,
} = require("./src/devServer");

/**
 * Initialize the application
 */
async function initialize() {
  // Setup menu with callbacks
  setupMenu({
    onNewWindow: () => createNewWindow(),
  });

  // Setup IPC handlers
  setupWindowIPC();

  // Setup focus/blur callbacks to register/unregister shortcuts
  // This ensures shortcuts only work when our app is focused
  setWindowFocusCallbacks({
    onFocus: registerGlobalShortcuts,
    onBlur: unregisterGlobalShortcuts,
  });

  createSplashWindow();

  try {
    // Get project root (may prompt user in packaged mode)
    const projectRoot = await getProjectRoot();

    if (!projectRoot) {
      // User cancelled project selection
      closeSplashWindow();
      dialog.showErrorBox(
        "No Project Selected",
        "A project directory is required to run Claude Code Doc."
      );
      app.quit();
      return;
    }

    // Start the dev server (generates docs + docusaurus start with hot reload)
    await startDevServer(projectRoot);

    // Close splash and show main window
    closeSplashWindow();
    createMainWindow();
  } catch (err) {
    closeSplashWindow();
    console.error("Failed to start:", err);
    dialog.showErrorBox("Failed to Start", err.message);
    app.quit();
  }
}

// Application lifecycle events
app.whenReady().then(initialize);

app.on("activate", async () => {
  // On macOS, re-create window when dock icon is clicked
  if (!hasWindows()) {
    if (isDevServerRunning()) {
      createMainWindow();
    } else {
      // Server not running, reinitialize
      await initialize();
    }
  }
});

app.on("window-all-closed", () => {
  // Unregister shortcuts when no windows are open (app may still run on macOS)
  unregisterGlobalShortcuts();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  unregisterGlobalShortcuts();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  stopDevServer();
});

// Track if shortcuts are currently registered
let shortcutsRegistered = false;

// Register global shortcuts for tab navigation (Cmd+1-9) and copy URL (Cmd+Option+C)
function registerGlobalShortcuts() {
  if (shortcutsRegistered) return;

  for (let i = 1; i <= 9; i++) {
    globalShortcut.register(`CommandOrControl+${i}`, () => {
      const win = BrowserWindow.getFocusedWindow();
      if (win) {
        win.webContents.send("menu-goto-tab", i - 1);
      }
    });
  }

  // Copy current URL shortcut (Cmd+Option+C / Ctrl+Alt+C)
  globalShortcut.register("CommandOrControl+Alt+C", () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      win.webContents.send("copy-current-url");
    }
  });

  shortcutsRegistered = true;
}

// Unregister global shortcuts
function unregisterGlobalShortcuts() {
  if (!shortcutsRegistered) return;

  for (let i = 1; i <= 9; i++) {
    globalShortcut.unregister(`CommandOrControl+${i}`);
  }
  globalShortcut.unregister("CommandOrControl+Alt+C");
  shortcutsRegistered = false;
}

// Handle process termination signals
process.on("SIGINT", () => {
  stopDevServer();
  app.quit();
});

process.on("SIGTERM", () => {
  stopDevServer();
  app.quit();
});
