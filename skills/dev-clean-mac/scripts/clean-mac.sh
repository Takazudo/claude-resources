#!/usr/bin/env bash
# dev-clean-mac: reclaim disk space on a Mac dev machine by deleting regenerable
# dev caches. Tuned for takazudo's layout (~/repos with myoss/zfb, a shared cargo
# target dir, pnpm/npm caches) but every step is guarded so missing paths are skipped.
#
# Usage:
#   clean-mac.sh                 # dry run: report what WOULD be freed, delete nothing
#   clean-mac.sh --run           # actually delete
#   clean-mac.sh --run --keep-node-modules   # delete caches but keep node_modules
#
# macOS gotcha (the reason this script exists as a script): on APFS, deleting files
# does NOT free space while local Time Machine snapshots still reference the data —
# `df` keeps showing the old number. The final step thins those snapshots; without it
# a multi-GB cleanup looks like it reclaimed nothing.

set -u

RUN=0
KEEP_NODE_MODULES=0
for a in "$@"; do
  case "$a" in
    --run|-y) RUN=1 ;;
    --dry-run) RUN=0 ;;
    --keep-node-modules) KEEP_NODE_MODULES=1 ;;
    -h|--help)
      sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "unknown arg: $a (use --run, --dry-run, --keep-node-modules)"; exit 2 ;;
  esac
done

REPOS="$HOME/repos"
TOTAL_KB=0

hdr()  { printf '\n=== %s ===\n' "$1"; }
free_line() { df -k /System/Volumes/Data | awk 'NR==2{printf "Used: %.1f GiB | Avail: %.1f GiB (%s full)\n",$3/1048576,$4/1048576,$5}'; }

