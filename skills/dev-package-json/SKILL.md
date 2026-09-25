---
name: dev-package-json
description: "Organize and maintain package.json and pnpm config: scripts layout and separators, multi-process/multi-environment dev commands, serve/dev script tweaks (predev kill-port, `:net` LAN variants, non-destructive port-rotation launcher), corepack/packageManager pinning, and pnpm build-script security (allowBuilds / strictDepBuilds). Use when editing package.json scripts, on 'tweak serve', 'kill port', 'port in use', 'port rotation', 'don't kill the port', or on pnpm 'Ignored build scripts' warnings."
user-invocable: true
argument-hint: "[--kill] [--net] [--rotate]"
---

# package.json & pnpm config

## 1. Scripts organization

**Separator keys** — unused JSON keys as section dividers: `"// ── Name ───…": ""`, padded with `─` to ~50 chars, placed before the first script of each section.

```json
"// ── Core ─────────────────────────────────────────": "",
"dev": "next dev",
"build": "next build",
"// ── Testing ─────────────────────────────────────": "",
"test": "jest"
```

**Multi-process commands** — when a script starts 2+ background processes, extract it to `scripts/*.sh` from the template `scripts/multi-process-dev.sh.template` (trap-based cleanup so Ctrl+C takes every child down). `chmod +x` it.

**Multi-environment dev:**

```json
"// ── Dev with API (3 environments) ───────────────": "",
"dev:full": "API_MODE=local ./scripts/dev-full.sh",
"dev:full:preview": "API_MODE=preview pnpm dev",
"dev:full:prod": "API_MODE=production pnpm dev"
```

Section names, suffix conventions, monorepo namespace prefixes, `_` internal scripts: [references/patterns.md](references/patterns.md).

## 2. Serve / dev scripts

Read [references/serve-scripts.md](references/serve-scripts.md) before changing any server-starting script. It covers:

- `--kill` — `preXXX` hook: `lsof -ti :PORT | xargs kill 2>/dev/null; true` (multiple ports: repeat `-ti :PORT`, never `:A,:B`)
- `--net` — `COMMAND:net` variants bound to `0.0.0.0`, per-framework host flags
- `--rotate` — non-destructive port rotation: copy `assets/find-free-port.mjs` (verbatim) + `assets/dev-launcher.mjs` into the project; multi-process variant in [references/port-rotation-multi-process.md](references/port-rotation-multi-process.md)

Invoked with no flag and no clear intent: ask which tweak to apply. Prefer rotation over kill when worktrees/second checkouts run side by side or the port may belong to something the user wants alive.

## 3. pnpm version via corepack

Pin in package.json: `"packageManager": "pnpm@10.30.2+sha512.…"`. Once per machine: `corepack enable`.

- **Node ≥25 no longer bundles corepack** — `npm install -g corepack` first, or use pnpm's standalone installer (`curl -fsSL https://get.pnpm.io/install.sh | sh -`); recent pnpm reads `packageManager` and self-manages the pinned version.
- Never `pnpm self-update` — it errors under corepack.
- Never add `corepack use pnpm@latest` to setup steps (a common AI/automation mistake) — it bumps `packageManager` and churns `pnpm-lock.yaml`. Upgrade only intentionally: one person runs `corepack use pnpm@<version>` and commits package.json + lockfile.

## 4. Dependency build-script security

pnpm 10+ blocks dependency lifecycle scripts by default. Verdicts go in the `allowBuilds` map in **`pnpm-workspace.yaml`** (`true` = run, `false` = deny + silence the warning) — NOT `.npmrc`, where such keys are silent no-ops. Never bulk-approve; evaluate each package.

Workflow for "Ignored build scripts" warnings, decision criteria, known-package verdict table, `strictDepBuilds`: [references/build-scripts.md](references/build-scripts.md).
