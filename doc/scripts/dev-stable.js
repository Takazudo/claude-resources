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
import { getWatchDirs } from "./watch-dirs.js";

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
let buildId = 0;

// ── SSE live-reload ─────────────────────────────────

const sseClients = new Set();

const LIVE_RELOAD_SCRIPT = `<script>(function(){
var es=new EventSource('/___events');
var dot;
es.addEventListener('building',function(){
  if(dot)return;
  dot=document.createElement('div');
  dot.id='__lr';
  dot.innerHTML='<div style="width:80px;height:80px;border:4px solid #383838;border-top-color:#d69a66;border-radius:50%;animation:__lrs 0.7s linear infinite"></div>';
  dot.style.cssText='position:fixed;bottom:24px;right:24px;z-index:99999;background:#181818;border:1px solid #333;border-radius:12px;padding:12px;box-shadow:0 2px 12px rgba(0,0,0,0.5)';
  var st=document.createElement('style');
  st.textContent='@keyframes __lrs{to{transform:rotate(360deg)}}';
  dot.appendChild(st);
  document.body.appendChild(dot);
});
es.addEventListener('rebuild',function(){location.reload()});
es.onerror=function(){es.close();setTimeout(function(){location.reload()},3000)};
})();</script>`;

function broadcastSSE(eventType, data) {
  const msg = `event: ${eventType}\ndata: ${data}\n\n`;
  for (const res of sseClients) {
    try { res.write(msg); } catch { sseClients.delete(res); }
  }
}

function broadcastBuilding() {
  broadcastSSE("building", "start");
  console.log(`\x1b[36m[stable]\x1b[0m SSE broadcast building (clients=${sseClients.size})`);
}

function broadcastRebuild() {
  buildId++;
  broadcastSSE("rebuild", buildId);
  console.log(`\x1b[36m[stable]\x1b[0m SSE broadcast rebuild (id=${buildId}, clients=${sseClients.size})`);
}

// ── Build ──────────────────────────────────────────

function build() {
  return new Promise((ok, fail) => {
    console.log("\x1b[36m[stable]\x1b[0m Building...");
    const astroBin = join(ROOT, "node_modules", "astro", "astro.js");
    const proc = spawn(process.execPath, [astroBin, "build", "--outDir", "dist_tmp"], {
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

    // SSE endpoint for live-reload
    if (pathname === "/___events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });
      res.write(`data: connected\n\n`);
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }

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
      let content = readFileSync(filePath);
      // Inject live-reload script into HTML pages
      if (ct.startsWith("text/html")) {
        let html = content.toString();
        html = html.replace("</body>", LIVE_RELOAD_SCRIPT + "</body>");
        content = html;
      }
      res.writeHead(200, { "Content-Type": ct, "Cache-Control": "no-cache" });
      res.end(content);
    } catch {
      res.writeHead(500);
      res.end("Internal server error");
    }
  });

  server.listen(PORT, "127.0.0.1", () => {
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
    broadcastBuilding();
    try {
      await build();
      ready = true;
      broadcastRebuild();
    } catch (err) {
      console.error("\x1b[31m[stable]\x1b[0m Rebuild failed:", err.message);
      // Broadcast rebuild even on failure to dismiss the spinner
      broadcastRebuild();
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
  const dirs = getWatchDirs(ROOT);
  const claudeDir = resolve(ROOT, "..");

  for (const dir of dirs) {
    const isClaudeDir = dir.startsWith(claudeDir);
    watch(dir, { recursive: true }, (event, filename) => {
      if (!filename) return;
      if (filename.includes("node_modules")) return;
      // Ignore generated content written by claude-resources integration during build
      if (filename === "content/docs/claude" || filename.startsWith("content/docs/claude/") || filename.startsWith("content/docs/claude-")) return;
      // For ~/.claude/ root, only rebuild on CLAUDE.md changes
      // (commands/, skills/, agents/ are watched as separate dirs)
      if (dir === claudeDir && filename !== "CLAUDE.md") return;
      console.log(`\x1b[33m[watch]\x1b[0m ${event}: ${isClaudeDir ? "~/.claude/" : ""}${filename}`);
      scheduleRebuild();
    });
  }
  console.log(`\x1b[36m[stable]\x1b[0m Watching ${dirs.length} directories for changes`);
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
