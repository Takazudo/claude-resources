# npm Package Publishing, Versioning, and Quality: Best Practices (2025-2026)

## Semantic Versioning and Release Automation

### Semver Rules

Semantic versioning follows the `MAJOR.MINOR.PATCH` format:

- **MAJOR** (e.g. 1.0.0 -> 2.0.0): Breaking changes to the public API. Removing or renaming exports, changing function signatures, dropping Node.js version support
- **MINOR** (e.g. 1.0.0 -> 1.1.0): New features that are backward-compatible. Adding new exports, new optional parameters, new configuration options
- **PATCH** (e.g. 1.0.0 -> 1.0.1): Bug fixes that are backward-compatible. Fixing incorrect behavior, security patches, documentation typos in JSDoc

### Pre-release Versions

```
1.0.0-alpha.1   # Early testing
1.0.0-beta.1    # Feature-complete testing
1.0.0-rc.1      # Release candidate
```

### Release Automation Tool Comparison

#### Changesets

Recommended for monorepos and teams that want explicit control over versioning decisions. Each PR author adds a changeset file describing the change and its semver impact.

```bash
npm install -D @changesets/cli
npx changeset init
```

Adding a changeset:

```bash
npx changeset
# Interactive prompts:
# - Which packages changed?
# - major / minor / patch?
# - Summary of the change
```

This creates a markdown file in `.changeset/`:

```markdown
---
"@myorg/utils": minor
---

Added `formatDate` utility function with timezone support
```

Configuration in `.changeset/config.json`:

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.1.1/schema.json",
  "changelog": "@changesets/changelog-github",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch"
}
```

Version bump and publish:

```bash
npx changeset version   # Bumps versions, updates CHANGELOG.md
npm publish             # Or: npx changeset publish
```

#### semantic-release

Recommended for fully automated pipelines where commit messages drive versioning. Requires strict adherence to Conventional Commits.

```bash
npm install -D semantic-release
```

Configuration in `.releaserc.json`:

```json
{
  "branches": ["main"],
  "plugins": [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    "@semantic-release/changelog",
    "@semantic-release/npm",
    [
      "@semantic-release/git",
      {
        "assets": ["package.json", "CHANGELOG.md"],
        "message": "chore(release): ${nextRelease.version} [skip ci]"
      }
    ],
    "@semantic-release/github"
  ]
}
```

Conventional Commit examples that trigger version bumps:

```
fix: resolve null pointer in parser        -> PATCH
feat: add streaming support                 -> MINOR
feat\!: rewrite config format               -> MAJOR
BREAKING CHANGE: dropped Node 16 support   -> MAJOR
```

#### release-it

Recommended for simpler setups that want interactive or automated releases without strict commit conventions.

```bash
npm install -D release-it
```

Configuration in `.release-it.json`:

```json
{
  "git": {
    "commitMessage": "chore: release v${version}",
    "tagName": "v${version}"
  },
  "npm": {
    "publish": true
  },
  "github": {
    "release": true,
    "releaseName": "v${version}"
  },
  "hooks": {
    "before:init": ["npm test", "npm run lint"],
    "after:bump": "npx auto-changelog -p"
  }
}
```

#### When to Choose Which

- **Changesets**: Monorepos, teams needing human review of version decisions, projects with multiple packages
- **semantic-release**: Solo maintainers or teams committed to Conventional Commits, fully automated CI/CD
- **release-it**: Small to medium projects, interactive release workflows, flexible commit conventions

## Publishing Workflow

### The `files` Field (Recommended Over `.npmignore`)

The `files` field in `package.json` is a whitelist approach. It explicitly declares which files to include in the published package. This is safer than `.npmignore` because new files are excluded by default.

```json
{
  "files": [
    "dist",
    "LICENSE",
    "README.md"
  ]
}
```

Certain files are always included regardless of the `files` field: `package.json`, `README`, `LICENSE`/`LICENCE`, and the file referenced in `main`.

Certain files are always excluded: `.git`, `node_modules`, `.npmrc`, `package-lock.json`, `.DS_Store`.

### Why Not `.npmignore`

- `.npmignore` uses a blacklist approach -- new files may accidentally be included
- If `.npmignore` exists, `.gitignore` is not consulted for npm packaging
- Easy to forget updating `.npmignore` when adding new development files
- The `files` field is declarative and visible in `package.json`

### Lifecycle Scripts

```json
{
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts --clean",
    "test": "vitest run",
    "lint": "eslint src/",
    "prepublishOnly": "npm run lint && npm run test && npm run build",
    "prepack": "npm run build"
  }
}
```

- **`prepare`**: Runs on `npm install` (local) and before `npm publish`. Use for build steps that consumers installing from git need
- **`prepublishOnly`**: Runs only before `npm publish`. Use for tests, linting, and builds that should gate publishing
- **`prepack`**: Runs before `npm pack` and `npm publish`. Use for build steps

### Testing with `npm pack`

Always inspect the package contents before publishing:

```bash
# Dry run to see what would be included
npm pack --dry-run

