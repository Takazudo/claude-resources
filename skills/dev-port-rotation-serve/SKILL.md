---
name: dev-port-rotation-serve
description: "Set up a dev server that auto-rotates to the next free port instead of killing whatever holds the preferred one. Ships a drop-in port-probe helper + launcher template. Use when: (1) User invokes /dev-port-rotation-serve, (2) User wants `dev` to walk to the next free port (+1, +2, ...) rather than kill-port, (3) User says 'port rotation', 'rotate ports', 'don't kill the port', 'auto-shift port', or wants a non-destructive dev launcher. NOT for adding a predev kill-port one-liner — that is dev-tweak-serve-package-json (--kill) / dev-package-json."
user-invocable: true
---

# dev-port-rotation-serve

Reference implementation for a `dev` script that **probes the preferred port and
walks forward (+1, +2, ...) to the first free one**, instead of force-killing
whatever already listens there. The chosen port is printed at startup.

## Rotation vs. kill-port — pick the right approach

Two `dev-*` skills add the opposite behavior (a `predev` that runs
`lsof -ti :PORT | xargs kill`): `dev-tweak-serve-package-json --kill` and
`dev-package-json` (Technique 2). Use **this** skill instead when killing is too
blunt:

- A second checkout / worktree of the same project should run side by side.
- The preferred port might be held by something the user wants alive (another

  app, a debugger, a paused server).

- You want each `dev` to "just work" without ever taking down a foreign process.

Reach for the kill-port one-liner when a stale orphan of *this* server is the
only thing ever on that port and a one-line `predev` is enough. Rotation is more
robust but needs a launcher script; kill-port is a one-liner but destructive.

## What ships in this skill

Assets are **not** auto-loaded — read and copy them into the target project.
They live under this skill's directory
(`$HOME/.claude/skills/dev-port-rotation-serve/`):

| File | Role | How to use |
|---|---|---|
| `assets/find-free-port.mjs` | The port-probe helper (`isPortFree`, `findFreePort`) | Copy **verbatim** into the project (e.g. `scripts/lib/`). Fragile logic — do not rewrite. |
| `assets/dev-launcher.mjs` | Single-process launcher template | Copy to `scripts/`, then edit the marked `EDIT FOR YOUR PROJECT` block. |
| `assets/find-free-port.test.ts` | Vitest contract test | Copy to the test dir; adjust the relative import. Optional but recommended. |
| `references/multi-process.md` | Multi-process coordination (server + sidecar) | Read when `dev` spawns more than one process. |

## Apply it

1. **Copy the helper verbatim** to `scripts/lib/find-free-port.mjs`. Keep `.mjs`

   (always-ESM regardless of `"type"`). Its connect-vs-bind probe encodes a
   macOS gotcha (see below) — do not re-derive it.

2. **Copy the launcher** to `scripts/dev-launcher.mjs` and edit the marked block:

   set `PREFERRED_PORT` and `buildCommand` (the dev command + how it takes the
   resolved port — `--port <n>` on argv, or a `PORT=<n>` env var).

3. **Wire `package.json`** — point `dev` at the launcher and remove any

   `predev` kill-port hook:

   ```json
   "dev": "node scripts/dev-launcher.mjs"
   ```

4. **Multi-process** (server + sidecar)? Read `references/multi-process.md` and

   extend the template — thread an `exclude` list between resolutions and hand
   each child the *resolved* sibling ports.

5. **Test** — copy `find-free-port.test.ts`, fix the import path, run the unit

   suite to confirm the helper resolves green in the new project.

## Why the helper is fragile (do not simplify)

- **Probe by CONNECT, not test-bind.** Node listeners set `SO_REUSEADDR`; on

  macOS a wildcard test-bind succeeds even while another process holds
  `127.0.0.1:<port>`, so a `listen()`-probe falsely reports "free". A TCP
  connect that succeeds means something is listening → busy; connection-refused
  → free.

- **Probe both loopback families** (`127.0.0.1` and `::1`); busy on either = occupied.
- **TOCTOU is accepted** — a probed-free port is bound a moment later; the real

  server fails loudly if the port is stolen in between. Fine for dev tooling.

## Why clean shutdown matters MORE here (do not drop these)

Without a kill-port step, an orphaned dev server keeps its port bound and
silently pushes every future `dev` +1. The launcher therefore:

- Spawns children **detached** (own process group) and signals the whole tree

  via `process.kill(-pid)` — many CLI bins are a shim → node → spawned-binary
  chain; signaling only the wrapper orphans the real server.

- Escalates `SIGTERM` → `SIGKILL` after 2s and has a last-resort `exit` sweep.
- **Forwards `SIGINT` explicitly** — the detached child does not receive the

  terminal's Ctrl-C, only the launcher does. Drop this handler and Ctrl-C stops
  working.

## Deterministic ports for automation

Pass `--strict-port` to fail instead of shifting. Use it for a Playwright
`webServer.command` whose configured `url` must match the bound port:

```js
command: 'DEV_PORT=5173 node scripts/dev-launcher.mjs --strict-port',
```
