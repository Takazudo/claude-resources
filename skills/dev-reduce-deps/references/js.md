# JS / npm / pnpm

Contents: [Detectors](#detectors) · [False positives](#false-positive-classes) · [Deps the lockfile does not cover](#deps-the-lockfile-does-not-cover) · [Free wins](#free-wins-before-any-manifest-edit) · [Investigation](#investigation-commands) · [Verification](#verification-commands) · [Publishable packages](#publishable-packages-are-different)

## Detectors

```bash
pnpm dlx knip          # richer: unused files, exports, and deps
pnpm dlx depcheck      # narrower: unused deps only
```

Neither needs installing — `dlx`/`npx` is the right call for a tool run a few times a year.

**Both are noisy on peer-dependency-heavy projects**, for the structural reason below: a dep that
exists purely so a *different* package can resolve it has no import anywhere in your source, which is
indistinguishable from genuinely dead to any static checker.

So a legitimate outcome of the JS half of an audit is **"do not wire a checker here, and here is
why"** — a gate that cries wolf on load-bearing deps trains everyone to ignore it. Say so in the
report rather than adding a noisy check for symmetry with the Rust side.

## False-positive classes

The first two are the expensive ones. Both have caused real "unused" reports on deps whose removal
breaks the build.

### Optional peerDependencies of an upstream package

A package can declare **optional peers** — deps you install to opt into its features. Nothing in your
source imports them, so every checker and every grep says unused. Removing them silently disables the
feature, and usually not at build time.

Read the upstream package's `peerDependencies` / `peerDependenciesMeta` before removing anything that
looks unused:

```bash
# What does the lockfile record as this package's peers?
grep -n "'<package-name>@" -A 40 pnpm-lock.yaml | grep -A 25 peerDependencies

# Or read the installed manifest directly.
cat node_modules/<package>/package.json | python3 -m json.tool | head -60
```

In one audit, six deps (`diff`, `katex`, `zod`, `preact`, and two first-party packages) were all
optional peers of a single docs framework. Every checker called them unused; all six were deliberate
feature opt-ins.

### Undeclared peers — imported by upstream runtime code

Worse than the above: a package whose *runtime code* imports something it never declared. Your
top-level declaration is the only reason resolution succeeds. Nothing in your source references it,
and the upstream manifest does not either.

These surface only in **generated output**, not the source tree:

```bash
# Grep the built bundle, not src/.
grep -l "<dep-name>" dist/**/*.js .*-build/*.mjs 2>/dev/null
```

Three deps in one project (`mermaid`, `minisearch`, `remark-cjk-friendly`) were found this way and
nowhere else. Removing any of them would have broken the docs build with a resolution error at
runtime.

Once identified, record them in a comment — but note `package.json` **cannot carry comments**, so the
note goes in the project's `CLAUDE.md` or the `DEPENDENCIES.md` register.

### Deps consumed by config, scripts, or CI rather than imports

A dep referenced only from a `scripts` entry, a `.config.*` file, a CI workflow, or a git hook has no
import statement. Before removing, grep beyond the source tree:

```bash
grep -rn "<dep>" package.json .github/ scripts/ *.config.* .*rc* 2>/dev/null | grep -v node_modules
```

A binary invoked as a CLI (`html-validate`, `playwright`, a formatter) is the usual shape.

### Usage that exists on another branch

`git grep` reads the branch you are standing on. A repo with a long-lived accumulation branch — a
drafting branch for unpublished content, a release-candidate branch, a feature base — can have zero
call sites on your branch and live ones a merge away.

```bash
# Search every branch, not just the checked-out one.
git grep -l "<Component\|from 'dep'" $(git for-each-ref --format='%(refname:short)' refs/remotes/origin)
```

A diagramming library once passed every check on the working branch — 0 of 439 content files used it —
while three live call sites sat in finished drafts on the repo's documented drafting branch. The
removal was correct for that branch and wrong for the project. Where a project's own docs describe such
a branch (this one's `CLAUDE.md` did), read that before trusting a content-usage count.

### Used but NOT declared — phantom deps hoisting hides

Audits look for declared-but-unused. The opposite is just as real and strictly more dangerous: code
that **imports a package the manifest never declares**, resolving only because a hoisting setting
(`shamefullyHoist`, `publicHoistPattern`, npm's flat `node_modules`) happens to place it at the top
level. It works until the package that actually pulls it drops or moves it — then it fails as
`MODULE_NOT_FOUND`, at whatever moment that dep's own tree changes.

```bash
# Every bare specifier imported from first-party code, normalised to package names.
git ls-files '*.ts' '*.tsx' '*.js' '*.mjs' '*.cjs' \
  | xargs grep -ohE "from '[^.@/][^']*'|from '@[^/]+/[^']+'" 2>/dev/null \
  | sed "s/^from '//; s/'$//" \
  | grep -E '^(@[a-z0-9._-]+/)?[a-z0-9._-]+' \
  | sed 's|^\(@[^/]*/[^/]*\).*|\1|; s|^\([^@/]*\)/.*|\1|' \
  | sort -u
```

Diff that against the declared set, then subtract three benign classes before you have a finding:
**Node builtins** (`fs`, `path`, `node:*`), **tsconfig `paths` aliases** (`@lib/*`, `@components/*` —
they look scoped but resolve locally), and **`@types/*`-backed type-only imports** (`hast`, `mdast`),
whose declaration is the `@types` package. Without those subtractions the list is mostly noise; with
them, what remains is short and each entry is real.

One audit found a script sitting on the **T1 CI gate path** importing `chalk` with no declaration
anywhere — one upstream refactor away from breaking every PR check in the repo.

A related shape: the **swapped declaration**, where a manifest declares a *neighbouring* package rather
than the one its config names. Three packages there declared `postcss` while their `postcss.config.js`
loaded `@tailwindcss/postcss` — again resolving only through hoisting. Read what the config actually
loads, not what the manifest says.

Report these as findings even though they are additions rather than removals. An audit that tightens
hoisting without fixing them turns a latent break into an immediate one.

### Deps that implement a declared support policy

Some deps exist to satisfy a policy the project states elsewhere: a `browserslist`, a Node engines
floor, a locale or currency list. Removing one is a **policy change wearing hygiene's clothes** — and
the diff looks identical either way.

```bash
npx --no-install browserslist        # what the configured query ACTUALLY resolves to
```

An audit called a prefixer's remaining output "extinct browsers"; the configured query resolved
`kaios 2.5`, `kaios 3.0-3.1` and `op_mini all`, which genuinely need those prefixes. Removing it for a
two-package win would have silently narrowed stated browser support.

The fix is not to keep the dep forever — it is to **change the policy first, explicitly**, and let the
dep removal follow as a consequence. Narrowing the policy is a product decision and belongs to a human.

### Single-file components the detector cannot parse

`depcheck` and `knip` read `.js` / `.ts` / `.tsx`. They do **not** parse `.svelte` or `.vue` single-file
components, so a dependency imported only from a component's `<script>` block is reported unused with
full confidence.

```bash
# Always re-grep a detector's "unused" list against component files before believing it.
grep -rn "<dep>" --include='*.svelte' --include='*.vue' src/
```

In one workspace this was the single largest false-positive source: six packages each reported four
unused deps (a date library, a lodash build, and two first-party component packages), and every one had
live call sites in `.svelte` files.

### Plugins named as strings inside a bundler config

A bundler config that passes a plugin **by name** rather than by import is invisible twice over — there
is no import statement to grep, and the detector sees only a string literal:

```js
babel({ babelHelpers: 'runtime', plugins: ['@babel/plugin-transform-runtime'] })
```

The bundler `require`s that name at build time, so the package is load-bearing. Its paired runtime
helper (`@babel/runtime` here) can look *doubly* dead — no import anywhere **and** zero references in
the built bundle — and still break the build when removed.

```bash
# Grep configs for quoted package names, not just import statements.
grep -rnoE "['\"](@[a-z0-9-]+/)?[a-z0-9@/-]*(plugin|preset|loader|transform)[a-z0-9@/-]*['\"]" \
  --include='*.config.*' --include='.*rc*' . | grep -v node_modules
```

Read every bundler, test-runner, and linter config — not just the tool's own dotfile.

### Binary name is not package name

A scan of `scripts` entries for undeclared commands will flag binaries whose providing package has a
different name — `sirv` ships from `sirv-cli`, `tsc` from `typescript`, `zfb` from a scoped package.

```bash
# Resolve a binary back to its package before calling it undeclared.
node -e "for (const p of process.argv.slice(1)) { try { const m = require(p + '/package.json'); console.log(p, JSON.stringify(m.bin)) } catch {} }" <pkg>...
# Or just look at what pnpm linked:
ls -l node_modules/.bin/<binary>
```

Without this mapping the scan's real findings drown in noise, and the noise trains you to skip it.

### Types packages and transitive-only resolution

`@types/*` entries have no runtime import and are consumed by the compiler. A dep that resolves today
only because another package hoists it will break the moment that package changes — the same
transitive-is-not-your-surface rule as Rust.

## Deps the lockfile does not cover

`pnpm install --frozen-lockfile` guarantees reproducibility for **declared** dependencies. It
guarantees nothing about a tool a script shells out to. `pnpm dlx <tool>` and `npx <tool>` resolve
`latest` from the registry **at run time** — not in the lockfile, not in `pnpm audit`, not reviewed,
and not pinned. On a build machine with deploy credentials, that is an unaudited package executing
inside your release.

So an audit that reads only `dependencies` blocks has not audited the build. Read the scripts too:

```bash
# Every unpinned tool invocation across manifests, hooks, CI, and helper scripts.
grep -rnoE '(pnpm dlx|npx)( +-y| +--no-install)?( +--package=[^ ]+)* +[@a-zA-Z0-9._/-]+' \
  --include='*.json' --include='*.yml' --include='*.yaml' --include='*.sh' --include='*.js' . \
  | grep -v node_modules
```

Then walk the **deploy path specifically** — follow the CI/host build command through every script it
calls. One project's production build ran a frozen install and then fetched three unpinned tools
(`cross-env`, `rimraf`, `mkdirp`) from the registry on every deploy.

Three things to check in that output:

1. **Is it on the deploy path?** A `dlx` in a local-only script is a reproducibility annoyance; the
   same call in the release build is supply-chain exposure. Rank accordingly.
2. **Does the name match what the project declares elsewhere?** A bare `npx http-serve` sat beside a
   config using `http-server`; `http-serve` is a real package with four versions, last published years
   earlier, one unfamiliar maintainer. A typo here installs and executes a stranger's code, and no
   manifest-based tool will ever flag it because there is no manifest entry.
3. **Does a gate run an unpinned copy of a tool the manifest already pins?** A pre-commit hook and a
   pre-push script both invoking the formatter via `dlx` while the manifest pins it means the gates
   enforce a version nobody chose, and drift shows up as unrelated formatting churn.

The fix is usually **declare and `pnpm exec`**, not a rewrite — it costs one manifest line, puts the
tool in the lockfile and in `pnpm audit`, and removes a network fetch from the build. Reach for a
native replacement only where the tool is trivially replaceable by the standard library *and* the repo
already has precedent for it (a `rimraf` + `mkdirp` pair becoming one `fs.rm` / `fs.mkdir` script is
well inside the abandon rule; a process supervisor is not).

**The standing rule: anything a `scripts` entry, git hook, or CI step invokes gets installed and
pinned as a declared dep; `npx` / `pnpm dlx` is for interactive human-run one-shots only** —
scaffolding (`pnpm create …`), an occasional `depcheck` or `license-checker` typed by hand. Those
one-shots never belonged in the manifest, and everything else does. The direction matters: an audit
converts dlx'd script tools *into* declared deps, never the reverse — un-installing a tool to `dlx`
it shrinks the visible dependency count while trading a pinned, locked, auditable dep for an unpinned
network fetch at commit or build time. (A retired skill, `dev-npxify`, automated exactly that reverse
trade; do not resurrect the idea.)

## Free wins before any manifest edit

Run these first. They cost nothing, need no judgment, and they make every later package-count claim
measured against an honest baseline.

```bash
pnpm dedupe --check     # non-mutating: reports what would collapse
```

Caret ranges get frozen at whatever they first resolved to, so a lockfile accumulates duplicate
version lines long after the ranges would unify. One repo shed **18 packages with zero manifest edits
and zero behavior change**; the biggest block came from a `@types/*` package whose own runtime
dependencies were pinned a minor behind the real tool, forking thirteen packages of that tool's
internals.

Measure it honestly — run `dedupe`, count the lockfile's package entries before and after, then restore
the lockfile if you are still in the planning phase:

```bash
cp pnpm-lock.yaml /tmp/lock-baseline.yaml
pnpm dedupe && git diff --stat pnpm-lock.yaml
git checkout -- pnpm-lock.yaml      # planning only; keep it when you mean to ship it
```

While you are reading every manifest anyway, check the `name` fields for collisions. Two sibling
packages sharing a name makes `pnpm --filter <name>` ambiguous and silently picks one:

```bash
find . -name package.json -not -path '*/node_modules/*' \
  | xargs -I{} node -p "require('./{}').name + ' {}'" 2>/dev/null | sort \
  | awk '{c[$1]++; l[$1]=l[$1] $0 ORS} END {for (n in c) if (c[n]>1) printf "%s", l[n]}'
```

## Investigation commands

```bash
# Every manifest in the workspace — monorepos hide deps in packages/*.
find . -name package.json -not -path '*/node_modules/*' -not -path '*/dist/*'

# Who depends on this, and why is it installed?
pnpm why <dep>

# Read one manifest's dependency fields compactly.
node -e "const p=require('./package.json');console.log(JSON.stringify({deps:p.dependencies,dev:p.devDependencies,peer:p.peerDependencies,opt:p.optionalDependencies},null,1))"
```

Measure the **production-reachable** share before prioritising — it reframes the whole audit:

```bash
# Unique packages reachable from production deps, vs the lockfile total.
pnpm list --prod --depth Infinity --json > /tmp/prod.json   # then count unique name@version
```

One repo carried 1,247 lockfile packages of which **384 were production-reachable** — so ~70% was dev
tooling. That does not make the dev tail safe (it executes on developer machines and in CI, where the
deploy credentials live) but it does change what "reduce our dependencies" should mean, and it is worth
stating in the report rather than leaving the reader with one big number.

Audit **every** manifest, not just the root. A monorepo's dead weight is usually in a sub-package, and
"we checked the deps" is not true if only the root was checked.

Note deliberate duplication as you go: the same dep pinned in two manifests is often intentional (a
version-pin guard, a package that must install standalone). Record it as deliberate so a future audit
does not "fix" it.

## Verification commands

```bash
pnpm install                 # regenerate the lockfile
pnpm typecheck               # or: tsc --noEmit
pnpm test
pnpm build                   # per-package where a workspace root script does not cover it
pnpm audit --prod --audit-level=high
```

Run the **build**, not just tests — the undeclared-peer class above fails at bundle time, which a unit
test suite never reaches.

If the project has a lockfile-drift or version-pin check, run it too; removing a dep changes the
lockfile shape those guards read.

## Publishable packages are different

A dep in the `dependencies` of a **published** package is downstream supply-chain surface, not just
your build. Removing one is a breaking change for consumers if anything imported it.

Treat published-package `dependencies` as a separate, higher-bar workstream: audit and report them,
but do not remove them in the same pass as internal cleanup. `devDependencies` on a published package
are not shipped and can be treated normally.

The distinction is worth stating explicitly in the report — "publishable-package `dependencies` were
not modified" is exactly the sentence a reviewer needs.
