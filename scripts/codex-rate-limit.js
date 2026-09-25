#!/usr/bin/env node

/**
 * Codex rate limit tracker.
 *
 * Maintains a lockout file to prevent repeatedly hitting the Codex CLI
 * rate limit within the same session / time window.
 *
 * Usage:
 *   node $HOME/.claude/scripts/codex-rate-limit.js check
 *     → exit 0 + prints "ok"      if codex is available
 *     → exit 1 + prints reason    if rate-limited
 *
 *   node $HOME/.claude/scripts/codex-rate-limit.js mark [minutes]
 *     → writes lockout file, default 60 minutes from now
 *
 *   node $HOME/.claude/scripts/codex-rate-limit.js clear
 *     → removes lockout file
 *
 *   node $HOME/.claude/scripts/codex-rate-limit.js notify [message]
 *     → fires the IFTTT "codex rate limit detected" push only (no lockout change)
 *
 *   node $HOME/.claude/scripts/codex-rate-limit.js check-stderr <file>
 *     → exit 0 + prints "ok"      if no rate limit detected in file
 *     → exit 1 + prints reason    if rate limit pattern found (also marks lockout)
 *
 *   node $HOME/.claude/scripts/codex-rate-limit.js check-output <stdout> <stderr>
 *     → same contract, but the two files are scanned with DIFFERENT strictness:
 *       stdout is the model's answer and is scanned strictly, stderr is a
 *       diagnostic stream and is scanned with the full pattern set. See the
 *       RATE_LIMIT_PATTERNS comment for why conflating them caused a false
 *       lockout on a successful review.
 *
 * Whenever a lockout is freshly created (via `mark`, or automatically from
 * `check-stderr`/`check-output` detecting a pattern), a best-effort IFTTT push
 * "codex rate limit detected" fires once per lockout window (dedupe logic lives
 * in mark(); the push itself is sent by notifyIfttt()).
 *
 * Lockout file: $HOME/.claude/.codex-rate-limited
 */

import fs from "fs";
import path from "path";
import os from "os";
import { execFileSync } from "child_process";

const LOCKOUT_FILE = path.join(os.homedir(), ".claude", ".codex-rate-limited");
const DEFAULT_LOCKOUT_MINUTES = 60;

// Reuses the existing local IFTTT applet (same event as hooks/notify-ifttt.sh).
const IFTTT_EVENT = "Claude Code";

// Best-effort mobile push fired when Codex hits a rate/usage limit. The codex-*
// skills silently fall back to Opus and never surface the limit in the terminal,
// so this push is the only signal the user gets. Returns true when a push was
// dispatched, false when skipped because IFTTT_WEBHOOK_KEY is unset. Never throws
// — a failed notification must not break rate-limit tracking.
function notifyIfttt(detail) {
  const key = process.env.IFTTT_WEBHOOK_KEY;
  if (!key) return false; // not configured on this machine — skip silently
  const url = `https://maker.ifttt.com/trigger/${encodeURIComponent(
    IFTTT_EVENT
  )}/with/key/${key}`;
  const payload = JSON.stringify({
    value1: "codex rate limit detected",
    value2: detail || "",
    value3: process.cwd(),
  });
  try {
    // Feed the secret URL through a curl config on stdin (-K -) rather than argv,
    // so the webhook key never lands on the process command line (ps / procfs).
    execFileSync(
      "curl",
      [
        "-s", "-o", "/dev/null",
        "--connect-timeout", "5", "-m", "8",
        "-X", "POST",
        "-H", "Content-Type: application/json",
        "-d", payload,
        "-K", "-",
      ],
      { input: `url = "${url}"\n`, stdio: ["pipe", "ignore", "ignore"] }
    );
  } catch {
    // best-effort; ignore network/timeout/missing-curl failures
  }
  return true;
}

// Patterns that indicate Codex rate limiting, split by how safely each one can
// be matched against MODEL OUTPUT rather than a diagnostic stream.
//
// WHY THE SPLIT: `check-output` scans codex's stdout, which is the model's own
// answer. Matching /rate limit/i there fires on any answer that merely DISCUSSES
// rate limiting — a code review weighing an API's rate limits, say. That is not
// hypothetical: a successful /codex-2nd review whose text argued "retry logic
// does not handle a sustained npm outage, rate limiting, ..." was classified as
// a rate-limit error and locked codex out for an hour. A diagnostic stream
// mentions limits because it hit one; an answer may mention anything.
const STRONG_RATE_LIMIT_PATTERNS = [
  // Unambiguous — phrasings that occur in an actual limit error and essentially
  // never in prose about limits. Safe to match against model output.
  /you've hit your limit/i,
  /too many requests/i,
  /quota exceeded/i,
  /\b429\b/,
  /resets?\s+\d{1,2}[ap]m/i,
];

