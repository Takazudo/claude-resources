# package.json scripts conventions

## Section names for separator keys

| Section | Contents |
| --- | --- |
| Core | dev, build, serve, clean, start |
| Dev with API | multi-environment dev commands |
| Sub-packages | namespace-prefixed sub-app commands |
| Code quality | typecheck, lint, format, check |
| Testing | test, test:unit, test:e2e, test:api |
| Validation & checks | 404 checkers, link validators |
| Deploy | deploy scripts |
| Data & content tools | generators, indexers, content scripts |
| Internal & utilities | `_`-prefixed helpers, setup scripts |

## Multi-environment suffixes

- base `dev` = no API connection (mock/standalone)
- `:full` = starts all required local services (multi-process script)
- `:preview` / `:prod` = frontend only, pointed at the remote preview / production API

## Namespace-prefixed sub-package commands

```json
{
  "// ── my-subapp ────────────────────────────────────": "",
  "my-subapp:dev": "cd sub-packages/my-subapp && pnpm run dev",
  "my-subapp:dev:full": "SUBAPP_API=local ./scripts/my-subapp-dev-full.sh",
  "my-subapp:dev:preview": "VITE_API_URL=https://preview.example.com pnpm my-subapp:dev",
  "my-subapp:build": "cd sub-packages/my-subapp && pnpm run build",
  "my-subapp:test": "pnpm --filter my-subapp test"
}
```

## Internal scripts

Prefix with `_` for scripts not meant to be called directly (`"_prepare": "rm -rf public && ..."`).

## When to extract a script to `scripts/*.sh`

- 2+ background processes needing coordinated shutdown
- conditional process startup based on env vars
- the same orchestration reused by several npm scripts

Start from `scripts/multi-process-dev.sh.template` in this skill (`trap cleanup EXIT INT TERM`, `&` + `$!` per process, `sleep` when one depends on another, trailing `wait`).
