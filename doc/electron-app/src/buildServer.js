const { spawn, execSync } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");
const os = require("os");
const { SERVER_PORT } = require("./constants");
const { getShellEnv, getShell } = require("./env");

let httpServer = null;
let watchers = [];
let rebuildTimer = null;
let building = false;
let pendingRebuild = false;
let projectRootCached = null;

// MIME types for static file serving
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

/**
 * Kill any process occupying the given port
 * @param {number} port
 */
function killProcessOnPort(port) {
  try {
    const output = execSync(`lsof -ti tcp:${port}`, { encoding: "utf-8" });
    const pids = output.trim().split("\n").filter(Boolean);
    for (const pid of pids) {
      const numPid = Number(pid);
      if (numPid === process.pid) {
        console.warn(`[server] Skipping self-kill (PID ${numPid})`);
        continue;
      }
      process.kill(numPid, "SIGKILL");
    }
    if (pids.length > 0) {
      console.log(
        `Killed stale process(es) on port ${port}: ${pids.join(", ")}`
      );
    }
  } catch {
    // No process on port — fine
  }
}

/**
 * Run astro build in the site directory
 * @param {string} projectRoot
 * @param {{ skipDocHistory?: boolean }} options
 * @returns {Promise<void>}
 */
function buildSite(projectRoot, { skipDocHistory = false } = {}) {
  projectRootCached = projectRoot;

  return new Promise((resolve, reject) => {
    const siteDir = path.join(projectRoot, "site");
    const mode = skipDocHistory ? "rebuild (fast)" : "full build";
    console.log(`[build] Starting ${mode}...`);

    if (!fs.existsSync(siteDir)) {
      reject(new Error(`Site not found at: ${siteDir}`));
      return;
    }

    const shellCommand = `source ~/.zshrc 2>/dev/null || source ~/.bashrc 2>/dev/null || true; cd "${siteDir}" && pnpm run build`;

    const env = { ...getShellEnv() };
    if (skipDocHistory) {
      env.SKIP_DOC_HISTORY = "1";
    }

    const proc = spawn(getShell(), ["-c", shellCommand], {
      cwd: siteDir,
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });

    proc.stdout.on("data", (data) => {
      console.log(`[build] ${data.toString().trim()}`);
    });

    proc.stderr.on("data", (data) => {
      console.error(`[build] ${data.toString().trim()}`);
    });

    proc.on("error", (err) => {
      reject(new Error(`Build process failed: ${err.message}`));
    });

    proc.on("exit", (code) => {
      if (code === 0) {
        console.log("[build] Build complete!");
        resolve();
      } else {
        reject(new Error(`Build failed with exit code ${code}`));
      }
    });
  });
}

/**
 * Start a static file server serving site/dist/
 * @param {string} projectRoot
 * @returns {Promise<void>}
 */
function startStaticServer(projectRoot) {
  return new Promise((resolve, reject) => {
    const distDir = path.join(projectRoot, "site", "dist");

    if (!fs.existsSync(distDir)) {
      reject(new Error(`dist/ directory not found at: ${distDir}`));
      return;
    }

    killProcessOnPort(SERVER_PORT);

    httpServer = http.createServer((req, res) => {
      const urlObj = new URL(
        req.url || "/",
        `http://localhost:${SERVER_PORT}`
      );
      let urlPath = decodeURIComponent(urlObj.pathname);

      // Resolve file path
      let filePath = path.join(distDir, urlPath);

      // Security: prevent path traversal — check BEFORE any filesystem access
      const resolvedDist = path.resolve(distDir);
      if (
        path.resolve(filePath) !== resolvedDist &&
        !path.resolve(filePath).startsWith(resolvedDist + path.sep)
      ) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      // Directory -> try index.html
      try {
        if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
          filePath = path.join(filePath, "index.html");
        }
      } catch {
        // stat failed, continue
      }

      // If not found, try adding .html or /index.html
      if (!fs.existsSync(filePath)) {
        const withHtml = filePath + ".html";
        const withIndex = path.join(filePath, "index.html");
        if (fs.existsSync(withHtml)) {
          filePath = withHtml;
        } else if (fs.existsSync(withIndex)) {
          filePath = withIndex;
        } else {
          res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<h1>404 Not Found</h1>");
          return;
        }
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";

      try {
        const content = fs.readFileSync(filePath);
        res.writeHead(200, {
          "Content-Type": contentType,
          "Cache-Control": "no-cache",
        });
        res.end(content);
      } catch {
        res.writeHead(500);
        res.end("Internal server error");
      }
    });

    httpServer.listen(SERVER_PORT, "127.0.0.1", () => {
      console.log(`[server] Static server listening on port ${SERVER_PORT}`);
      resolve();
    });

    httpServer.on("error", (err) => {
      reject(new Error(`Failed to start static server: ${err.message}`));
    });
  });
}

