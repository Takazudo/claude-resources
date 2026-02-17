#!/usr/bin/env node
/**
 * Start dev server with file watcher.
 * 1. Run generate scripts (sync)
 * 2. Start Docusaurus dev server (foreground)
 * 3. Start watcher in background (regenerates docs on source changes,
 *    Docusaurus hot reload picks up the file changes automatically)
 *
 * Usage: node scripts/start-dev.js [--no-open] [--port PORT] [--host HOST]
 */

const { execSync, spawn } = require("child_process");
const path = require("path");

const SITE_DIR = path.resolve(__dirname, "..");
const SCRIPTS_DIR = __dirname;

// Pass through CLI args (e.g. --no-open, --port, --host)
const extraArgs = process.argv.slice(2);

// 1. Run generation
console.log("Running doc generation...");
execSync("pnpm run generate", { cwd: SITE_DIR, stdio: "inherit" });

// 2. Start Docusaurus dev server (foreground)
const docusaurus = spawn("pnpm", ["exec", "docusaurus", "start", ...extraArgs], {
  cwd: SITE_DIR,
  stdio: "inherit",
});

// 3. Spawn watcher (detached, only regenerates docs)
const watcher = spawn(process.execPath, [path.join(SCRIPTS_DIR, "watch-claude-sources.js")], {
  cwd: SITE_DIR,
  stdio: "inherit",
  detached: true,
});
watcher.unref();
console.log(`[start-dev] Watcher started (pid ${watcher.pid})`);

docusaurus.on("exit", (code) => {
  process.exit(code || 0);
});
