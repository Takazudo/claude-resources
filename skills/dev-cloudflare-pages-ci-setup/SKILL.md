---
name: dev-cloudflare-pages-ci-setup
description: >
  Set up Cloudflare Pages deployment with GitHub Actions workflows. Use when: (1) User wants to
  deploy a static site to Cloudflare Pages, (2) User says 'cloudflare pages', 'deploy to
  cloudflare', 'cf pages setup', (3) User wants CI/CD workflows for Cloudflare Pages with PR
  previews, (4) Setting up wrangler deployment pipelines.
---

# Cloudflare Pages CI Setup

Set up Cloudflare Pages deployment with GitHub Actions workflows for static sites. Supports production deploys, PR preview deploys, and named preview branches.

## Step 1: Gather Project Info

Identify the project's build setup:

```bash
cat package.json
ls .github/workflows/ 2>/dev/null
cat wrangler.toml 2>/dev/null
```

Determine: **package manager** (pnpm/npm/yarn), **build command**, **output directory** (dist/, build/, out/), **base path** (root `/` or subpath like `/pj/project-name/`).

## Step 2: Ask User Preferences

1. **Cloudflare Pages project name** (used in `--project-name`)
2. **Which workflows**: Main only, Main + PR previews, Main + PR + named previews
3. **Base path**: root `/` or specific subpath
4. **IFTTT notifications**: yes/no

## Step 3: Create Cloudflare Configuration

### wrangler.toml

```toml
# Cloudflare Pages project configuration

compatibility_date = "2024-12-01"
```

### Add wrangler devDependency

```bash
pnpm add -D wrangler  # or npm
```

For pnpm: add `esbuild` and `workerd` to `pnpm.onlyBuiltDependencies` in package.json.

### public/\_redirects (if using a base path)

If the site has a base path (e.g., `/pj/project-name/`), create `public/_redirects`:

```
/ /pj/project-name/ 302
```

Most static site generators (Astro, Next.js, etc.) copy `public/` to output, eliminating CI-time redirect generation.

## Step 4: Create Workflows

### Security Best Practices (apply to all workflows)

- **Explicit `permissions` blocks** (least privilege)
- **Pass `${{ }}` values via `env:` blocks**, never inline in `github-script` JavaScript (prevents script injection)
- **Quote all shell variable expansions**: `"${GITHUB_SHA}"`
- **Pin wrangler version**: `npm install -g wrangler@4` (or `pnpm exec wrangler` when node_modules available)
- **Add `timeout-minutes`** to all jobs (build: 15, deploy: 10, notify: 5)
- **Use `curl -sSf --max-time 10`** for external HTTP calls

### Production Deploy (main-deploy.yml)

Trigger: push to `main`. Concurrency: `production-deploy`, cancel-in-progress: false.

```yaml
permissions:
  contents: read

jobs:
  build:
    # Heavy job — candidate for self-hosted runner via /dev-actions-self-runner
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      # fetch-depth: 0 if project needs git history (e.g., doc history, changelogs)
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: actions/upload-artifact@v4
        with: { name: dist-out, path: dist/, retention-days: 1 }

  deploy:
    needs: build
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/download-artifact@v4
        with: { name: dist-out, path: deploy/ }
      - run: npm install -g wrangler@4
      - run: |
          wrangler pages deploy deploy \
            --project-name=PROJECT_NAME \
            --branch=main \
            --commit-hash="${GITHUB_SHA}" \
            --commit-message="Production deploy: ${GITHUB_SHA}"
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

  notify: # Optional IFTTT notification
    needs: [build, deploy]
    if: always()
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Notify via IFTTT
        if: env.IFTTT_PROD_NOTIFY != ''
        env:
          IFTTT_PROD_NOTIFY: ${{ secrets.IFTTT_PROD_NOTIFY }}
          RAW_COMMIT_MSG: ${{ github.event.head_commit.message }}
          BUILD_RESULT: ${{ needs.build.result }}
          DEPLOY_RESULT: ${{ needs.deploy.result }}
          GITHUB_SHA_VAL: ${{ github.sha }}
          SERVER_URL: ${{ github.server_url }}
          REPO: ${{ github.repository }}
          RUN_ID: ${{ github.run_id }}
        run: |
          if [ "$DEPLOY_RESULT" = "success" ]; then STATUS="succeeded"
          elif [ "$BUILD_RESULT" = "failure" ]; then STATUS="failed (build)"
          elif [ "$DEPLOY_RESULT" = "failure" ]; then STATUS="failed (deploy)"
          else STATUS="cancelled"; fi

          COMMIT_MSG=$(echo "$RAW_COMMIT_MSG" | head -1 | sed 's/"/\\"/g')
          SHORT_SHA=$(echo "$GITHUB_SHA_VAL" | cut -c1-7)
          RUN_URL="${SERVER_URL}/${REPO}/actions/runs/${RUN_ID}"

          curl -sSf --max-time 10 -X POST "$IFTTT_PROD_NOTIFY" \
            -H 'Content-Type: application/json' \
            -d "{
              \"value1\": \"Cloudflare Pages deploy ${STATUS}\",
              \"value2\": \"${SHORT_SHA} ${COMMIT_MSG}\",
              \"value3\": \"${RUN_URL}\"
            }" || echo "::warning::IFTTT notification failed"
```

### PR Preview Deploy (pr-checks.yml)

Trigger: pull_request to `main`. Concurrency: per-PR, cancel-in-progress: true.

```yaml
permissions:
  contents: read
  pull-requests: write
```

Build job identical to production. Preview job:

- Download artifact to `deploy/`
- Deploy with `--branch="pr-${PR_NUMBER}"`
- Preview URL: `https://pr-${PR_NUMBER}.PROJECT_NAME.pages.dev`
- Post/update PR comment using `actions/github-script@v8` with marker `<!-- cf-preview-pr -->`
- **Pass deploy URL via `env:`**: `const deployUrl = process.env.DEPLOY_URL;`

### Named Preview Deploy (preview-deploy.yml)

Trigger: push to `preview` and `expreview/**`. Concurrency: per-branch, cancel-in-progress: true.

```yaml
permissions:
  contents: read
  pull-requests: write
  statuses: write
```

Single-job workflow (build + deploy in one job):

- Convert branch slashes to hyphens for deploy branch name
- Deploy directly from build output (no copy step needed)
- Use `pnpm exec wrangler` (node_modules available in same job)
- Set commit status via `createCommitStatus` API
- Comment on associated PR if one exists, using marker `<!-- cf-preview-branch -->`
- **Use distinct markers** from pr-checks.yml to prevent collision

## Step 5: Required Secrets

| Secret | Required | Purpose |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Yes | Wrangler authentication |
| `CLOUDFLARE_ACCOUNT_ID` | Yes | Cloudflare account identifier |
| `IFTTT_PROD_NOTIFY` | No | IFTTT webhook URL (skipped if not set) |

### Creating Cloudflare API Token

1. Cloudflare dashboard > My Profile > API Tokens > Create Token > Custom token
2. Permissions: Account > Cloudflare Pages > Edit
3. Account Resources: Include the target account

The Cloudflare Pages project is auto-created on first deploy via `wrangler pages deploy`.

## Step 6: Verify

```bash
pnpm build  # Verify build works locally
```

## Companion Skills

- **`/dev-actions-self-runner`** — Add self-hosted runner with fallback for build jobs
- **`/dev-ci-ifttt-notify`** — Add IFTTT webhook notifications
