const { BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const {
  DEV_SERVER_URL,
  MAIN_WINDOW,
  SPLASH_WINDOW,
} = require("./constants");

let splashWindow = null;
const windows = new Set();

// Callbacks for window focus/blur events
let onWindowFocus = null;
let onWindowBlur = null;

/**
 * Set callbacks for window focus/blur events
 * @param {Object} callbacks
 * @param {Function} callbacks.onFocus - Called when any window gains focus
 * @param {Function} callbacks.onBlur - Called when all windows lose focus
 */
function setWindowFocusCallbacks(callbacks) {
  onWindowFocus = callbacks.onFocus || null;
  onWindowBlur = callbacks.onBlur || null;
}

/**
 * Create and show the splash window
 */
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: SPLASH_WINDOW.width,
    height: SPLASH_WINDOW.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  splashWindow.loadFile(path.join(__dirname, "..", "splash.html"));

  splashWindow.on("closed", () => {
    splashWindow = null;
  });
}

/**
 * Close the splash window if it exists
 */
function closeSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

/**
 * Create and show a tabbed main window
 * @returns {BrowserWindow}
 */
function createMainWindow() {
  const win = new BrowserWindow({
    width: MAIN_WINDOW.width,
    height: MAIN_WINDOW.height,
    title: "Claude Code Doc",
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true,
    },
  });

  win.loadFile(path.join(__dirname, "..", "tabbed-window.html"));

  win.once("ready-to-show", () => {
    win.show();
  });

  win.on("closed", () => {
    windows.delete(win);
  });

  // Handle focus/blur for keyboard shortcut management
  win.on("focus", () => {
    if (onWindowFocus) onWindowFocus();
  });

  win.on("blur", () => {
    // Only trigger blur callback if no windows are focused
    // (switching between our windows shouldn't unregister shortcuts)
    setTimeout(() => {
      const focusedWin = BrowserWindow.getFocusedWindow();
      if (!focusedWin && onWindowBlur) {
        onWindowBlur();
      }
    }, 100);
  });

  windows.add(win);
  return win;
}

/**
 * Create a new window (for Cmd+N)
 * @returns {BrowserWindow}
 */
function createNewWindow() {
  return createMainWindow();
}

/**
 * Get all open windows
 * @returns {Set<BrowserWindow>}
 */
function getAllWindows() {
  return windows;
}

/**
 * Get the focused window
 * @returns {BrowserWindow|null}
 */
function getFocusedWindow() {
  return BrowserWindow.getFocusedWindow();
}

/**
 * Check if any windows are open
 * @returns {boolean}
 */
function hasWindows() {
  return BrowserWindow.getAllWindows().length > 0;
}

/**
 * Setup IPC handlers for window/tab management
 */
function setupWindowIPC() {
  // Handle new window request
  ipcMain.on("new-window", () => {
    createNewWindow();
  });

  // Handle get default URL
  ipcMain.handle("get-default-url", () => {
    return DEV_SERVER_URL;
  });
}

module.exports = {
  createSplashWindow,
  closeSplashWindow,
  createMainWindow,
  createNewWindow,
  getAllWindows,
  getFocusedWindow,
  hasWindows,
  setupWindowIPC,
  setWindowFocusCallbacks,
};