# Create the actual tarball for inspection
npm pack

# Inspect contents
tar -tzf mypackage-1.0.0.tgz

# Install locally from tarball to test
cd /tmp/test-project
npm install /path/to/mypackage-1.0.0.tgz
```

### Scoped Packages

```json
{
  "name": "@myorg/utils",
  "publishConfig": {
    "access": "public"
  }
}
```

Publishing a scoped package as public:

```bash
npm publish --access public
```

### Dry-Run Publishing

```bash
npm publish --dry-run
```

This simulates the entire publish process without actually uploading to the registry.

## ESM and CJS Dual Publishing

### Recommended Package Structure

```
my-package/
  src/
    index.ts
  dist/
    index.js        # ESM
    index.cjs       # CJS
    index.d.ts      # Types for ESM
    index.d.cts     # Types for CJS
  package.json
```

### package.json Configuration

```json
{
  "name": "my-package",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    }
  },
  "files": [
    "dist"
  ]
}
```

The `types` condition must come first in each entry. Node.js and TypeScript use the first matching condition.

### Building with tsup

tsup (powered by esbuild) is the most commonly recommended build tool for dual-format packages.

```bash
npm install -D tsup
```

`tsup.config.ts`:

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
});
```

Or via CLI in `package.json`:

```json
{
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts --clean --sourcemap"
  }
}
```

### ESM-Only Publishing

If your package targets modern environments only, ESM-only is simpler and avoids the dual-package hazard.

```json
{
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  }
}
```

As of Node.js v22+, CJS code can `require()` ESM modules natively, reducing the need for dual publishing.

## CI/CD for npm Packages

### GitHub Actions: Trusted Publishing with OIDC

Trusted publishing (GA since July 2025) eliminates the need for npm access tokens. Authentication happens via short-lived OIDC tokens.

#### Setup Steps

1. Go to npmjs.com -> Package Settings -> Trusted Publishers
2. Add your GitHub repository, workflow filename, and environment

#### Workflow File

`.github/workflows/publish.yml`:

```yaml
name: Publish to npm

on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "22.x"
          registry-url: "https://registry.npmjs.org"

      - run: npm ci
      - run: npm test
      - run: npm run build
      - run: npm publish
```

Key points:

- `id-token: write` permission is required for OIDC
- npm CLI 11.5.1+ is required
- Provenance attestations are generated automatically with trusted publishing (no `--provenance` flag needed)
- No `NODE_AUTH_TOKEN` secret is needed

#### Workflow with Token-Based Auth (Legacy)

If trusted publishing is not available, use token-based authentication:

```yaml
name: Publish to npm

on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "22.x"
          registry-url: "https://registry.npmjs.org"

      - run: npm ci
      - run: npm test
      - run: npm run build
      - run: npm publish --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

For token-based publishing, the `--provenance` flag must be explicitly passed.

### CI Testing Workflow

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}

      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build

      - name: Validate package
        run: |
          npx publint
          npx attw --pack .
```

