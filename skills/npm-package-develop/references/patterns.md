# npm Package Architecture, Patterns, and Common Gotchas (2025-2026)

A comprehensive reference covering package types, ESM/CJS dual publishing, entry points, dependency management, CLI tooling, tree-shaking, and common mistakes.

## Package Types and Patterns

### Library Packages

Library packages expose reusable functions, classes, or components. Their primary concern is clean exports, proper type definitions, and tree-shakeability.

```json
{
  "name": "my-lib",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.mts",
        "default": "./dist/index.mjs"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    }
  },
  "files": ["dist"],
  "sideEffects": false
}
```

### CLI Tool Packages

CLI tools use the `bin` field to register executable commands. They require a shebang line and argument parsing.

```json
{
  "name": "my-cli",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "my-cli": "./bin/cli.mjs"
  },
  "files": ["bin", "dist"],
  "dependencies": {
    "commander": "^13.0.0"
  }
}
```

### Full-Stack Utility Packages

Packages that run in both Node.js and browsers need conditional exports to serve the right code per environment.

```json
{
  "exports": {
    ".": {
      "browser": {
        "import": "./dist/browser.mjs",
        "require": "./dist/browser.cjs"
      },
      "node": {
        "import": "./dist/node.mjs",
        "require": "./dist/node.cjs"
      },
      "default": "./dist/index.mjs"
    }
  }
}
```

### Packages with Native/Binary Dependencies

Packages that depend on platform-specific native binaries use `optionalDependencies` to handle multi-platform distribution.

```json
{
  "optionalDependencies": {
    "@my-pkg/linux-x64": "1.0.0",
    "@my-pkg/darwin-arm64": "1.0.0",
    "@my-pkg/win32-x64": "1.0.0"
  }
}
```

The consuming package checks which optional dependency installed successfully and loads the corresponding binary at runtime.

## ESM/CJS Dual Publishing

### The Current State

As of 2025, the JavaScript ecosystem is in a transitional period. ESM is the standard, but CJS remains deeply embedded in enterprise codebases and tooling. Node.js v22+ natively supports `require()` of ESM modules (previously experimental), but dual publishing is still the pragmatic choice for library authors who want broad compatibility.

### The `type: "module"` Decision

Setting `"type": "module"` in package.json means all `.js` files in the package are treated as ESM. Without it, Node.js defaults to CJS for `.js` files. The explicit file extensions `.mjs` (ESM) and `.cjs` (CJS) override this setting regardless.

#### When to set `"type": "module"`

- Your package is ESM-first and you want `.js` files treated as ESM
- You are writing a modern library where CJS is a secondary output

#### When to omit it

- You want maximum backward compatibility
- You rely on `.mjs`/`.cjs` extensions to distinguish formats explicitly

### Recommended Dual-Format Configuration

```json
{
  "name": "my-package",
  "version": "1.0.0",
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      },
      "import": {
        "types": "./dist/index.d.mts",
        "default": "./dist/index.mjs"
      }
    }
  }
}
```

#### Key points

- `main` and `module` provide fallback for older tools that do not support `exports`
- `exports` takes priority in Node.js 12.7+ and modern bundlers
- Type declaration file extensions matter: `.d.cts` for CJS consumers, `.d.mts` for ESM consumers
- The `types` condition must appear before `default` within each condition block

### Build Tools for Dual Publishing

#### tsup (recommended for simplicity)

```bash
tsup src/index.ts --format cjs,esm --dts --clean
```

- Powered by esbuild, very fast
- Generates both `.cjs` and `.mjs` outputs plus `.d.ts`/`.d.cts`/`.d.mts` declarations
- Automatically shims `import.meta.url` for CJS output

#### unbuild (recommended for flexibility)

- Auto-generates both formats by default
- Stubbing mode (`--stub`) enables live development without watchers
- Uses rollup under the hood for clean bundled output

#### pkgroll (zero-config approach)

