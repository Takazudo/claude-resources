// Fixture tests for codex-sweep.js --workspace reap + log-DB rotation.
//
// Cheap/local only: fake state dirs, fake broker processes (a script literally
// named app-server-broker.mjs so the sweep's signature match fires), and an
// env-overridden log dir with tiny fake files. NEVER signals a real codex process
// (every reap target is pinned to a throwaway workspace + our own fake pid) and
// NEVER touches the real ~/.codex logs (CODEX_LOG_DIR always points at a temp dir).
//
// Run:  node --test scripts/codex-sweep.test.mjs

import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { after, test } from "node:test";

import { computeLogFamilies, resolveStateDirForWorkspace } from "./codex-sweep.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SWEEP = path.join(HERE, "codex-sweep.js");

const cleanups = [];
after(() => {
  for (const fn of cleanups.splice(0)) {
    try {
      fn();
    } catch {
      // best-effort teardown
    }
  }
});

function mkTmp(prefix) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function have(binary) {
  return spawnSync("sh", ["-c", `command -v ${binary}`]).status === 0;
}

const FAKE_BROKER_SRC = `
import fs from "node:fs";
import net from "node:net";
const args = process.argv.slice(2);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const endpoint = val("--endpoint");
const pidFile = val("--pid-file");
const marker = process.env.FAKE_MARKER;
const sockPath = endpoint && endpoint.startsWith("unix:") ? endpoint.slice(5) : null;
if (pidFile) fs.writeFileSync(pidFile, String(process.pid));
const writeMarker = (v) => { try { if (marker) fs.writeFileSync(marker, v); } catch {} };
process.on("SIGTERM", () => { writeMarker("term"); process.exit(0); });
if (process.env.FAKE_LISTEN === "1" && sockPath) {
  const server = net.createServer((socket) => {
    socket.setEncoding("utf8");
    let buf = "";
    socket.on("data", (d) => {
      buf += d;
      let nl;
      while ((nl = buf.indexOf("\\n")) !== -1) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        if (msg.method === "broker/shutdown") {
          try { socket.write(JSON.stringify({ id: msg.id, result: {} }) + "\\n"); } catch {}
          writeMarker("rpc");
          try { server.close(); } catch {}
          try { fs.unlinkSync(sockPath); } catch {}
          try { if (pidFile) fs.unlinkSync(pidFile); } catch {}
          setTimeout(() => process.exit(0), 10);
        }
      }
    });
  });
  server.listen(sockPath);
}
setInterval(() => {}, 1000);
`;

function writeFakeBroker(dir) {
  const p = path.join(dir, "app-server-broker.mjs");
  fs.writeFileSync(p, FAKE_BROKER_SRC);
  return p;
}

function trackChild(child) {
  cleanups.push(() => {
    try {
      process.kill(child.pid, "SIGKILL");
    } catch {
      // already gone
    }
  });
  return child;
}