# del_path <path>: measure size, add to running total, and rm -rf it in run mode.
# Refuses anything not under $HOME as a guardrail.
del_path() {
  local p="$1"
  [ -e "$p" ] || return 0
  case "$p" in
    "$HOME"/*) : ;;
    *) printf '  SKIP (outside $HOME): %s\n' "$p"; return 0 ;;
  esac
  local kb hum
  kb=$(du -sk "$p" 2>/dev/null | awk '{print $1}'); [ -z "$kb" ] && kb=0
  hum=$(du -sh "$p" 2>/dev/null | awk '{print $1}')
  TOTAL_KB=$((TOTAL_KB + kb))
  if [ "$RUN" -eq 1 ]; then
    rm -rf "$p" && printf '  removed       %6s  %s\n' "$hum" "$p"
  else
    printf '  would remove  %6s  %s\n' "$hum" "$p"
  fi
}

echo "dev-clean-mac  (mode: $([ "$RUN" -eq 1 ] && echo RUN || echo DRY-RUN))"
hdr "BEFORE"; free_line

# --- Rust / Cargo (zfb is the dominant occupant of the shared target dir) ---
hdr "Rust / Cargo caches"
# Shared CARGO_TARGET_DIR from ~/.cargo/config.toml (falls back to the ~/.cargo-target convention).
cargo_tdir=$(grep -E '^[[:space:]]*target-dir[[:space:]]*=' "$HOME/.cargo/config.toml" 2>/dev/null \
  | head -1 | sed -E 's/.*=[[:space:]]*"?([^"]+)"?[[:space:]]*$/\1/')
[ -z "$cargo_tdir" ] && cargo_tdir="$HOME/.cargo-target"
cargo_tdir="${cargo_tdir/#\~/$HOME}"
del_path "$cargo_tdir"
del_path "$HOME/.cargo/registry"   # downloaded crate sources/index; cargo refetches
# Per-project cargo target dirs (identified by cargo's CACHEDIR.TAG signature, e.g. Tauri src-tauri/target)
if [ -d "$REPOS" ]; then
  while IFS= read -r d; do
    [ -f "$d/CACHEDIR.TAG" ] && del_path "$d"
  done < <(find "$REPOS" -type d -name target -prune 2>/dev/null)
fi

# --- zfb release artifacts & generated build dirs ---
hdr "zfb build artifacts"
for f in "$REPOS"/myoss/zfb/zfb-*.tar.gz; do del_path "$f"; done   # checked-in release tarballs, rebuildable
if [ -d "$REPOS" ]; then
  while IFS= read -r d; do del_path "$d"; done < <(find "$REPOS" -type d -name .zfb-build -prune 2>/dev/null)
fi

# --- node_modules across all repos (reinstallable via pnpm/npm install) ---
if [ "$KEEP_NODE_MODULES" -eq 0 ] && [ -d "$REPOS" ]; then
  hdr "node_modules (all repos)"
  while IFS= read -r d; do del_path "$d"; done < <(find "$REPOS" -type d -name node_modules -prune 2>/dev/null)
else
  hdr "node_modules"; echo "  (kept: --keep-node-modules)"
fi

# --- JS package-manager caches ---
hdr "JS package caches"
del_path "$HOME/Library/Caches/pnpm"
if [ -d "$HOME/.npm/_cacache" ]; then
  del_path "$HOME/.npm/_cacache"   # bulk of the npm cache; `npm cache clean` below tidies the rest
fi

# --- OS / app caches & logs (all regenerate on demand) ---
hdr "OS / app caches & logs"
del_path "$HOME/Library/Caches/ms-playwright"
del_path "$HOME/Library/Caches/electron"
del_path "$HOME/Library/Caches/copilot"
del_path "$HOME/.cache/codex-runtimes"
del_path "$HOME/Library/Logs/Adobe"
del_path "$HOME/Library/Logs/CreativeCloud"

# --- Downloads installers (.dmg/.pkg are re-downloadable; leave other files alone) ---
hdr "Downloads installers"
if [ -d "$HOME/Downloads" ]; then
  while IFS= read -r f; do del_path "$f"; done \
    < <(find "$HOME/Downloads" -maxdepth 1 -type f \( -iname '*.dmg' -o -iname '*.pkg' \) 2>/dev/null)
fi

# --- Tool-driven reclaim (can't pre-measure exactly; only acts in RUN mode) ---
hdr "Tool-driven reclaim (npm / pnpm / brew / simulators)"
if [ "$RUN" -eq 1 ]; then
  command -v npm  >/dev/null 2>&1 && { npm cache clean --force >/dev/null 2>&1 && echo "  npm cache cleaned"; }
  command -v pnpm >/dev/null 2>&1 && { echo "  pnpm store prune..."; pnpm store prune 2>&1 | sed 's/^/    /' | tail -4; }
  if command -v brew >/dev/null 2>&1; then
    brew cleanup -s >/dev/null 2>&1
    bc=$(brew --cache 2>/dev/null); [ -n "$bc" ] && [ -d "$bc" ] && rm -rf "$bc" && echo "  brew cache cleaned"
  fi
  command -v xcrun >/dev/null 2>&1 && { xcrun simctl delete unavailable >/dev/null 2>&1 && echo "  simctl: unavailable simulators deleted"; }
else
  echo "  would run: npm cache clean --force; pnpm store prune; brew cleanup -s; xcrun simctl delete unavailable"
  [ -d "$HOME/Library/pnpm/store" ] && echo "  (pnpm store currently $(du -sh "$HOME/Library/pnpm/store" 2>/dev/null | awk '{print $1}'); prune drops packages no remaining project references)"
fi

# --- Thin local Time Machine snapshots so the freed space actually materializes ---
hdr "Reclaim space held by APFS local snapshots"
if command -v tmutil >/dev/null 2>&1; then
  snaps=$(tmutil listlocalsnapshots / 2>/dev/null | grep -c TimeMachine)
  echo "  local snapshots present: $snaps"
  if [ "$RUN" -eq 1 ]; then
    # Ask the OS to purge up to ~200GB of snapshot-held space at max urgency (4).
    tmutil thinlocalsnapshots / 200000000000 4 2>&1 | sed 's/^/  /'
  else
    echo "  would run: tmutil thinlocalsnapshots / 200000000000 4   (without this, df shows no change on macOS)"
  fi
else
  echo "  tmutil not available (not macOS?) — skipping"
fi

hdr "RESULT"
printf 'Measured removable paths: %.1f GiB\n' "$(echo "$TOTAL_KB" | awk '{print $1/1048576}')"
echo "(plus npm/pnpm/brew/simulator reclaim, which is not pre-measured)"
free_line
if [ "$RUN" -eq 0 ]; then
  echo
  echo "Dry run only — nothing deleted. Re-run with --run to apply."
fi