- Reads entry points from `package.json` directly
- Uses rollup for bundling and esbuild for transformations
- No separate config file needed

### Common Interop Issues and Solutions

#### `__dirname` and `__filename` not available in ESM

```js
// ESM replacement
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```

#### `require()` not available in ESM

```js
// ESM replacement
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

// Now you can use require() for JSON imports or CJS modules
const pkg = require("./package.json");
```

#### Dual Package Hazard

When the same package is loaded as both ESM and CJS in a single application, two separate instances exist. This can break `instanceof` checks and singleton patterns. The mitigation is to make one format a thin wrapper that re-exports from the other.

### Verification Tools

- **publint** (publint.dev): Checks that your package follows distribution best practices
- **Are The Types Wrong** (@arethetypeswrong/cli): Analyzes TypeScript types for ESM/CJS resolution issues across node10, node16, and bundler module resolution modes

```bash
# Check your package before publishing
npx publint
npx @arethetypeswrong/cli ./my-package-1.0.0.tgz
```

## Package Entry Points

### The `exports` Map

The `exports` field (introduced in Node.js 12.7.0) is the modern approach for defining package entry points. When `exports` is defined, it acts as a blocklist: no subpaths are accessible unless explicitly exported, not even `package.json`.

### Condition Keys

Conditions are keys without a `.` prefix. Common conditions include:

- `types` -- TypeScript type declarations (must appear first)
- `import` -- Used when loaded via `import` or `import()`
- `require` -- Used when loaded via `require()`
- `node` -- Node.js-specific entry
- `browser` -- Browser-specific entry
- `development` / `production` -- Environment-specific
- `default` -- Fallback (must appear last)

#### Condition ordering matters

Within an exports object, earlier entries take priority. Custom conditions must appear before default conditions (`import`, `require`, `default`). Anything placed after `default` is unreachable.

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "my-custom-condition": "./dist/custom.js",
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs",
      "default": "./dist/index.mjs"
    }
  }
}
```

### Subpath Exports

Subpath exports expose specific modules from your package under clean import paths.

```json
{
  "exports": {
    ".": "./dist/index.mjs",
    "./utils": "./dist/utils.mjs",
    "./components/Button": "./dist/components/Button.mjs"
  }
}
```

Consumers import with:

```js
import { helper } from "my-pkg/utils";
import { Button } from "my-pkg/components/Button";
```

### Wildcard Exports

The `*` character captures nested paths. It does not behave like glob syntax and may expose more files than expected.

```json
{
  "exports": {
    ".": "./dist/index.mjs",
    "./components/*": "./dist/components/*.mjs"
  }
}
```

This maps `my-pkg/components/Button` to `./dist/components/Button.mjs`.

### Blocking Internal Access

Use `null` to explicitly prevent importing internal paths:

```json
{
  "exports": {
    ".": "./dist/index.mjs",
    "./internal/*": null
  }
}
```

### Condition Resolution by Runtime

Different runtimes check different conditions in different orders:

- **Node.js**: `node`, `import`/`require`, `default`
- **Vite**: `import`/`require`, `default`, `module`, `browser`, `production`/`development`
- **esbuild**: `import`/`require`, `default`, `browser`, `node`, `module`
- **webpack**: `import`/`require`, `default`, `browser`, `node`, `module`

### TypeScript and moduleResolution

For consumers to use packages with subpath exports in TypeScript, their `tsconfig.json` must set `moduleResolution` to one of:

- `node16` -- Follows Node.js resolution strictly, requires file extensions in relative imports
- `nodenext` -- Same as node16 but tracks the latest Node.js behavior
- `bundler` -- Supports `exports` like node16 but allows extensionless imports

The older `node` (node10) resolution mode does not support the `exports` field at all.

## Dependency Management

### dependencies

Packages required at runtime. These are installed when a consumer runs `npm install your-package`.

```json
{
  "dependencies": {
    "lodash-es": "^4.17.21"
  }
}
```

Use for: any module your package imports at runtime.

### devDependencies

Packages needed only during development (testing, building, linting). These are not installed for consumers.

```json
{
  "devDependencies": {
    "tsup": "^8.0.0",
    "vitest": "^3.0.0",
    "typescript": "^5.7.0",
    "@arethetypeswrong/cli": "^0.17.0"
  }
}
```

Use for: build tools, test runners, linters, type checkers, bundlers.

### peerDependencies

Packages your library expects the consuming project to provide. The consumer controls the version.

```json
{
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0"
  }
}
```

#### Guidelines for peer dependencies

- Use only when the dependency must be shared (e.g., React, Vue, Angular)
- Keep version ranges as wide as possible (`^18.0.0` not `~18.2.1`)
- Do not overuse; excessive peer dependencies burden consumers with resolution issues
- Since npm v7, peer dependencies are installed automatically by default

### peerDependenciesMeta

Mark peer dependencies as optional to suppress warnings when they are not installed.

```json
{
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0",
    "react-native": ">=0.70.0"
  },
  "peerDependenciesMeta": {
    "react-native": {
      "optional": true
    }
  }
}
```

### optionalDependencies

Dependencies that can fail to install without breaking the package. Your code must handle their absence gracefully.

```json
{
  "optionalDependencies": {
    "fsevents": "^2.3.0"
  }
}
```

```js
let fsevents;
try {
  fsevents = await import("fsevents");
} catch {
  // Gracefully handle absence - platform does not support fsevents
}
```

Use for: platform-specific binaries, performance-enhancing native addons.

### bundleDependencies

An array of package names that will be bundled into the published tarball. The packages are included in the tarball rather than fetched from the registry.

```json
{
  "bundleDependencies": ["internal-parser", "custom-logger"]
}
```

Use for: packages not available on the npm registry, modified forks of existing packages, or ensuring exact versions ship with your package.

## README Best Practices

### Recommended Structure

```markdown
# package-name

