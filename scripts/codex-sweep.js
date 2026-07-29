#!/usr/bin/env node

/**
 * Stale Codex process sweeper.
 *
 * The OpenAI Codex Claude Code plugin spawns one detached broker
 * (app-server-broker.mjs serve --cwd <workspace> ...) per workspace, plus a
 * `codex app-server` child. Cleanup relies on the plugin's SessionEnd hook,
 * which never fires on killed terminals / crashes / worktree-teammate
 * sessions — orphaned trees then live forever (PPID 1) and, on WSL2, exhaust
 * fs.inotify.max_user_instances (Vite EMFILE). This script detects and kills
 * them. Kills are cheap: the plugin's ensureBrokerSession self-heals by
 * respawning an unreachable broker in ~1-2s.
 *
 * Usage:
 *   node $HOME/.claude/scripts/codex-sweep.js [options]
 *
 * Options:
 *   --dry-run          classify and report, kill nothing
 *   --age <hours>      tier-2 idle threshold (default 2; --auto default 6)
 *   --quiet            print nothing unless something was killed/removed
 *   --json             machine-readable output
 *   --throttle <dur>   skip run if last sweep was younger than dur (e.g. 6h, 30m)
 *   --auto             hook preset: --quiet --throttle 6h --age 6 + log-DB rotation
 *   --tier1-only       skip the liveness-based tier 2
 *   --workspace <path> reap ONLY this workspace's codex broker (no global sweep,
 *                      no rotation) — RPC shutdown, then TERM/KILL a verified
 *                      survivor; exit 0 when nothing to reap, NONZERO when a
 *                      verified target survives (the always-0 hook contract is
 *                      --auto only). Used post-review by child agents.
 *   --rotate-logs      run ONLY the log-DB rotation (no sweep) — standalone/test
 *                      entry point; honors --dry-run and the env overrides below.
 *
 * Log-DB rotation env overrides (tests point these away from the real dir):
 *   CODEX_LOG_DIR                    dir holding logs_<n>.sqlite (default ~/.codex)
 *   CODEX_LOG_ROTATE_THRESHOLD_BYTES aggregate family size that triggers rotation
 *                                    (default 500 MB)
 *   CODEX_GUARD_DIR / CODEX_GUARD_SLOTS  guard slot dir + count (must match the
 *                                    codex-guard.sh maintenance lock)
 *
 * Classification:
 *   tier 1 (definitively stale):
 *     1a broker whose --cwd no longer exists
 *     1b `codex app-server` orphaned to PPID 1 (broker children have PPID=broker)
 *     1c `codex exec` orphaned to PPID 1, older than 60 min
 *   tier 2 (stale by liveness): broker older than --age whose workspace has no
 *     live claude session at-or-under it, and no live claude session above it
 *     (below $HOME) — the bidirectional rule keeps worktree brokers of a live
 *     manager session alive.
 *
 * Always exits 0 (hook safety). Never kills anything younger than 60s or
 * whose command line doesn't match a codex signature.
 */

import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const HOME = os.homedir();
const MARKER_FILE = path.join(HOME, ".claude", ".codex-sweep-last");
const MIN_AGE_SEC = 60;
const CODEX_EXEC_MIN_AGE_SEC = 3600;
const TMPDIR_MIN_AGE_MS = 10 * 60 * 1000;

// --- log-DB rotation (--auto / --rotate-logs) ---
// codex writes a growing $HOME/.codex/logs_<n>.sqlite (bumps the number over time).
// Env-overridable so tests never point a low threshold at the real dir.
const DEFAULT_LOG_DIR = path.join(HOME, ".codex");
const ROTATE_THRESHOLD_DEFAULT = 500 * 1024 * 1024; // 500 MB
// codex-guard.sh's slot dir + default slot count — the rotation maintenance lock
// must coordinate with the SAME files so no guarded codex launch starts mid-delete.
const GUARD_DIR = process.env.CODEX_GUARD_DIR || path.join(HOME, ".claude", ".codex-guard");
const GUARD_SLOTS_DEFAULT = 2;

function parseDuration(s) {
  const m = /^(\d+)(h|m|s)?$/.exec(String(s).trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n * (m[2] === "h" ? 3600000 : m[2] === "s" ? 1000 : 60000);
}

function parseArgs(argv) {
  const opts = {
    dryRun: false,
    ageHours: null,
    quiet: false,
    json: false,
    throttleMs: null,
    tier1Only: false,
    workspace: null,
    rotateLogs: false,
    auto: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--quiet") opts.quiet = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--tier1-only") opts.tier1Only = true;
    else if (a === "--rotate-logs") opts.rotateLogs = true;
    else if (a === "--workspace") {
      // Require a real path value. A missing value (--workspace as the last arg) or
      // an option-like value (next token starts with '-') must NOT be swallowed and
      // then fall through to the GLOBAL sweep — a malformed targeted reap could kill
      // unrelated broker trees. Fail loudly with a distinct usage exit code (2),
      // separate from the reap-failure code (1), and never reach the sweep.
      const val = argv[i + 1];
      if (val === undefined || val.startsWith("-")) {
        process.stderr.write(
          "codex-sweep: --workspace requires a non-option <path> value\n" +
            "usage: codex-sweep.js --workspace <path>\n"
        );
        process.exit(2);
      }
      opts.workspace = argv[++i];
    }
    else if (a === "--age") opts.ageHours = Number(argv[++i]);
    else if (a === "--throttle") opts.throttleMs = parseDuration(argv[++i]);
    else if (a === "--auto") {
      opts.auto = true;
      opts.quiet = true;
      if (opts.throttleMs == null) opts.throttleMs = 6 * 3600000;
      if (opts.ageHours == null) opts.ageHours = 6;
    }
  }
  if (opts.ageHours == null || !Number.isFinite(opts.ageHours)) opts.ageHours = 2;
  return opts;
}

