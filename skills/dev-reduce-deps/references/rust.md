# Rust / Cargo

Contents: [Detector](#detector) · [False positives](#false-positive-classes) · [Investigation commands](#investigation-commands) · [Verification](#verification-commands) · [Regression guard](#regression-guard)

## Detector

```bash
cargo install cargo-machete --locked
cargo machete --with-metadata
```

`--with-metadata` makes it read `[package.metadata.cargo-machete]` ignore lists — pass it everywhere,
or the documented false positives come back on every run.

It compares declarations against `use` statements, so it is fast and needs no build. It is the right
default. `cargo-udeps` is the heavier alternative — it works from real compilation output and catches
more, but requires a nightly toolchain and a full build.

Confirm every hit by hand before removing. Grep the entire crate — `src/`, `tests/`, `benches/`,
`examples/`, and `build.rs` — for both the crate name and its underscored form (`serde_yaml` vs
`serde-yaml`; `use foo::`, `foo::bar()`, and a bare `extern crate foo`).

## False-positive classes

Each of these has produced a wrong "unused" report in a real audit.

### `build.rs` is invisible to the detector

`cargo-machete` does not parse `build.rs`, so it flags **every** `[build-dependencies]` entry. In one
workspace it reported `flate2`, `tar`, `hex`, and `zfb-binfetch` as unused; all four were used in
`build.rs` to download and extract a binary.

Suppress them at the source, with the reason recorded — a bare ignore list decays into a mystery:

```toml
[package.metadata.cargo-machete]
# [build-dependencies] used in build.rs; cargo-machete does not parse build.rs
# and reports them as unused. Verified used: flate2/tar (tarball extraction),
# hex (digest encoding).
ignored = ["flate2", "tar", "hex"]
```

A dep needed by `build.rs` **stays in the lockfile regardless** of what the runtime crates do — which
often makes replacing it in runtime code a zero-payoff exercise. Check `build.rs` before proposing any
removal that claims a package-count win.

### A dep can be named only in a `[features]` block

`dep:foo` in a `[features]` table is a real reference with zero `use` statements behind it. Read every
`[features]` block in the workspace before removing anything; an optional dependency wired to a
feature flag has no call site until that feature is on.

### `required-features` targets are skipped by `--all-targets`

A `[[test]]` or `[[bin]]` carrying `required-features = ["x"]` is **not built** by
`cargo build --workspace --all-targets`. A removal can break one and every default check stays green.

Enumerate them (`grep -rn 'required-features' --include=Cargo.toml .`) and check each explicitly:

```bash
cargo nextest run -p <crate> --features <feature>
cargo check -p <crate> --features <feature> --bin <exact-bin-name>
```

Name the bin explicitly. A bare `--tests` is ambiguous about which gated targets it covers.

### Feature unification hides changed resolution

Removing a dead direct declaration can change which features a crate ends up with, because the
workspace was unifying features across the removed edge. `cargo build` will not tell you. Diff
`cargo tree -e features` against the baseline — that is the only view where this shows up.

### `cfg`-gated and platform-specific code

A dep used only under `#[cfg(windows)]` or `#[cfg(target_arch = "wasm32")]` looks unused when building
for the host. Grep for the crate name independent of `cfg` before concluding anything, and check
whether CI actually builds the platform in question — a platform that ships without a CI leg makes any
regression there invisible.

## Investigation commands

```bash
# Who pulls this dep? Are we the only consumer (so removal is a real graph win)?
cargo tree --workspace -i <dep> --depth 1

# Feature-edge view — the baseline oracle for Step 3, and the diff target for Step 6.
cargo tree -e features --workspace
cargo tree -e features -p <crate> --no-default-features   # the minimal-feature lane

# Multi-version detection.
cargo tree --workspace --duplicates

# Package count — the honest headline metric.
grep -c '^\[\[package\]\]' Cargo.lock
```

On duplicates, separate what is **yours to fix** (two of your crates on different majors of the same
dep) from what is **dictated upstream** (a large framework pinning its own line). Recording which is
which stops the next audit from re-investigating the unfixable half.

## Verification commands

```bash
cargo build --workspace --all-targets
cargo clippy --workspace --all-targets -- -D warnings
cargo nextest run --workspace          # or: cargo test --workspace
cargo test --workspace --doc           # nextest does not run doctests
```

Then the lanes a default build skips — the minimal-feature build (`--no-default-features`), each
alternate compile target (`wasm32-unknown-unknown` and friends), and every `required-features` target
from above. A dependency removal that only breaks one feature combination is the normal failure here,
not the exotic one.

If a new dep was added as part of a swap, run `cargo deny check` and report the transitive-package and
license delta. Trading one dep for another that drags in twelve is not a reduction.

## Regression guard

Wire the detector into the existing local pre-push script and the existing CI job:

- Pin an exact version (`cargo install cargo-machete --locked --version X.Y.Z`) so the gate cannot
  change under you.
- Invoke it as `cargo machete --with-metadata`.
- Have the local step **skip rather than fail** when the binary is absent, so a fresh clone is not
  blocked.
- Test both paths — installed and absent — before declaring the guard done.

Add it to a job that already runs. Introducing a new *required* check is a governance change, and a
required check that later stops running blocks unrelated work indefinitely.
