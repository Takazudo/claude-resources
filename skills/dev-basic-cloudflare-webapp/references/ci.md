# CI Reference

GitHub Actions conventions. Before writing or editing any workflow, also read
`/gh-actions-wisdom`.

## Contents

- [The standard workflow set](#the-standard-workflow-set)
- [Rules every workflow follows](#rules-every-workflow-follows)
- [Self-skipping deploy jobs](#self-skipping-deploy-jobs)
- [PR preview + sticky comment](#pr-preview--sticky-comment)
- [Post-deploy smoke test](#post-deploy-smoke-test)
- [actionlint](#actionlint)
- [Security audit](#security-audit)
- [Dependency updates](#dependency-updates)
- [Release (npm packages)](#release-npm-packages)

## The standard workflow set

Names are consistent across repos so a person landing in a new one knows where
to look.

| File | Trigger | Job |
| --- | --- | --- |
| `ci.yml` | PR + push to main | install → build → test → typecheck → lint |
| `deploy.yml` | push to main + PR | build (always), deploy (main), preview (PR) |
| `actionlint.yml` | PR/push touching `.github/workflows/**` | lint workflows |
| `security.yml` | PR + push + weekly cron | `pnpm audit` with an advisory allowlist |
| `release.yml` | `v*` tag | npm publish (only if the repo publishes) |

Larger repos split `deploy.yml` into `main-deploy.yml` (production),
`pr-checks.yml` (PR preview), and `preview-deploy.yml` (named preview branches
like `preview`, `expreview/**`). Start with the merged `deploy.yml` and split
when the jobs diverge.

Two starting templates ship with this skill:
`assets/templates/.github/workflows/ci.yml` and `deploy.yml`.

## Rules every workflow follows

- **SHA-pin every action**, with the version as a trailing comment:
  `uses: actions/checkout@93cb6efe... # v5.0.1`. Renovate's
  `helpers:pinGitHubActionDigests` keeps them current.
- **`permissions:` declared explicitly**, `contents: read` by default; add
  `pull-requests: write` only on the job that comments, `id-token: write` only
  on the job that publishes with provenance.
- **`concurrency:` on every workflow.** `cancel-in-progress: true` for PR-ish
  work; `false` for production deploys and releases so a deploy is never killed
  mid-flight. A common shape:
  `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`.
- **`timeout-minutes:` on every job.** 15 for build/test, 30–40 when Playwright
  or a big install is involved.
- **`pnpm install --frozen-lockfile`**, always.
- **Branch filters include `base/**`** so `/x-wt-teams` epic integration
  branches get the same gates as main.
- **Path filters** on workflows that only care about a subtree (actionlint,
  docs) so they stay off the critical path.
- Pass values into `run:` blocks through `env:`, not `${{ }}` interpolation
  inside the script — actionlint and shellcheck both flag the latter.

```yaml
- uses: pnpm/action-setup@fc06bc12... # v5.0.0
- uses: actions/setup-node@a0853c24... # v5.0.0
  with:
    node-version: 22
    cache: pnpm
- run: pnpm install --frozen-lockfile
```

`setup-node` defaults `package-manager-cache: true` and auto-detects pnpm. A job
that deliberately skips `pnpm/action-setup` must set
`package-manager-cache: false` or it fails with "Unable to locate executable
file: pnpm".

Cache Playwright browsers keyed on the lockfile:

```yaml
- uses: actions/cache@0057852b... # v4.3.0
  with:
    path: ~/.cache/ms-playwright
    key: playwright-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
```

## Self-skipping deploy jobs

A fresh repo, or a fork PR, has no Cloudflare secrets. The deploy job must
notice and skip with a `::notice::` rather than going red — the build job is the
real correctness gate and needs no credentials.

```yaml
- name: Preflight — is Cloudflare configured?
  id: preflight
  env:
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
  run: |
    if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
      echo "::notice::CLOUDFLARE_API_TOKEN is not set — skipping deploy."
      echo "ready=false" >> "$GITHUB_OUTPUT"
    else
      echo "ready=true" >> "$GITHUB_OUTPUT"
    fi
```

A repository **variable** gate (`if: vars.CF_WORKERS_DEPLOY == 'true'`) is the
alternative when go-live should be a deliberate switch rather than a
consequence of the secret existing. Either way, keep
`wrangler deploy --dry-run` running unconditionally — it validates the config
with no credentials, so a broken `wrangler.toml` still fails the PR.

Fork PRs never receive secrets. Skip the preview job outright for them rather
than letting it run and self-skip.

## PR preview + sticky comment

Upload a per-PR aliased version, parse the alias URL from the output, then
upsert a single marked comment.

```bash
pnpm exec wrangler versions upload --env preview \
  --preview-alias "pr-${PR_NUMBER}" \
  --message "PR #${PR_NUMBER} @ ${GITHUB_SHA:0:7}" 2>&1 | tee "$LOG"
# `|| true` — grep exits 1 with no match, which would fail the step under pipefail
URL=$(grep -oE "https://pr-${PR_NUMBER}-[a-z0-9.-]+\.workers\.dev" "$LOG" | head -1 || true)
```

Match the **alias-prefixed** host, not the per-version hash URL, so the comment
points at the predictable address.

The comment step uses `actions/github-script`, finds an existing comment by an
HTML-comment marker (`<!-- cf-preview-pr -->`), and updates it instead of
posting a new one each push. Pass `github-token:` explicitly — implicit
detection can 401 on SHA-pinned runs.

## Post-deploy smoke test

`wrangler deploy --dry-run` validates config and unit tests never touch the
edge; only an over-the-wire request proves the custom domain is attached and
serving. Run `node scripts/smoke.mjs` against the production URL after a
main-branch deploy, and let it fail the job — a reachable-but-broken site must
go red.

While the domain is not yet wired up, the script exits 0 with a `::notice::`.
Once it is confirmed live, set `SMOKE_REQUIRE_LIVE: "1"` so a host that stops
resolving becomes a failure instead of a quiet skip.

## actionlint

Path-filtered to `.github/workflows/**`. Download a pinned release and verify
its checksum before running — bump version and checksum together from the
release's `actionlint_<ver>_checksums.txt`. GitHub-hosted ubuntu runners ship
shellcheck, so actionlint lints `run:` blocks through it for free.

Custom runner labels (e.g. Blacksmith runners) go in `.github/actionlint.yaml`
under `self-hosted-runner.labels`, or actionlint flags them as unknown.

## Security audit

`pnpm audit --prod` on PR, push, and a weekly cron. Critical vulnerabilities
always fail. High-severity ones fail **unless** listed in an in-workflow
allowlist — by GHSA id (preferred, precise) or by module name (when several
advisories for one module are all accepted). Each entry carries a comment
naming the mitigation and tracking issue. An unrecognized high advisory fails,
so nothing new is ever silently swallowed.

When the fix is not reachable by bumping a direct dependency, add a scoped
`overrides` entry in `pnpm-workspace.yaml` — see tooling.md.

## Dependency updates

**Renovate** is preferred (`renovate.json5`, extends `config:recommended` +
`helpers:pinGitHubActionDigests`). Add `customManagers` for versions embedded in
workflow strings (`npx wrangler@x.y.z`, container image tags), and group
packages that must move together (`@playwright/test` with the Playwright
container image).

**Dependabot** (`.github/dependabot.yml`) is the fallback. Monthly npm +
github-actions, grouped dev/minor updates, and an `ignore` list for majors that
need manual migration (eslint, typescript, vite/vitest pairs).

## Release (npm packages)

Only for repos that publish. Triggered on a `v*` tag push.

- `NPM_TOKEN` must be an **Automation**-type token — a standard user token fails
  unattended scoped publish because npm requires 2FA.
- `permissions: id-token: write` plus `--provenance` attaches a signed
  attestation linking the tarball to the run.
- dist-tag policy: a tag matching `-next.` / `-beta.` / `-rc.` publishes to
  `next`; everything else to `latest`.
- Guard against a `workflow_dispatch` on a branch publishing by accident —
  require a `refs/tags/v` ref unless `dry_run` is set.
- Keep the test gate in `ci.yml`, not in the release job; `prepublishOnly` only
  rebuilds `dist/`.
- Keep registry dist-tag maintenance in a separate manual workflow so a hiccup
  there never marks a successful release as failed.

For the full versioning and dist-tag strategy, use `/dev-npm-package`.
