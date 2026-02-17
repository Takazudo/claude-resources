const { app, dialog } = require("electron");
const { setupMenu } = require("./src/menu");
const { getProjectRoot } = require("./src/config");
const {
  createSplashWindow,
  closeSplashWindow,
  createMainWindow,
  createNewWindow,
  hasWindows,
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
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  stopDevServer();
});

// Handle process termination signals
process.on("SIGINT", () => {
  stopDevServer();
  app.quit();
});

process.on("SIGTERM", () => {
  stopDevServer();
  app.quit();
});
