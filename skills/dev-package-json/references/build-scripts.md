# Dependency Build Script Security (pnpm `allowBuilds`)

## Background

pnpm 10+ blocks all dependency lifecycle scripts (`postinstall`, `install`, `prepare`, etc.) **by
default** — no opt-in setting needed. This is a supply chain attack countermeasure. Packages with
blocked scripts produce:

```
Warning: Ignored build scripts: @parcel/watcher@2.5.4, core-js@3.48.0, ...
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
```

**Do NOT blindly approve all.** Evaluate each package individually.

## Where the config lives (and where it does NOT)

Decisions go in **`pnpm-workspace.yaml`** (or the global `~/.config/pnpm/config.yaml`) as the
`allowBuilds` map — introduced in pnpm 10.26, the only mechanism in pnpm 11+:

```yaml
allowBuilds:
  esbuild: true      # true  = run this package's build scripts
  core-js: false     # false = deny, and silence the warning for it
  # version matchers are supported:
  "nx@21.6.4 || 21.6.5": true
```

- **NOT `.npmrc`.** Since pnpm 11, `.npmrc` carries only auth/registry settings. INI forms like
  `allowBuilds[]=pkg` were never valid in any pnpm — they parse as unknown keys and are **silent
  no-ops** (verified on pnpm 10.34: the warning persists and, worse, a "required" native build you
  believed you allowed never runs).
- **There is no `ignoredBuilds` key.** `false` in the `allowBuilds` map IS the ignore.
- **Legacy (pnpm ≤10 only):** `onlyBuiltDependencies:` / `ignoredBuiltDependencies:` lists in
  `pnpm-workspace.yaml` still work, but pnpm 11 removed them — write `allowBuilds` for anything new.
- `pnpm approve-builds` (interactive) writes this config for you; hand-editing the map with reason
  comments is better documentation.

### `strictDepBuilds`: escalate the warning to a failure

Blocking is already the default; `strictDepBuilds` controls how loudly an *unreviewed* script
surfaces. With `strictDepBuilds: true` in `pnpm-workspace.yaml`, an install that encounters a build
script with no `allowBuilds` verdict **fails hard** (`ERR_PNPM_IGNORED_BUILDS`) instead of warning.
Good for CI: a new dependency with a lifecycle script cannot slip in unreviewed. On pnpm 10 it
defaults to `false` (warning only); pnpm 11 defaults it to `true`, so there the hard failure is
what you get unless you explicitly set `strictDepBuilds: false`. (The `.npmrc`
spelling `strictDepBuilds=true` is silently ignored — this setting also belongs in the yaml.)

## Evaluation Workflow

When the warning appears:

### Step 1: Identify the scripts

For each package in the warning, check what script it runs:

```bash
node -e "const p = require('./node_modules/<pkg>/package.json'); console.log(JSON.stringify(p.scripts, null, 2))"
```

Look for: `install`, `postinstall`, `preinstall`, `prepare`, `prebuild`.

### Step 2: Read the actual script code

```bash
# Check what the script does
cat node_modules/<pkg>/postinstall.js
cat node_modules/<pkg>/scripts/build-from-source.js
```

### Step 3: Classify into one of three categories

| Category | `allowBuilds` entry | Criteria |
|----------|--------------------|----------|
| **Allow** | `<pkg>: true` | Script execution is required for the package to function (native bindings, code generation) |
| **Deny + silence** | `<pkg>: false` | Script is harmless but unnecessary (banners, echo messages, optional telemetry) |
| **Neither** | (leave as warning) | Needs further investigation or is suspicious |

### Step 4: Document the decision in pnpm-workspace.yaml

```yaml
allowBuilds:
  # true — scripts that must run:
  # unrs-resolver: native binding build (required)
  unrs-resolver: true
  # false — evaluated and deemed unnecessary:
  # @parcel/watcher: prebuilt binaries ship as @parcel/watcher-{platform}; install script is manual-build only
  "@parcel/watcher": false
```

## Decision Criteria

### Allow (`true`) when:

- **Native bindings** that must compile for the platform (and no prebuilt binary is available)
  - Examples: `node-gyp rebuild`, native addon compilation
- **Code generation** required at install time
- **Package won't work** without the script running

### Deny + silence (`false`) when:

- **Donation/sponsorship banners** (e.g., core-js)
- **Echo/console messages** (e.g., "don't forget to install X")
- **Prebuilt binaries exist** as separate platform packages (e.g., `@parcel/watcher` has `@parcel/watcher-darwin-arm64`)
- **Optional telemetry** or usage tracking
- Script only runs under specific conditions that don't apply (e.g., `if npm_config_build_from_source === 'true'`)

### Investigate further when:

- Script downloads external code at install time
- Script modifies files outside its own package directory
- Script has obfuscated or minified code
- Unknown package with complex postinstall

## Common Package Evaluations (Reference)

| Package | Script | What it does | Verdict |
|---------|--------|-------------|---------|
| `core-js` | `postinstall` | Donation banner display | **`false`** (harmless, unnecessary) |
| `core-js-pure` | `postinstall` | Same as core-js | **`false`** (harmless, unnecessary) |
| `@parcel/watcher` | `install` | `build-from-source.js` - only runs when `npm_config_build_from_source=true`. Prebuilt binaries provided via `@parcel/watcher-{platform}` | **`false`** |
| `svelte-preprocess` | `postinstall` | `echo` message about installing preprocessor packages | **`false`** |
| `unrs-resolver` | `postinstall` | Native binding setup | **`true`** (required) |
| `esbuild` | `postinstall` | Downloads platform-specific binary | **`true`** (required) |
| `sharp` | `install` | Downloads libvips native binary | **`true`** (required) |
| `husky` | `prepare` | Sets up git hooks | **`true`** (required for dev workflow) |

This table should be expanded as new packages are evaluated.

## pnpm-workspace.yaml Configuration Example

```yaml
# Escalate unreviewed build scripts from warning to install failure (good for CI)
strictDepBuilds: true

allowBuilds:
  # true — scripts that must run:
  # core-js / core-js-pure: postinstall donation banner (harmless; true also fine)
  # unrs-resolver: native binding build (required)
  core-js: true
  core-js-pure: true
  unrs-resolver: true
  # false — evaluated and deemed unnecessary (warning silenced):
  # @parcel/watcher: prebuilt binaries available, install script is for manual build only
  # svelte-preprocess: postinstall is just an echo message
  "@parcel/watcher": false
  svelte-preprocess: false
```

## Key Principles

1. **Default deny is built in** — pnpm 10+ blocks every dependency lifecycle script until you rule on it
2. **Evaluate each package** — never bulk-approve with `pnpm approve-builds` selecting all
3. **Document decisions** — comments in `pnpm-workspace.yaml` explain why each package is `true`/`false`
4. **Re-evaluate on update** — when a package version changes, its scripts may change too
5. **Check prebuilt binaries** — many native packages now ship platform-specific prebuilts (e.g., `@pkg/tool-darwin-arm64`), making their install scripts unnecessary
6. **`strictDepBuilds: true` in CI** — turns "someone ignored the warning" into a red install
