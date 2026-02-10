const { spawn, execSync } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");
const {
  DEV_SERVER_URL,
  SERVER_START_TIMEOUT_MS,
  SERVER_POLL_INTERVAL_MS,
  HTTP_REQUEST_TIMEOUT_MS,
  SERVER_PORT,
} = require("./constants");
const { getShellEnv, getShell } = require("./env");

let serverProcess = null;

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if the server is responding
 * @param {string} url - URL to check
 * @returns {Promise<boolean>}
 */
function isServerReady(url) {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(url);
      const req = http.request(
        {
          hostname: urlObj.hostname,
          port: urlObj.port || 80,
          path: "/",
          method: "HEAD",
          timeout: HTTP_REQUEST_TIMEOUT_MS,
        },
        (res) => resolve(res.statusCode === 200)
      );

      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    } catch {
      resolve(false);
    }
  });
}

/**
 * Wait for the server to be ready
 * @param {string} url - URL to poll
 * @param {number} timeout - Maximum time to wait in ms
 * @returns {Promise<void>}
 */
async function waitForServer(url, timeout) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await isServerReady(url)) {
      console.log("Server is ready!");
      return;
    }
    await sleep(SERVER_POLL_INTERVAL_MS);
  }

  throw new Error("Timeout waiting for server");
}

/**
 * Build the Docusaurus site
 * @param {string} siteDir - Path to the site directory
 * @returns {Promise<void>}
 */
function buildSite(siteDir) {
  return new Promise((resolve, reject) => {
    console.log("Building site...");

    // Build shell command - source shell profile for proper PATH
    const shellCommand = `source ~/.zshrc 2>/dev/null || source ~/.bashrc 2>/dev/null || true; cd "${siteDir}" && pnpm run build`;

    const buildProcess = spawn(getShell(), ["-c", shellCommand], {
      cwd: siteDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: getShellEnv(),
    });

    buildProcess.stdout.on("data", (data) => {
      console.log(`[build] ${data.toString().trim()}`);
    });

    buildProcess.stderr.on("data", (data) => {
      console.error(`[build] ${data.toString().trim()}`);
    });

    buildProcess.on("error", (err) => {
      console.error("Build failed:", err);
      reject(err);
    });

    buildProcess.on("exit", (code) => {
      if (code === 0) {
        console.log("Build completed successfully!");
        resolve();
      } else {
        reject(new Error(`Build exited with code ${code}`));
      }
    });
  });
}

/**
 * Start the static file server
 * @param {string} projectRoot - Path to the project root (doc/ directory)
 * @returns {Promise<void>}
 */
function startDevServer(projectRoot) {
  return new Promise(async (resolve, reject) => {
    let settled = false;

    const safeResolve = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    const safeReject = (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    };

    console.log("Starting server...");
    console.log("Project root:", projectRoot);

    // The site is in projectRoot/site
    const siteDir = path.join(projectRoot, "site");
    const buildDir = path.join(siteDir, "build");

    // Verify project exists
    if (!fs.existsSync(siteDir)) {
      safeReject(new Error(`Site not found at: ${siteDir}`));
      return;
    }

    try {
      // Build the site first
      await buildSite(siteDir);

      // Verify build directory exists
      if (!fs.existsSync(buildDir)) {
        safeReject(new Error(`Build directory not found at: ${buildDir}`));
        return;
      }

      // Start serving static files using docusaurus serve
      console.log("Starting static file server...");

      const shellCommand = `source ~/.zshrc 2>/dev/null || source ~/.bashrc 2>/dev/null || true; cd "${siteDir}" && pnpm exec docusaurus serve --port ${SERVER_PORT} --host claude.localhost --no-open`;

      serverProcess = spawn(getShell(), ["-c", shellCommand], {
        cwd: siteDir,
        stdio: ["ignore", "pipe", "pipe"],
        env: getShellEnv(),
        detached: true,
      });

      serverProcess.stdout.on("data", (data) => {
        console.log(`[serve] ${data.toString().trim()}`);
      });

      serverProcess.stderr.on("data", (data) => {
        console.error(`[serve] ${data.toString().trim()}`);
      });

      serverProcess.on("error", (err) => {
        console.error("Failed to start server:", err);
        safeReject(err);
      });

      serverProcess.on("exit", (code) => {
        console.log(`Server exited with code ${code}`);
        if (code !== 0 && code !== null) {
          safeReject(new Error(`Server exited with code ${code}`));
        }
      });

      // Wait for server to be ready
      await waitForServer(DEV_SERVER_URL, SERVER_START_TIMEOUT_MS);
      safeResolve();
    } catch (err) {
      safeReject(err);
    }
  });
}

/**
 * Safely kill a process
 * @param {number} pid - Process ID
 * @param {string} signal - Signal to send
 */
function safeKill(pid, signal = "SIGTERM") {
  try {
    process.kill(pid, signal);
  } catch {
    // Process already dead - ignore
  }
}

/**
 * Stop the server
 */
function stopDevServer() {
  if (!serverProcess) {
    return;
  }

  console.log("Stopping server...");

  const isUnix = process.platform === "darwin" || process.platform === "linux";

  // Kill process group on Unix to ensure all child processes are terminated
  if (isUnix && serverProcess.pid) {
    safeKill(-serverProcess.pid, "SIGTERM");
  }

  // Also try direct kill as fallback
  if (serverProcess.pid) {
    safeKill(serverProcess.pid, "SIGTERM");
  }

  serverProcess = null;
}

/**
 * Check if server is running
 * @returns {boolean}
 */
function isDevServerRunning() {
  return serverProcess !== null;
}

module.exports = {
  startDevServer,
  stopDevServer,
  isDevServerRunning,
};