### GitHub Actions with Changesets

```yaml
name: Release

on:
  push:
    branches: [main]

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      id-token: write
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "22.x"
          registry-url: "https://registry.npmjs.org"

      - run: npm ci

      - name: Create Release Pull Request or Publish
        uses: changesets/action@v1
        with:
          publish: npx changeset publish
          version: npx changeset version
          commit: "chore: version packages"
          title: "chore: version packages"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Package Quality Checklist

### Required Files

- `README.md`: Package description, installation, usage examples, API reference, contributing guide
- `LICENSE`: Choose an appropriate open-source license (MIT, Apache-2.0, ISC, etc.)
- `CHANGELOG.md`: Document all notable changes per version (automated by Changesets or semantic-release)

### Validation Tools

#### publint

Lints the `package.json` and package structure for common publishing mistakes.

```bash
npx publint

# In package.json scripts for CI
{
  "scripts": {
    "lint:pkg": "publint"
  }
}
```

Checks for issues like:

- Missing `exports` field
- Incorrect `main`/`module`/`types` paths
- Files referenced but not included in the package
- Incorrect `type` field usage

#### Are the Types Wrong (attw)

Validates that TypeScript type definitions work correctly across different `moduleResolution` settings.

```bash
npx @arethetypeswrong/cli --pack .

# Or check a published package
npx @arethetypeswrong/cli my-package
```

Detects issues like:

- Types not resolving under `node16` / `nodenext` module resolution
- Missing `.d.cts` or `.d.mts` files
- Mismatched ESM/CJS type declarations
- The `FalseCJS` problem (CJS types claiming ESM-style default exports)

#### Using Both Together

publint and attw catch different issues. publint performs static analysis of the package structure while attw uses the TypeScript compiler. Both should be used together in CI.

```json
{
  "scripts": {
    "check:package": "publint && attw --pack ."
  }
}
```

### Package Size Optimization

#### size-limit

Enforces size budgets in CI.

```bash
npm install -D size-limit @size-limit/preset-small-lib
```

`.size-limit.json`:

```json
[
  {
    "path": "dist/index.js",
    "limit": "10 kB"
  }
]
```

```json
{
  "scripts": {
    "size": "size-limit",
    "size:why": "size-limit --why"
  }
}
```

The `--why` flag opens a treemap visualization showing what contributes to bundle size.

#### Bundlephobia

Check the install size and bundle size of any npm package at https://bundlephobia.com. This is useful for comparing dependency choices rather than for validating your own package during development.

## Security

### npm audit

```bash
npm audit
npm audit fix
npm audit --omit=dev   # Skip devDependencies
```

### Lockfile Practices

- Always commit `package-lock.json` (or `pnpm-lock.yaml` / `yarn.lock`)
- Use `npm ci` in CI environments (installs from lockfile exactly)
- Avoid floating version ranges in production dependencies when possible
- Review lockfile diffs in pull requests for unexpected dependency changes

```bash
# CI should use:
npm ci              # Not "npm install"
pnpm install --frozen-lockfile
```

### Provenance Attestation

Provenance provides a cryptographic proof that a package was built from a specific source repository and commit, using a specific CI/CD workflow. Consumers can verify this on npmjs.com (look for the green "Provenance" badge).

With trusted publishing, provenance is automatic. With token-based auth:

```bash
npm publish --provenance
```

Or in `package.json`:

```json
{
  "publishConfig": {
    "provenance": true
  }
}
```

### Supply Chain Security Measures

- Enable 2FA on your npm account (required for publishing if you have tokens)
- Use npm trusted publishing to avoid storing long-lived tokens
- Pin dependency versions in lockfiles
- Review new dependencies before adding them
- Use `npm audit signatures` to verify package signing
- Consider pnpm's cooldown feature that blocks installation of package versions published within a cooldown period
- Monitor for typosquatting on your package name

### The 2025 Shai-Hulud Attack Context

In September 2025, a self-replicating worm compromised 796 npm packages (132M monthly downloads) via stolen maintainer credentials and malicious `preinstall` scripts. Key defenses:

- Use trusted publishing (OIDC) instead of long-lived npm tokens
- Audit `preinstall`/`postinstall` scripts in dependencies
- Use `--ignore-scripts` flag when installing untrusted packages
- Monitor for anomalous publishes to your packages

## Documentation

### JSDoc / TSDoc

Write inline documentation for all public exports:

```ts
/**
 * Formats a date string according to the specified locale and options.
 *
 * @param date - The date to format
 * @param locale - BCP 47 language tag (e.g., "en-US", "ja-JP")
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted date string
 *
 * @example
 * ```ts
 * formatDate(new Date(), "en-US", { dateStyle: "long" });
 * // => "February 7, 2026"
 * ```
 *
 * @since 1.2.0
 */