Brief one-line description of what this package does.

[![npm version](https://img.shields.io/npm/v/package-name.svg)](https://www.npmjs.com/package/package-name)
[![license](https://img.shields.io/npm/l/package-name.svg)](./LICENSE)

## Installation

\`\`\`bash
npm install package-name
\`\`\`

## Usage

\`\`\`js
import { something } from "package-name";
// Minimal working example
\`\`\`

## API

### `functionName(arg1, arg2)`

- **arg1** (`string`): Description
- **arg2** (`number`, optional): Description. Defaults to `0`.
- **Returns**: `Promise<Result>`

## Configuration

Document any configuration options with defaults.

## Contributing

Link to CONTRIBUTING.md or brief instructions.

## License

MIT
```

### Key Sections

- **Package name and description**: The single most important thing. Visible immediately on npm
- **Badges**: npm version, license, CI status, coverage. Use shields.io for generation
- **Install instructions**: Include both npm and yarn/pnpm variants if your audience expects them
- **Usage example**: A minimal, copy-pasteable code snippet showing the primary use case
- **API documentation**: Every exported function/class with parameters, types, return values, and defaults
- **License**: State it explicitly

### What Not to Include

- Implementation details that change frequently
- Excessive badges that obscure the actual content
- Marketing language or feature comparison tables against competitors

## Common Mistakes New Package Authors Make

### Forgetting the `files` Field

Without a `files` field, npm publishes almost everything in your project directory (minus `.gitignore` entries). This includes test files, source maps, editor configs, and potentially sensitive files.

```json
{
  "files": ["dist", "bin"]
}
```

Always verify before publishing:

```bash
npm pack --dry-run
```

This lists exactly which files would be included in the tarball.

### Not Testing the Package Locally Before Publishing

#### Using npm pack

```bash
# Create a tarball
npm pack

# In a test project, install the tarball
npm install ../my-package/my-package-1.0.0.tgz
```

This simulates exactly what a consumer would get from npm.

#### Using npm link

```bash
# In the package directory
npm link

# In the consuming project
npm link my-package
```

Note: `npm link` creates a symlink, which can mask issues that `npm pack` would reveal (missing files, wrong exports). Prefer `npm pack` for final verification.

### Breaking Changes Without Major Version Bump

Semantic versioning requires a major version bump for any breaking change:

- Removing an exported function or changing its signature
- Changing the minimum Node.js version
- Switching from CJS to ESM-only
- Renaming or restructuring exports

Use `npm version major` to bump correctly. The command updates `package.json`, `package-lock.json`, creates a git commit, and tags the release.

### Missing or Wrong Types Path

TypeScript consumers will silently get `any` types if the `types` field points to a nonexistent file or the wrong location.

```bash
# Verify types are correct before publishing
npx @arethetypeswrong/cli $(npm pack)
```

Common type resolution problems detected by `attw`:

- Resolution failed (types file does not exist)
- Masquerading as CJS (ESM types served for a CJS entry)
- Masquerading as ESM (CJS types served for an ESM entry)
- Missing `export` (subpath has no types)
- CJS default export mismatch

### Not Handling Node.js Version Compatibility

Specify your minimum Node.js version in `engines`:

```json
{
  "engines": {
    "node": ">=18.0.0"
  }
}
```

Test against your minimum version in CI. Features like top-level await, `node:` protocol imports, and `structuredClone` have specific minimum Node.js versions.

### Forgetting `prepublishOnly`

Without a build step in `prepublishOnly`, you risk publishing stale dist files or no dist files at all.

```json
{
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts --clean",
    "prepublishOnly": "npm run build"
  }
}
```

## CLI Package Specifics

### bin Field Configuration

#### Single command

```json
{
  "bin": {
    "my-cli": "./bin/cli.mjs"
  }
}
```

#### Shorthand (command name matches package name)

```json
{
  "bin": "./bin/cli.mjs"
}
```

#### Multiple commands

```json
{
  "bin": {
    "my-cli": "./bin/cli.mjs",
    "my-cli-init": "./bin/init.mjs"
  }
}
```

### Cross-Platform Shebang

The shebang must be the very first line of the file:

```js
#!/usr/bin/env node

import { program } from "commander";
// ...
```

#### How it works across platforms

- **Unix/macOS**: The OS reads the shebang to determine the interpreter
- **Windows**: npm reads the shebang during installation and generates a `.cmd` wrapper alongside the script. Windows ignores the shebang line itself (treated as a comment)

#### Line terminator warning

If developing on Windows, ensure the shebang line uses `\n` (LF), not `\r\n` (CRLF). A `\r` at the end of the shebang makes Unix systems look for `node\r` instead of `node`. Configure your editor to use LF for the bin files.

### Argument Parsing Libraries Comparison

#### commander

- Most popular CLI framework (weekly downloads: millions)
- Object-oriented, programmatic API
- Strong subcommand support with Git-style nesting
- Automatic help generation
- Mature and stable

```js
#!/usr/bin/env node
import { program } from "commander";

program
  .name("my-cli")
  .version("1.0.0")
  .description("A sample CLI tool");

program
  .command("init")
  .description("Initialize a new project")
  .option("-t, --template <name>", "template to use", "default")
  .action((options) => {
    console.log(`Initializing with template: ${options.template}`);
  });

program.parse();
```

#### yargs

- Fluent, chainable API
- Built-in middleware support
- Extensive input validation
- Dynamic argument parsing
- Powerful completion generation

```js
#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

yargs(hideBin(process.argv))
  .command(
    "init",
    "Initialize a new project",
    (yargs) => {
      return yargs.option("template", {
        alias: "t",
        type: "string",
        default: "default",
        describe: "Template to use",
      });
    },
    (argv) => {
      console.log(`Initializing with template: ${argv.template}`);
    }
  )
  .demandCommand(1)
  .help()
  .parse();
```

#### citty (unjs)

- Lightweight, ESM-first CLI builder from the UnJS ecosystem
- Lazy and async command loading
- Auto-generated usage and help
- Under active development (v0.1.6 as of early 2025)

```js
#!/usr/bin/env node
import { defineCommand, runMain } from "citty";

const main = defineCommand({
  meta: {
    name: "my-cli",
    version: "1.0.0",
    description: "A sample CLI tool",
  },
  args: {
    template: {
      type: "string",
      description: "Template to use",
      default: "default",
    },
  },
  run({ args }) {
    console.log(`Initializing with template: ${args.template}`);
  },
});

runMain(main);
```

#### Choosing a library

- **commander**: Best for traditional, feature-complete CLIs with deep subcommand trees
- **yargs**: Best when you need middleware, validation, and dynamic parsing
- **citty**: Best for modern ESM-first projects in the UnJS ecosystem or when you want async command loading

### Making Scripts Executable

After creating your CLI file, ensure it is executable on Unix systems:

```bash
chmod +x bin/cli.mjs
```

npm handles this automatically during installation, but during development you may need to set the permission manually.

## Tree-Shaking and Bundle Optimization

### The sideEffects Field

The `sideEffects` field tells bundlers (webpack, rollup, vite, esbuild) whether modules in your package have side effects. When set to `false`, the bundler can safely remove any unused exports.

```json
{
  "sideEffects": false
}
```

#### When to use `false`

- Pure utility libraries (lodash-style)
- Component libraries where each component is self-contained
- Any package where importing a module does not modify global state

#### When to specify an array

If some files do have side effects (e.g., CSS imports, polyfills), list them explicitly:

```json
{
  "sideEffects": ["*.css", "./src/polyfills.js"]
}
```

### Proper ESM Exports for Tree-Shaking

Tree-shaking works by analyzing static `import`/`export` statements. CJS modules use dynamic `require()` which is not statically analyzable, making tree-shaking impossible for CJS.

#### Use named exports, not default exports of objects

```js
// Good: named exports are tree-shakeable
export function formatDate(date) { /* ... */ }
export function parseDate(str) { /* ... */ }

// Bad: default export of an object is NOT tree-shakeable
export default {
  formatDate(date) { /* ... */ },
  parseDate(str) { /* ... */ },
};
```

#### Avoid classes when individual functions suffice

Class methods cannot be individually tree-shaken. If a consumer imports the class, all methods are included.

```js
// Bad for tree-shaking: all methods included even if only one is used
export class DateUtils {
  static formatDate(date) { /* ... */ }
  static parseDate(str) { /* ... */ }
}

// Good for tree-shaking: each function is independently removable
export function formatDate(date) { /* ... */ }
export function parseDate(str) { /* ... */ }
```

### Barrel Files and Their Tradeoffs

A barrel file (`index.js`) re-exports from multiple modules:

```js
// src/index.js
export { formatDate } from "./format.js";
export { parseDate } from "./parse.js";
export { validateDate } from "./validate.js";
```

Barrel files are convenient for consumers but can hinder tree-shaking if `sideEffects` is not set to `false`. Without that flag, the bundler must assume each re-exported module might have side effects and cannot safely remove it.

#### Subpath exports as an alternative to barrel files

Instead of a single barrel file, expose individual modules directly:

```json
{
  "exports": {
    ".": "./dist/index.mjs",
    "./format": "./dist/format.mjs",
    "./parse": "./dist/parse.mjs",
    "./validate": "./dist/validate.mjs"
  }
}
```

This lets consumers import only what they need without relying on barrel file tree-shaking:

```js
// Consumer only loads the format module
import { formatDate } from "my-date-lib/format";
```

### Build Configuration for Tree-Shakeable Output

#### tsup with multiple entry points

```ts
// tsup.config.ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/format.ts",
    "src/parse.ts",
    "src/validate.ts",
  ],
  format: ["esm", "cjs"],
  dts: true,
  splitting: true,
  clean: true,
});
```

The `splitting: true` option enables code splitting, which helps avoid duplicating shared code across entry points.

## Complete package.json Example

A comprehensive example combining the patterns discussed above:

```json
{
  "name": "@scope/my-library",
  "version": "1.0.0",
  "description": "A concise description of what this package does",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      },
      "import": {
        "types": "./dist/index.d.mts",
        "default": "./dist/index.mjs"
      }
    },
    "./utils": {
      "require": {
        "types": "./dist/utils.d.cts",
        "default": "./dist/utils.cjs"
      },
      "import": {
        "types": "./dist/utils.d.mts",
        "default": "./dist/utils.mjs"
      }
    }
  },
  "files": ["dist"],
  "sideEffects": false,
  "engines": {
    "node": ">=18.0.0"
  },
  "scripts": {
    "build": "tsup",
    "check-types": "attw --pack .",
    "check-publish": "publint",
    "prepublishOnly": "npm run build && npm run check-types && npm run check-publish"
  },
  "keywords": ["relevant", "keywords"],
  "author": "Your Name",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/user/repo.git"
  },
  "devDependencies": {
    "@arethetypeswrong/cli": "^0.17.0",
    "publint": "^0.3.0",
    "tsup": "^8.0.0",
    "typescript": "^5.7.0"
  }
}
```

## Pre-Publish Checklist

Before running `npm publish`:

1. Run `npm pack --dry-run` to verify only intended files are included
2. Run `npx publint` to check distribution best practices
3. Run `npx @arethetypeswrong/cli $(npm pack)` to verify TypeScript types resolve correctly
4. Install the tarball in a test project: `npm install ../my-pkg-1.0.0.tgz`
5. Test `import` and `require()` both work in the test project
6. Verify `engines.node` matches your minimum supported version
7. Confirm the version bump follows semver (major for breaking changes)

## Sources

- [Guide to the package.json exports field (Hiroki Osame)](https://hirok.io/posts/package-json-exports)
- [Ship ESM and CJS in one Package (Anthony Fu)](https://antfu.me/posts/publish-esm-and-cjs)
- [TypeScript in 2025 with ESM and CJS npm publishing (Liran Tal)](https://lirantal.com/blog/typescript-in-2025-with-esm-and-cjs-npm-publishing)
- [Building an npm package compatible with ESM and CJS (Snyk)](https://snyk.io/blog/building-npm-package-compatible-with-esm-and-cjs-2024/)
- [Tips for making a CLI-based tool with Node (Kent C. Dodds)](https://kentcdodds.com/blog/tips-for-making-a-cli-based-tool-with-node)
- [Node.js Packages Documentation](https://nodejs.org/api/packages.html)
- [Are The Types Wrong CLI](https://github.com/arethetypeswrong/arethetypeswrong.github.io)
- [citty - Elegant CLI Builder (UnJS)](https://github.com/unjs/citty)
- [Tree-Shaking Reference Guide (Smashing Magazine)](https://www.smashingmagazine.com/2021/05/tree-shaking-reference-guide/)
- [Peer Dependencies in Depth](https://dev.to/icy0307/peer-dependencies-in-depth-1o3b)
- [Tree-shakable library with tsup](https://dorshinar.me/posts/treeshaking-with-tsup)
- [webpack Tree Shaking documentation](https://webpack.js.org/guides/tree-shaking/)
- [Dual Publishing ESM and CJS with tsup (John Reilly)](https://johnnyreilly.com/dual-publishing-esm-cjs-modules-with-tsup-and-are-the-types-wrong)
- [Creating ESM-based shell scripts for Unix and Windows (Dr. Axel Rauschmayer)](https://2ality.com/2022/07/nodejs-esm-shell-scripts.html)
- [The npm Dependency Handbook](https://blog.greenroots.info/the-npm-dependency-handbook-for-you)