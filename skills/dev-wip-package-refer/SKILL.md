---
name: dev-wip-package-refer
description: "Pattern for consuming an in-progress (WIP) upstream npm/pnpm package from a sibling git checkout via a `file:../{name}/...` relative dep — without publishing the package. Use when: (1) Setting up a consumer project that needs to depend on a local in-development library or framework checked out next to it, (2) User mentions 'file: dep', 'sibling repo', 'upstream package', 'wip package', 'monorepo-style refer', 'how do we consume the upstream', (3) Deciding between this pattern and a published npm version or a `github:` git-URL dep, (4) Setting up a fresh machine that already has a consumer project but the sibling upstream isn't cloned yet, (5) A consumer's CI is failing because the sibling upstream isn't where the `file:` spec expects it."
---

# dev-wip-package-refer

The "consume a WIP upstream package via a sibling-relative `file:` dep" pattern. Lets a consumer project depend on an in-development library/framework without publishing each iteration to npm.

For the inverse — editing the upstream itself — see [`dev-wip-package-upstream-wt-dev`](../dev-wip-package-upstream-wt-dev/SKILL.md).

## When to reach for this pattern

Use when **the upstream library is itself in active development by the same maintainer (or a tightly coordinated team)** and the iteration loop matters: edit upstream → consumer sees the change immediately on next `pnpm install`, no publish step. Trades multi-machine setup pain for fast iteration.

Don't use it when the upstream is stable and shipped to npm — a normal versioned dep is simpler. Also don't use it for adversarial / arms-length dependencies — `file:` paths assume both repos live on disk under your control.

## How it resolves

The consumer's `package.json` declares the dep with a path-style spec:

```json
{
  "dependencies": {
    "@org/pkg":    "file:../upstream/packages/pkg",
    "@org/pkg-rt": "file:../upstream/packages/pkg-runtime"
  }
}
```

pnpm/npm resolve `file:../upstream/...` against the **consumer project root**, so the upstream sibling is always at `<consumer-root>/../upstream/`. Identical on every machine as long as the sibling layout is preserved — clone the consumer at `$HOME/repos/foo/consumer`, the upstream at `$HOME/repos/foo/upstream`, and `file:../upstream` just works. No env-specific config.

Real example (zudo-doc):

```json
"@takazudo/zfb":                     "file:../zfb/packages/zfb"
"@takazudo/zfb-adapter-cloudflare":  "file:../zfb/packages/zfb-adapter-cloudflare"
"@takazudo/zfb-runtime":             "file:../zfb/packages/zfb-runtime"
"@takazudo/zudo-design-token-panel": "file:../zdtp/packages/zudo-design-token-panel"
```

→ resolves to `../zfb/packages/zfb` and `../zdtp/packages/zudo-design-token-panel`.

## What the consumer needs in place

For `pnpm install` to succeed in the consumer, the upstream sibling must:

1. **Exist on disk** at `../upstream/` (clone before installing).
2. **Be at a known SHA** so the consumer's behavior is reproducible — see "Pinning" below.
3. **Have any required build artifacts present.** pnpm hard-copies `file:` deps at install time. If the dep is "source + a built binary" (e.g. a Rust CLI shipped via the npm package), the binary must be built before the consumer installs. If the dep is "TypeScript + a `dist/`" the dist must be built first.

If any of those are missing, the consumer's `pnpm install` either succeeds with broken/stale state or fails at a postinstall hook.

## Pinning — single source of truth for the SHA

The consumer pins which upstream SHA it depends on. Two places to pin:

1. **In CI workflow env vars** — e.g. `ZFB_PINNED_SHA`, `ZDTP_PINNED_SHA` declared at the workflow `env:` level of every workflow that runs `pnpm install`. CI clones the upstream at that SHA before installing. This is the **source of truth.**
2. **(Optional) A `framework-pins.json`** that both CI workflows and a local bootstrap script read from. Reduces "edit 3 YAML files per bump" to "edit 1 JSON file." Use when you have more than ~2 workflow files.

Bumping the pin = the consumer adopts the upstream change. The change is reviewed and tested in CI's clean clone.

## CI side — clone-then-install

The consumer's CI workflow must clone the upstream at the pinned SHA into `../upstream/` **before** `pnpm install` runs in the consumer. Shape:

```yaml
env:
  UPSTREAM_PINNED_SHA: <full SHA>

jobs:
  build:
    steps:
      - name: Checkout consumer
        uses: actions/checkout@v5

      - name: Clone pinned upstream sibling
        run: |
          git clone https://github.com/<org>/<upstream-repo>.git ../upstream
          git -C ../upstream checkout "$UPSTREAM_PINNED_SHA"

      # OPTIONAL: build upstream artifacts here if the npm package needs them
      # (Rust binary, dist/, etc.). For heavy builds, do it in a separate
      # job and upload the artifact, then download it into ../upstream/ in
      # each consumer job. See zudo-doc's `build-zfb` job for that pattern.

      - name: Setup Node + pnpm
        # ...

      - name: Install consumer deps
        run: pnpm install
```

