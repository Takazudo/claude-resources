# Cloudflare setup

An ordered, from-zero walkthrough taking this repo from "never deployed" to
"live on Cloudflare Workers". Do the steps in order — each depends on the last.

The `deploy` job self-skips while `CLOUDFLARE_API_TOKEN` is unset, and the
`build` job needs no credentials, so CI stays green throughout.

## 1. Create (or reuse) the Cloudflare API token

Dashboard → My Profile → API Tokens → Create Custom Token.

| Type | Resource | Level | Needed when |
| --- | --- | --- | --- |
| Account | Workers Scripts | Edit | always |
| Account | Account Settings | Read | always |
| Account | D1 | Edit | the project uses D1 |
| Account | Workers KV Storage | Edit | the project uses KV |
| Account | Workers R2 Storage | Edit | the project uses R2 |
| Zone | Workers Routes | Edit | the project serves a custom domain |

Set **Account Resources → Include → (your account)**, and for the Zone row
**Zone Resources → Include → __DOMAIN__**.

The Zone row matters: without it `wrangler deploy` uploads the Worker and then
fails on the route step, leaving the domain unattached — a confusing
half-success.

One token can be shared across sibling repos; it must then carry the union of
their permissions.

You also need the **account id**: dashboard → Workers & Pages → the id in the
right-hand sidebar.

## 2. Set the two GitHub Actions secrets

Repo secrets under **Settings → Secrets and variables → Actions**:

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | the token from step 1 |
| `CLOUDFLARE_ACCOUNT_ID` | target Cloudflare account id |

```bash
gh secret set CLOUDFLARE_API_TOKEN --repo <owner>/__PROJECT_NAME__
gh secret set CLOUDFLARE_ACCOUNT_ID --repo <owner>/__PROJECT_NAME__
gh secret list --repo <owner>/__PROJECT_NAME__
```

Each command prompts for the value, so nothing lands in shell history.

## 3. Provision the storage resources

Delete the rows this project does not use.

```bash
pnpm exec wrangler d1 create __PROJECT_NAME__
pnpm exec wrangler d1 create __PROJECT_NAME__-preview
pnpm exec wrangler kv namespace create CACHE
pnpm exec wrangler r2 bucket create __PROJECT_NAME__-blobs
```

Paste each returned id into the matching block in `wrangler.toml`, leaving the
binding names alone — the code looks resources up by binding name. Then commit
and push: the deploy job reads `wrangler.toml` from the repo, not from your
working copy.

Give the preview environment its own resources. Bindings are **not** inherited
by a named environment, so `[env.preview]` must re-declare each one; skipping
that is how a PR preview ends up writing to production data.

## 4. Set the Worker secrets

**These live in Cloudflare, attached to the deployed Worker — not in GitHub.**
Step 2's secrets let CI authenticate *to* Cloudflare in order to deploy; these
are what the running Worker reads. Adding one to the wrong place does nothing.

```bash
pnpm exec wrangler secret put SESSION_SECRET
```

Locally the same values come from `.dev.vars` (gitignored). Keep the names
listed in `.dev.vars.example`.

Anything that ships to the browser anyway (a public key, an OAuth client id) is
safe in `[vars]` in `wrangler.toml`; anything else is a secret.

## 5. First deploy

Push to `main`. The workflow builds, applies D1 migrations, runs
`wrangler deploy`, attaches the custom domain from `[[routes]]`, and smoke-tests
the live URL.

Verify:

```bash
curl -I https://__PROJECT_NAME__.__DOMAIN__/
```

Once the domain is confirmed live, `SMOKE_REQUIRE_LIVE: "1"` in `deploy.yml`
turns the smoke test's "not wired up yet" skip into a hard failure — from then
on a host that stops resolving is an outage, not a pending setup.

## 6. Enable PR preview URLs

A version preview URL requires `previews_enabled` on the Worker's subdomain,
which `workers_dev = true` does **not** set. The deploy workflow calls this
automatically, but it needs the preview Worker to exist — so the first PR after
setup may report a pending preview. Error code `10056` means "already
configured".

```bash
curl -X POST \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/__PROJECT_NAME__-preview/subdomain" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled":true,"previews_enabled":true}'
```
