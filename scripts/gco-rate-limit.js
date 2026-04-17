#!/usr/bin/env node

/**
 * GitHub Copilot CLI rate limit tracker.
 *
 * Tracks when Copilot enters low-cost/degraded mode (auto-downgraded model).
 * For Pro users, Copilot remains usable when rate-limited — it simply switches
 * to a cheaper model (e.g., GPT-3.5 instead of GPT-4) at no extra cost.
 * This tracker is informational only — it does NOT block Copilot usage.
 *
 * Usage:
 *   node $HOME/.claude/scripts/gco-rate-limit.js check
 *     → exit 0 + prints "ok"           if copilot is in normal mode
 *     → exit 0 + prints "degraded:…"   if copilot is in low-cost mode (still usable)
 *
 *   node $HOME/.claude/scripts/gco-rate-limit.js mark [minutes]
 *     → writes state file, default 15 minutes from now
 *
 *   node $HOME/.claude/scripts/gco-rate-limit.js clear
 *     → removes state file
 *
 *   node $HOME/.claude/scripts/gco-rate-limit.js check-stderr <file>
 *     → exit 0 + prints "ok"           if no rate limit detected in file
 *     → exit 1 + prints reason         if rate limit pattern found (also marks state)
 *
 *   node $HOME/.claude/scripts/gco-rate-limit.js check-output <stdout-file> <stderr-file>
 *     → checks both files for rate limit patterns
 *
 * State file: $HOME/.claude/.gco-rate-limited
 */

import fs from "fs";
import path from "path";
import os from "os";

const STATE_FILE = path.join(os.homedir(), ".claude", ".gco-rate-limited");
const DEFAULT_DEGRADED_MINUTES = 15;

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
  if (!fs.existsSync(STATE_FILE)) {
    console.log("ok");
    process.exit(0);
  }

  try {
    const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    const expiresAt = new Date(data.expiresAt);

    if (expiresAt <= new Date()) {
      // Degraded period expired — clean up
      fs.unlinkSync(STATE_FILE);
      console.log("ok");
      process.exit(0);
    }

    const remaining = Math.ceil((expiresAt - new Date()) / 60000);
    // Exit 0 — Copilot is still usable in low-cost mode (Pro users get free fallback model)
    console.log(
      `degraded: Copilot is in low-cost mode (auto-downgraded model). Resets in ~${remaining} min. Still usable.`
    );
    process.exit(0);
  } catch {
    // Corrupted file — remove and allow
    try {
      fs.unlinkSync(STATE_FILE);
    } catch {}
    console.log("ok");
    process.exit(0);
  }
}

function mark(minutes) {
  const degradedMinutes = parseInt(minutes, 10) || DEFAULT_DEGRADED_MINUTES;
  const expiresAt = new Date(Date.now() + degradedMinutes * 60000);

  const data = {
    markedAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    degradedMinutes,
  };

  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
  console.log(
    `Copilot entered low-cost mode until ${expiresAt.toLocaleTimeString()} (~${degradedMinutes} min). Still usable.`
  );
}

function clear() {
  try {
    fs.unlinkSync(STATE_FILE);
    console.log("Rate limit state cleared.");
  } catch {
    console.log("No state file found.");
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
      // Mark as degraded (informational — Copilot still works in low-cost mode)
      mark(DEFAULT_DEGRADED_MINUTES);
      console.log(`degraded: Copilot switched to low-cost model: ${content.trim().split("\n")[0]}`);
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
        // Mark as degraded (informational — Copilot still works in low-cost mode)
        mark(DEFAULT_DEGRADED_MINUTES);
        console.log(
          `degraded: Copilot switched to low-cost model (detected in ${path.basename(filePath)}): ${content.trim().split("\n")[0]}`
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