export function formatDate(
  date: Date,
  locale: string,
  options?: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat(locale, options).format(date);
}
```

### TypeDoc

Generate API documentation from TypeScript source code and JSDoc/TSDoc comments.

```bash
npm install -D typedoc
```

`typedoc.json`:

```json
{
  "entryPoints": ["src/index.ts"],
  "out": "docs",
  "plugin": ["typedoc-plugin-markdown"],
  "readme": "none",
  "excludePrivate": true,
  "excludeInternal": true
}
```

```json
{
  "scripts": {
    "docs": "typedoc",
    "docs:watch": "typedoc --watch"
  }
}
```

TypeDoc reads your TypeScript source and generates HTML or Markdown documentation automatically. The `typedoc-plugin-markdown` plugin generates `.md` files suitable for static site generators or GitHub wikis.

## Pre-Publish Validation

### Complete Pre-Publish Checklist

```bash
# 1. Run tests
npm test

# 2. Run linting
npm run lint

# 3. Build the package
npm run build

# 4. Validate package.json and exports
npx publint

# 5. Validate TypeScript types
npx @arethetypeswrong/cli --pack .

# 6. Check package size
npx size-limit

# 7. Inspect package contents
npm pack --dry-run

# 8. Test installation in a temporary project
npm pack
cd "$(mktemp -d)"
npm init -y
npm install /path/to/my-package-1.0.0.tgz
node -e "import('my-package').then(m => console.log(Object.keys(m)))"

# 9. Dry-run publish
npm publish --dry-run
```

### Automated Pre-Publish Script

```json
{
  "scripts": {
    "prepublishOnly": "npm run lint && npm test && npm run build && npx publint && npx attw --pack .",
    "prepack": "npm run build"
  }
}
```

### Checking Bundle Size in CI

```yaml
# In .github/workflows/ci.yml
- name: Check package size
  run: npx size-limit
```

## Common Pitfalls and How to Avoid Them

### Forgetting to Build Before Publish

The `prepublishOnly` script prevents this:

```json
{
  "scripts": {
    "prepublishOnly": "npm run build"
  }
}
```

If the `dist/` directory is gitignored (as it should be), a missing build step means publishing an empty or stale package.

### Including Test Files in the Package

Use the `files` field as a whitelist:

```json
{
  "files": ["dist"]
}
```

Verify with `npm pack --dry-run` that `__tests__/`, `*.test.ts`, `*.spec.ts`, `jest.config.*`, `vitest.config.*`, `.eslintrc.*`, and similar files are excluded.

### Missing Type Declarations

If using TypeScript, ensure `dts: true` in tsup config or `"declaration": true` in `tsconfig.json`. Verify with:

```bash
npx @arethetypeswrong/cli --pack .
```

### Broken ESM/CJS Interop

Common issues:

- Missing `"type": "module"` in `package.json` when publishing ESM
- The `types` condition not being first in `exports`
- Missing `.d.cts` files for CJS consumers using `moduleResolution: "node16"`
- Using `__dirname` or `require` in ESM files
- Default export confusion between ESM and CJS

Prevention:

```bash
# Run attw to detect interop issues
npx @arethetypeswrong/cli --pack .

