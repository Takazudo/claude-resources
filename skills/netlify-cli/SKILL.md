---
name: netlify-cli
description: >-
  Use this skill when writing or debugging GitHub Actions workflows that deploy to Netlify using
  `netlify-cli`, or when running `netlify dev` / `netlify functions:serve` locally. This skill
  contains critical knowledge about common pitfalls and solutions for: (1) Monorepo 'Projects
  detected' errors, (2) pnpm workspace deployments, (3) Deploying pre-built directories, (4)
  Capturing deployment URLs, (5) Setting up GitHub secrets for Netlify, (6) netlify.toml inheritance
  issues with branch deploys, (7) Isolating sub-site deploys from main site config, (8) Local
  development with `netlify dev` including monorepo --filter flag, pnpm 10.x trust store errors, CLI
  crash workarounds, and running functions separately. Keywords: netlify deploy, github actions
  netlify, netlify-cli, monorepo deploy, pnpm workspace netlify, netlify dev, netlify functions
  serve, local development.
---

# Netlify CLI for GitHub Actions

Use this skill when writing or debugging GitHub Actions workflows that deploy to Netlify using `netlify-cli`. This skill contains critical knowledge about common pitfalls and solutions.

## Key Flags Reference

```bash
netlify deploy \
  --dir=<path>           # Directory to deploy (required)
  --site=<site-id>       # Netlify site ID
  --auth=<token>         # Auth token (or use NETLIFY_AUTH_TOKEN env var)
  --prod                 # Deploy to production (default: draft)
  --build                # Opt-in to running build before deploy (deploy does NOT build by default)
  --filter=<package>     # Select package in monorepo - CRITICAL for pnpm workspaces
  --functions=<folder>   # Override functions directory (useful to skip functions with empty dir)
  --alias=<name>         # Custom subdomain for draft deploys
  --message=<msg>        # Deployment message
  --json                 # Output as JSON (for programmatic URL extraction)
```

**IMPORTANT**: There is NO `--no-build` flag in netlify-cli@19+. `netlify deploy` does NOT build by default. Use `--build` only if you want to opt-in to building.

## Critical: Monorepo "Projects Detected" Error

When deploying from a **pnpm workspace** or **monorepo**, you will encounter:

```
Error: Projects detected: package-a, package-b. Configure the project you want to work with and try again.
```

### Solution

Use the `--filter` flag to select the target package:

```bash
netlify deploy \
  --dir=./doc/build \
  --site=$NETLIFY_SITE_ID \
  --auth=$NETLIFY_AUTH_TOKEN \
  --filter=<package-name> \
  --prod
```

- `--filter=<package-name>`: Selects the package (use the `name` from package.json)
- `netlify deploy` does NOT build by default, so no extra flag is needed to skip building

## Critical: netlify.toml Inheritance Problem

**The CLI always reads `netlify.toml` from the project root**, regardless of the `--dir` flag. This means:

- **Redirects** defined in the root `netlify.toml` apply to ALL deploys (including branch/alias deploys)
- **Functions** from the root config are bundled into every deploy
- **Circular proxy**: If root `netlify.toml` has a redirect like `/doc/* -> https://doc--mysite.netlify.app/doc/:splat` with `force = true`, the branch deploy will proxy to itself, causing 404s

### Solution: Deploy from an Isolated Directory

To prevent the root `netlify.toml` from affecting a sub-site deploy, deploy from a separate directory with its own minimal `netlify.toml`:

```yaml
- name: Prepare deploy directory
  run: |
    mkdir -p deploy-output/doc
    cp -r doc/build/* deploy-output/doc/
    mkdir -p deploy-output/.empty-functions
    cat > deploy-output/netlify.toml << 'TOML'
    [build]
      publish = "."
    TOML

- name: Deploy to Netlify
  working-directory: deploy-output
  env:
    NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
    NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
  run: |
    netlify deploy \
      --dir=. \
      --functions=.empty-functions \
      --site=$NETLIFY_SITE_ID \
      --auth=$NETLIFY_AUTH_TOKEN \
      --alias=doc \
      --message="Deploy: ${{ github.sha }}"
```

Key points:
- `working-directory: deploy-output` makes the CLI find the local `netlify.toml` instead of the root one
- `--functions=.empty-functions` overrides the root's functions directory to avoid bundling errors
- The local `netlify.toml` has no redirects, so no circular proxy issues
- `--filter` is not needed when deploying from an isolated directory (no monorepo detection)

## Critical: basePath / baseUrl Wrapping for Proxied Deploys

When a sub-site is proxied from the main site under a path prefix (e.g., `mysite.com/doc/` -> `doc--mysite.netlify.app/doc/`), the build output must be nested in a matching subdirectory.

**Problem**: `netlify deploy --dir=doc/build` deploys files at root `/`. But if the framework (e.g., Docusaurus with `baseUrl: '/doc/'`) generates asset references like `/doc/assets/main.js`, they will 404 because the actual file is at `/assets/main.js`.

