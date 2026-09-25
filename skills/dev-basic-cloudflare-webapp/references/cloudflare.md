# Cloudflare Configuration Reference

House patterns for `wrangler.toml` and Cloudflare resources. For current
wrangler flags and binding APIs, use `/cloudflare:wrangler` and `/cloudflare:cloudflare` — they
retrieve live docs. This file is the opinion layer.

## Contents

- [Deploy model: Workers Static Assets](#deploy-model-workers-static-assets)
- [wrangler.toml anatomy](#wranglertoml-anatomy)
- [TOML ordering traps](#toml-ordering-traps)
- [Named environments](#named-environments)
- [Preview URLs](#preview-urls)
- [Bindings](#bindings)
- [Secrets vs vars](#secrets-vs-vars)
- [One-time provisioning](#one-time-provisioning)
- [Local dev](#local-dev)

## Deploy model: Workers Static Assets

Not Pages. One `wrangler.toml`, one `wrangler deploy`. The `[assets]` block
serves the static build; `main` is the SSR Worker (the zfb CF adapter emits it
at `dist/_worker.js`).

`run_worker_first`:

- `false` — assets are consulted first, the Worker only runs on a miss. Default
  for a mostly-static site with a few SSR routes.
- `true` — the Worker runs first for everything. Required for a password gate or
  anything that must authorize before a public file can leak.
- an array of globs — Worker-first for those paths only.

`not_found_handling = "404-page"` serves `dist/404.html` for unmatched GETs. It
only applies to GET/HEAD, so a `POST /api/...` still reaches the Worker. A
deliberate API 404 should answer `application/json` so it is not mistaken for
the styled page.

The adapter writes `dist/.assetsignore` listing `_worker.js` and
`_zfb_inner.mjs` so the Worker source is never downloadable. It is generated,
not committed.

## wrangler.toml anatomy

```toml
name = "__PROJECT_NAME__"
main = "./dist/_worker.js"

compatibility_date = "2026-05-01"
# Required whenever the bundle imports node:async_hooks (zfb CF adapter uses
# AsyncLocalStorage to thread `env` into SSR routes) or node:crypto.
compatibility_flags = ["nodejs_compat"]

# These MUST stay above [assets] — see "TOML ordering traps".
workers_dev = true
preview_urls = true

[observability]
enabled = true

[assets]
directory = "./dist"
binding = "ASSETS"
not_found_handling = "404-page"
run_worker_first = false

[[routes]]
pattern = "__PROJECT_NAME__.__DOMAIN__"
custom_domain = true
```

`custom_domain = true` makes wrangler provision the DNS record and TLS cert on
`wrangler deploy`. Preconditions: the zone is on the same account as
`CLOUDFLARE_ACCOUNT_ID`, the hostname has no pre-existing CNAME, and the API
token carries **Zone · Workers Routes · Edit**. Without that permission the
Worker uploads fine and then the route step fails — a confusing half-success.

## TOML ordering traps

The single most expensive class of mistake here.

- **Any key written after a table header belongs to that table.** So
  `workers_dev` / `preview_urls` placed below `[assets]` are parsed as
  `[assets]` fields; wrangler warns "Unexpected fields found in assets field"
  and silently ignores them. Keep all top-level scalars above the first table.
- **Top-level `[[routes]]` must appear before `[env.*]`**, for the same reason.
- **`[[migrations]]` is append-only.** Never edit a shipped `tag`; add a new
  one. Renaming a Durable Object class is a storage migration.

## Named environments

A named environment deploys as a **separate Worker**
(`__PROJECT_NAME__-preview`), so a PR never touches production or its data.

Inheritable from top level: `main`, `assets`, `compatibility_*`,
`workers_dev`, `preview_urls`, **`routes`**, `vars`… but **not** bindings.

Two consequences worth internalizing:

```toml
[env.preview]
# routes IS inherited — left implicit, the preview Worker would try to claim
# the production custom domain. An explicit empty list overrides it.
routes = []

# Bindings are NOT inherited — every D1/KV/R2/DO block must be repeated here,
# pointing at the environment's own resource.
[[env.preview.d1_databases]]
binding = "DB"
database_name = "__PROJECT_NAME__-preview"
database_id = "<from wrangler d1 create>"
```

`vars` is inherited as a whole block, not merged per key — a named environment
that declares any `[env.x.vars]` replaces the top-level set entirely.

Target production explicitly with `wrangler deploy --env=""` once a named
environment exists; a bare `wrangler deploy` warns about an unspecified
environment.

## Preview URLs

`workers_dev` (is the Worker served on `*.workers.dev`) and `preview_urls` (are
per-version preview URLs generated) are **separate toggles**, and
`preview_urls` defaults to *match* `workers_dev`. Set both explicitly, or the
day someone flips `workers_dev = false` every PR preview URL silently
disappears.

For per-PR previews use `wrangler versions upload --preview-alias pr-<N>`, not
`wrangler deploy --env preview`. A version upload is not promoted to live
traffic and gets its own stable
`pr-<N>-<worker>.<subdomain>.workers.dev` host, so concurrent PRs stop
clobbering each other. Add `--env preview` so the version still inherits the
preview bindings.

Alias constraints: lowercase `[a-z0-9-]` only, and the alias becomes the first
DNS label together with the worker name — a label maxes at 63 chars, so clamp
long branch slugs and append a short hash to keep them distinct.

The alias URL is only emitted when the Worker's subdomain has
`previews_enabled: true`. That is not what `workers_dev = true` sets. Enable it
once per Worker:

```bash
curl -X POST "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT/workers/scripts/<worker>/subdomain" \
  -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
  -d '{"enabled":true,"previews_enabled":true}'
```

Error code `10056` means "already configured" — treat it as success.

Cloudflare does **not** generate preview URLs for a version that implements a
Durable Object. A project with a DO needs a separate adapter-only preview
service, or previews without the DO.

## Bindings

```toml
[[d1_databases]]
binding = "DB"                 # becomes env.DB
database_name = "__PROJECT_NAME__"
database_id = "<wrangler d1 create __PROJECT_NAME__>"

[[kv_namespaces]]
binding = "CACHE"
id = "<wrangler kv namespace create CACHE>"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "__PROJECT_NAME__-blobs"

[[durable_objects.bindings]]
name = "ROOM"
class_name = "Room"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["Room"]

[ai]
binding = "AI"

[[services]]
binding = "AUTH_SERVER"
service = "other-worker-name"

[[queues.producers]]
binding = "JOBS"
queue = "__PROJECT_NAME__-jobs"
```

Use one binding per capability even when two point at the same target — two
bindings stay separately revocable.

The binding name is a contract with the code (`env.DB`). Changing it is a code
change, so pick it once.

## Secrets vs vars

The most confusable part of a first setup — there are **three** different
places credentials live:

| Where | What | Set with |
| --- | --- | --- |
| GitHub Actions secrets | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` — let CI authenticate *to* Cloudflare in order to deploy | `gh secret set NAME` |
| Cloudflare Worker secrets | runtime secrets the deployed Worker reads (`API_KEY`, `JWT_SECRET`, `SITE_PASSWORD`) | `wrangler secret put NAME` |
| `[vars]` in wrangler.toml | non-secret config, committed and public | edit the file |

Adding a Worker secret to GitHub secrets does nothing, and vice versa. Anything
that ships to the browser anyway (a public VAPID key, an OAuth client id) is
safe in `[vars]`; anything else is a Worker secret.

Locally, Worker secrets come from `.dev.vars` (gitignored). Commit a
`.env.example` / `.dev.vars.example` listing the names with placeholder values.

## One-time provisioning

Record these in `docs/cloudflare-setup.md` as an ordered walkthrough. They are
manual and easy to forget.

1. **API token** — Cloudflare dashboard → My Profile → API Tokens → Create
   Custom Token. Minimum permissions, plus one row per resource the project
   uses:

   | Type | Resource | Level |
   | --- | --- | --- |
   | Account | Workers Scripts | Edit |
   | Account | Account Settings | Read |
   | Account | Workers KV Storage | Edit (if KV) |
   | Account | D1 | Edit (if D1) |
   | Account | Workers R2 Storage | Edit (if R2) |
   | Zone | Workers Routes | Edit (if custom domain) |

   Scope Account Resources to the account, and Zone Resources to the zone. One
   shared token across sibling repos is fine — it must carry the union of their
   permissions.

2. **GitHub secrets** — `gh secret set CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID` (each prompts, so nothing lands in shell history).

3. **Resources** — `wrangler d1 create`, `wrangler kv namespace create`,
   `wrangler r2 bucket create`. Paste the returned id into `wrangler.toml` and
   commit; the deploy job reads the committed file, not your working copy.
   Running the create command from a one-shot `workflow_dispatch` bootstrap
   workflow is often easier than locally — CI already holds the credentials.

4. **Worker secrets** — `wrangler secret put NAME` for each.

5. **Custom domain** — attached by `wrangler deploy` from `[[routes]]`, given
   the Zone permission above.

## Local dev

| Command | What it exercises |
| --- | --- |
| `pnpm dev` (`zfb dev`) | Pages and components. **No Cloudflare bindings.** |
| `pnpm build && pnpm preview` | Real Worker runtime via `wrangler dev`, local binding simulation |
| `wrangler dev --remote` | Real remote bindings |

A binding-backed route should return a controlled `503` when
`getCloudflareContext()` throws, rather than crashing, so `zfb dev` stays
usable for UI work.

Local state lives in `.wrangler/` — delete it for a fresh local namespace.
Apply migrations locally with
`wrangler d1 migrations apply <db> --local`.

Workers Cache is **not** simulated by local `wrangler dev`: repeated requests
re-render and `Cf-Cache-Status` is absent. Verify caching on a deployed preview.
