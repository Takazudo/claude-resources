---
name: dev-tweak-serve-package-json
description: >-
  Tweak serve/dev commands in package.json. Use when: (1) User says 'tweak serve', 'dev tweak
  serve', or 'tweak-serve', (2) User wants to add port-kill before dev/serve commands (--kill), (3)
  User wants to add :net LAN-accessible variants of dev/serve commands (--net). Flags: --kill adds
  predev port cleanup, --net adds 0.0.0.0 host variants.
disable-model-invocation: true
user-invocable: true
argument-hint: "--kill and/or --net"
---

# dev-tweak-serve-package-json

Tweak serving-related commands in package.json. Requires `--kill` and/or `--net` flag.

## Workflow

1. Read the project's package.json
2. Identify all serve/dev commands (scripts that start local servers — `dev`, `serve`, `preview`, `start`, etc.)
3. Detect the port(s) used by each command
4. Detect the framework (Next.js, Astro, Vite, etc.) from package.json dependencies
5. Apply the requested tweaks

## `--kill` flag

Add port-killing before serve commands so stale processes don't block startup.

### Pattern

For each serve command, detect the port it uses and add a `preXXX` script that kills it:

```json
"predev": "lsof -ti :PORT | xargs kill 2>/dev/null; true",
"dev": "astro dev",
```

- Use `preXXX` npm lifecycle hook naming (e.g., `predev` for `dev`, `preserve` for `serve`)
- The kill command pattern: `lsof -ti :PORT | xargs kill 2>/dev/null; true`
- If a `preXXX` script already exists, prepend the kill command to it
- If the port is not obvious from the command, check common framework defaults (Astro: 4321, Next.js: 3000, Vite: 5173, etc.)

### Port detection priority

1. Explicit `-p PORT` or `--port PORT` flag in the command
2. Framework default port from dependencies

## `--net` flag

Create `:net` suffixed variants of serve commands that bind to `0.0.0.0` for LAN access.

### Pattern

For each serve command, create a `COMMAND:net` variant:

```json
"dev": "astro dev",
"dev:net": "astro dev --host 0.0.0.0",
```

### Framework-specific host flags

| Framework | Flag |
| --- | --- |
| Astro | `--host 0.0.0.0` |
| Next.js | `-H 0.0.0.0` |
| Vite / Vitest | `--host 0.0.0.0` |
| Webpack Dev Server | `--host 0.0.0.0` |
| serve (npm) | `-l tcp://0.0.0.0:PORT` or `--listen tcp://0.0.0.0:PORT` |
| http-server | `-a 0.0.0.0` |
| Docusaurus | `--host 0.0.0.0` |

- Place the `:net` variant immediately after the original command
- If the command already has a host flag, replace it with `0.0.0.0`
- If `--kill` is also specified, the `:net` variant should also get a matching `preXXX:net` kill script

## Both flags together

When both `--kill` and `--net` are specified, apply both tweaks. Example result:

```json
"predev": "lsof -ti :4321 | xargs kill 2>/dev/null; true",
"dev": "astro dev",
"predev:net": "lsof -ti :4321 | xargs kill 2>/dev/null; true",
"dev:net": "astro dev --host 0.0.0.0",
```

## Important

- Only modify scripts that actually start servers (dev, serve, preview, start and their variants)
- Do not touch build, test, lint, or other non-server scripts
- Preserve existing script order — insert new scripts adjacent to their originals
- If the argument is missing or invalid, ask the user which flag(s) to apply