/**
 * Cache and restore doc-history files across rebuilds.
 * Astro clears dist/ on build, so we preserve the slow-to-generate
 * doc-history JSON files and restore them after fast rebuilds.
 */
function cacheDocHistory() {
  const siteDir = path.join(projectRootCached, "site");
  const docHistoryDir = path.join(siteDir, "dist", "doc-history");
  const cacheDir = path.join(siteDir, ".doc-history-cache");

  if (fs.existsSync(docHistoryDir)) {
    if (fs.existsSync(cacheDir)) {
      fs.rmSync(cacheDir, { recursive: true });
    }
    fs.cpSync(docHistoryDir, cacheDir, { recursive: true });
    console.log("[build] Cached doc-history for fast rebuild");
  }
}

function restoreDocHistory() {
  const siteDir = path.join(projectRootCached, "site");
  const docHistoryDir = path.join(siteDir, "dist", "doc-history");
  const cacheDir = path.join(siteDir, ".doc-history-cache");

  if (fs.existsSync(cacheDir)) {
    fs.cpSync(cacheDir, docHistoryDir, { recursive: true });
    console.log("[build] Restored doc-history from cache");
  }
}

/**
 * Schedule a debounced rebuild (fast: skips doc-history, restores from cache)
 * @param {() => void} onRebuildComplete
 */
function scheduleRebuild(onRebuildComplete) {
  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(async () => {
    rebuildTimer = null;

    if (building) {
      pendingRebuild = true;
      return;
    }

    building = true;
    try {
      cacheDocHistory();
      await buildSite(projectRootCached, { skipDocHistory: true });
      restoreDocHistory();
      onRebuildComplete();
    } catch (err) {
      console.error("[watch] Rebuild failed:", err.message);
    } finally {
      building = false;
      if (pendingRebuild) {
        pendingRebuild = false;
        scheduleRebuild(onRebuildComplete);
      }
    }
  }, 2000);
}

/**
 * Start watching ~/.claude/ content directories for changes
 * @param {() => void} onRebuildComplete - Called after each successful rebuild
 */
function startWatcher(onRebuildComplete) {
  const claudeHome = path.join(os.homedir(), ".claude");

  try {
    const w = fs.watch(
      claudeHome,
      { recursive: true },
      (eventType, filename) => {
        if (!filename) return;
        // Skip the doc/ project directory (that's us)
        if (filename.startsWith("doc/") || filename.startsWith("doc\\")) return;
        // Only react to .md file changes
        if (!filename.endsWith(".md")) return;

        console.log(`[watch] Change detected: ${filename}`);
        scheduleRebuild(onRebuildComplete);
      }
    );
    watchers.push(w);
    console.log("[watch] Watching ~/.claude/ for content changes");
  } catch (err) {
    console.error(`[watch] Failed to watch ${claudeHome}:`, err.message);
  }
}

/**
 * Stop the server and watchers
 */
function stopServer() {
  if (rebuildTimer) {
    clearTimeout(rebuildTimer);
    rebuildTimer = null;
  }

  for (const w of watchers) {
    w.close();
  }
  watchers = [];

  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }

  console.log("[server] Stopped");
}

/**
 * Check if server is running
 * @returns {boolean}
 */
function isServerRunning() {
  return httpServer !== null;
}

module.exports = {
  buildSite,
  startStaticServer,
  startWatcher,
  stopServer,
  isServerRunning,
};