**Solution**: Wrap the build output in the correct subdirectory before deploying:

```yaml
- name: Prepare deploy directory
  run: |
    mkdir -p deploy-output/doc
    cp -r doc/build/* deploy-output/doc/

- name: Deploy
  run: netlify deploy --dir=deploy-output ...
```

Now `doc--mysite.netlify.app/doc/assets/main.js` resolves correctly.

## Standard Single-Project Deploy

For non-monorepo projects:

```yaml
- name: Install Netlify CLI
  run: npm install -g netlify-cli

- name: Deploy to Netlify
  run: |
    netlify deploy \
      --dir=./out \
      --site=${{ secrets.NETLIFY_SITE_ID }} \
      --auth=${{ secrets.NETLIFY_AUTH_TOKEN }} \
      --prod \
      --message="Deploy from GitHub Actions - ${{ github.sha }}"
```

## Capturing Deploy URL

### Without --json (simpler, recommended)

```yaml
- name: Deploy to Netlify
  id: deploy
  run: |
    OUTPUT=$(netlify deploy \
      --dir=./build \
      --site=${{ secrets.NETLIFY_SITE_ID }} \
      --auth=${{ secrets.NETLIFY_AUTH_TOKEN }} \
      --prod \
      --message="Deploy: ${{ github.sha }}" 2>&1)

    echo "$OUTPUT"

    DEPLOY_URL=$(echo "$OUTPUT" | grep -o 'https://[^ ]*netlify.app' | head -1)
    echo "deploy-url=$DEPLOY_URL" >> $GITHUB_OUTPUT
```

### With --json (for more data)

```yaml
- name: Deploy to Netlify
  id: deploy
  run: |
    OUTPUT=$(netlify deploy \
      --dir=./build \
      --site=${{ secrets.NETLIFY_SITE_ID }} \
      --auth=${{ secrets.NETLIFY_AUTH_TOKEN }} \
      --prod \
      --json)

    DEPLOY_URL=$(echo "$OUTPUT" | jq -r '.deploy_url')
    echo "deploy-url=$DEPLOY_URL" >> $GITHUB_OUTPUT
```

## Complete GitHub Action Example (Monorepo Sub-Site)

Deploys a Docusaurus sub-site from a monorepo as a branch deploy, isolated from the main site's config:

```yaml
name: Deploy Documentation

on:
  push:
    branches: [doc]

concurrency:
  group: doc-deploy
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install documentation dependencies
        working-directory: doc
        run: pnpm install --frozen-lockfile

      - name: Build Docusaurus documentation
        working-directory: doc
        run: pnpm run build

      - name: Install Netlify CLI
        run: npm install -g netlify-cli@19

      - name: Prepare deploy directory
        run: |
          mkdir -p deploy-output/doc
          cp -r doc/build/* deploy-output/doc/
          mkdir -p deploy-output/.empty-functions
          cat > deploy-output/netlify.toml << 'TOML'
          [build]
            publish = "."
          TOML

      - name: Deploy to Netlify (branch deploy)
        working-directory: deploy-output
        env:
          NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
        run: |
          netlify deploy \
            --dir=. \
            --functions=.empty-functions \
            --site=$NETLIFY_SITE_ID \
            --auth=$NETLIFY_AUTH_TOKEN \
            --alias=doc \
            --message="Documentation deploy: ${{ github.sha }}"
```

## Common Errors and Solutions

### Error: "Projects detected"

- **Cause**: Monorepo with multiple package.json files
- **Solution**: Add `--filter=<package-name>` flag to `netlify deploy`

### Error: "Projects detected" with `netlify link`

- **Cause**: `netlify link` does NOT support `--filter` flag and fails in monorepos
- **Solution**: **Don't use `netlify link`** in monorepos. It's unnecessary when using `--site` flag with `netlify deploy`. The `--site` flag directly specifies the target site, making explicit linking redundant.

### Error: "unknown option '--no-build'"

- **Cause**: `--no-build` does not exist in netlify-cli@19+
- **Solution**: Remove the flag. `netlify deploy` does NOT build by default. Use `--build` only when you want to opt-in to building.

### Error: "Could not resolve @netlify/blobs" (or other function bundling errors)

- **Cause**: The CLI picks up functions from the root `netlify.toml` config, even when deploying a sub-site that doesn't need functions
- **Solution**: Use `--functions=<empty-dir>` to override. Create an empty directory and point to it:
  ```bash
  mkdir -p .empty-functions
  netlify deploy --functions=.empty-functions ...
  ```

### Error: Circular redirect / 404 on branch deploy

- **Cause**: Root `netlify.toml` has a redirect like `/doc/* -> https://doc--mysite.netlify.app/doc/:splat` with `force = true`. On the branch deploy itself, this redirect proxies to itself.
- **Solution**: Deploy from an isolated directory with its own `netlify.toml` that has no redirects. Use `working-directory` in the GitHub Actions step so the CLI finds the local config instead of the root one.