async function waitFor(predicate, { timeoutMs = 4000, stepMs = 50 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await delay(stepMs);
  }
  return false;
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [SWEEP, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

// Spawn a fake broker + write its broker.json into the resolved state dir.
// brokerCwdSuffix (optional) makes the broker's --cwd a SUBDIRECTORY of the
// workspace root while state is still hashed under the root — mirrors the plugin
// starting the broker in a repo subdir (see the path-boundary reap test).
// Returns { ws, pluginData, stateDir, brokerFile, child, pid, sessionDir, endpoint, marker, brokerCwd }.
async function setupFakeBroker({ listen, brokerCwdSuffix } = {}) {
  const ws = mkTmp("cxsweep-ws-");
  const pluginData = mkTmp("cxsweep-plugindata-");
  const fixtureDir = mkTmp("cxsweep-fixture-");
  const sessionDir = mkTmp("cxc-");
  const brokerScript = writeFakeBroker(fixtureDir);
  const endpoint = `unix:${path.join(sessionDir, "broker.sock")}`;
  const pidFile = path.join(sessionDir, "broker.pid");
  const logFile = path.join(sessionDir, "broker.log");
  const marker = path.join(fixtureDir, "marker.txt");

  let brokerCwd = ws;
  if (brokerCwdSuffix) {
    brokerCwd = path.join(ws, brokerCwdSuffix);
    fs.mkdirSync(brokerCwd, { recursive: true });
  }

  const child = trackChild(
    spawn(
      process.execPath,
      [brokerScript, "serve", "--endpoint", endpoint, "--cwd", brokerCwd, "--pid-file", pidFile],
      { detached: false, stdio: "ignore", env: { ...process.env, FAKE_LISTEN: listen ? "1" : "0", FAKE_MARKER: marker } }
    )
  );

  // Wait until the broker is observably up: pid file written, and socket present if listening.
  const up = await waitFor(() => {
    if (!fs.existsSync(pidFile)) return false;
    if (listen && !fs.existsSync(path.join(sessionDir, "broker.sock"))) return false;
    return true;
  });
  assert.ok(up, "fake broker failed to start");

  const prev = process.env.CLAUDE_PLUGIN_DATA;
  process.env.CLAUDE_PLUGIN_DATA = pluginData;
  const stateDir = resolveStateDirForWorkspace(ws);
  if (prev === undefined) delete process.env.CLAUDE_PLUGIN_DATA;
  else process.env.CLAUDE_PLUGIN_DATA = prev;

  fs.mkdirSync(stateDir, { recursive: true });
  const brokerFile = path.join(stateDir, "broker.json");
  fs.writeFileSync(brokerFile, JSON.stringify({ endpoint, pidFile, logFile, sessionDir, pid: child.pid }, null, 2));

  return { ws, pluginData, stateDir, brokerFile, child, pid: child.pid, sessionDir, endpoint, marker, brokerCwd };
}

test("reap: successful RPC shutdown removes broker + state, exit 0", async () => {
  const f = await setupFakeBroker({ listen: true });
  const res = runCli(["--workspace", f.ws], { CLAUDE_PLUGIN_DATA: f.pluginData });

  assert.equal(res.status, 0, res.stderr);
  assert.ok(await waitFor(() => !pidAlive(f.pid)), "broker should be gone");
  assert.equal(fs.existsSync(f.brokerFile), false, "broker.json should be removed");
  assert.equal(fs.existsSync(path.join(f.sessionDir, "broker.sock")), false, "socket should be removed");
  assert.equal(fs.readFileSync(f.marker, "utf8"), "rpc", "broker should have shut down via RPC, not signal");

  // Idempotent re-run: nothing left to reap → exit 0, no throw.
  const again = runCli(["--workspace", f.ws], { CLAUDE_PLUGIN_DATA: f.pluginData });
  assert.equal(again.status, 0, again.stderr);
});

test("reap: unreachable endpoint falls back to signal, exit 0", async () => {
  const f = await setupFakeBroker({ listen: false });
  const res = runCli(["--workspace", f.ws], { CLAUDE_PLUGIN_DATA: f.pluginData });

  assert.equal(res.status, 0, res.stderr);
  assert.ok(await waitFor(() => !pidAlive(f.pid)), "broker should be signaled dead");
  assert.equal(fs.readFileSync(f.marker, "utf8"), "term", "broker should have died via SIGTERM fallback");
  assert.equal(fs.existsSync(f.brokerFile), false, "broker.json should be removed");
});

test("reap: reused/mismatched pid is never signaled, exit 0", async () => {
  // broker.json points at a live NON-broker process (a sleep). The reap must
  // refuse to signal it and just clear the stale state.
  const ws = mkTmp("cxsweep-ws-");
  const pluginData = mkTmp("cxsweep-plugindata-");
  const sleeper = trackChild(spawn("sleep", ["30"], { stdio: "ignore" }));
  await delay(100);

  const prev = process.env.CLAUDE_PLUGIN_DATA;
  process.env.CLAUDE_PLUGIN_DATA = pluginData;
  const stateDir = resolveStateDirForWorkspace(ws);
  if (prev === undefined) delete process.env.CLAUDE_PLUGIN_DATA;
  else process.env.CLAUDE_PLUGIN_DATA = prev;
  fs.mkdirSync(stateDir, { recursive: true });
  const brokerFile = path.join(stateDir, "broker.json");
  fs.writeFileSync(
    brokerFile,
    JSON.stringify({ endpoint: `unix:${path.join(stateDir, "nope.sock")}`, pid: sleeper.pid }, null, 2)
  );

  const res = runCli(["--workspace", ws], { CLAUDE_PLUGIN_DATA: pluginData });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(pidAlive(sleeper.pid), true, "reused-pid process must NOT be signaled");
  assert.equal(fs.existsSync(brokerFile), false, "stale broker.json should be removed");
});

test("reap: broker --cwd under the workspace root (repo subdir) is reaped, not orphaned", async () => {
  // The plugin can start the broker with a repo SUBDIRECTORY as --cwd while hashing
  // state under the root. A strict cwd==root check would refuse to signal the correct
  // broker and delete its state (orphaning it). The path-boundary check must accept it.
  const f = await setupFakeBroker({ listen: true, brokerCwdSuffix: "packages/app" });
  assert.notEqual(f.brokerCwd, f.ws, "broker --cwd should be a subdir of the workspace root");

  const res = runCli(["--workspace", f.ws], { CLAUDE_PLUGIN_DATA: f.pluginData });

  assert.equal(res.status, 0, res.stderr);
  assert.ok(await waitFor(() => !pidAlive(f.pid)), "broker with a subdir --cwd should be reaped, not left alive");
  assert.equal(fs.existsSync(f.brokerFile), false, "broker.json should be removed after a successful reap");
  assert.equal(fs.readFileSync(f.marker, "utf8"), "rpc", "subdir broker should have shut down via RPC (it was a valid target)");
});

test("reap: no broker at all is a quiet no-op, exit 0", async () => {
  const ws = mkTmp("cxsweep-ws-");
  const pluginData = mkTmp("cxsweep-plugindata-");
  const res = runCli(["--workspace", ws], { CLAUDE_PLUGIN_DATA: pluginData });
  assert.equal(res.status, 0, res.stderr);
});

test("args: --workspace with no value exits 2 (usage) and never runs the global sweep", () => {
  // Regression: --workspace as the final arg used to assign undefined and fall
  // through to the destructive GLOBAL sweep. It must now fail with a distinct usage
  // code (2, not the reap-failure code 1) BEFORE any process enumeration.
  const res = runCli(["--workspace"]);
  assert.equal(res.status, 2, `expected usage exit 2, got ${res.status}: ${res.stderr}`);
  assert.match(res.stderr, /--workspace requires a non-option/);
  // The global sweep always exits 0 and prints a "[codex-sweep]" summary — neither
  // may happen here. (exit===2 already proves the sweep branch was not taken.)
  assert.doesNotMatch(res.stdout, /\[codex-sweep\]/);
});

test("args: --workspace followed by an option (no path) exits 2 (usage), no global sweep", () => {
  const res = runCli(["--workspace", "--dry-run"]);
  assert.equal(res.status, 2, `expected usage exit 2, got ${res.status}: ${res.stderr}`);
  assert.match(res.stderr, /--workspace requires a non-option/);
  assert.doesNotMatch(res.stdout, /\[codex-sweep\]/);
});

test("rotation: computeLogFamilies aggregates the WAL family and ignores unrelated files", () => {
  const logDir = mkTmp("cxsweep-logs-");
  fs.writeFileSync(path.join(logDir, "logs_1.sqlite"), Buffer.alloc(300));
  fs.writeFileSync(path.join(logDir, "logs_1.sqlite-wal"), Buffer.alloc(150));
  fs.writeFileSync(path.join(logDir, "logs_1.sqlite-shm"), Buffer.alloc(90));
  fs.writeFileSync(path.join(logDir, "logs_1.sqlite-journal"), Buffer.alloc(60));
  fs.writeFileSync(path.join(logDir, "logs_1.sqlite.bak"), Buffer.alloc(5000)); // unrelated
  fs.writeFileSync(path.join(logDir, "README"), Buffer.alloc(5000)); // unrelated
  fs.writeFileSync(path.join(logDir, "logs_2.sqlite"), Buffer.alloc(42));

  const families = computeLogFamilies(logDir);
  const byBase = Object.fromEntries(families.map((f) => [f.base, f]));

  assert.equal(families.length, 2);
  assert.equal(byBase["logs_1.sqlite"].totalBytes, 600, "family = sqlite + wal + shm + journal");
  assert.deepEqual(byBase["logs_1.sqlite"].members.sort(), [
    "logs_1.sqlite",
    "logs_1.sqlite-journal",
    "logs_1.sqlite-shm",
    "logs_1.sqlite-wal",
  ]);
  assert.equal(byBase["logs_2.sqlite"].totalBytes, 42);
});

test("rotation --dry-run: under threshold → skip, no delete", () => {
  const logDir = mkTmp("cxsweep-logs-");
  const guardDir = mkTmp("cxsweep-guard-");
  fs.writeFileSync(path.join(logDir, "logs_1.sqlite"), Buffer.alloc(100));

  const res = runCli(["--rotate-logs", "--dry-run"], {
    CODEX_LOG_DIR: logDir,
    CODEX_GUARD_DIR: guardDir,
    CODEX_LOG_ROTATE_THRESHOLD_BYTES: "500",
  });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /family logs_1\.sqlite: 100 bytes.*under threshold/);
  assert.match(res.stdout, /decision: skip \(no family over threshold\)/);
  assert.equal(fs.existsSync(path.join(logDir, "logs_1.sqlite")), true, "dry-run must not delete");
});

test("rotation --dry-run: over threshold reports family size and the guard gate; decision is consistent", () => {
  const logDir = mkTmp("cxsweep-logs-");
  const guardDir = mkTmp("cxsweep-guard-");
  fs.writeFileSync(path.join(logDir, "logs_1.sqlite"), Buffer.alloc(300));
  fs.writeFileSync(path.join(logDir, "logs_1.sqlite-wal"), Buffer.alloc(300));
  fs.writeFileSync(path.join(logDir, "logs_1.sqlite-shm"), Buffer.alloc(300));
  fs.writeFileSync(path.join(logDir, "logs_1.sqlite.bak"), Buffer.alloc(9999)); // must not count

  const res = runCli(["--rotate-logs", "--dry-run"], {
    CODEX_LOG_DIR: logDir,
    CODEX_GUARD_DIR: guardDir,
    CODEX_LOG_ROTATE_THRESHOLD_BYTES: "500",
  });
  assert.equal(res.status, 0, res.stderr);
  // 900 = 3×300; the .bak file is excluded from the family aggregate.
  assert.match(res.stdout, /family logs_1\.sqlite: 900 bytes.*OVER threshold/);
  const guardFree = /gate guardSlots: free/.test(res.stdout);
  const liveTotal = Number(/gate liveCodex: total=(\d+)/.exec(res.stdout)?.[1] ?? "0");

  // Decision must follow the documented rule: delete only when all gates pass.
  if (guardFree && liveTotal === 0) {
    assert.match(res.stdout, /decision: would delete \[logs_1\.sqlite\]/);
  } else {
    assert.match(res.stdout, /decision: skip/);
  }
  assert.equal(fs.existsSync(path.join(logDir, "logs_1.sqlite")), true, "dry-run must not delete");
});

test("rotation --dry-run: all-slots-busy is reported and forces skip", async () => {
  if (!have("flock")) {
    return; // flock absent → maintenance-lock gating not exercisable
  }
  const logDir = mkTmp("cxsweep-logs-");
  const guardDir = mkTmp("cxsweep-guard-");
  fs.mkdirSync(guardDir, { recursive: true });
  fs.writeFileSync(path.join(logDir, "logs_1.sqlite"), Buffer.alloc(700));

  // Hold slot-0 so "acquire ALL slots non-blocking" fails.
  const holder = trackChild(
    spawn("flock", ["-n", path.join(guardDir, "slot-0.lock"), "-c", "echo HELD; sleep 30"], {
      stdio: ["ignore", "pipe", "ignore"],
    })
  );
  let held = "";
  holder.stdout.setEncoding("utf8");
  holder.stdout.on("data", (d) => (held += d));
  assert.ok(await waitFor(() => held.includes("HELD")), "holder failed to grab slot-0");

  const res = runCli(["--rotate-logs", "--dry-run"], {
    CODEX_LOG_DIR: logDir,
    CODEX_GUARD_DIR: guardDir,
    CODEX_LOG_ROTATE_THRESHOLD_BYTES: "500",
  });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /gate guardSlots: busy/);
  assert.match(res.stdout, /decision: skip \([^)]*guard slots busy[^)]*\)/);

  try {
    process.kill(holder.pid, "SIGKILL");
  } catch {
    // ignore
  }
});

