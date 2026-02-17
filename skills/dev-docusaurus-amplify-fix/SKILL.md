---
name: docusaurus-amplify-fix
description: >-
  Fix trailing slash 404 errors in Docusaurus sites deployed on AWS Amplify. Use when: (1)
  Docusaurus documentation pages return 404 with trailing slash URLs (e.g., /docs/page/ returns 404
  but /docs/page.html works), (2) Setting up a new Docusaurus site on Amplify, (3) Users report
  documentation links are broken when accessed directly or refreshed.
---

# Docusaurus + Amplify Trailing Slash Fix

## Problem

Docusaurus sites deployed on AWS Amplify show 404 errors when accessing pages with trailing slash URLs:
- `/docs/dev/environment-variables/` → 404
- `/docs/dev/environment-variables.html` → works

## Root Cause

Docusaurus with `trailingSlash: false` (default) generates:
- `page.html` ✅ (file exists)
- `page/index.html` ❌ (does not exist)

When users access `/page/`, Amplify looks for `page/index.html` but finds nothing, resulting in 404.

## Solution

Create `page/index.html` copies for all generated `.html` files during the build process. This makes both URL formats work:
- `/docs/dev/page.html` → original file
- `/docs/dev/page/` → serves `page/index.html` (copy)

## Implementation

### 0. Detect Docusaurus Root

Find the Docusaurus root directory by locating `docusaurus.config.ts` or `docusaurus.config.js` in the repository. Store this path as `{DOCUSAURUS_ROOT}` and use it for all subsequent steps. For example, if `docusaurus.config.ts` is at `doc/docusaurus.config.ts`, then `{DOCUSAURUS_ROOT}` is `doc`.

```bash
# Find the Docusaurus root directory
DOCUSAURUS_ROOT=$(dirname $(find . -maxdepth 3 -name "docusaurus.config.*" -type f | head -1))
echo "Docusaurus root: $DOCUSAURUS_ROOT"
```

### 1. Add the Script

Copy `scripts/create-trailing-slash-pages.sh` to your Docusaurus project:

```bash
# Create scripts directory if it doesn't exist
mkdir -p {DOCUSAURUS_ROOT}/scripts

# Copy the script
cp create-trailing-slash-pages.sh {DOCUSAURUS_ROOT}/scripts/
chmod +x {DOCUSAURUS_ROOT}/scripts/create-trailing-slash-pages.sh
```

### 2. Update amplify.yml

Add the script execution after the Docusaurus build. Replace `{DOCUSAURUS_ROOT}` with the actual Docusaurus directory path for your project:

```yaml
build:
  commands:
    - cd {DOCUSAURUS_ROOT} && npm ci && npm run build && bash scripts/create-trailing-slash-pages.sh && cd ../
```

Full example (adapt paths to your project structure):

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run prod:demo
        - cd {DOCUSAURUS_ROOT} && npm ci && npm run build && bash scripts/create-trailing-slash-pages.sh && cd ../ && mkdir -p dist/{DOCUSAURUS_ROOT} && cp -r {DOCUSAURUS_ROOT}/build/* dist/{DOCUSAURUS_ROOT}/
  artifacts:
    baseDirectory: dist
    files:
      - '**/*'
```

> **Note:** The `amplify.yml` paths above use `{DOCUSAURUS_ROOT}` as a placeholder. Replace it with the actual directory name where `docusaurus.config.ts` (or `.js`) is located (e.g., `doc`, `website`, `docs-site`, or `.` if at the repository root). Also adjust the `dist/` staging directory and `cp` commands to match your project's deployment structure.

### 3. Verify

After deployment, test that both URL formats work:
- https://your-site.amplifyapp.com/docs/page.html
- https://your-site.amplifyapp.com/docs/page/

## How the Script Works

The script:
1. Finds all `.html` files (except `index.html`)
2. Creates a directory with the same name as each file
3. Copies the HTML content as `index.html` inside that directory

Example:
```
build/dev/
├── environment-variables.html          # Original
└── environment-variables/
    └── index.html                      # Copy created by script
```

## Alternative Approaches (Not Recommended)

### ❌ Changing trailingSlash to true

Setting `trailingSlash: true` in Docusaurus config breaks existing relative links throughout the documentation, requiring extensive link fixes.

### ❌ Using _redirects file

While Amplify supports `_redirects` files, the SPA fallback approach doesn't reliably work for all page types and creates dependency on redirect rules.

## Script Details

The `create-trailing-slash-pages.sh` script is located in `scripts/` and can be used as-is in any Docusaurus + Amplify project.
