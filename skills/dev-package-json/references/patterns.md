# package.json Organization Patterns

## Comment Separator Keys

Use `"//"` prefix keys with descriptive section names as visual separators.
JSON doesn't support comments, but unused keys with empty string values work as separators.

### Format

```
"// ── Section Name ──────────────────────────────": ""
```

Rules:
- Start with `"// ── "`
- Pad with `─` characters to roughly consistent width (~50 chars total key length)
- Value is always empty string `""`
- Place before the first script in each section

### Example

```json
{
  "scripts": {
    "// ── Core ─────────────────────────────────────────": "",
    "dev": "next dev",
    "build": "next build",
    "serve": "serve out",
    "// ── Code quality ────────────────────────────────": "",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "format": "prettier --check .",
    "// ── Testing ─────────────────────────────────────": "",
    "test": "jest",
    "test:e2e": "playwright test"
  }
}
```

### Suggested Section Names

Adapt to your project. Common sections:

| Section | Contents |
|---------|----------|
| Core | dev, build, serve, clean, start |
| Dev with API | Multi-environment dev commands |
| Sub-packages | Namespace-prefixed sub-app commands |
| Code quality | typecheck, lint, format, check |
| Testing | test, test:unit, test:e2e, test:api |
| Validation & checks | 404 checkers, link validators |
| Deploy | deploy scripts |
| Data & content tools | generators, indexers, content scripts |
| Internal & utilities | _prefixed helpers, setup scripts |

## External Shell Scripts for Complex Commands

When a npm script needs to start multiple processes or has complex conditional logic, extract to a shell script in `scripts/`.

### When to Extract

- Command starts 2+ background processes that need coordinated shutdown
- Conditional process startup based on env vars
- Complex pipe chains or multi-line logic
- Same process orchestration reused across multiple npm scripts

### Shell Script Pattern

```bash
#!/bin/bash
set -e

cleanup() {
  echo ""
  echo "Shutting down dev servers..."
  kill $PID_1 2>/dev/null
  kill $PID_2 2>/dev/null
  wait $PID_1 2>/dev/null
  wait $PID_2 2>/dev/null
  echo "Done."
}
trap cleanup EXIT INT TERM

# Conditionally start a background service
if [ "$SOME_MODE" = "local" ]; then
  echo "=== Starting background service ==="
  some-service --flag &
  PID_1=$!
  sleep 3
fi

# Start main dev server
echo "=== Starting main dev server ==="
pnpm dev &
PID_2=$!

wait
```

Key elements:
- `set -e` — exit on error
- `trap cleanup EXIT INT TERM` — graceful shutdown on Ctrl+C
- Background processes with `&` and `$!` to capture PID
- `sleep` between process starts if one depends on another
- `wait` at the end to keep script alive

### Calling from package.json

```json
{
  "dev:full": "API_MODE=local ./scripts/dev-full.sh",
  "dev:full:preview": "API_MODE=preview pnpm dev"
}
```

Note: Make scripts executable with `chmod +x scripts/*.sh`.

## Multi-Environment Dev Commands

When your app connects to different API backends (local, preview, production), create a command for each:

```json
{
  "// ── Dev with API (3 environments) ───────────────": "",
  "dev:full": "API_MODE=local ./scripts/dev-full.sh",
  "dev:full:preview": "API_MODE=preview pnpm dev",
  "dev:full:prod": "API_MODE=production pnpm dev"
}
```

Pattern:
- `:full` suffix = starts all required services (multi-process script)
- `:preview` suffix = points to remote preview API
- `:prod` suffix = points to remote production API
- Base `dev` = no API connection (mock/standalone mode)

## Namespace Prefixed Sub-Package Commands

For monorepos with sub-packages, prefix commands with the package name:

```json
{
  "// ── my-subapp ────────────────────────────────────": "",
  "my-subapp:dev": "cd sub-packages/my-subapp && pnpm run dev",
  "my-subapp:dev:full": "SUBAPP_API=local ./scripts/my-subapp-dev-full.sh",
  "my-subapp:dev:preview": "VITE_API_URL=https://preview.example.com pnpm my-subapp:dev",
  "my-subapp:dev:prod": "VITE_API_URL=https://example.com pnpm my-subapp:dev",
  "my-subapp:build": "cd sub-packages/my-subapp && pnpm run build",
  "my-subapp:test": "pnpm --filter my-subapp test"
}
```

## Predev Port Cleanup

Kill stale processes on dev server ports before starting. Prevents "port already in use" errors from orphaned processes, crashed dev servers, or forgotten terminals.

npm/pnpm lifecycle hooks auto-run `predev` before `dev` — no manual step needed.

```json
{
  "predev": "lsof -ti :5173,:8787 | xargs kill 2>/dev/null; true",
  "dev": "vite"
}
```

**Command breakdown:**

| Part | Purpose |
|------|---------|
| `lsof -ti :5173,:8787` | Find PIDs on ports 5173 and 8787 (`-t` = PID only) |
| `xargs kill` | SIGTERM (graceful shutdown) to each PID |
| `2>/dev/null; true` | Silently succeed when no processes found |

**Common port combinations:**

| Stack | Ports | predev |
|-------|-------|--------|
| Vite + Wrangler | 5173, 8787 | `lsof -ti :5173,:8787 \| xargs kill 2>/dev/null; true` |
| Next.js | 3000 | `lsof -ti :3000 \| xargs kill 2>/dev/null; true` |
| Vite + Express | 5173, 3001 | `lsof -ti :5173,:3001 \| xargs kill 2>/dev/null; true` |
| CRA + API | 3000, 8080 | `lsof -ti :3000,:8080 \| xargs kill 2>/dev/null; true` |

**Notes:**
- Use `kill` (SIGTERM) not `kill -9` (SIGKILL) — give processes a chance to clean up
- `; true` is preferred over `|| true` because it always succeeds regardless of which command in the pipeline fails
- This is macOS/Linux only (`lsof`). For cross-platform needs, use `npx kill-port 5173 8787` instead

## Internal/Private Scripts

Prefix with `_` for scripts not meant to be called directly:

```json
{
  "// ── Internal & utilities ────────────────────────": "",
  "_prepare": "rm -rf public && mkdir -p public && rsync -a static/ public/"
}
```
