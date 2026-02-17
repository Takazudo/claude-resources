#!/usr/bin/env node
/**
 * Watch Claude Code source files and regenerate docs on change.
 * Watches: ~/.claude/commands/, ~/.claude/skills/, ~/.claude/agents/, CLAUDE.md files
 * On change: regenerate docs (Docusaurus hot reload picks up the rest).
 *
 * Changes are debounced for 5 seconds to batch rapid edits.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const CLAUDE_DIR = path.resolve(__dirname, "../../..");
const COMMANDS_DIR = path.join(CLAUDE_DIR, "commands");
const SKILLS_DIR = path.join(CLAUDE_DIR, "skills");
const AGENTS_DIR = path.join(CLAUDE_DIR, "agents");
const SCRIPT_DIR = __dirname;

const DEBOUNCE_MS = 5000;
let timer = null;

function regenerate() {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`\n[${timestamp}] Source change detected, regenerating docs...`);
  try {
    execSync(`node ${path.join(SCRIPT_DIR, "generate-docs.js")}`, {
      stdio: "inherit",
    });
    console.log(`[${timestamp}] Regeneration complete.`);
  } catch (err) {
    console.error(`[${timestamp}] Regeneration failed:`, err.message);
  }
}

function scheduleRegenerate() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(regenerate, DEBOUNCE_MS);
}

function shouldIgnore(filename) {
  if (!filename) return false;
  return (
    filename.startsWith(".") ||
    filename === "node_modules" ||
    filename === ".docusaurus" ||
    filename === "build"
  );
}

function watchDir(dir, label) {
  if (!fs.existsSync(dir)) {
    console.log(`  [watch] Skipping ${label} (not found)`);
    return;
  }
  fs.watch(dir, { recursive: true }, (eventType, filename) => {
    if (shouldIgnore(filename)) return;
    console.log(`  [watch] ${label}: ${eventType} ${filename || ""}`);
    scheduleRegenerate();
  });
  console.log(`  [watch] Watching ${label}`);
}

function watchClaudeMd() {
  const claudeMdPath = path.join(CLAUDE_DIR, "CLAUDE.md");
  if (fs.existsSync(claudeMdPath)) {
    fs.watch(claudeMdPath, (eventType) => {
      console.log(`  [watch] CLAUDE.md: ${eventType}`);
      scheduleRegenerate();
    });
    console.log(`  [watch] Watching ~/.claude/CLAUDE.md`);
  }

  const docClaudeMdPath = path.join(CLAUDE_DIR, "doc", "CLAUDE.md");
  if (fs.existsSync(docClaudeMdPath)) {
    fs.watch(docClaudeMdPath, (eventType) => {
      console.log(`  [watch] doc/CLAUDE.md: ${eventType}`);
      scheduleRegenerate();
    });
    console.log(`  [watch] Watching ~/.claude/doc/CLAUDE.md`);
  }
}

console.log("[watch] Starting Claude source file watcher (5s debounce)...");
watchDir(COMMANDS_DIR, "commands");
watchDir(SKILLS_DIR, "skills");
watchDir(AGENTS_DIR, "agents");
watchClaudeMd();
console.log("[watch] Watcher ready.\n");