For expensive upstream builds (Rust toolchain, large bundles), split into a dedicated build job that uploads the binary as an artifact; consumer jobs `cp` it into `../upstream/target/release/` before `pnpm install`. See zudo-doc's `.github/workflows/pr-checks.yml` `build-zfb` job for a reference shape.

## Local side — bootstrap script for multi-machine setup

The brittle part of this pattern is "new machine = clone two repos in the right layout + build their artifacts before `pnpm install`." Solve it with a bootstrap script that does what CI does:

```bash
pnpm setup:upstream     # ensure all WIP-sibling upstreams are present and built
```

The script:

1. Reads the pinned SHA(s) from the single source of truth (CI workflow env vars or `framework-pins.json`).
2. For each upstream:
   - If `../upstream/` doesn't exist → `git clone <url> ../upstream`, then `git checkout <SHA>`.
   - If `../upstream/` exists with a **clean tree** → `git fetch origin && git checkout <SHA>` (matches CI).
   - If `../upstream/` exists with a **dirty tree** → refuse to touch it (you have in-flight upstream edits; resolve first or pass `--force-checkout`).
3. Build upstream artifacts if missing (Rust binary, `dist/`, etc.). Skip if cache is fresh.
4. Run `pnpm install` in the consumer.

The "refuse on dirty tree" rule is what prevents stomping on a parallel upstream-edit session — see [`dev-wip-package-upstream-wt-dev`](../dev-wip-package-upstream-wt-dev/SKILL.md) for why the upstream root is shared.

A starter Node.js skeleton (adjust to the consumer's needs):

```js
// scripts/setup-upstream.mjs
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = process.cwd();
const pkg = JSON.parse(readFileSync(resolve(projectRoot, "package.json"), "utf8"));

// Discover sibling-relative file: deps and group by upstream root.
const upstreams = new Map(); // siblingDir -> { siblingPath }
for (const [name, spec] of Object.entries(pkg.dependencies ?? {})) {
  if (typeof spec !== "string" || !spec.startsWith("file:..")) continue;
  const siblingDir = spec.slice("file:".length).split("/")[0]; // "../upstream"
  const siblingPath = resolve(projectRoot, siblingDir);
  if (!upstreams.has(siblingDir)) upstreams.set(siblingDir, { siblingPath });
}

// For each upstream, load (sha, gitUrl, buildSteps) from `framework-pins.json`
// (or grep the workflow YAML) and ensure-clone-build.
// ...left to the consumer to fill in based on its specific upstreams.
```

Wire the script into `package.json` as a regular script (`"setup:upstream": "node scripts/setup-upstream.mjs"`). Don't run it from `postinstall` — that would loop. Document it as the **first thing to run on a new machine.**

## Comparison with alternatives

| Approach | Multi-machine | Lets you edit upstream live | Effort |
|---|---|---|---|
| `file:../sibling` + bootstrap (this pattern) | One command per new machine | ✅ | Small |
| `github:org/repo#SHA` git URL | Just works on any machine; lockfile pins SHA | ⚠️ slower iteration; needs an upstream prebuilt-binary release flow if there's a non-JS artifact | Medium |
| Published npm package | Cleanest | ❌ requires `npm link` for upstream-edit flow | Large; an upstream-side project of its own |

The `file:` pattern wins when **iteration speed on upstream matters and the team can absorb the bootstrap step.** The published-package pattern wins when the upstream stabilizes.

## Bumping the pin

Edit the SHA in the single source of truth (CI workflow env var or `framework-pins.json`). Commit + push the consumer-side change. CI re-clones the upstream at the new SHA in its clean checkout and validates. Locally re-run `pnpm setup:upstream` to mirror the new pin if you want to test before pushing — otherwise trust CI.

For the **how** of preparing the new upstream SHA itself (an upstream PR, merge, watch CI green), see [`dev-wip-package-upstream-wt-dev`](../dev-wip-package-upstream-wt-dev/SKILL.md).

## Anti-patterns

- **Don't `git checkout` random branches on `../upstream/`.** That checkout is shared with every consumer using `file:../upstream/...` and with any concurrent Claude session. Use a worktree — see [`dev-wip-package-upstream-wt-dev`](../dev-wip-package-upstream-wt-dev/SKILL.md).
- **Don't run the bootstrap from `postinstall`.** Postinstall already runs on every `pnpm install` — the bootstrap script itself runs `pnpm install`, so wiring it as postinstall loops.
- **Don't commit absolute paths to `package.json`.** `file:../upstream/...` is portable; `file:/home/you/repos/upstream/...` is not.
- **Don't pin the SHA only in `pnpm-lock.yaml`.** `file:` deps point at on-disk paths, not SHAs — the lockfile is stable across pin bumps and won't help reproducibility. The SHA must live in CI env vars (or `framework-pins.json`).
