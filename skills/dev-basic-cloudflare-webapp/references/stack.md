# Stack Reference

Every library choice, with rationale and the alternatives that were rejected.

## Contents

- [Frontend](#frontend)
- [Styling](#styling)
- [Backend / Worker](#backend--worker)
- [Data](#data)
- [Auth](#auth)
- [Desktop](#desktop)
- [Do not use](#do-not-use)
- [First-party @takazudo packages](#first-party-takazudo-packages)

## Frontend

| Need | Choice | Notes |
| --- | --- | --- |
| Static / SSR site | **zfb** (`@takazudo/zfb`) | Rust-orchestrated SSG. File-routed `pages/`, MDX content collections, Preact SSR, islands. Ships prebuilt platform binaries — plain `pnpm install`, no Rust toolchain. |
| Docs site | **zudo-doc** (`@takazudo/zudo-doc`) | A zfb preset: sidebar, search, TOC, i18n, doc history, design-token panel. Config is one `zfb.config.ts` calling `zudoDoc({...})`. |
| UI runtime under zfb | **Preact** (+ `preact-render-to-string`) | zfb's `framework: "preact"`. React-compat aliases when a dep insists on `react`. |
| Client-heavy app | **Vite + React 19** | Only when the app is genuinely interactive (editor, dashboard, canvas). Otherwise zfb islands are cheaper. |
| Component workshop | **Storybook** (`@storybook/react-vite`) | Only for a real component library. Skip for a site. |
| Client routing | zfb's own client router; React Router only inside a Vite SPA | |
| Search | **MiniSearch** (in-worker or in-page index) or **Pagefind** (static) | |
| Markdown rendering | zfb's built-in MDX pipeline + `remark-*` plugins | `remark-cjk-friendly` when Japanese content mixes emphasis with CJK. |
| Diagrams | **mermaid** | |
| Math | **KaTeX** | |
| Syntax highlighting | zfb's native build-time highlighter (`hi-*` classes, `--zd-syntax-*` tokens) | Do not add Shiki to a zudo-doc project — it conflicts with the token pipeline. |

### zfb SSR contract

An SSR route must carry the literal export, which zfb detects as an exact AST
shape at build time:

```ts
export const prerender = false;
```

Inside it, `getCloudflareContext<Env>()` returns `{ env, request, ctx }`. It
throws outside a Worker request scope — `zfb dev` has no bindings, so a
binding-backed route should answer a controlled `503` there and be exercised via
`pnpm build && pnpm preview` (which hands off to `wrangler dev`).

Set `adapter: "@takazudo/zfb-adapter-cloudflare"` in `zfb.config.ts`; it emits
`dist/_worker.js` plus a `dist/.assetsignore` that hides the worker source from
the public asset directory.

## Styling

| Need | Choice |
| --- | --- |
| Utility CSS | **Tailwind CSS v4** (`@import "tailwindcss"`, `@theme` blocks) |
| Component-scoped CSS | **CSS Modules** (`*.module.css`) — when the project deliberately avoids utilities |
| Design tokens | CSS custom properties, three-tier (primitive → semantic → component) |
| Token enforcement | `@takazudo/zudo-design-token-lint` + `.design-token-lint.json` |
| Live token tweaking | `@takazudo/zdtp` (design token panel) |

Raw numeric and palette utilities (`p-4`, `bg-gray-500`) are prohibited by the
token lint; use semantic tokens (`p-hgap-sm`, `bg-surface`). Before writing
non-trivial CSS, invoke `/css-wisdom <topic>`.

Under zudo-doc, Tailwind is compiled by zfb's embedded engine — neither
`tailwindcss` nor `@tailwindcss/vite` belongs in that project's dependencies.
Under plain Vite, add `tailwindcss` + `@tailwindcss/vite`.

## Backend / Worker

| Need | Choice | Notes |
| --- | --- | --- |
| HTTP routing in a Worker | **Hono** | The default for anything with more than two routes. |
| Simple handler | plain `export default { fetch }` | Fine for a proxy or single endpoint. |
| Validation | **zod** | |
| Stateful coordination | **Durable Objects**, SQLite-backed (`new_sqlite_classes`) | Rooms, rate limiters, spend caps, per-user sessions. |
| Background / retries | **Workflows** or **Queues** | |
| Scheduled work | Cron triggers in `wrangler.toml` | |
| AI | **Workers AI** binding, or the Anthropic API via `fetch` | For agent-shaped work read `/agents-sdk`. |
| Caching | Workers Cache API + explicit `Cache-Control` + `Cache-Tag` | Local `wrangler dev` does not simulate cache hits — verify on a deployed preview. |

`compatibility_flags = ["nodejs_compat"]` is required whenever the bundle
touches `node:async_hooks` (the zfb CF adapter does) or `node:crypto`
(better-auth does).

## Data

| Need | Choice | Notes |
| --- | --- | --- |
| Relational | **D1** | Numbered SQL files in `migrations/`, applied with `wrangler d1 migrations apply`. Idempotent — wrangler tracks applied files. |
| SQL layer | **drizzle-orm**, or plain prepared statements | |
| Key-value, TTL, counters | **KV** | Eventually consistent — never for read-after-write. |
| Blobs, images, uploads | **R2** | |
| Strongly-consistent small state | **Durable Object** storage | |
| Vectors | **Vectorize** | |
| Local dev state | `.wrangler/` — delete the directory for a clean slate | |

Give every environment its own database/namespace/bucket. Bindings are
**non-inheritable** across named environments, so a `[env.preview]` block must
re-declare each one; forgetting this is how a PR preview ends up writing to
production data.

## Auth

| Need | Choice |
| --- | --- |
| Full auth server | **better-auth** on a Worker, D1-backed, `nodejs_compat` on |
| Token verification in another worker | Service binding to the auth worker, or JWKS verification |
| Password hashing | PBKDF2 via Web Crypto (no native deps) |
| Sessions | Opaque server-side cookie |
| Simple gate | A hand-written Worker checking a `SITE_PASSWORD` secret, `run_worker_first = true` |

A Worker subrequest to its own public hostname does not re-enter the Worker — it
404s. Verify JWKS in-process or reach the peer through a service binding.

## Desktop

**Tauri v2** when a project needs a desktop build (`src-tauri/`). The web build
stays the source of truth; Tauri wraps it.

## Do not use

| Rejected | Instead | Why |
| --- | --- | --- |
| Cloudflare **Pages** | Workers Static Assets (`[assets]` in `wrangler.toml`) | All repos migrated off Pages. Pages advanced mode is legacy; Workers gives named environments, version previews, and one config file. |
| Next.js / Remix / Astro | zfb, or Vite + React | |
| AWS (Lambda, S3, RDS, DynamoDB) | Workers, R2, D1 | Cloudflare is the infra decision. |
| Vercel / Netlify / Supabase / PlanetScale | Cloudflare equivalents | |
| Prisma | drizzle-orm or raw SQL | Prisma's engine does not fit the Workers runtime cleanly. |
| Jest | vitest | |
| npm / yarn | pnpm | |
| styled-components / emotion | Tailwind v4 or CSS Modules | Runtime CSS-in-JS costs SSR time for nothing here. |
| Shiki (in zudo-doc projects) | zfb's native highlighter | |
| Raw Tailwind numeric/palette utilities | semantic design tokens | Enforced by design-token-lint. |
| `~` in any path written to a file | `$HOME` or the `{logdir}` placeholder | `~` is not expanded by Node or non-login shells. |

## First-party @takazudo packages

Prefer these before reaching for a third-party equivalent. Bump them with
`/dev-bump-zudo-deps`; report bugs upstream with `/dev-upstream-report`.

| Package | Purpose |
| --- | --- |
| `@takazudo/zfb`, `@takazudo/zfb-runtime` | Static site builder + runtime |
| `@takazudo/zfb-adapter-cloudflare` | Emits `dist/_worker.js` for Workers |
| `@takazudo/zfb-md-wasm` | Browser-time markdown/highlight WASM |
| `@takazudo/zudo-doc` | Documentation site preset |
| `@takazudo/zdtp` | Design token panel |
| `@takazudo/zudo-design-token-lint` | Tailwind token linter |
| `@takazudo/mdx-formatter` | Markdown/MDX formatter |

Working examples of every Cloudflare shape (KV guestbook, D1 webshop, JSON API,
Workers AI, workers cache, reverse proxy, password gate) live in the
`zfb-example-*` repos under `$HOME/repos/zfb-ex/` — read one with
`/refer-another-project` when a concrete recipe would help.
