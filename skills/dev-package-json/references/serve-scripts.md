# Serve / dev script tweaks

Applies only to scripts that start a server (`dev`, `serve`, `preview`, `start` and variants). Insert new scripts adjacent to their originals; never touch build/test/lint scripts.

Port detection: explicit `-p`/`--port` in the command first, else the framework default (Astro 4321, Next.js 3000, Vite 5173, Wrangler 8787).

## Kill vs. rotate

| | kill-port `preXXX` | port rotation launcher |
| --- | --- | --- |
| Cost | one-liner | launcher script + helper |
| Behavior | SIGTERMs whatever holds the port | walks +1, +2, ... to the first free port |
| Use when | only a stale orphan of *this* server is ever on the port | a second checkout/worktree runs side by side, or the port may be held by something the user wants alive |

## Kill-port (`--kill`)

```json
"predev": "lsof -ti :5173 -ti :8787 | xargs kill 2>/dev/null; true",
"dev": "vite",
```

- Lifecycle naming: `predev` for `dev`, `preserve` for `serve`, `predev:net` for `dev:net`. If a `preXXX` already exists, prepend the kill to it.
- **Multiple ports: repeat the flag** (`-ti :5173 -ti :8787`). A comma list takes the colon once (`:5173,8787`); `:5173,:8787` is a usage error on macOS ("unknown service :8787").
- `; true` is required — `lsof` exits 1 when nothing matches and that must not fail the hook.
- `kill` (SIGTERM), not `kill -9`.
- `lsof` is macOS/Linux only. Cross-platform: add `kill-port` as a devDependency and call `pnpm exec kill-port 5173 8787` — never `npx`/`dlx` at script run time (pin-vs-dlx rule in dev-reduce-deps).

## LAN variants (`--net`)

Add a `COMMAND:net` variant bound to `0.0.0.0` immediately after the original. If the command already has a host flag, replace its value. With `--kill`, the variant gets its own `preXXX:net`.

```json
"predev": "lsof -ti :4321 | xargs kill 2>/dev/null; true",
"dev": "astro dev",
"predev:net": "lsof -ti :4321 | xargs kill 2>/dev/null; true",
"dev:net": "astro dev --host 0.0.0.0",
```

| Tool | Flag |
| --- | --- |
| Astro, Vite, Webpack Dev Server, Docusaurus | `--host 0.0.0.0` |
| Next.js | `-H 0.0.0.0` |
| serve (npm) | `-l tcp://0.0.0.0:PORT` |
| http-server | `-a 0.0.0.0` |

## Port rotation

Assets live in `$HOME/.claude/skills/dev-package-json/assets/` — copy them into the target project:

| Asset | Copy to | Notes |
| --- | --- | --- |
| `find-free-port.mjs` | `scripts/lib/` | **Verbatim.** Keep `.mjs` (ESM regardless of `"type"`). Do not rewrite or simplify. |
| `dev-launcher.mjs` | `scripts/` | Edit only the `EDIT FOR YOUR PROJECT` block: `PREFERRED_PORT`, and `buildCommand` (port via `--port <n>` argv or a `PORT=<n>` env). |
| `find-free-port.test.ts` | unit test dir | Vitest; fix the relative import at the bottom. |

Then set `"dev": "node scripts/dev-launcher.mjs"` and remove any `predev` kill-port hook. When `dev` spawns more than one process, read [port-rotation-multi-process.md](port-rotation-multi-process.md).

Deterministic port for automation — `--strict-port` fails instead of shifting, e.g. a Playwright `webServer.command` whose `url` must match:

```js
command: 'DEV_PORT=5173 node scripts/dev-launcher.mjs --strict-port',
```

### Why the helper and launcher must not be simplified

- **Probe by CONNECT, not test-bind.** Node listeners set `SO_REUSEADDR`; on macOS a wildcard test-bind succeeds while another process holds `127.0.0.1:<port>`, so a `listen()` probe falsely reports "free".
- Probe both `127.0.0.1` and `::1`; busy on either = occupied.
- TOCTOU between probe and bind is accepted — the real server fails loudly if the port is stolen.
- Clean shutdown matters *more* without a kill step: an orphaned server keeps its port and silently pushes every future `dev` +1. So the launcher spawns **detached** and signals the whole group via `process.kill(-pid)` (CLI bins are a shim → node → binary chain; signaling only the wrapper orphans the real server), escalates SIGTERM → SIGKILL after 2s, and sweeps on `exit`.
- **SIGINT is forwarded explicitly** — a detached child does not receive the terminal's Ctrl-C. Drop the handler and Ctrl-C stops working.
