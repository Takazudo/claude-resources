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
 *   --auto             hook preset: --quiet --throttle 6h --age 6
 *   --tier1-only       skip the liveness-based tier 2
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
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const HOME = os.homedir();
const MARKER_FILE = path.join(HOME, ".claude", ".codex-sweep-last");
const MIN_AGE_SEC = 60;
const CODEX_EXEC_MIN_AGE_SEC = 3600;
const TMPDIR_MIN_AGE_MS = 10 * 60 * 1000;

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
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--quiet") opts.quiet = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--tier1-only") opts.tier1Only = true;
    else if (a === "--age") opts.ageHours = Number(argv[++i]);
    else if (a === "--throttle") opts.throttleMs = parseDuration(argv[++i]);
    else if (a === "--auto") {
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

async function main() {
  const opts = parseArgs(process.argv.slice(2));

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

main().catch((err) => {
  process.stderr.write(`[codex-sweep] error: ${err?.message ?? err}\n`);
});