// etime is [[dd-]hh:]mm:ss; macOS ps has no `etimes` keyword
function parseEtime(s) {
  const m = /^(?:(?:(\d+)-)?(\d+):)?(\d+):(\d+)$/.exec(String(s).trim());
  if (!m) return -1;
  const [, dd, hh, mm, ss] = m;
  return (Number(dd || 0) * 24 + Number(hh || 0)) * 3600 + Number(mm) * 60 + Number(ss);
}

function psSnapshot() {
  const res = spawnSync("ps", ["-e", "-ww", "-o", "pid=,ppid=,uid=,etime=,command="], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (res.status !== 0 || !res.stdout) throw new Error(`ps failed: ${res.stderr || res.status}`);
  const uid = process.getuid();
  const procs = [];
  for (const line of res.stdout.split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(line);
    if (!m) continue;
    if (Number(m[3]) !== uid) continue;
    procs.push({ pid: Number(m[1]), ppid: Number(m[2]), ageSec: parseEtime(m[4]), cmd: m[5] });
  }
  const children = new Map();
  for (const p of procs) {
    if (!children.has(p.ppid)) children.set(p.ppid, []);
    children.get(p.ppid).push(p.pid);
  }
  return { procs, byPid: new Map(procs.map((p) => [p.pid, p])), children };
}

const isBrokerCmd = (cmd) => cmd.includes("app-server-broker.mjs") && cmd.includes(" serve ");
const isAppServerCmd = (cmd) => /(^|\/| )codex app-server\b/.test(cmd) && !cmd.includes("app-server-broker.mjs");
const isCodexExecCmd = (cmd) => /(^|\/| )codex exec\b/.test(cmd);
const isCodexSignature = (cmd) => isBrokerCmd(cmd) || isAppServerCmd(cmd) || isCodexExecCmd(cmd);
// Any `codex` CLI process (interactive TUI, `codex resume`, any subcommand) — it
// also writes ~/.codex/logs_*.sqlite, so the DESTRUCTIVE rotation gate must count
// it. `codex($| )` (space-or-end after the word) deliberately excludes the
// hyphenated helpers `codex-sweep`/`codex-guard`/`codex-rate-limit`/`codex-companion`.
const isCodexAnyCmd = (cmd) => /(^|\/| )codex($| )/.test(cmd);

function safeRealpath(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

function brokerArgs(proc) {
  // Linux: exact argv from /proc; macOS: regex on the ps command line.
  // Arg order is fixed by the plugin's spawnBrokerProcess:
  //   serve --endpoint <ep> --cwd <path> --pid-file <cxc>/broker.pid
  if (process.platform === "linux") {
    try {
      const argv = fs.readFileSync(`/proc/${proc.pid}/cmdline`, "utf8").split("\0");
      const cwdIdx = argv.indexOf("--cwd");
      const pidIdx = argv.indexOf("--pid-file");
      return {
        cwd: cwdIdx !== -1 ? argv[cwdIdx + 1] : null,
        cxcDir: pidIdx !== -1 && argv[pidIdx + 1] ? path.dirname(argv[pidIdx + 1]) : null,
      };
    } catch {
      // process may have exited; fall through to regex
    }
  }
  const m = /--cwd (.+?) --pid-file (\S+)/.exec(proc.cmd);
  return { cwd: m ? m[1] : null, cxcDir: m ? path.dirname(m[2]) : null };
}

function getClaudeCwds(procs) {
  const claudePids = procs
    .filter((p) => /(^|\/)claude( |$)/.test(p.cmd) || p.cmd.includes("@anthropic-ai/claude-code"))
    .map((p) => p.pid);
  if (claudePids.length === 0) return [];

  if (process.platform === "linux") {
    const cwds = [];
    let failures = 0;
    for (const pid of claudePids) {
      try {
        cwds.push(fs.readlinkSync(`/proc/${pid}/cwd`));
      } catch {
        failures++;
      }
    }
    return failures === claudePids.length ? null : cwds.map(safeRealpath);
  }

  const res = spawnSync("lsof", ["-a", "-p", claudePids.join(","), "-d", "cwd", "-Fn"], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (!res.stdout) return null;
  const cwds = res.stdout
    .split("\n")
    .filter((l) => l.startsWith("n"))
    .map((l) => safeRealpath(l.slice(1)));
  return cwds.length === 0 ? null : cwds;
}

const isAtOrUnder = (child, parent) => child === parent || child.startsWith(parent + path.sep);

function isProtected(brokerCwd, claudeCwds) {
  const w = safeRealpath(brokerCwd);
  const homeReal = safeRealpath(HOME);
  for (const c of claudeCwds) {
    // upward: a session running inside the workspace
    if (isAtOrUnder(c, w)) return true;
    // downward: a session above the workspace (manager at repo root protects
    // its worktree brokers) — but never from a session idling at ~ or /
    if (isAtOrUnder(w, c) && c !== homeReal && c !== "/") return true;
  }
  return false;
}

function planKills(snapshot, claudeCwds, opts) {
  const targets = [];
  const kept = [];
  const ageLimitSec = opts.ageHours * 3600;

  for (const p of snapshot.procs) {
    if (p.pid === process.pid) continue;

    if (isBrokerCmd(p.cmd)) {
      const { cwd, cxcDir } = brokerArgs(p);
      if (!cwd) {
        kept.push({ pid: p.pid, cwd: "(unparsed)", reason: "cwd parse failed" });
        continue;
      }
      if (p.ageSec < MIN_AGE_SEC || p.ageSec === -1) {
        kept.push({ pid: p.pid, cwd, reason: "younger than 60s floor" });
        continue;
      }
      if (!fs.existsSync(cwd)) {
        targets.push({ ...p, tier: "1a", reason: "workspace deleted", cwd, cxcDir });
        continue;
      }
      if (opts.tier1Only) {
        kept.push({ pid: p.pid, cwd, reason: "tier1-only mode" });
        continue;
      }
      if (claudeCwds === null) {
        kept.push({ pid: p.pid, cwd, reason: "tier 2 skipped (liveness lookup failed)" });
        continue;
      }
      if (isProtected(cwd, claudeCwds)) {
        kept.push({ pid: p.pid, cwd, reason: "live claude session" });
        continue;
      }
      if (p.ageSec <= ageLimitSec) {
        kept.push({ pid: p.pid, cwd, reason: `younger than ${opts.ageHours}h threshold` });
        continue;
      }
      targets.push({ ...p, tier: "2", reason: "no live session at workspace", cwd, cxcDir });
      continue;
    }

    if (isAppServerCmd(p.cmd) && p.ppid === 1) {
      if (p.ageSec >= MIN_AGE_SEC) targets.push({ ...p, tier: "1b", reason: "orphaned app-server" });
      continue;
    }

    if (isCodexExecCmd(p.cmd) && p.ppid === 1) {
      if (p.ageSec >= CODEX_EXEC_MIN_AGE_SEC) targets.push({ ...p, tier: "1c", reason: "orphaned codex exec" });
      continue;
    }
  }
  return { targets, kept };
}

function descendantsOf(pid, snapshot, acc = new Set()) {
  for (const child of snapshot.children.get(pid) ?? []) {
    if (!acc.has(child)) {
      acc.add(child);
      descendantsOf(child, snapshot, acc);
    }
  }
  return acc;
}

function tryKill(pid, signal) {
  try {
    process.kill(pid, signal);
    return "ok";
  } catch (e) {
    return e.code === "ESRCH" ? "gone" : "eperm";
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function executeKills(targets, snapshot1) {
  // reverify against a fresh snapshot: same pid+ppid+cmd, or it's dropped
  const snap2 = psSnapshot();
  const live = targets.filter((t) => {
    const p = snap2.byPid.get(t.pid);
    return p && p.ppid === t.ppid && p.cmd === t.cmd;
  });

  const killedPids = new Set();
  const skipped = [];

  for (const t of live) {
    if (t.pid <= 1 || !isCodexSignature(t.cmd)) continue;
    const r = tryKill(t.pid, "SIGTERM");
    if (r === "eperm") skipped.push(t.pid);
  }

  const deadline = Date.now() + 3000;
  let pending = live.map((t) => t.pid);
  while (pending.length > 0 && Date.now() < deadline) {
    await sleep(200);
    pending = pending.filter((pid) => tryKill(pid, 0) === "ok");
  }

  // escalation: survivors + descendants the graceful shutdown missed
  const snap3 = psSnapshot();
  const escalate = new Set();
  for (const t of live) {
    if (snap3.byPid.has(t.pid)) escalate.add(t.pid);
    for (const d of descendantsOf(t.pid, snapshot1)) {
      const now = snap3.byPid.get(d);
      const before = snapshot1.byPid.get(d);
      if (now && before && now.cmd === before.cmd) escalate.add(d);
    }
  }
  for (const pid of escalate) tryKill(pid, "SIGTERM");
  if (escalate.size > 0) await sleep(1000);
  for (const pid of escalate) {
    if (tryKill(pid, 0) === "ok") tryKill(pid, "SIGKILL");
  }

  // count what actually died (trees + total processes)
  const finalSnap = psSnapshot();
  for (const t of live) {
    if (!finalSnap.byPid.has(t.pid)) killedPids.add(t.pid);
    for (const d of descendantsOf(t.pid, snapshot1)) {
      if (!finalSnap.byPid.has(d)) killedPids.add(d);
    }
  }
  return { killedTrees: live.filter((t) => !finalSnap.byPid.has(t.pid)), killedPids, skipped, finalSnap };
}

function sweepTmpDirs(postKillSnap, opts) {
  const tmp = os.tmpdir();
  let entries = [];
  try {
    entries = fs.readdirSync(tmp).filter((n) => n.startsWith("cxc-"));
  } catch {
    return { removed: [], kept: 0 };
  }
  const liveCmdline = postKillSnap.procs.map((p) => p.cmd).join("\n");
  const removed = [];
  let kept = 0;

  for (const name of entries) {
    const dir = path.join(tmp, name);
    try {
      const st = fs.statSync(dir);
      if (Date.now() - st.mtimeMs < TMPDIR_MIN_AGE_MS) {
        kept++;
        continue;
      }
      let pidAlive = false;
      try {
        const pid = Number(fs.readFileSync(path.join(dir, "broker.pid"), "utf8").trim());
        const proc = postKillSnap.byPid.get(pid);
        pidAlive = Boolean(proc && isBrokerCmd(proc.cmd));
      } catch {
        // no readable pid file → treat as dead
      }
      const referenced =
        liveCmdline.includes(dir) || liveCmdline.includes(safeRealpath(dir)) || liveCmdline.includes(name);
      if (pidAlive || referenced) {
        kept++;
        continue;
      }
      if (!opts.dryRun) fs.rmSync(dir, { recursive: true, force: true });
      removed.push(dir);
    } catch {
      kept++;
    }
  }
  return { removed, kept };
}

function fmtAge(sec) {
  if (sec < 0) return "?";
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)}h`;
  return `${(sec / 86400).toFixed(1)}d`;
}

// ---------------------------------------------------------------------------
// --workspace reap: shut down ONE workspace's codex broker.
//
// The plugin's SessionEnd hook never fires for /x-wt-teams child sessions, so a
// child's detached broker+app-server pair leaks. A child knows its own workspace
// and its review-completion moment, so it reaps its own broker here. The plugin's
// ensureBrokerSession self-heals if codex is needed again, so an early reap is safe.
//
// State-dir resolution below REIMPLEMENTS the plugin's state.mjs / broker-lifecycle.mjs
// layout (do NOT import plugin files — they are upstream and clobbered on update).
// ---------------------------------------------------------------------------

function resolveWorkspaceRoot(cwd) {
  // Mirrors plugin resolveWorkspaceRoot: git toplevel, else the cwd itself.
  try {
    const r = spawnSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  } catch {
    // git missing / not a repo → fall through
  }
  return cwd;
}

function resolveStateDirForWorkspace(cwd) {
  // Mirrors plugin state.mjs resolveStateDir: slug from basename, hash from the
  // canonical (realpath) workspace root, under $CLAUDE_PLUGIN_DATA/state or the
  // /tmp/codex-companion fallback. Must stay byte-identical to the plugin or the
  // reap looks in the wrong directory.
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  let canonical = workspaceRoot;
  try {
    canonical = fs.realpathSync.native(workspaceRoot);
  } catch {
    canonical = workspaceRoot;
  }
  const slugSource = path.basename(workspaceRoot) || "workspace";
  const slug = slugSource.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
  const hash = createHash("sha256").update(canonical).digest("hex").slice(0, 16);
  const pluginDataDir = process.env.CLAUDE_PLUGIN_DATA;
  const stateRoot = pluginDataDir ? path.join(pluginDataDir, "state") : path.join(os.tmpdir(), "codex-companion");
  return path.join(stateRoot, `${slug}-${hash}`);
}

function endpointSocketPath(endpoint) {
  return typeof endpoint === "string" && endpoint.startsWith("unix:") ? endpoint.slice("unix:".length) : null;
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM"; // exists but not signalable (same-uid here, so ~never)
  }
}

function unlinkSafe(p) {
  try {
    if (p) fs.unlinkSync(p);
  } catch {
    // already gone / not removable
  }
}

function removeBrokerArtifacts(stateDir, broker) {
  unlinkSafe(path.join(stateDir, "broker.json"));
  if (broker && typeof broker === "object") {
    unlinkSafe(broker.pidFile);
    unlinkSafe(broker.logFile);
    unlinkSafe(endpointSocketPath(broker.endpoint));
    if (broker.sessionDir) {
      try {
        fs.rmSync(broker.sessionDir, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    }
  }
  // Remove the plugin state dir only if now empty — preserve state.json / jobs.
  try {
    fs.rmdirSync(stateDir);
  } catch {
    // non-empty or already gone
  }
}

// Bounded broker/shutdown RPC over the unix socket. Resolves { ok } — ok:true when
// the broker acknowledged (it exits itself right after), ok:false on timeout /
// unreachable endpoint (caller then falls back to signals).
function sendBrokerShutdown(endpoint, timeoutMs = 3000) {
  const sockPath = endpointSocketPath(endpoint);
  if (!sockPath) return Promise.resolve({ ok: false, reason: "non-unix endpoint" });
  return new Promise((resolve) => {
    let settled = false;
    const socket = net.createConnection({ path: sockPath });
    const finish = (res) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      resolve(res);
    };
    const timer = setTimeout(() => finish({ ok: false, reason: "timeout" }), timeoutMs);
    socket.setEncoding("utf8");
    socket.on("connect", () => {
      socket.write(`${JSON.stringify({ id: 1, method: "broker/shutdown", params: {} })}\n`);
    });
    socket.on("data", () => finish({ ok: true }));
    socket.on("error", () => finish({ ok: false, reason: "unreachable" }));
    socket.on("close", () => finish({ ok: false, reason: "closed" }));
  });
}

async function reapWorkspace(workspacePath, opts) {
  const stateDir = resolveStateDirForWorkspace(workspacePath);
  const brokerFile = path.join(stateDir, "broker.json");
  const say = (m) => {
    if (!opts.quiet) console.log(`[codex-reap] ${m}`);
  };

  let broker;
  try {
    broker = JSON.parse(fs.readFileSync(brokerFile, "utf8"));
  } catch {
    say(`no broker for ${workspacePath} — nothing to reap`);
    return; // idempotent: exit 0 quietly
  }

  const pid = Number(broker?.pid);
  if (!Number.isInteger(pid) || pid <= 1) {
    say("broker.json has no usable pid — removing stale state");
    removeBrokerArtifacts(stateDir, broker);
    return;
  }

  const snap = psSnapshot();
  const proc = snap.byPid.get(pid);
  const workspaceRoot = safeRealpath(resolveWorkspaceRoot(workspacePath));

  // --- validate BEFORE signaling: never signal a mismatched/reused pid ---
  if (!proc) {
    say(`broker pid ${pid} not alive — removing stale state`);
    removeBrokerArtifacts(stateDir, broker);
    return;
  }
  if (!isBrokerCmd(proc.cmd)) {
    say(`pid ${pid} is not a codex broker (reused pid) — refusing to signal; removing stale state`);
    removeBrokerArtifacts(stateDir, broker);
    return;
  }
  const brokerCwd = brokerArgs(proc).cwd;
  const brokerCwdReal = brokerCwd ? safeRealpath(brokerCwd) : null;
  // Accept a broker whose --cwd is AT or UNDER the workspace root. The plugin can
  // start the broker with a repo SUBDIRECTORY as --cwd while hashing its state under
  // the root, so a strict equality check would reject the correct broker — orphaning
  // it while deleting its state. isAtOrUnder is a real path-boundary check, so
  // /foo/barbaz does NOT match workspace root /foo/bar.
  if (!brokerCwdReal || !isAtOrUnder(brokerCwdReal, workspaceRoot)) {
    say(`broker pid ${pid} --cwd ${brokerCwd ?? "(?)"} not under workspace ${workspaceRoot} — refusing to signal; removing stale state`);
    removeBrokerArtifacts(stateDir, broker);
    return;
  }

  // --- valid target: capture descendants FIRST, then shut down ---
  const descendants = [...descendantsOf(pid, snap)];
  if (opts.dryRun) {
    say(`would reap broker pid ${pid} (+${descendants.length} descendants) for ${workspaceRoot}`);
    return;
  }
  say(`reaping broker pid ${pid} (+${descendants.length} descendants) for ${workspaceRoot}`);

  const rpc = await sendBrokerShutdown(broker.endpoint, 3000);

  // Give an acknowledged shutdown a moment to exit on its own; an unreachable
  // endpoint (rpc.ok false) skips straight to signal escalation.
  if (rpc.ok) {
    const deadline = Date.now() + 3000;
    while (pidAlive(pid) && Date.now() < deadline) await sleep(150);
  }

  // TERM then KILL, only for REVERIFIED survivors. The broker's FULL command line
  // (which encodes --cwd) must still equal the validated snapshot — matching only
  // isBrokerCmd would let a reused PID that is now ANOTHER workspace's broker get
  // signaled, defeating the reused-PID protection. Descendants match the same way.
  if (pidAlive(pid) || descendants.some((d) => pidAlive(d))) {
    const s2 = psSnapshot();
    const bp = s2.byPid.get(pid);
    if (bp && bp.cmd === proc.cmd) tryKill(pid, "SIGTERM");
    for (const d of descendants) {
      const now = s2.byPid.get(d);
      const before = snap.byPid.get(d);
      if (now && before && now.cmd === before.cmd) tryKill(d, "SIGTERM");
    }
    await sleep(1000);
    const s3 = psSnapshot();
    const bp3 = s3.byPid.get(pid);
    if (bp3 && bp3.cmd === proc.cmd) tryKill(pid, "SIGKILL");
    for (const d of descendants) {
      const now = s3.byPid.get(d);
      const before = snap.byPid.get(d);
      if (now && before && now.cmd === before.cmd) tryKill(d, "SIGKILL");
    }
    await sleep(200);
  }

  // Determine survivors BEFORE any cleanup: if a verified target is still running,
  // RETAIN its state so a re-run can retry — deleting broker.json here would make
  // the next reap report "no broker" and orphan the survivor forever.
  const finalSnap = psSnapshot();
  const stillAlive = (targetPid, beforeCmd) => {
    const now = finalSnap.byPid.get(targetPid);
    return Boolean(now && beforeCmd && now.cmd === beforeCmd);
  };
  const brokerSurvived = stillAlive(pid, proc.cmd);
  const descSurvived = descendants.some((d) => stillAlive(d, snap.byPid.get(d)?.cmd));

  // Exit NONZERO when a verified target survives — the always-0 hook contract
  // applies to --auto only; an explicit reap must surface failure.
  if (brokerSurvived || descSurvived) {
    process.exitCode = 1;
    process.stderr.write(
      `[codex-reap] verified target survived reap for ${workspaceRoot} (broker pid ${pid}); retaining state for retry\n`
    );
    return;
  }

  removeBrokerArtifacts(stateDir, broker);
  say(`broker pid ${pid} reaped${rpc.ok ? " via RPC shutdown" : " via signal"}`);
}

// ---------------------------------------------------------------------------
// Log-DB rotation: bounded deletion of a fat $HOME/.codex/logs_<n>.sqlite family.
//
// codex bumps the filename number (logs_1 → logs_2) and never truncates, so the
// active DB grows unbounded (observed ~2.4 GB). The SessionStart sweep protects
// live brokers and can't relieve this. Rotation deletes the whole WAL family only
// when it is provably safe — codex recreates the DB on next start.
// ---------------------------------------------------------------------------

function computeLogFamilies(logDir) {
  let names;
  try {
    names = fs.readdirSync(logDir);
  } catch {
    return [];
  }
  // The version-glob is ONLY because codex bumps the number — treat siblings that
  // share the sqlite filename as ONE family, never as unrelated files.
  const bases = names.filter((n) => /^logs_\d+\.sqlite$/.test(n));
  const families = [];
  for (const base of bases) {
    const members = [base];
    for (const suffix of ["-wal", "-shm", "-journal"]) {
      if (names.includes(base + suffix)) members.push(base + suffix);
    }
    const sizes = {};
    let totalBytes = 0;
    for (const m of members) {
      try {
        const st = fs.statSync(path.join(logDir, m));
        sizes[m] = st.size;
        totalBytes += st.size;
      } catch {
        sizes[m] = 0;
      }
    }
    families.push({ base, dir: logDir, members, sizes, totalBytes });
  }
  return families;
}

function countLiveCodexProcesses() {
  let snap;
  try {
    snap = psSnapshot();
  } catch {
    // If we cannot enumerate processes, assume codex is live (fail safe: don't delete).
    return { total: 1, appServer: 0, broker: 0, exec: 0, other: 0, error: true };
  }
  let appServer = 0;
  let broker = 0;
  let exec = 0;
  let other = 0; // any OTHER codex CLI process (interactive TUI, etc.) — also holds the DB
  for (const p of snap.procs) {
    if (p.pid === process.pid) continue;
    if (isBrokerCmd(p.cmd)) broker++;
    else if (isAppServerCmd(p.cmd)) appServer++;
    else if (isCodexExecCmd(p.cmd)) exec++;
    else if (isCodexAnyCmd(p.cmd)) other++;
  }
  return { total: appServer + broker + exec + other, appServer, broker, exec, other, error: false };
}

// Belt-and-suspenders: if lsof reports ANY process holding a family file open,
// treat the DB as in use. Best-effort — a missing lsof yields "not held".
function dbHeldOpen(files) {
  if (files.length === 0) return false;
  const res = spawnSync("lsof", ["-t", ...files], { encoding: "utf8" });
  if (res.error) return false; // lsof unavailable
  return Boolean(res.stdout && res.stdout.trim());
}

function haveFlock() {
  const r = spawnSync("sh", ["-c", "command -v flock"], { encoding: "utf8" });
  return r.status === 0;
}

function guardSlotCount() {
  const n = Number(process.env.CODEX_GUARD_SLOTS);
  return Number.isInteger(n) && n > 0 ? n : GUARD_SLOTS_DEFAULT;
}

// Non-blocking probe used for dry-run reporting: every slot lock must be acquirable
// right now. (Real deletion re-acquires and HOLDS via holdAllSlots.)
function probeAllSlotsFree(guardDir, n) {
  for (let i = 0; i < n; i++) {
    const lock = path.join(guardDir, `slot-${i}.lock`);
    const r = spawnSync("flock", ["-n", lock, "-c", "true"], { encoding: "utf8" });
    if (r.error) return { ok: false, reason: "flock unavailable" };
    if (r.status !== 0) return { ok: false, reason: `slot ${i} busy` };
  }
  return { ok: true };
}

// Spawn a bash process that flock -n's EVERY slot on its own fd and holds them all
// (blocked on stdin) until released — the exclusive maintenance lock coordinated
// with codex-guard.sh. Resolves the child on success, or null if any slot is busy.
function holdAllSlots(guardDir, n) {
  return new Promise((resolve) => {
    const script =
      'DIR="$1"; N="$2"; fd=200; i=0; ' +
      'while [ "$i" -lt "$N" ]; do ' +
      'eval "exec $fd>\\"$DIR/slot-$i.lock\\""; ' +
      'flock -n "$fd" || exit 1; ' +
      "fd=$((fd+1)); i=$((i+1)); " +
      "done; " +
      'echo LOCKED; IFS= read -r _ || true';
    const child = spawn("bash", ["-c", script, "bash", guardDir, String(n)], { stdio: ["pipe", "pipe", "ignore"] });
    let out = "";
    let settled = false;
    const done = (val) => {
      if (!settled) {
        settled = true;
        resolve(val);
      }
    };
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (d) => {
      out += d;
      if (out.includes("LOCKED")) done(child);
    });
    child.on("exit", () => done(null)); // exited before LOCKED → a slot was busy
    child.on("error", () => done(null));
  });
}

function releaseAllSlots(child) {
  if (!child) return;
  try {
    child.stdin.end();
  } catch {
    // ignore
  }
  try {
    child.kill("SIGTERM");
  } catch {
    // ignore
  }
}

async function rotateLogs(opts) {
  const logDir = process.env.CODEX_LOG_DIR || DEFAULT_LOG_DIR;
  const envThreshold = Number(process.env.CODEX_LOG_ROTATE_THRESHOLD_BYTES);
  const threshold = Number.isFinite(envThreshold) && envThreshold > 0 ? envThreshold : ROTATE_THRESHOLD_DEFAULT;
  const dry = opts.dryRun;
  const quiet = opts.quiet && !dry;
  const say = (m) => {
    if (!quiet) console.log(`[codex-rotate] ${m}`);
  };
  // An actual deletion is significant enough to announce even under --auto --quiet.
  const announce = (m) => console.log(`[codex-rotate] ${m}`);

  const families = computeLogFamilies(logDir);
  say(`logDir=${logDir} threshold=${threshold} families=${families.length}`);

  const candidates = [];
  for (const f of families) {
    const over = f.totalBytes > threshold;
    const sizeStr = Object.entries(f.sizes)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    say(`family ${f.base}: ${f.totalBytes} bytes (${sizeStr}) ${over ? "OVER" : "under"} threshold`);
    if (over) candidates.push(f);
  }
  if (candidates.length === 0) {
    say("decision: skip (no family over threshold)");
    return;
  }

  const candidateFiles = candidates.flatMap((f) => f.members.map((m) => path.join(f.dir, m)));
  const label = candidates.map((f) => f.base).join(", ");

  // Gate 1: zero live codex processes (app-server + broker + exec) and no lsof holder.
  const live = countLiveCodexProcesses();
  const dbOpen = dbHeldOpen(candidateFiles);
  say(
    `gate liveCodex: total=${live.total} (app-server=${live.appServer} broker=${live.broker} exec=${live.exec} other=${live.other ?? 0}) dbOpen=${dbOpen}`
  );

  // Gate 2: ALL guard slots acquirable (maintenance lock — no guarded launch mid-delete).
  const guardDir = GUARD_DIR;
  const slots = guardSlotCount();
  const flockOk = haveFlock();
  let slotsFree = false;
  if (flockOk) {
    try {
      fs.mkdirSync(guardDir, { recursive: true });
    } catch {
      // ignore
    }
    slotsFree = probeAllSlotsFree(guardDir, slots).ok;
  }
  say(`gate guardSlots: ${flockOk ? (slotsFree ? "free" : "busy") : "flock-unavailable"} (${slots} slots @ ${guardDir})`);

  const reasons = [];
  if (live.total > 0) reasons.push("live codex process");
  if (dbOpen) reasons.push("db open (lsof)");
  if (!flockOk) reasons.push("flock unavailable"); // destructive op — no lock, no delete
  else if (!slotsFree) reasons.push("guard slots busy");
  if (reasons.length > 0) {
    say(`decision: skip (${reasons.join("; ")})`);
    return;
  }

  if (dry) {
    say(`decision: would delete [${label}] (${candidateFiles.length} files)`);
    return;
  }

  // Real deletion: hold ALL slots, recheck liveness immediately before unlink.
  const holder = await holdAllSlots(guardDir, slots);
  if (!holder) {
    say("decision: skip (guard slots busy at lock time)");
    return;
  }
  try {
    const live2 = countLiveCodexProcesses();
    const dbOpen2 = dbHeldOpen(candidateFiles);
    if (live2.total > 0 || dbOpen2) {
      say(`decision: skip (liveness changed before unlink: total=${live2.total} dbOpen=${dbOpen2})`);
      return;
    }
    let deleted = 0;
    for (const file of candidateFiles) {
      try {
        fs.unlinkSync(file);
        deleted++;
      } catch {
        // already gone
      }
    }
    announce(`deleted [${label}] (${deleted}/${candidateFiles.length} files, codex recreates on next start)`);
  } finally {
    releaseAllSlots(holder);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  // --workspace: reap ONLY this workspace's broker. No global sweep, no rotation,
  // no throttle. Sets a nonzero exit when a verified target survives.
  if (opts.workspace != null) {
    await reapWorkspace(opts.workspace, opts);
    return;
  }

  // --rotate-logs: run ONLY the log-DB rotation (standalone / test entry point).
  if (opts.rotateLogs) {
    await rotateLogs(opts);
    return;
  }

  if (opts.throttleMs != null && !opts.dryRun) {
    try {
      const last = Number(fs.readFileSync(MARKER_FILE, "utf8").trim());
      if (Number.isFinite(last) && Date.now() - last < opts.throttleMs) return;
    } catch {
      // no marker yet → proceed
    }
  }

  const snapshot = psSnapshot();
  const claudeCwds = opts.tier1Only ? [] : getClaudeCwds(snapshot.procs);
  const { targets, kept } = planKills(snapshot, claudeCwds, opts);

  if (!opts.dryRun) {
    fs.mkdirSync(path.dirname(MARKER_FILE), { recursive: true });
    fs.writeFileSync(MARKER_FILE, `${Date.now()}\n`, "utf8");
  }

  if (opts.dryRun) {
    const dirPlan = sweepTmpDirs(snapshot, opts);
    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            dryRun: true,
            wouldKill: targets.map((t) => ({ pid: t.pid, tier: t.tier, reason: t.reason, ageSec: t.ageSec, cwd: t.cwd ?? null })),
            kept,
            wouldRemoveDirs: dirPlan.removed,
            livenessSource: process.platform === "linux" ? "proc" : "lsof",
            tier2Skipped: claudeCwds === null,
          },
          null,
          2
        )
      );
      return;
    }
    console.log(`[codex-sweep] dry-run: would kill ${targets.length} trees, remove ${dirPlan.removed.length} tmp dirs`);
    for (const t of targets) console.log(`  would kill pid ${t.pid}  ${fmtAge(t.ageSec)}  tier ${t.tier} (${t.reason})  ${t.cwd ?? t.cmd.slice(0, 80)}`);
    for (const k of kept) console.log(`  keep pid ${k.pid}  (${k.reason})  ${k.cwd}`);
    if (claudeCwds === null) console.log("  NOTE: tier 2 skipped — liveness lookup failed");
    return;
  }

  let result = { killedTrees: [], killedPids: new Set(), skipped: [], finalSnap: snapshot };
  if (targets.length > 0) result = await executeKills(targets, snapshot);
  const dirs = sweepTmpDirs(result.finalSnap, opts);

  // Log-DB rotation rides the SessionStart --auto flow (gated + best-effort).
  // MUST await inside the try — an unawaited async rejection would escape this
  // catch and become an unhandled rejection that fails the SessionStart hook,
  // breaking its always-succeed contract.
  if (opts.auto) {
    try {
      await rotateLogs(opts);
    } catch (err) {
      if (!opts.quiet) process.stderr.write(`[codex-rotate] error: ${err?.message ?? err}\n`);
    }
  }

  const nothingDone = result.killedPids.size === 0 && dirs.removed.length === 0;
  if (opts.json) {
    console.log(
      JSON.stringify({
        killedTrees: result.killedTrees.map((t) => ({ pid: t.pid, tier: t.tier, reason: t.reason, cwd: t.cwd ?? null })),
        killedProcessCount: result.killedPids.size,
        skippedEperm: result.skipped,
        keptBrokers: kept,
        removedDirs: dirs.removed,
        livenessSource: process.platform === "linux" ? "proc" : "lsof",
        tier2Skipped: claudeCwds === null,
      })
    );
    return;
  }
  if (opts.quiet && nothingDone) return;

  const tierCounts = {};
  for (const t of result.killedTrees) tierCounts[t.tier] = (tierCounts[t.tier] ?? 0) + 1;
  const tierStr = Object.entries(tierCounts)
    .map(([tier, n]) => `${n} tier-${tier}`)
    .join(", ");
  console.log(
    `[codex-sweep] killed ${result.killedTrees.length} trees / ${result.killedPids.size} processes` +
      (tierStr ? ` (${tierStr})` : "") +
      `, kept ${kept.length} brokers, removed ${dirs.removed.length} tmp dirs` +
      (result.skipped.length ? `, skipped ${result.skipped.length} (EPERM)` : "") +
      (claudeCwds === null ? " [tier 2 skipped: liveness lookup failed]" : "")
  );
}

// Only auto-run when executed directly as a CLI; when imported by tests, export
// the helpers instead so fixtures can drive them (and match the state-dir hash).
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    process.stderr.write(`[codex-sweep] error: ${err?.message ?? err}\n`);
  });
}

export { resolveStateDirForWorkspace, reapWorkspace, computeLogFamilies, rotateLogs };
