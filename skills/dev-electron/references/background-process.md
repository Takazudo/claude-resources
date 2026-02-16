# Background Process & Dev Server

## Basic Structure

```javascript
// main.js
const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");

let serverProcess = null;
let mainWindow = null;

app.whenReady().then(async () => {
  // 1. Show splash
  const splash = createSplashWindow();

  // 2. Start server
  await startDevServer();

  // 3. Show main window
  splash.close();
  mainWindow = createMainWindow();
});

app.on("will-quit", () => stopDevServer());
```

## Shell Environment for nodenv/anyenv

Spawned processes don't inherit version manager PATH. Source shell profile:

```javascript
function getShellEnv() {
  const shell = process.env.SHELL || "/bin/bash";
  const rcFile = shell.includes("zsh") ? "~/.zshrc" : "~/.bashrc";

  return new Promise((resolve) => {
    const child = spawn(shell, ["-c", `source ${rcFile} && env`], {
      env: process.env,
    });

    let output = "";
    child.stdout.on("data", (data) => output += data);
    child.on("close", () => {
      const env = {};
      output.split("\n").forEach((line) => {
        const [key, ...value] = line.split("=");
        if (key) env[key] = value.join("=");
      });
      resolve(env);
    });
  });
}
```

## Starting Dev Server

```javascript
async function startDevServer(projectRoot) {
  const env = await getShellEnv();

  return new Promise((resolve, reject) => {
    serverProcess = spawn("pnpm", ["start"], {
      cwd: projectRoot,
      env,
      shell: true,
      detached: true, // Create process group for cleanup
    });

    // Wait for server ready (look for URL in output)
    serverProcess.stdout.on("data", (data) => {
      const output = data.toString();
      if (output.includes("localhost:") || output.includes("ready")) {
        resolve();
      }
    });

    serverProcess.on("error", reject);

    // Timeout fallback
    setTimeout(resolve, 10000);
  });
}
```

## Process Group Cleanup (Unix)

Kill entire process group on exit (important for npm/pnpm which spawn child processes):

```javascript
function stopDevServer() {
  if (serverProcess && !serverProcess.killed) {
    try {
      // Negative PID kills entire process group
      process.kill(-serverProcess.pid, "SIGTERM");
    } catch (e) {
      serverProcess.kill("SIGTERM");
    }
    serverProcess = null;
  }
}

// Register cleanup handlers
app.on("will-quit", stopDevServer);
process.on("SIGINT", () => { stopDevServer(); app.quit(); });
process.on("SIGTERM", () => { stopDevServer(); app.quit(); });
```

## Splash Screen

```javascript
function createSplashWindow() {
  const splash = new BrowserWindow({
    width: 300,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  splash.loadFile("splash.html");
  return splash;
}
```

```html
<!-- splash.html -->
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      margin: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      background: rgba(30, 30, 30, 0.95);
      border-radius: 12px;
      color: white;
      font-family: -apple-system, sans-serif;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #333;
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="spinner"></div>
  <p>Starting...</p>
</body>
</html>
```

## macOS: Reactivate on Dock Click

```javascript
app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    if (serverProcess) {
      createMainWindow(); // Server still running
    } else {
      await startDevServer(); // Restart server
      createMainWindow();
    }
  }
});

app.on("window-all-closed", () => {
  // Keep running on macOS (dock behavior)
  if (process.platform !== "darwin") {
    app.quit();
  }
});
```
