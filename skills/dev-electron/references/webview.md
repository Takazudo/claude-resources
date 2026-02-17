# BrowserWindow Patterns

## Basic BrowserWindow

```javascript
const { BrowserWindow } = require("electron");

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "My App",
    show: false, // Show after ready
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadURL("http://localhost:3000");
  win.once("ready-to-show", () => win.show());

  return win;
}
```

## Menu Shortcuts

```javascript
const { Menu, app } = require("electron");

const template = [
  {
    label: "File",
    submenu: [
      { role: "close" },
    ],
  },
  {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  },
  {
    label: "View",
    submenu: [
      { role: "reload" },
      { role: "forceReload" },
      { role: "toggleDevTools" },
    ],
  },
  {
    label: "Window",
    submenu: [
      { role: "minimize" },
      { role: "zoom" },
    ],
  },
];

// macOS app menu
if (process.platform === "darwin") {
  template.unshift({
    label: app.name,
    submenu: [
      { role: "about" },
      { type: "separator" },
      { role: "quit" },
    ],
  });
}

Menu.setApplicationMenu(Menu.buildFromTemplate(template));
```

## Security Settings Reference

| Setting | Secure | Use Case |
|---------|--------|----------|
| `nodeIntegration: false` | Yes | Default, most apps |
| `contextIsolation: true` | Yes | Default, most apps |

For localhost-only apps loading trusted content, these secure defaults are sufficient. No need for `nodeIntegration: true` or `webviewTag: true` when using plain BrowserWindow.
