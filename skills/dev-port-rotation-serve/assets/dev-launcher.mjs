/**
 * Dev launcher — port auto-selection instead of killing port-holders.
 *
 * Probes the preferred port and walks forward (+1, +2, ...) to the first free
 * one, then spawns the dev server on it. Replaces the common
 * `predev: lsof -ti :PORT | xargs kill` flow, which can take down a process
 * the user wanted alive (another app, a second checkout, a debugger).
 *
 * Override the preferred port via env (see PREFERRED_PORT below).
 *
 * Flags:
 *   --strict-port   fail instead of shifting when the preferred port is busy.
 *                   For automation that needs a deterministic URL — e.g. a
 *                   Playwright `webServer.command` whose `url` must match the
 *                   port the launcher actually binds.
 *
 * TEMPLATE: edit the marked block for your project. For a multi-process dev
 * server (server + sidecar), see multi-process.md in the skill.
 */

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findFreePort, isPortFree } from './lib/find-free-port.mjs';

const scriptsDir = dirname(fileURLToPath(import.meta.url));

// Make project bins (node_modules/.bin) resolvable even when this is invoked
// as `node scripts/dev-launcher.mjs` directly (e.g. a Playwright webServer
// command) — not just via the npm/pnpm-script PATH, which prepends .bin itself.
const binDir = join(scriptsDir, '..', 'node_modules', '.bin');
const childPath = `${binDir}:${process.env.PATH ?? ''}`;

// ── EDIT FOR YOUR PROJECT ──────────────────────────────────────────────────
const PREFERRED_PORT = Number(process.env.DEV_PORT) || 5173;
// The dev command + how it receives the resolved port. Most dev servers take
// `--port <n>` on argv; some read it from an env var (e.g. `PORT=<n>`) instead.
const buildCommand = (port) => ({
  cmd: 'vite',
  args: ['--port', String(port)],
  env: {},
});
// ───────────────────────────────────────────────────────────────────────────

const strictPort = process.argv.slice(2).includes('--strict-port');

const COLORS = { yellow: '\x1b[33m', reset: '\x1b[0m' };

async function resolvePort(preferred) {
  if (strictPort) {
    if (!(await isPortFree(preferred))) {
      console.error(`[dev-launcher] --strict-port: port ${preferred} is busy`);
      process.exit(1);
    }
    return preferred;
  }
  return findFreePort(preferred);
}

const port = await resolvePort(PREFERRED_PORT);
const shifted =
  port !== PREFERRED_PORT
    ? ` ${COLORS.yellow}(${PREFERRED_PORT} was busy — shifted)${COLORS.reset}`
    : '';

console.log('');
console.log('=== dev port ===');
console.log(`  port: ${port}${shifted}`);
console.log(`  → http://localhost:${port}/`);
console.log('');

const { cmd, args, env } = buildCommand(port);

// detached: true puts the child in its own process group so shutdown can
// signal the whole tree via process.kill(-pid). Many CLI bins are a shim →
// node wrapper → spawned binary; signaling only the wrapper orphans the real
// server, which keeps the port bound.
//
// Clean self-shutdown matters MORE here than under a kill-port flow, not less:
// with no kill-port step, an orphaned dev server silently pushes every future
// run +1. The SIGKILL escalation + exit sweep below guarantee we release our
// own port on the way out.
const child = spawn(cmd, args, {
  stdio: 'inherit',
  detached: true,
  env: { ...process.env, ...env, PATH: childPath },
});

let shuttingDown = false;

function killTree(signal) {
  if (child.exitCode !== null) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // already gone
    }
  }
}

function shutdown(signal = 'SIGTERM') {
  if (shuttingDown) return;
  shuttingDown = true;
  killTree(signal);
  const killTimer = setTimeout(() => killTree('SIGKILL'), 2000);
  killTimer.unref();
}

// Last-resort sweep: if the event loop drains unexpectedly, take the child
// with us (kill(2) is a sync syscall — safe in 'exit').
process.on('exit', () => killTree('SIGKILL'));

child.on('exit', (code) => {
  if (!shuttingDown) {
    process.exitCode = code ?? 1;
    shutdown();
  }
});
child.on('error', (err) => {
  console.error(`[dev-launcher] failed to start ${cmd}: ${err.message}`);
  process.exitCode = 1;
  shutdown();
});

// The child is in its own process group (detached), so a terminal Ctrl-C
// reaches only this launcher — forward it explicitly, or Ctrl-C won't stop the
// server.
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