test("rotation --dry-run: a generic `codex` CLI process counts toward the liveness gate", async () => {
  const logDir = mkTmp("cxsweep-logs-");
  const guardDir = mkTmp("cxsweep-guard-");
  fs.writeFileSync(path.join(logDir, "logs_1.sqlite"), Buffer.alloc(700));

  // argv[0] = "codex" (no subcommand) — an interactive-style codex process that
  // also holds ~/.codex/logs_*.sqlite. It must land in the "other" bucket.
  const fake = trackChild(spawn("bash", ["-c", "exec -a codex sleep 20"], { stdio: "ignore" }));
  assert.ok(await waitFor(() => pidAlive(fake.pid)), "fake codex process failed to start");
  await delay(200);

  const res = runCli(["--rotate-logs", "--dry-run"], {
    CODEX_LOG_DIR: logDir,
    CODEX_GUARD_DIR: guardDir,
    CODEX_LOG_ROTATE_THRESHOLD_BYTES: "500",
  });
  assert.equal(res.status, 0, res.stderr);
  const other = Number(/gate liveCodex: .*other=(\d+)/.exec(res.stdout)?.[1] ?? "0");
  assert.ok(other >= 1, `expected the generic codex process in the 'other' bucket, got other=${other}`);
  assert.match(res.stdout, /decision: skip \([^)]*live codex process[^)]*\)/);

  try {
    process.kill(fake.pid, "SIGKILL");
  } catch {
    // ignore
  }
});

test("rotation --dry-run: an open DB file (lsof) is reported and forces skip", async () => {
  if (!have("lsof")) {
    return; // lsof absent → best-effort DB-open gate not exercisable
  }
  const logDir = mkTmp("cxsweep-logs-");
  const guardDir = mkTmp("cxsweep-guard-");
  const dbFile = path.join(logDir, "logs_1.sqlite");
  fs.writeFileSync(dbFile, Buffer.alloc(700));

  const fd = fs.openSync(dbFile, "r"); // hold it open across the CLI run
  cleanups.push(() => {
    try {
      fs.closeSync(fd);
    } catch {
      // ignore
    }
  });

  const res = runCli(["--rotate-logs", "--dry-run"], {
    CODEX_LOG_DIR: logDir,
    CODEX_GUARD_DIR: guardDir,
    CODEX_LOG_ROTATE_THRESHOLD_BYTES: "500",
  });
  fs.closeSync(fd);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /gate liveCodex: .*dbOpen=true/);
  assert.match(res.stdout, /decision: skip \([^)]*db open \(lsof\)[^)]*\)/);
});
