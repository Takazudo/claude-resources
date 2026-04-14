#!/usr/bin/env node

/**
 * GitHub Copilot CLI rate limit tracker.
 *
 * Maintains a lockout file to prevent repeatedly hitting the Copilot CLI
 * rate limit within the same session / time window.
 *
 * Usage:
 *   node $HOME/.claude/scripts/gco-rate-limit.js check
 *     → exit 0 + prints "ok"      if copilot is available
 *     → exit 1 + prints reason    if rate-limited
 *
 *   node $HOME/.claude/scripts/gco-rate-limit.js mark [minutes]
 *     → writes lockout file, default 60 minutes from now
 *
 *   node $HOME/.claude/scripts/gco-rate-limit.js clear
 *     → removes lockout file
 *
 *   node $HOME/.claude/scripts/gco-rate-limit.js check-stderr <file>
 *     → exit 0 + prints "ok"      if no rate limit detected in file
 *     → exit 1 + prints reason    if rate limit pattern found (also marks lockout)
 *
 *   node $HOME/.claude/scripts/gco-rate-limit.js check-output <stdout-file> <stderr-file>
 *     → checks both files for rate limit patterns
 *
 * Lockout file: $HOME/.claude/.gco-rate-limited
 */

import fs from "fs";
import path from "path";
import os from "os";

const LOCKOUT_FILE = path.join(os.homedir(), ".claude", ".gco-rate-limited");
const DEFAULT_LOCKOUT_MINUTES = 60;

// Patterns that indicate Copilot rate limiting in stdout/stderr
const RATE_LIMIT_PATTERNS = [
  /you've hit your limit/i,
  /rate limit/i,
  /too many requests/i,
  /quota exceeded/i,
  /usage limit/i,
  /resets?\s+\d{1,2}[ap]m/i,
  /exceeded.*monthly.*limit/i,
  /copilot.*limit/i,
];

function check() {
  if (!fs.existsSync(LOCKOUT_FILE)) {
    console.log("ok");
    process.exit(0);
  }

  try {
    const data = JSON.parse(fs.readFileSync(LOCKOUT_FILE, "utf8"));
    const expiresAt = new Date(data.expiresAt);

    if (expiresAt <= new Date()) {
      // Lockout expired — clean up and allow
      fs.unlinkSync(LOCKOUT_FILE);
      console.log("ok");
      process.exit(0);
    }

    const remaining = Math.ceil((expiresAt - new Date()) / 60000);
    console.log(
      `rate-limited: Copilot rate limit active. Resets in ~${remaining} min (${expiresAt.toLocaleTimeString()}).`
    );
    process.exit(1);
  } catch {
    // Corrupted file — remove and allow
    try {
      fs.unlinkSync(LOCKOUT_FILE);
    } catch {}
    console.log("ok");
    process.exit(0);
  }
}

function mark(minutes) {
  const lockoutMinutes = parseInt(minutes, 10) || DEFAULT_LOCKOUT_MINUTES;
  const expiresAt = new Date(Date.now() + lockoutMinutes * 60000);

  const data = {
    markedAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    lockoutMinutes,
  };

  fs.mkdirSync(path.dirname(LOCKOUT_FILE), { recursive: true });
  fs.writeFileSync(LOCKOUT_FILE, JSON.stringify(data, null, 2));
  console.log(
    `Marked copilot as rate-limited until ${expiresAt.toLocaleTimeString()} (~${lockoutMinutes} min).`
  );
}

function clear() {
  try {
    fs.unlinkSync(LOCKOUT_FILE);
    console.log("Rate limit lockout cleared.");
  } catch {
    console.log("No lockout file found.");
  }
}

function checkStderr(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    console.log("ok");
    process.exit(0);
  }

  const content = fs.readFileSync(filePath, "utf8");

  for (const pattern of RATE_LIMIT_PATTERNS) {
    if (pattern.test(content)) {
      // Auto-mark as rate-limited
      mark(DEFAULT_LOCKOUT_MINUTES);
      console.log(`rate-limited: Detected rate limit in output: ${content.trim().split("\n")[0]}`);
      process.exit(1);
    }
  }

  console.log("ok");
  process.exit(0);
}

// Also check stdout file if provided as second argument
function checkOutput(stdoutPath, stderrPath) {
  const files = [stdoutPath, stderrPath].filter(
    (f) => f && fs.existsSync(f)
  );

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf8");
    for (const pattern of RATE_LIMIT_PATTERNS) {
      if (pattern.test(content)) {
        mark(DEFAULT_LOCKOUT_MINUTES);
        console.log(
          `rate-limited: Detected rate limit in ${path.basename(filePath)}: ${content.trim().split("\n")[0]}`
        );
        process.exit(1);
      }
    }
  }

  console.log("ok");
  process.exit(0);
}

// CLI
const [, , command, ...args] = process.argv;

switch (command) {
  case "check":
    check();
    break;
  case "mark":
    mark(args[0]);
    break;
  case "clear":
    clear();
    break;
  case "check-stderr":
    checkStderr(args[0]);
    break;
  case "check-output":
    checkOutput(args[0], args[1]);
    break;
  default:
    console.error(
      "Usage: gco-rate-limit.js <check|mark [minutes]|clear|check-stderr <file>|check-output <stdout-file> <stderr-file>>"
    );
    process.exit(2);
}
