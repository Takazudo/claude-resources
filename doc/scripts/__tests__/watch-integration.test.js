import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "../..");
const CLAUDE_DIR = resolve(ROOT, "..");

/**
 * Start dev-stable.js and collect stdout lines until a condition is met.
 * Kills the process after timeout or when done.
 */
function startDevStable() {
  const nodeBin = process.execPath;
  const child = spawn(nodeBin, [join(ROOT, "scripts/dev-stable.js")], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });

  const lines = [];
  child.stdout.on("data", (chunk) => {
    for (const line of chunk.toString().split("\n").filter(Boolean)) {
      lines.push(line);
    }
  });
  child.stderr.on("data", (chunk) => {
    for (const line of chunk.toString().split("\n").filter(Boolean)) {
      lines.push(line);
    }
  });

  return { child, lines };
}

function waitForLine(lines, pattern, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const found = lines.find((l) => l.includes(pattern));
      if (found) return resolve(found);
      if (Date.now() - start > timeoutMs) {
        return reject(
          new Error(
            `Timeout waiting for "${pattern}". Got lines:\n${lines.join("\n")}`,
          ),
        );
      }
      setTimeout(check, 200);
    };
    check();
  });
}

function killTree(child) {
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {}
  }
}

describe("dev-stable.js watcher integration", { timeout: 120000 }, () => {
  let child;
  let lines;

  after(() => {
    if (child) killTree(child);
  });

  it("rebuilds when ~/.claude/CLAUDE.md is touched", async () => {
    // Kill any stale process on port 4892
    try {
      const { execSync } = await import("node:child_process");
      execSync("lsof -ti :4892 | xargs kill 2>/dev/null", { stdio: "ignore" });
      await sleep(1000);
    } catch {}

    ({ child, lines } = startDevStable());

    // Wait for initial "Watching" log (server + build started)
    await waitForLine(lines, "Watching", 60000);

    // Wait a moment for watchers to settle
    await sleep(2000);

    // Clear collected lines so we only check new output
    lines.length = 0;

    // Touch CLAUDE.md
    const claudeMd = join(CLAUDE_DIR, "CLAUDE.md");
    assert.ok(existsSync(claudeMd), "CLAUDE.md should exist");
    const original = readFileSync(claudeMd, "utf8");
    writeFileSync(claudeMd, original + "\n");

    // Wait for [watch] log indicating change was detected
    const watchLine = await waitForLine(lines, "[watch]", 10000);
    assert.ok(
      watchLine.includes("CLAUDE.md"),
      `Watch line should mention CLAUDE.md, got: ${watchLine}`,
    );

    // Restore file
    writeFileSync(claudeMd, original);
  });

  it("rebuilds when a file in ~/.claude/commands/ is touched", async () => {
    // Reuse the running server from previous test
    await sleep(2000);
    lines.length = 0;

    const commandsDir = join(CLAUDE_DIR, "commands");
    assert.ok(existsSync(commandsDir), "commands/ should exist");

    // Find any existing command file to touch
    const { readdirSync } = await import("node:fs");
    const cmdFiles = readdirSync(commandsDir).filter((f) => f.endsWith(".md"));
    assert.ok(cmdFiles.length > 0, "Should have at least one command file");

    const cmdFile = join(commandsDir, cmdFiles[0]);
    const original = readFileSync(cmdFile, "utf8");
    writeFileSync(cmdFile, original + "\n");

    const watchLine = await waitForLine(lines, "[watch]", 10000);
    assert.ok(
      watchLine.includes(cmdFiles[0]),
      `Watch line should mention ${cmdFiles[0]}, got: ${watchLine}`,
    );

    writeFileSync(cmdFile, original);
  });
});
