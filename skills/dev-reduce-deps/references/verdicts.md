# Handled verdicts — accumulated across projects

What previous dependency audits found, so the same investigation is not repeated from scratch.

**A verdict here is evidence, not a rule.** The same dep in a different project has different call
sites, a different platform surface, and a different blast radius. Use an entry to know *what to look
at* and *what bit someone last time* — then verify against the project in front of you. A recorded
REMOVE never authorizes a blind removal; a recorded KEEP never blocks a removal that is genuinely
correct here.

Entries are appended by `scripts/record-verdict.sh` at the end of a run. The Patterns section below is
maintained by hand.

## Patterns

These transfer between projects far better than individual verdicts do.

- **The best dependency removal is often deleting dead code, not swapping a library.** A dep whose
  only consumer is an unwired abstraction is invisible to every detector — the code genuinely imports
  it. Deleting one such struct removed four packages from a lock file. Grep for `#[allow(dead_code)]`,
  unreferenced exports, and "not yet wired up" comments before reaching for library-level changes.
- **Static checkers cannot see `build.rs`.** Every `[build-dependencies]` entry gets reported as
  unused. Always check `build.rs` before believing a Rust detector — and note that a build-dep pins
  the package into the lockfile regardless of runtime use, which often makes a runtime replacement
  worth exactly zero.
- **Deps that exist so *another package* can resolve them look unused to everything.** Optional peers
  and undeclared peers have no import in your source by construction. This is the single most
  expensive false-positive class in JS. Read the upstream manifest and grep the *generated bundle*.
- **A dep pulled transitively is still worth declaring if you import it directly.** Removing the
  declaration to chase a package-count win breaks the day the intermediate package drops it. The axis
  is used vs unused, not free vs costly.
- **"Existing tests pass" does not prove semantic equivalence** when swapping anything with a data
  table behind it — Unicode categories, timezones, locale rules, MIME maps. Tests cover a handful of
  inputs; a table swap changes behavior across a range. Prove it with a differential over the input
  space, or document the accepted behavior change.
- **An umbrella crate swapped for its sub-crate often changes the lockfile by zero packages** when
  something else in the tree still pulls the umbrella. The win can be real anyway (a smaller compile
  graph in a minimal-feature lane) — just describe it accurately.
- **A deprecated-but-load-bearing dep is a decision, not a removal.** Archived upstream does not mean
  broken: if it is feature-complete, widely depended on, and pinned into user-visible behavior, "stay,
  with a named blocker" is a legitimate written outcome.
- **Attack a REMOVE verdict before acting on it; the survivors are the dangerous ones.** In a
  53-verdict audit, three skeptics per verdict (hidden consumption / behavioral fidelity / value vs
  churn) overturned four removals that each looked well-evidenced — including one whose proposed
  replacement rested on a signing claim that was simply false for the protocol involved. Re-reading
  your own reasoning does not find these; a different lens does.
- **`git grep` only sees the branch you are standing on.** A repo with a long-lived drafting or
  release-candidate branch can show zero usage on your branch and live call sites one merge away. A
  diagramming library was "unused in 439 content files" on the working branch and had three live call
  sites on the project's documented drafting branch. Search `refs/remotes/origin/*` before believing a
  usage count of zero.
- **A first-party package retains a dep just as hard as a third-party one.** Before proposing to
  hand-roll a utility, run `pnpm why` / `cargo tree -i`: if anything else pulls it, the rewrite frees
  zero packages and zero supply-chain surface while leaving you owning the code. The org's own lint
  package retained `chalk` and `glob`; a charting library retained `uuid`; the docs framework retained
  the frontmatter parser. Three separate "obvious utility replacements", all worth exactly nothing.
- **Audit the used-but-undeclared direction too.** Code that imports a package the manifest never
  declares resolves only through hoisting and breaks the day its real provider moves. One was found on
  a repo's authoritative CI gate path. This is an addition rather than a removal, and it is the finding
  most likely to bite *because* of a successful audit — tightening hoisting turns it from latent to
  immediate.
- **A dep implementing a declared policy is a policy change, not hygiene.** A prefixer's output looked
  like dead weight for extinct browsers until the configured `browserslist` was actually resolved and
  returned `kaios 2.5` and `op_mini all`. Change the policy explicitly first, then let the dep removal
  follow; never smuggle the policy change in as cleanup.
- **Verify a migration by running it, not by reasoning about it.** The most trustworthy verdict in one
  audit read "6 files / 47 tests pass in 3.92s (baseline 16.5s)" — measured in a scratch copy — and it
  was the only migration nobody re-litigated. Delete the scratch probes afterwards; one run left 14
  untracked files behind after reporting the tree clean.