const WEAK_RATE_LIMIT_PATTERNS = [
  // Ambiguous — ordinary English a legitimate answer may contain. Trusted only
  // on a diagnostic stream, never on model output.
  /rate limit/i,
  /usage limit/i,
];

const RATE_LIMIT_PATTERNS = [
  ...STRONG_RATE_LIMIT_PATTERNS,
  ...WEAK_RATE_LIMIT_PATTERNS,
];

// A rate-limit refusal is short. Past this many bytes codex produced a real
// answer, so the run was not rate-limited whatever words that answer uses.
const SUBSTANTIVE_OUTPUT_BYTES = 2000;

// Returns the matching pattern, or null when the content shows no rate limit.
// `strict` is for model output: strong patterns only, and only while the content
// is still short enough to be a refusal rather than an answer.
function matchRateLimit(content, { strict }) {
  if (strict && content.length >= SUBSTANTIVE_OUTPUT_BYTES) return null;
  const patterns = strict ? STRONG_RATE_LIMIT_PATTERNS : RATE_LIMIT_PATTERNS;
  return patterns.find((pattern) => pattern.test(content)) || null;
}

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
      `rate-limited: Codex rate limit active. Resets in ~${remaining} min (${expiresAt.toLocaleTimeString()}).`
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

  // Notify at most once per active lockout window: if an unexpired lockout that
  // already fired a push exists, stay quiet (a second codex skill hitting the
  // same wall shouldn't buzz the phone again).
  let alreadyNotified = false;
  try {
    const prev = JSON.parse(fs.readFileSync(LOCKOUT_FILE, "utf8"));
    if (new Date(prev.expiresAt) > new Date() && prev.notified) {
      alreadyNotified = true;
    }
  } catch {}

  // Push only on a fresh window AND when a key is configured. `notified` records
  // whether a push is actually dispatched (not merely attempted), so a key-less
  // run doesn't consume the window — a later run with the key set can still fire.
  const willNotify = !alreadyNotified && !!process.env.IFTTT_WEBHOOK_KEY;

  // Persist the lockout BEFORE the (blocking) push so a concurrent mark() sees the
  // claimed slot and stays quiet, keeping the once-per-window guarantee tight.
  const data = {
    markedAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    lockoutMinutes,
    notified: alreadyNotified || willNotify,
  };
  fs.mkdirSync(path.dirname(LOCKOUT_FILE), { recursive: true });
  fs.writeFileSync(LOCKOUT_FILE, JSON.stringify(data, null, 2));

  if (willNotify) {
    notifyIfttt(
      `Resets in ~${lockoutMinutes} min (${expiresAt.toLocaleTimeString()}).`
    );
  }

  console.log(
    `Marked codex as rate-limited until ${expiresAt.toLocaleTimeString()} (~${lockoutMinutes} min).`
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

  // stderr is a diagnostic stream, so the full pattern set applies here.
  if (matchRateLimit(content, { strict: false })) {
    // Auto-mark as rate-limited
    mark(DEFAULT_LOCKOUT_MINUTES);
    console.log(`rate-limited: Detected rate limit in output: ${content.trim().split("\n")[0]}`);
    process.exit(1);
  }

  console.log("ok");
  process.exit(0);
}

// Scan a finished codex run for rate-limit evidence.
//
// The two files are NOT equivalent and must not share a scan: stdout holds the
// model's answer (scanned strictly — see matchRateLimit), while stderr is a
// diagnostic stream where limit wording is evidence rather than subject matter.
function checkOutput(stdoutPath, stderrPath) {
  const targets = [
    { filePath: stdoutPath, strict: true },
    { filePath: stderrPath, strict: false },
  ].filter(({ filePath }) => filePath && fs.existsSync(filePath));

  for (const { filePath, strict } of targets) {
    const content = fs.readFileSync(filePath, "utf8");
    if (matchRateLimit(content, { strict })) {
      mark(DEFAULT_LOCKOUT_MINUTES);
      console.log(
        `rate-limited: Detected rate limit in ${path.basename(filePath)}: ${content.trim().split("\n")[0]}`
      );
      process.exit(1);
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
  case "notify": {
    // Fire the IFTTT push without touching the lockout — for manual testing and
    // for callers that only want to signal, not to enforce a lockout window.
    const sent = notifyIfttt(args.join(" ") || "manual test");
    console.log(
      sent
        ? "Notification sent (best-effort)."
        : "IFTTT_WEBHOOK_KEY not set — nothing sent."
    );
    break;
  }
  default:
    console.error(
      "Usage: codex-rate-limit.js <check|mark [minutes]|clear|notify [message]|check-stderr <file>|check-output <stdout-file> <stderr-file>>"
    );
    process.exit(2);
}
