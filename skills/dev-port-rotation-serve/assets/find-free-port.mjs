/**
 * Free-port resolution for a dev launcher (replaces a kill-port flow).
 *
 * Instead of force-killing whatever listens on the preferred dev port,
 * the launcher probes the preferred port and walks forward (+1, +2, ...)
 * to the first free one. See `dev-launcher.mjs` for the consumer.
 *
 * The probe CONNECTS to the loopback addresses instead of test-binding a
 * listener: Node listeners set SO_REUSEADDR, and on macOS that lets a
 * wildcard test-bind succeed even while another process holds
 * 127.0.0.1:<port> — a listen()-probe reports "free" for ports that are
 * very much in use (observed with a running dev server). A successful TCP
 * connect on either loopback family means something is listening → busy;
 * connection-refused means free. There is an inherent TOCTOU race between
 * probe and the real server's bind — acceptable for dev tooling; the real
 * server fails loudly if the port is stolen in between.
 */

import { connect } from 'node:net';

const CONNECT_TIMEOUT_MS = 500;

/**
 * Try a TCP connect; resolves true if a connection is established
 * (= something is listening there).
 *
 * @param {string} host
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function canConnect(host, port) {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    socket.unref();
    socket.setTimeout(CONNECT_TIMEOUT_MS);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    // ECONNREFUSED / EADDRNOTAVAIL (no such loopback family) etc. → not listening.
    socket.once('error', () => resolve(false));
    // Loopback connects answer ~instantly; a hang is unexpected — treat as busy
    // (conservative: shifts a port unnecessarily rather than colliding).
    socket.once('timeout', () => {
      socket.destroy();
      resolve(true);
    });
  });
}

/**
 * Check whether a TCP port is free on both loopback families.
 *
 * @param {number} port
 * @returns {Promise<boolean>}
 */
export async function isPortFree(port) {
  const [v4Busy, v6Busy] = await Promise.all([
    canConnect('127.0.0.1', port),
    canConnect('::1', port),
  ]);
  return !v4Busy && !v6Busy;
}

/**
 * Find the first free port starting at `preferred`, walking +1 each try.
 *
 * @param {number} preferred - the port to try first
 * @param {{ maxTries?: number, exclude?: Iterable<number> }} [options]
 *   `exclude` skips ports already promised to another process this run —
 *   probe-then-spawn means a probed-free port is not actually bound yet, so
 *   two sequential findFreePort calls could otherwise pick the same port.
 * @returns {Promise<number>} the first free port
 * @throws when no free port is found within `maxTries` attempts
 */
export async function findFreePort(preferred, { maxTries = 20, exclude = [] } = {}) {
  const excluded = new Set(exclude);
  for (let i = 0; i < maxTries; i++) {
    const candidate = preferred + i;
    if (excluded.has(candidate)) continue;
    if (await isPortFree(candidate)) return candidate;
  }
  throw new Error(
    `No free port found in range ${preferred}-${preferred + maxTries - 1} (${maxTries} tries)`,
  );
}