# Test both import styles
node -e "import('./dist/index.js').then(console.log)"
node -e "console.log(require('./dist/index.cjs'))"
```

### Publishing Sensitive Files

Never publish `.env`, credentials, or config files with secrets. The `files` whitelist approach prevents accidental inclusion. Additionally, npm will warn if it detects potential secrets.

### Not Testing the Published Package

The tarball produced by `npm pack` is exactly what gets uploaded to the registry. Always test it:

```bash
npm pack
mkdir /tmp/test-install && cd /tmp/test-install
npm init -y
npm install /path/to/package-1.0.0.tgz
# Test imports, types, and functionality
```

### Incorrect `engines` Field

Declare the minimum Node.js version your package supports:

```json
{
  "engines": {
    "node": ">=18"
  }
}
```

### Not Setting `sideEffects`

For tree-shaking support in bundlers:

```json
{
  "sideEffects": false
}
```

Or specify files that do have side effects:

```json
{
  "sideEffects": ["./dist/polyfill.js", "**/*.css"]
}
```

## Complete package.json Example

```json
{
  "name": "@myorg/utils",
  "version": "1.0.0",
  "description": "Utility functions for common operations",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    }
  },
  "files": [
    "dist"
  ],
  "sideEffects": false,
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "lint": "eslint src/",
    "check:package": "publint && attw --pack .",
    "size": "size-limit",
    "docs": "typedoc",
    "prepublishOnly": "npm run lint && npm test && npm run build && npm run check:package",
    "prepack": "npm run build"
  },
  "publishConfig": {
    "access": "public",
    "provenance": true
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/myorg/utils.git"
  },
  "keywords": ["utils", "utilities"],
  "author": "My Org",
  "license": "MIT"
}
```

## Sources

- [Snyk: Best Practices for Creating a Modern npm Package](https://snyk.io/blog/best-practices-create-modern-npm-package/)
- [npm Docs: Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)
- [npm Docs: Generating Provenance Statements](https://docs.npmjs.com/generating-provenance-statements/)
- [Oleksii Popov: NPM Release Automation Comparison](https://oleksiipopov.com/blog/npm-release-automation/)
- [Changesets GitHub Repository](https://github.com/changesets/changesets)
- [semantic-release Configuration](https://semantic-release.gitbook.io/semantic-release/usage/configuration)
- [Liran Tal: TypeScript in 2025 with ESM and CJS](https://lirantal.com/blog/typescript-in-2025-with-esm-and-cjs-npm-publishing)
- [publint](https://publint.dev/docs/comparisons)
- [Are the Types Wrong CLI](https://github.com/arethetypeswrong/arethetypeswrong.github.io)
- [GitHub Blog: npm Trusted Publishing OIDC](https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/)
- [Antfu: Ship ESM and CJS in One Package](https://antfu.me/posts/publish-esm-and-cjs)
- [tsup Documentation](https://tsup.egoist.dev/)
- [size-limit GitHub Repository](https://github.com/ai/size-limit)
- [TypeDoc](https://typedoc.org/)
- [pnpm Blog: Supply Chain Security](https://pnpm.io/blog/2025/12/05/newsroom-npm-supply-chain-security)
- [Snyk: NPM Security Best Practices After Shai Hulud](https://snyk.io/articles/npm-security-best-practices-shai-hulud-attack/)
- [npm Docs: Scripts](https://docs.npmjs.com/cli/v8/using-npm/scripts/)
- [npm CLI Wiki: Files and Ignores](https://github.com/npm/cli/wiki/Files-&-Ignores)
- [johnnyreilly: Dual Publishing with tsup and attw](https://johnnyreilly.com/dual-publishing-esm-cjs-modules-with-tsup-and-are-the-types-wrong)