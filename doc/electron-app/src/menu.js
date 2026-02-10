const { app, Menu, BrowserWindow } = require("electron");

// Callbacks for menu actions
let onNewWindow = null;

/**
 * Send command to focused window's webContents
 * @param {string} channel - IPC channel name
 */
function sendToFocusedWindow(channel) {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    win.webContents.send(channel);
  }
}

/**
 * Get the application menu template
 * @returns {Array} Menu template array
 */
function getMenuTemplate() {
  const isMac = process.platform === "darwin";

  const macAppMenu = {
    label: app.name,
    submenu: [
      { role: "about" },
      { type: "separator" },
      { role: "services" },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit" },
    ],
  };

  const fileMenu = {
    label: "File",
    submenu: [
      {
        label: "New Tab",
        accelerator: "CmdOrCtrl+T",
        click: () => sendToFocusedWindow("menu-new-tab"),
      },
      {
        label: "New Window",
        accelerator: "CmdOrCtrl+N",
        click: () => {
          if (onNewWindow) {
            onNewWindow();
          }
        },
      },
      { type: "separator" },
      {
        label: "Close Tab",
        accelerator: "CmdOrCtrl+W",
        click: () => sendToFocusedWindow("menu-close-tab"),
      },
      ...(isMac ? [] : [{ type: "separator" }, { role: "quit" }]),
    ],
  };

  const editMenu = {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      ...(isMac ? [{ role: "pasteAndMatchStyle" }] : []),
      { role: "delete" },
      { role: "selectAll" },
    ],
  };

  const viewMenu = {
    label: "View",
    submenu: [
      { role: "reload" },
      { role: "forceReload" },
      { role: "toggleDevTools" },
      { type: "separator" },
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ],
  };

  const windowMenu = {
    label: "Window",
    submenu: [
      { role: "minimize" },
      { role: "zoom" },
      { type: "separator" },
      ...(isMac
        ? [{ role: "front" }, { type: "separator" }, { role: "window" }]
        : [{ role: "close" }]),
    ],
  };

  return [
    ...(isMac ? [macAppMenu] : []),
    fileMenu,
    editMenu,
    viewMenu,
    windowMenu,
  ];
}

/**
 * Setup the application menu
 * @param {Object} options - Menu options
 * @param {Function} options.onNewWindow - Callback for new window action
 */
function setupMenu(options = {}) {
  onNewWindow = options.onNewWindow || null;
  const menu = Menu.buildFromTemplate(getMenuTemplate());
  Menu.setApplicationMenu(menu);
}

module.exports = {
  setupMenu,
};
