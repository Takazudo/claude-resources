# Multi-process dev launcher

When `dev` starts more than one process (a server + a sidecar, an API + a
frontend), three things change versus the single-process template.

## 1. Thread an `exclude` list between resolutions

Port resolution is **probe-then-spawn**: a port reported free is not bound yet.
Two back-to-back `findFreePort` calls can therefore pick the *same* port. Pass
each already-chosen port into the next call's `exclude`:

```js
const serverPort = await findFreePort(PREFERRED_SERVER_PORT);
const sidecarPort = await findFreePort(PREFERRED_SIDECAR_PORT, { exclude: [serverPort] });
```

Under `--strict-port` there is no walking, so no exclude is needed — each
process simply asserts its own preferred port is free.

## 2. Hand the resolved ports to the children that need them

A child that must reach a sibling needs the sibling's *resolved* port, not the
preferred one. Pass it through env or argv:

```js
const serverEnv = { ...process.env, PATH: childPath, SIDECAR_PORT: String(sidecarPort) };
const server = spawn('my-server', ['--port', String(serverPort)], { detached: true, env: serverEnv });

const sidecar = spawn('my-sidecar', ['--port', String(sidecarPort),
  // If the sidecar gates by Origin, allow every spelling the resolved
  // server port is reachable at — the resolved port, not the preferred one.
  '--allow-origin', `http://localhost:${serverPort}`,
  '--allow-origin', `http://127.0.0.1:${serverPort}`,
], { detached: true, env: { ...process.env, PATH: childPath } });
```

Origin/CORS allow-lists, proxy targets, and printed URLs must all use the
resolved ports. A hard-coded preferred port silently breaks the moment the
launcher shifts.

## 3. First-exit-takes-all shutdown across the group

Track all children in an array and apply the single-process shutdown logic to
each. `concurrently -k` semantics: when any child exits, take the others down
and propagate the exit code.

```js
const children = [server, sidecar];

function shutdown(signal = 'SIGTERM') {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) killTree(c, signal);
  const t = setTimeout(() => { for (const c of children) killTree(c, 'SIGKILL'); }, 2000);
  t.unref();
}
process.on('exit', () => { for (const c of children) killTree(c, 'SIGKILL'); });

for (const child of children) {
  child.on('exit', (code) => { if (!shuttingDown) { process.exitCode = code ?? 1; shutdown(); } });
  child.on('error', () => { process.exitCode = 1; shutdown(); });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
```

Here `killTree(child, signal)` is the single-process `killTree` parameterized by
child (signal the group via `process.kill(-child.pid, signal)`, fall back to
`child.kill`).

## Per-process prefixed output

With multiple children you usually want `stdio: ['inherit'|'ignore', 'pipe', 'pipe']`
and a readline-based line prefixer so interleaved logs stay attributable:

```js
import { createInterface } from 'node:readline';
function prefixStream(stream, label, target) {
  const rl = createInterface({ input: stream });
  rl.on('line', (line) => target.write(`[${label}] ${line}\n`));
}
prefixStream(server.stdout, 'server', process.stdout);
prefixStream(server.stderr, 'server', process.stderr);
```

The single-process template uses `stdio: 'inherit'` instead — simpler, and
there is nothing to disambiguate with only one child.
