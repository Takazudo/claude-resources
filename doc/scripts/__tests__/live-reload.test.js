import { describe, it, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { get } from "node:http";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "../..");
const CLAUDE_DIR = resolve(ROOT, "..");

function httpGet(path) {
  return new Promise((resolve, reject) => {
    get(`http://localhost:4892${path}`, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body }));
      res.on("error", reject);
    }).on("error", reject);
  });
}

function waitForReady(timeoutMs = 90000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = async () => {
      try {
        const { status } = await httpGet("/___ready");
        if (status === 200) return resolve();
      } catch {}
      if (Date.now() - start > timeoutMs) return reject(new Error("Timeout waiting for ready"));
      setTimeout(check, 500);
    };
    check();
  });
}

/**
 * Subscribe to SSE /___events and collect events until `done` is called.
 */
function subscribeSSE() {
  const events = [];
  let res;
  const req = get("http://localhost:4892/___events", (r) => {
    res = r;
    let buf = "";
    r.on("data", (chunk) => {
      buf += chunk.toString();
      // SSE format: "event: <type>\ndata: <payload>\n\n"
      // Split on double-newline to get complete messages
      const parts = buf.split("\n\n");
      buf = parts.pop(); // keep incomplete message
      for (const part of parts) {
        const lines = part.split("\n");
        let eventType = "message";
        let data = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) eventType = line.slice(7);
          if (line.startsWith("data: ")) data = line.slice(6);
        }
        events.push(`${eventType}:${data}`);
      }
    });
  });
  const done = () => {
    try { res?.destroy(); } catch {}
    try { req.destroy(); } catch {}
  };
  return { events, done };
}

function waitForEvent(events, pattern, timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const found = events.find((e) => e.includes(pattern));
      if (found) return resolve(found);
      if (Date.now() - start > timeoutMs)
        return reject(new Error(`Timeout waiting for SSE event "${pattern}". Got: ${JSON.stringify(events)}`));
      setTimeout(check, 300);
    };
    check();
  });
}

describe("live-reload via SSE", { timeout: 180000 }, () => {
  let child;

  before(async () => {
    try {
      const { execSync } = await import("node:child_process");
      execSync("lsof -ti :4892 | xargs kill 2>/dev/null", { stdio: "ignore" });
      await sleep(1000);
    } catch {}

    child = spawn(process.execPath, [join(ROOT, "scripts/dev-stable.js")], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.resume();
    child.stderr.resume();

    await waitForReady();
    await sleep(1000);
  });

  after(() => {
    if (child) {
      try { process.kill(-child.pid, "SIGTERM"); } catch {}
      try { child.kill(); } catch {}
    }
  });

  it("serves /___events as text/event-stream", async () => {
    const { done } = subscribeSSE();
    // Give it a moment to connect
    await sleep(500);
    const { status, body } = await new Promise((resolve, reject) => {
      const req = get("http://localhost:4892/___events", (res) => {
        // Just check headers, don't consume body
        resolve({ status: res.statusCode, body: "" });
        res.destroy();
        req.destroy();
      });
      req.on("error", reject);
    });
    assert.equal(status, 200, "SSE endpoint should return 200");
    done();
  });

  it("injects live-reload script into HTML responses", async () => {
    const { body } = await httpGet("/docs/claude");
    assert.ok(
      body.includes("___events"),
      "HTML should contain script connecting to SSE ___events endpoint",
    );
  });

  it("sends 'building' SSE event before 'rebuild' when CLAUDE.md changes", async () => {
    const { events, done } = subscribeSSE();
    await sleep(500);

    const claudeMd = join(CLAUDE_DIR, "CLAUDE.md");
    const original = readFileSync(claudeMd, "utf8");
    writeFileSync(claudeMd, original + "\n");

    try {
      // Should receive building event first, then rebuild
      await waitForEvent(events, "building", 10000);
      await waitForEvent(events, "rebuild", 60000);

      // Verify order: building came before rebuild
      const buildingIdx = events.findIndex((e) => e.startsWith("building:"));
      const rebuildIdx = events.findIndex((e) => e.startsWith("rebuild:"));
      assert.ok(buildingIdx < rebuildIdx, "building event should come before rebuild event");
    } finally {
      writeFileSync(claudeMd, original);
      done();
    }
  });

  it("injected script handles both building and rebuild events", async () => {
    const { body } = await httpGet("/docs/claude");
    assert.ok(body.includes("building"), "Script should handle 'building' event for loading indicator");
    assert.ok(body.includes("rebuild"), "Script should handle 'rebuild' event for reload");
  });

  it("serves updated content after rebuild completes", async () => {
    // Wait for any pending rebuilds from previous test to fully settle
    await sleep(25000);

    const marker = `LIVERELOADMARKER${Date.now()}`;
    const claudeMd = join(CLAUDE_DIR, "CLAUDE.md");
    const original = readFileSync(claudeMd, "utf8");

    writeFileSync(claudeMd, original + `\n\n${marker}\n`);

    try {
      // Poll the page until the marker appears (rebuild + dist swap)
      const start = Date.now();
      let found = false;
      while (Date.now() - start < 60000) {
        const { body } = await httpGet("/docs/claude-md/root");
        if (body.includes(marker)) {
          found = true;
          break;
        }
        await sleep(2000);
      }
      assert.ok(found, "After rebuild, page should contain the marker within 60s");
    } finally {
      writeFileSync(claudeMd, original);
    }
  });
});