### Error: "Build directory not found"

- **Cause**: Wrong `--dir` path or build artifacts not downloaded
- **Solution**: Verify path and ensure artifacts are downloaded in CI

### Error: "Invalid character in header"

- **Cause**: Whitespace in auth token
- **Solution**: Trim the token: `export NETLIFY_AUTH_TOKEN=$(echo "$TOKEN" | tr -d '[:space:]')`

## Setup Requirements

### GitHub Secrets Needed

1. `NETLIFY_SITE_ID` - From Site settings -> General -> Site details -> API ID
2. `NETLIFY_AUTH_TOKEN` - From User settings -> Applications -> Personal access tokens

### Disable Netlify Auto-Build

When using GitHub Actions for deployment, disable Netlify's built-in CI:

1. Go to Site Settings -> Build & deploy
2. Set Build command to empty or `echo "Disabled"`
3. Or create `netlify.toml`:

```toml
[build]
  command = "echo 'Build disabled - deploying from GitHub Actions'"
  publish = "out"
```

## Using nwtgck/actions-netlify Instead

For simpler cases without monorepo issues:

```yaml
- name: Deploy to Netlify
  uses: nwtgck/actions-netlify@v3.0
  with:
    publish-dir: ./out
    production-deploy: true
    github-token: ${{ secrets.GITHUB_TOKEN }}
    deploy-message: 'Deploy - ${{ github.sha }}'
  env:
    NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
    NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
  timeout-minutes: 5
```

Note: This action may not handle monorepo scenarios well - use CLI directly for those cases.

## Local Development with `netlify dev`

### Basic Usage (Monorepo)

In a monorepo, `netlify dev` requires `--filter` to select the project. Without it, the CLI enters an interactive project selection prompt that blocks non-interactive environments:

```bash
# This works - selects the correct package
netlify dev --functions=netlify/functions --offline --filter takazudo-modular

# This gets stuck at interactive prompt
netlify dev --functions=netlify/functions --offline
```

A typical `package.json` script:

```json
{
  "netlify:dev": "PNPM_DISABLE_TRUST_STORE=true pnpm --package=netlify-cli dlx netlify dev --functions=netlify/functions --offline --filter takazudo-modular"
}
```

### What `netlify dev` Does

- Starts your framework's dev server (e.g., Next.js on port 34434)
- Starts a Netlify Functions server
- Runs a proxy on **port 8888** that routes:
  - Page requests → framework dev server
  - `/.netlify/functions/*` → functions server
  - Applies `netlify.toml` redirect rules (e.g., `/api/products` → `/.netlify/functions/get-products`)
- Injects `.env` variables into the environment

### pnpm 10.x Trust Store Error with `dlx`

On pnpm 10.x, `pnpm dlx netlify-cli` may fail with:

```
ERR_PNPM_TRUST_DOWNGRADE  High-risk trust downgrade for "@netlify/edge-bundler@14.9.5"
```

The `PNPM_DISABLE_TRUST_STORE=true` env var may **not** work with `pnpm dlx` even though `pnpm config list` shows `trust-store=false`. This is a pnpm 10.x behavior where `dlx` creates its own install context.

**Workarounds**:

1. **Install netlify-cli globally** instead of using `pnpm dlx`:
   ```bash
   npm install -g netlify-cli
   netlify dev --functions=netlify/functions --offline --filter takazudo-modular
   ```

2. **Use npx** (if the global install exists):
   ```bash
   npx netlify-cli dev --functions=netlify/functions --offline --filter takazudo-modular
   ```

### `netlify dev` Crash Workaround

`netlify dev` may crash with "Netlify CLI has terminated unexpectedly" after the proxy starts (observed in v23.14.0+). The proxy on port 8888 starts successfully but terminates immediately.

**Workaround: Run functions separately**

Use `netlify functions:serve` to run just the functions server on **port 9999**, then run your framework dev server separately:

```bash
# Terminal 1: Start functions server (port 9999)
netlify functions:serve --functions=netlify/functions --offline --filter takazudo-modular

# Terminal 2: Start Next.js dev server (port 34434)
pnpm dev
```

**Limitation**: Without the `netlify dev` proxy, API rewrites from `netlify.toml` (e.g., `/api/products` → `/.netlify/functions/get-products`) won't work. The functions are accessible directly at:

```
http://localhost:9999/.netlify/functions/<function-name>
```

For frameworks with `output: 'export'` (static site generation), Next.js `rewrites()` cannot be used. In this case, test the functions directly at the port 9999 URL.

### `netlify functions:serve` vs `netlify dev`

| Feature | `netlify dev` | `netlify functions:serve` |
|---|---|---|
| Port | 8888 (proxy) | 9999 |
| Framework dev server | Auto-started | Must start separately |
| API rewrites (`netlify.toml`) | Applied | Not applied |
| `.env` injection | Yes | Yes |
| Stability | May crash (v23+) | Stable |
| `--filter` flag | Supported | Supported |
