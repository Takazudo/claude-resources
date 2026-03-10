const { app, dialog } = require("electron");
const { setupMenu } = require("./src/menu");
const { getProjectRoot } = require("./src/config");
const {
  createSplashWindow,
  closeSplashWindow,
  createMainWindow,
  createNewWindow,
  hasWindows,
  reloadAllWindows,
} = require("./src/windows");
const {
  buildSite,
  startStaticServer,
  startWatcher,
  stopServer,
  isServerRunning,
} = require("./src/buildServer");

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

    // Build the site (static HTML)
    await buildSite(projectRoot);

    // Serve the built files
    await startStaticServer(projectRoot);

    // Watch for content changes and rebuild on demand
    startWatcher(() => {
      console.log("[main] Rebuild complete, reloading windows");
      reloadAllWindows();
    });

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
    if (isServerRunning()) {
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
  stopServer();
});

// Handle process termination signals
process.on("SIGINT", () => {
  stopServer();
  app.quit();
});

process.on("SIGTERM", () => {
  stopServer();
  app.quit();
});
