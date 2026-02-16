# electron-tabs Reference

## Setup (v1.x)

Uses `<tab-group>` custom element, not JavaScript class:

```html
<tab-group new-tab-button="true" sortable="true" theme="dark"></tab-group>
<script src="node_modules/electron-tabs/dist/electron-tabs.js"></script>
```

## Dark Theme CSS

```css
tab-group {
  --tabgroup-background: #1e1e1e;
  --tab-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --tab-font-size: 13px;
  --tab-background: #2d2d2d;
  --tab-color: #cccccc;
  --tab-border-color: #3c3c3c;
  --tab-active-background: #3c3c3c;
  --tab-active-color: #ffffff;
  --tab-hover-background: #383838;
  --button-background: transparent;
  --button-color: #cccccc;
  --button-hover-background: #3c3c3c;
}
```

## Tab Title Updates

Titles don't auto-update. Use webview events + polling fallback:

```javascript
function addTab(url) {
  const tab = tabGroup.addTab({
    title: "Loading...",
    src: url,
    active: true,
  });

  tab.once("webview-ready", (tab) => {
    const webview = tab.webview;
    if (!webview) return;

    // Title change listener
    webview.addEventListener("page-title-updated", (e) => {
      tab.setTitle(e.title);
    });

    // After load
    webview.addEventListener("did-finish-load", () => {
      const title = webview.getTitle();
      if (title && title !== "Loading...") tab.setTitle(title);
    });

    // Polling fallback (race condition workaround)
    let attempts = 0;
    const check = setInterval(() => {
      attempts++;
      const title = webview.getTitle();
      if ((title && title !== "" && title !== "Loading...") || attempts > 20) {
        if (title) tab.setTitle(title);
        clearInterval(check);
      }
    }, 250);
  });

  return tab;
}
```

## Tab Switching (Cmd+1-9)

Main process:

```javascript
const { globalShortcut, BrowserWindow } = require("electron");

function registerGlobalShortcuts() {
  for (let i = 1; i <= 9; i++) {
    globalShortcut.register(`CommandOrControl+${i}`, () => {
      const win = BrowserWindow.getFocusedWindow();
      if (win) win.webContents.send("menu-goto-tab", i - 1);
    });
  }
}

app.on("will-quit", () => globalShortcut.unregisterAll());
```

Renderer:

```javascript
ipcRenderer.on("menu-goto-tab", (event, index) => {
  const tab = tabGroup.getTabByPosition(index); // NOT getTabs()[index]
  if (tab) tab.activate();
});
```