- **`--frozen-lockfile` does not cover what your scripts shell out to.** A build can install
  reproducibly and then run `pnpm dlx <tool>` / `npx <tool>`, which fetches an unpinned `latest` from
  the registry *at build time* — outside the lockfile, outside `pnpm audit`, unreviewed. One project's
  production deploy path did this three times (`cross-env`, `rimraf`, `mkdirp`) after a carefully
  frozen install. **Audit the `scripts` blocks, hooks, and CI files, not only the `dependencies`
  blocks** — a dependency with no manifest entry is invisible to every manifest-based tool you own.
- **A bare `npx <name>` is where typosquat-shaped risk hides.** The same project's `serve` script ran
  `npx http-serve` while its own Playwright config used `http-server`; `http-serve` is a real package
  with four versions ever, last published years earlier, one unfamiliar maintainer. Nothing flags it,
  because there is no declaration to flag. Diff every bare-invoked tool name against the names the
  project declares elsewhere.
- **Run `pnpm dedupe --check` before proposing any manifest surgery.** Caret ranges get frozen at
  whatever they first resolved to, so a lockfile quietly carries duplicate version lines long after
  the ranges would unify. One repo shed **18 packages with zero manifest edits and zero behavior
  change** this way. It is the cheapest win in the whole audit and it makes every later package-count
  claim measured against an honest baseline.
- **A `@types/*` package can carry runtime dependencies and fork a whole tool's version line.**
  `@types/jest` depends on `expect` and `pretty-format`; a stale resolution held them one minor behind
  the real jest and duplicated thirteen packages. Check the types packages when a tool's internals
  appear at two versions.
- **Detectors do not parse single-file components.** `.svelte` and `.vue` files are opaque to depcheck
  and knip, so any dep used only inside components reads as unused. In one workspace this produced
  four false "unused" verdicts per package across six packages — every one had live call sites.
- **A plugin named as a string inside a bundler config is invisible to imports and detectors alike.**
  `babel({ plugins: ['@babel/plugin-transform-runtime'] })` in a `rollup.config.js` is a string, not an
  import; the bundler `require`s it at build time. The paired runtime helper package looked doubly dead
  — no import, and zero references in the built bundle — and removing either would have broken the
  build. Read the bundler config, not just `babel.config.js` / the tool's own config file.
- **Binary name is not package name.** A scan of script commands flagged bare `sirv` as undeclared in
  27 manifests; the package is `sirv-cli`, which ships that binary. Map binaries to packages before
  believing any undeclared-binary finding, or the scan buries its real hits in noise.
- **An undeclared-peer KEEP expires.** The whole reason for the verdict — upstream's runtime imports a
  package it never declares — is a fact about *one upstream version*. After a refactor the same dep can
  be genuinely dead. Re-verify against the installed manifest and the built output every time; never
  carry the KEEP forward on the strength of the register alone.
- **Duplicate workspace package names are a real defect an audit is well placed to catch.** Two pairs
  of sibling packages shared a `name` field, which makes `--filter <name>` ambiguous and silently picks
  one. You are already reading every manifest — check the names while you are there.
- **A gate that formats with an unpinned tool is not enforcing the version you declared.** A pre-commit
  hook and a pre-push script both ran the formatter via `dlx` while the manifest pinned it; the two
  drift apart the day upstream changes a default, and the diff appears as unrelated churn.

- **Speculative feature flags are quiet weight.** A feature enabled with a comment saying it is
  "unused today but useful later" is a removal with no behavior risk. Grep manifests for
  aspirational comments next to feature lists.

## Verdicts

