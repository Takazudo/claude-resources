# Testing Reference

For choosing an approach in a specific situation, also use `/test-wisdom`.

## Levels

| Level | Tool | Covers |
| --- | --- | --- |
| L1 unit | vitest | Pure logic, parsers, formatters, helpers |
| L2 component | vitest + `@testing-library/preact` (or `/react`) | Rendered component behaviour |
| L3 worker | `@cloudflare/vitest-pool-workers` | Handlers running in real workerd with real bindings |
| L4 E2E | Playwright | Full pages in a browser against a built site |
| L5 smoke | `node scripts/smoke.mjs` | The deployed URL actually serves |
| L6 visual | Playwright screenshots | Only where a visual regression would otherwise go unnoticed |

Unit tests cannot prove visual correctness. For UI/CSS/layout work verify with
`/verify-ui` (computed styles) or `/headless-browser` (screenshots).

## Tiers

| Tier | Where | Contents |
| --- | --- | --- |
| T0 | `pnpm b4push` | build, typecheck, lint, unit, worker tests — fast enough to run before every push |
| T1 | `ci.yml` / `pr-checks.yml` | everything in T0 plus Playwright E2E |
| T3 | nightly / `exam.yml` | heavy, slow, or flaky-prone suites; browser-compat matrices |

E2E stays out of b4push on purpose. Anything that needs a paid API, a real
device, or several minutes belongs in T3.

## Worker tests

```ts
// vitest.worker.config.ts
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.toml" } })],
  test: { include: ["worker-tests/**/*.test.ts"] },
});
```

Run as a separate script (`test:worker`) — the pool boots workerd, so mixing it
into the default unit run slows every test down. `miniflare` directly is the
lower-level fallback when the pool does not fit.

## Unit test config notes

**Preact-in-compat-mode aliases.** A project running Preact behind the React API
needs resolve aliases in `vitest.config.ts`, most-specific key first, or a
transitively-loaded island runtime fails with "Cannot find package 'react'":

```ts
resolve: {
  alias: {
    "react/jsx-runtime": "preact/jsx-runtime",
    "react-dom/test-utils": "preact/test-utils",
    "react-dom": "preact/compat",
    react: "preact/compat",
  },
},
test: {
  // Externalized node_modules deps bypass the aliases above — inline the ones
  // that import "react/jsx-runtime" so vite transforms them.
  server: { deps: { inline: [/@takazudo\/zfb/] } },
},
```

**Projects for differing timeouts.** Split subprocess-heavy suites from pure
unit tests rather than loosening the global timeout. Vitest project configs do
**not** inherit the root config — `extends: true` on each project is required or
the aliases above silently stop applying.

## Playwright

- `playwright.config.ts` at the repo root; specs in `e2e/` or `tests/`.
- Cache browsers in CI keyed on `pnpm-lock.yaml`; install with
  `playwright install --with-deps chromium`.
- Chromium is the CI baseline. WebKit/Firefox runs are macOS-local or nightly.
- Prefer web-first assertions and role/testid locators over sleeps. A fixed
  `waitForTimeout` is a defect, not a fix.
- Visual regression baselines are OS-keyed — generate them on the same runner
  image CI uses, review the PNG diff in the PR, then commit.
- Quarantine flakes behind a `@flaky` tag that requires a linked tracking issue,
  so quarantine cannot become a graveyard.
