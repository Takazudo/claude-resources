# Dev Server with Loading Page (dev-stable.js)

A Node.js dev server that starts an HTTP server immediately (serving a loading page), builds the site in the background, then atomically swaps in the build output. Watches for file changes and rebuilds automatically.

## dev-stable.js

```js
#!/usr/bin/env node

/**
 * dev-stable.js — Build-then-serve dev mode
 *
 * Starts HTTP server IMMEDIATELY with a loading page, then builds.
 * Once build completes, serves dist/ and auto-redirects the browser.
 * Watches for file changes and rebuilds automatically.
 */

import { spawn, execSync } from "node:child_process";
import { createServer } from "node:http";
import { watch, existsSync, statSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");
const DIST = join(ROOT, "dist");
const DIST_TMP = join(ROOT, "dist_tmp");
const PORT = 4892;

const MIME = {
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

const LOADING_HTML = `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #181818; color: #b8b8b8; font-family: system-ui, sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    height: 100vh; gap: 1.5rem;
  }
  .spinner { width: 32px; height: 32px; border: 3px solid #383838; border-top-color: #d69a66; border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .text { font-size: 1.1rem; color: #888; }
  .sub { font-size: 0.85rem; color: #555; }
</style></head><body>
  <div class="spinner"></div>
  <div class="text">Building documentation...</div>
  <div class="sub">This takes about 15 seconds on first launch</div>
  <script>setInterval(function(){fetch('/___ready').then(function(r){if(r.ok)location.href='/docs/claude'}).catch(function(){})},1000);</script>
</body></html>`;

let building = false;
let pendingRebuild = false;
let rebuildTimer = null;
let ready = false;

// ── Build ──────────────────────────────────────────

function build() {
  return new Promise((ok, fail) => {
    console.log("\x1b[36m[stable]\x1b[0m Building...");
    const proc = spawn("pnpm", ["exec", "astro", "build", "--outDir", "dist_tmp"], {
      cwd: ROOT,
      stdio: "inherit",
    });
    proc.on("error", fail);
    proc.on("exit", (code) => {
      if (code !== 0) return fail(new Error(`Build exit ${code}`));
      try {
        const distOld = DIST + "_old";
        if (existsSync(distOld)) rmSync(distOld, { recursive: true, force: true });
        if (existsSync(DIST)) renameSync(DIST, distOld);
        renameSync(DIST_TMP, DIST);
        if (existsSync(distOld)) rmSync(distOld, { recursive: true, force: true });
      } catch (err) {
        return fail(new Error(`Swap failed: ${err.message}`));
      }
      ok();
    });
  });
}

// ── Static server ──────────────────────────────────

function serve() {
  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${PORT}`);
    const pathname = decodeURIComponent(url.pathname);

    // Ready check endpoint — loading page polls this
    if (pathname === "/___ready") {
      if (ready) {
        res.writeHead(200);
        res.end("ok");
      } else {
        res.writeHead(503);
        res.end("building");
      }
      return;
    }

    // While building, serve loading page for any HTML request
    if (!ready) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
      res.end(LOADING_HTML);
      return;
    }

    let filePath = join(DIST, pathname);

    // Security: prevent path traversal
    const resolved = resolve(filePath);
    if (resolved !== resolve(DIST) && !resolved.startsWith(resolve(DIST) + sep)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    // Directory → index.html
    try {
      if (existsSync(filePath) && statSync(filePath).isDirectory()) {
        filePath = join(filePath, "index.html");
      }
    } catch {}

    // Fallback: .html or /index.html
    if (!existsSync(filePath)) {
      const withHtml = filePath + ".html";
      const withIndex = join(filePath, "index.html");
      if (existsSync(withHtml)) filePath = withHtml;
      else if (existsSync(withIndex)) filePath = withIndex;
      else {
        res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<h1>404 Not Found</h1>");
        return;
      }
    }

    const ct = MIME[extname(filePath).toLowerCase()] || "application/octet-stream";
    try {
      const content = readFileSync(filePath);
      res.writeHead(200, { "Content-Type": ct, "Cache-Control": "no-cache" });
      res.end(content);
    } catch {
      res.writeHead(500);
      res.end("Internal server error");
    }
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`\x1b[36m[stable]\x1b[0m Serving on http://localhost:${PORT}`);
  });
}

// ── Watcher ────────────────────────────────────────

function scheduleRebuild() {
  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(async () => {
    rebuildTimer = null;
    if (building) {
      pendingRebuild = true;
      return;
    }
    building = true;
    try {
      await build();
      ready = true;
      console.log("\x1b[36m[stable]\x1b[0m Rebuild complete — refresh browser");
    } catch (err) {
      console.error("\x1b[31m[stable]\x1b[0m Rebuild failed:", err.message);
    } finally {
      building = false;
      if (pendingRebuild) {
        pendingRebuild = false;
        scheduleRebuild();
      }
    }
  }, 1500);
}

function startWatcher() {
  const dirs = [
    join(ROOT, "src"),
    join(ROOT, "public"),
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    watch(dir, { recursive: true }, (event, filename) => {
      if (!filename) return;
      if (filename.includes("node_modules")) return;
      console.log(`\x1b[33m[watch]\x1b[0m ${event}: ${filename}`);
      scheduleRebuild();
    });
  }
  console.log("\x1b[36m[stable]\x1b[0m Watching src/ and public/ for changes");
}

// ── Kill stale port ───────────────────────────────

function killPort() {
  try {
    execSync(`lsof -ti :${PORT} | xargs kill 2>/dev/null`, { stdio: "ignore" });
  } catch {}
}

// ── Main ───────────────────────────────────────────

try {
  killPort();
  // Start server IMMEDIATELY (serves loading page while building)
  serve();
  await build();
  ready = true;
  console.log("\x1b[36m[stable]\x1b[0m Ready");
  startWatcher();
} catch (err) {
  console.error("Failed to start:", err.message);
  process.exit(1);
}
```

## Key Patterns

- **Server starts before build completes**: `serve()` is called first, so the port is listening immediately. Any request during the build gets the inline `LOADING_HTML` page
- **`/___ready` endpoint**: returns 200 when `ready === true`, 503 otherwise. The loading page's inline script polls this every second and redirects to `/docs/claude` on success. The Tauri app's `check_ready` command also hits this endpoint via raw TCP
- **Atomic swap via rename**: builds into `dist_tmp/`, then swaps directories with `rename(dist -> dist_old)` followed by `rename(dist_tmp -> dist)`. This avoids serving partially-written files during a rebuild
- **Debounced rebuilds**: `scheduleRebuild()` uses a 1500ms debounce timer so rapid file saves don't trigger multiple concurrent builds. If a change arrives during a build, `pendingRebuild` queues one more rebuild after the current one finishes
- **Stale port cleanup**: `killPort()` runs `lsof -ti :4892 | xargs kill` at startup to clear any leftover process from a previous run
- **Path traversal guard**: resolved file paths are checked against the `dist/` directory boundary before serving