| Date | Dep | Eco | Verdict | Project | Reason |
| --- | --- | --- | --- | --- | --- |
| 2026-08-30 | `fs2` | rust | REMOVE | zfb | Zero call sites; the code had migrated to a hand-rolled lock and the declaration was orphaned. A sibling file even carried a "why not fs2" comment. |
| 2026-08-30 | `indicatif` | rust | REMOVE | zfb | Only consumer was an unwired `#[allow(dead_code)]` progress-bar struct. Deleting the dead abstraction drops `indicatif` + `console` + `unit-prefix` + `portable-atomic`. |
| 2026-08-30 | `hex` | rust | KEEP | zfb | Directly used at 21 sites AND required by `build.rs`, so it stays in the lockfile no matter what — replacement payoff is exactly zero. Zero-transitive and maintained; hand-rolling it trips the abandon rule. |
| 2026-08-30 | `walkdir` | rust | KEEP | zfb | Directly used; also pulled by `ignore`/`notify`/`syntect`. ~75 call sites for zero package-count payoff, and moving to `ignore` would change walk semantics (gitignore awareness). |
| 2026-08-30 | `owo-colors` | rust | KEEP | zfb | Directly used; also pulled by `oxc-miette`. Zero package-count payoff from replacement. |
| 2026-08-30 | `sourcemap` | rust | KEEP | zfb | Directly used; also pulled by `deno_core`. Canonical Source Map v3 decoder — hand-rolling VLQ decoding is exactly the wrong trade. |
| 2026-08-30 | `serde_path_to_error` | rust | KEEP | zfb | Directly used; also pulled by `axum` at the same version line, so it adds nothing to the graph. |
| 2026-08-30 | `wait-timeout` | rust | KEEP | zfb | Zero transitive deps, maintained, cross-platform. Replacement is a polling loop — abandon trigger 3. |
| 2026-08-30 | `local-ip-address` | rust | KEEP | zfb | Enumerates ALL interfaces; the popular UDP-connect one-liner returns only the primary egress address and is NOT equivalent. Windows ships without a CI leg, so a regression would be invisible. |
| 2026-08-30 | `futures` (umbrella) | rust | REMOVE | zfb | Only `FutureExt` + `stream::{Stream, StreamExt}` used — both in `futures-util`, already present as a dev-dep. Note: lockfile package count unchanged (`deno_core` pulls the umbrella); the win is compile-graph-only in the no-V8 lane. |
| 2026-08-30 | `serde_yaml` | rust | DECIDE | zfb | Archived upstream (`0.9.34+deprecated`) but load-bearing: parses all frontmatter, drives user-facing diagnostics via `Error::location()`, compiles to wasm32, with line/col assertions pinned in tests. Candidates: `serde_yaml_ng`, `serde_yml`, `saphyr`. |
| 2026-08-30 | `unicode_categories` | rust | DECIDE | zfb | Unmaintained since 2018, one call site (directive-name parsing). Any swap needs a scalar-range differential — passing existing tests does not prove Unicode-version equivalence. |
| 2026-08-30 | `pagefind` | js | REMOVE | zfb | Zero references outside `package.json`. Verify the upstream docs framework does not shell out to its binary before removing. |
| 2026-08-30 | `gray-matter` | js | REMOVE | zfb | Redundant local declaration — already a direct dep of the upstream docs package. Removing it does NOT drop `js-yaml` from the tree, so any override pinned because of it must stay. |
| 2026-08-30 | `diff` / `katex` / `zod` / `preact` | js | KEEP | zfb | Optional `peerDependencies` of `@takazudo/zudo-doc` — installed deliberately to opt into features. Look unused to every checker and to grep. |
| 2026-08-30 | `mermaid` / `minisearch` / `remark-cjk-friendly` | js | KEEP | zfb | Undeclared peers: imported by the upstream package's runtime code, which never declares them. The local declarations are the only reason resolution succeeds. Found only by grepping the generated bundle. |
| 2026-08-30 | `npm-run-all2` | js | KEEP | zfb | Two `run-p` calls. A replacement needs signal forwarding, exit-code propagation, and child cleanup on Ctrl-C — abandon trigger 3. A bad process supervisor is worse than the dep. |
| 2026-08-30 | `jest / @jest/globals` | js | REMOVE | zzmod | Only package in the monorepo still on jest while everything else used vitest; migration verified by running it (6 files / 47 tests green in 3.92s vs 16.5s). Drops ~203 packages — the single largest removable block. |
| 2026-08-30 | `mermaid` | js | KEEP | zzmod | Looked dead: 0 of 439 content files used it on the working branch. Three live call sites existed on the repo's long-lived drafting branch. Branch-scoped usage; grep the other branches. |
| 2026-08-30 | `@imgly/background-removal-node` | js | KEEP | zzmod | Zero imports, ~261MB, sole reason for a native onnxruntime-node postinstall AND an allow-listed high tar advisory — yet load-bearing: an OPTIONAL PEER consumed through a wrapper package on the default code path. |
| 2026-08-30 | `diff` | js | KEEP | zzmod | Zero source imports and the consuming feature was config-disabled, yet build-critical: the docs framework resolves it via a runtime await import() reached through a deliberately static route import. A real build fails UNLOADABLE_DEPENDENCY without it. |
| 2026-08-30 | `@aws-sdk/client-s3` | js | KEEP | zzmod | 23 packages for signed HTTP to one bucket, and a tiny signer was already in the repo — but the proposed replacement's central signing claim was false for S3. devDependency only, so zero production exposure. High risk, low value. |
| 2026-08-30 | `gray-matter` | js | KEEP | zzmod | Different outcome to the zfb row: here the docs framework itself depends on it, so rewriting all 15 consumers frees zero packages AND cannot retire the js-yaml pin that motivated the work. Escalated upstream instead. |
| 2026-08-30 | `chalk / glob` | js | KEEP | zzmod | Retained by the org's OWN lint package, which runs on every CI gate — rewriting 153 call sites frees nothing. Separately, chalk was imported by a gate-path script with no declaration at all (phantom dep via hoisting). |
| 2026-08-30 | `autoprefixer` | js | KEEP | zzmod | Not hygiene: the configured browserslist genuinely resolves kaios 2.5 / kaios 3.0-3.1 / op_mini all, which need the -moz- prefixes it emits. Removing it is a support-policy change and belongs to a human. |
| 2026-08-30 | `papaparse` | js | KEEP | zzmod | Zero-dep single file producing byte-exact CSV for a live storefront importer that cannot be cheaply re-validated. Frees zero packages, so a hand-rolled RFC4180 serializer buys nothing and risks silent data corruption. |
| 2026-08-30 | `fast-xml-parser` | js | REMOVE | zzmod | Its only consumer had been silently broken since a framework migration — it fetched a sitemap path the current builder never emits and threw on the 404 before reaching the parser. Delete script, dep, and its orphaned override. |
| 2026-08-30 | `rss / @types/rss` | js | REMOVE | zzmod | Single consumer emitting 7 channel + 5 item elements; a sibling feed generator in the same repo already hand-rolls XML with a shared escapeXml helper. In-repo precedent makes this consistency, not novelty. |
| 2026-08-30 | `yargs` | js | REMOVE | zzmod | The CLI used no .option() at all — two subcommands and positionals, so process.argv.slice(2) is the whole input. 31-line replacement written and run; ~7 packages. |
| 2026-08-30 | `uuid` | js | REMOVE | zzmod | crypto.randomUUID() covers all four call sites, but note it frees ZERO packages (a charting library retains uuid). Direct-edge hygiene only; do not report it as supply-chain reduction. Needs an explicit node:crypto import to pass lint. |
| 2026-09-01 | `@types/jest` | js | DECIDE | sai | A types package with RUNTIME deps: it pins expect + pretty-format, and a stale lockfile resolution held them at 30.2.0 while jest itself was 30.4.1, forking a 13-package duplicate jest line. No manifest change needed — pnpm dedupe collapses it. |
| 2026-09-01 | `@babel/runtime + @babel/plugin-transform-runtime` | js | KEEP | sai | depcheck called both unused and the built bundle had ZERO @babel/runtime references — yet the plugin is named as a STRING inside rollup.config.js babel({plugins:[...]}) with babelHelpers:"runtime". Babel requires it at build time. Read bundler configs, not just babel.config.js. |
| 2026-09-01 | `date-fns / lodash-es / first-party component packages` | js | KEEP | sai | All reported unused by depcheck across 6 packages; all had live call sites in .svelte files. depcheck and knip do not parse SFCs, so a dep used only in components is unused to every detector. |
| 2026-09-01 | `sirv-cli` | js | KEEP | sai | A script-command scan flagged bare `sirv` as undeclared in 27 manifests. The package is sirv-cli and it ships the sirv binary. Map binary names to packages before believing an undeclared-binary finding. |
| 2026-09-01 | `core-js` | js | KEEP | sai | Reported unused in 9 packages; injected by Babel preset-env useBuiltIns (usage/entry), so it never appears as an import. The declarations were added deliberately by a prior audit to fix exactly this phantom. |
| 2026-09-01 | `pagefind` | js | DECIDE | sai | Zero references in source, config, the whole upstream docs-toolchain tree, and the BUILT output — 8 packages counting its 7 platform binaries. But a sibling project's recorded verdict shows this class flips between upstream versions, so verify with a real docs build + search smoke test, not grep. |
| 2026-09-01 | `minisearch` | js | DECIDE | sai | Recorded as a live UNDECLARED PEER in another project; at the version installed here the upstream package mentions it only in comments and the built output has zero references. An undeclared-peer KEEP expires when upstream refactors — re-verify against the installed version. |
| 2026-09-01 | `cross-env / rimraf / mkdirp (via pnpm dlx)` | js | REMOVE | sai | Not manifest entries at all: the production deploy build ran `pnpm install --frozen-lockfile` and then shelled out to three `pnpm dlx` tools, fetching unpinned latest from the registry at build time, outside the lockfile and outside pnpm audit. Declare-and-exec, or replace with native fs for the two trivial ones. |
| 2026-09-01 | `http-serve` | js | REMOVE | sai | A bare `npx http-serve` in a serve script: real but obscure package (4 versions ever, last publish 2022, single maintainer) one character from the http-server the project's own playwright config uses. No manifest entry, so no manifest audit would ever see it. |
