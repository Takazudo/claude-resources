const { BrowserWindow, shell } = require("electron");
const path = require("path");
const {
  DEV_SERVER_URL,
  MAIN_WINDOW,
  SPLASH_WINDOW,
} = require("./constants");

let splashWindow = null;
const windows = new Set();

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
 * Create and show a main window that loads the Docusaurus dev server directly
 * @returns {BrowserWindow}
 */
function createMainWindow() {
  const win = new BrowserWindow({
    width: MAIN_WINDOW.width,
    height: MAIN_WINDOW.height,
    title: "Claude Code Doc",
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadURL(DEV_SERVER_URL);

  win.once("ready-to-show", () => {
    win.show();
  });

  win.on("closed", () => {
    windows.delete(win);
  });

  // Open external links (Cmd+click) in default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
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
 * Check if any windows are open
 * @returns {boolean}
 */
function hasWindows() {
  return BrowserWindow.getAllWindows().length > 0;
}

module.exports = {
  createSplashWindow,
  closeSplashWindow,
  createMainWindow,
  createNewWindow,
  hasWindows,
};
