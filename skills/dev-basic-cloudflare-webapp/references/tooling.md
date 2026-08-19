# Tooling Reference

Package manager, workspace, lint, format, hooks, typecheck.

## Contents

- [pnpm](#pnpm)
- [Workspace layout](#workspace-layout)
- [package.json conventions](#packagejson-conventions)
- [TypeScript](#typescript)
- [Prettier](#prettier)
- [mdx-formatter](#mdx-formatter)
- [ESLint](#eslint)
- [design-token-lint](#design-token-lint)
- [lefthook and git hooks](#lefthook-and-git-hooks)
- [b4push](#b4push)

## pnpm

pnpm only, pinned in `packageManager`, with `engines.node` set (`>=22` for new
projects). Never npm or yarn.

**pnpm 11 reads only auth and registry settings from `.npmrc`.** Everything else
moved to `pnpm-workspace.yaml`. A `.npmrc` in a pnpm 11 repo should be nearly
empty; a pnpm 10 repo still uses it for `auto-install-peers` and friends.

```yaml
# pnpm-workspace.yaml
packages:
  - "packages/*"
  - "doc"

autoInstallPeers: true
engineStrict: true
strictPeerDependencies: false
preferFrozenLockfile: true

# CI must be deterministic; pnpm 11 defaults minimumReleaseAge to 1440 (24h),
# which would block `--frozen-lockfile` on anything published in the last day.
minimumReleaseAge: 0

# Non-interactive shells (agents, CI-like local runs) abort the post-version-bump
# node_modules relink with ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY.
confirmModulesPurge: false

# pnpm 11 replaces onlyBuiltDependencies with a per-package allow/deny map.
# Each entry is a deliberate decision about running that package's install script.
allowBuilds:
  esbuild: true    # ships a Go binary
  lefthook: true   # ships a native binary
  sharp: true      # builds libvips bindings
  workerd: true    # ships a native binary
```

`linkWorkspacePackages: false` when in-repo consumers (a docs site, examples)
must build against the **published** artifact rather than the local source. Set
it explicitly so a future pnpm default flip cannot silently re-link.

### Security overrides

When `pnpm audit` flags a transitive dependency with no in-range fix, add a
scoped override:

```yaml
overrides:
  "ws@<8.21.0": ">=8.21.0"
  # Caret, not >=, when the parent's contract is a single major line —
  # an open-ended >= can resolve two majors past what the consumer supports.
  js-yaml: "^3.15.1"
```

Comment each one with the advisory, the path that pulls it in, and the
condition under which it can be deleted.

### Useful escape hatches

`public-hoist-pattern[]=<pkg>` in `.npmrc` when a dependency resolves by
filesystem traversal instead of Node resolution and so cannot see
`node_modules/.pnpm/`. The zfb Cloudflare adapter needs this for `miniflare`.

## Workspace layout

A single-purpose repo needs no workspace. Add one when the repo holds more than
one deploy unit or publishable package.

```
packages/*          first-party libraries
workers/*           one directory per deployable Worker (own wrangler config)
doc/ or docs/       the documentation site (zfb + zudo-doc)
examples/*          runnable examples that install published packages
scripts/            repo automation (.mjs / .sh)
```

## package.json conventions

Scripts are grouped with comment keys, which pnpm tolerates and which make a
long script list readable:

```json
{
  "scripts": {
    "// ── Core ─────────────────────────": "",
    "dev": "zfb dev",
    "build": "zfb build",
    "preview": "zfb preview",

    "// ── Quality ──────────────────────": "",
    "typecheck": "zfb check",
    "lint": "eslint .",
    "test": "vitest run",
    "b4push": "bash scripts/run-b4push.sh",

    "// ── Lifecycle ────────────────────": "",
    "prepare": "lefthook install",
    "init-worktree": "bash scripts/install-git-hooks.sh"
  }
}
```

In a workspace root, delegate with `pnpm -r --if-present <script>` so adding a
package needs no root change.

Beware pnpm's automatic `pre<script>` hook: a script literally named
`prefoo` runs before `foo`. Name scripts so this is intentional.

## TypeScript

`strict: true` everywhere. A reasonable baseline for a zfb/Preact project:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "resolveJsonModule": true,
    "types": ["node", "@cloudflare/workers-types"],
    "noEmit": true,
    "skipLibCheck": true,
    "baseUrl": "."
  },
  "include": ["pages/**/*", "components/**/*", "lib/**/*", "zfb.config.ts"],
  "exclude": ["node_modules", "dist"]
}
```

Worker code gets its own `tsconfig.worker.json` extending the base, with
`types: ["@cloudflare/workers-types", "@cloudflare/vitest-pool-workers/types"]`
and an `include` limited to the worker entry, `worker-configuration.d.ts`, and
the worker tests. Generate `worker-configuration.d.ts` with
`wrangler types`.

When extending a `tsconfig.base.json` that lives inside `node_modules`,
re-declare `baseUrl: "."` in the project file — the base's own `baseUrl`
resolves relative to the base file's directory.

## Prettier

```json
{ "semi": true, "singleQuote": false, "trailingComma": "all", "printWidth": 100 }
```

`printWidth: 100` and `trailingComma: "all"` are the constants across repos;
quote style varies per repo — pick one at project start and leave it. Add a
`.prettierignore` for `dist/`, `node_modules/`, `worktrees/`, `.wrangler/`.

## mdx-formatter

`@takazudo/mdx-formatter` owns `.md` and `.mdx`, not Prettier. Wire it into
lefthook pre-commit so markdown is formatted on commit and never needs a manual
pass.

```json
// .mdx-formatter.json
{
  "exclude": ["node_modules/**", "dist/**", "worktrees/**", "__inbox/**", ".playwright-cli/**"],
  "addEmptyLinesInBlockJsx": {
    "blockComponents": ["Note", "Tip", "Warning", "Details", "Tabs"]
  }
}
```

## ESLint

Flat config in `eslint.config.js`. Keep it small — start from
`typescript-eslint`'s recommended set and add only rules that have caught a real
bug.

```js
import tseslint from "typescript-eslint";

export default [
  { ignores: ["node_modules/", "dist/", "worktrees/", ".wrangler/"] },
  ...tseslint.configs.recommended.map((c) => ({ ...c, files: ["**/*.ts", "**/*.tsx"] })),
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "prefer-const": "error",
      "no-var": "error",
      "prefer-template": "error",
    },
  },
  { files: ["scripts/**", "**/*.test.ts"], rules: { "no-console": "off" } },
];
```

`no-console` off in scripts and tests; warn elsewhere. React/Preact projects add
`eslint-plugin-react` + `eslint-plugin-react-hooks` with
`react/react-in-jsx-scope: "off"` and `react/prop-types: "off"`.

## design-token-lint

`@takazudo/zudo-design-token-lint` with `.design-token-lint.json` at the repo
root. It prohibits raw Tailwind numeric spacing (`p-{n}`, `gap-{n}`, `z-{n}`,
`top-{n}`) and palette utilities (`bg-{color}-{shade}`, `text-{color}-{shade}`,
`border-{color}-{shade}`, …), allowing only the zero/px escapes (`p-0`, `m-0`,
`gap-0`, `p-px`). Point `patterns` at the JSX that should be governed and
`ignore` at content, templates, tests, and build output. Exits non-zero on a
violation, so wire it into `b4push` and CI.

## lefthook and git hooks

`lefthook.yml` for pre-commit. Install it from `prepare` so `pnpm install`
sets it up.

```yaml
pre-commit:
  parallel: true
  commands:
    format-mdx:
      glob: "*.{md,mdx}"
      run: pnpm dlx @takazudo/mdx-formatter --write {staged_files} && git add -f {staged_files}
```

Hooks that must survive `lefthook install --reset-hooks-path` — notably the
worktree push guard — are installed directly to `.git/hooks/` by
`scripts/install-git-hooks.sh`, run from both `prepare` and `init-worktree`.

## b4push

`pnpm b4push` runs the same steps as `ci.yml`, locally, before pushing. Its
whole value is that it mirrors CI — a step in one and not the other defeats it,
so change both together. Large repos add a `check:b4push-ci-parity` script that
fails when they drift.

The script pattern (`assets/templates/scripts/run-b4push.sh`): collect failures
instead of exiting on the first one, print a `Step N/M` banner per step, and end
with a summary listing everything that failed and the elapsed time. Seeing all
five failures at once beats fixing them one round-trip at a time.

Playwright E2E is deliberately excluded from b4push for time budget — it runs in
CI. Generate or refresh the script with `/dev-create-b4push-script`.
