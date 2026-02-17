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
 * Kill any process occupying the given port
 * @param {number} port - Port number to free
 */
function killProcessOnPort(port) {
  try {
    const output = execSync(`lsof -ti tcp:${port}`, { encoding: "utf-8" });
    const pids = output.trim().split("\n").filter(Boolean);
    for (const pid of pids) {
      process.kill(Number(pid), "SIGKILL");
    }
    if (pids.length > 0) {
      console.log(`Killed stale process(es) on port ${port}: ${pids.join(", ")}`);
    }
  } catch {
    // No process on port - fine
  }
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
        // Accept any HTTP response as proof the server is alive
        (res) => resolve(res.statusCode > 0)
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
 * Start the Docusaurus dev server (with hot reload)
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

    console.log("Starting dev server...");
    console.log("Project root:", projectRoot);

    // The site is in projectRoot/site
    const siteDir = path.join(projectRoot, "site");

    // Verify project exists
    if (!fs.existsSync(siteDir)) {
      safeReject(new Error(`Site not found at: ${siteDir}`));
      return;
    }

    try {
      // Kill any stale process on the port from a previous crash
      killProcessOnPort(SERVER_PORT);

      // Start Docusaurus dev server (runs generate + docusaurus start)
      console.log("Starting Docusaurus dev server...");

      const shellCommand = `source ~/.zshrc 2>/dev/null || source ~/.bashrc 2>/dev/null || true; cd "${siteDir}" && pnpm run start:silent`;

      serverProcess = spawn(getShell(), ["-c", shellCommand], {
        cwd: siteDir,
        stdio: ["ignore", "pipe", "pipe"],
        env: getShellEnv(),
        detached: true,
      });

      serverProcess.stdout.on("data", (data) => {
        console.log(`[dev] ${data.toString().trim()}`);
      });

      serverProcess.stderr.on("data", (data) => {
        console.error(`[dev] ${data.toString().trim()}`);
      });

      serverProcess.on("error", (err) => {
        console.error("Failed to start dev server:", err);
        safeReject(err);
      });

      serverProcess.on("exit", (code) => {
        console.log(`Dev server exited with code ${code}`);
        if (code !== 0 && code !== null) {
          safeReject(new Error(`Dev server exited with code ${code}`));
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
