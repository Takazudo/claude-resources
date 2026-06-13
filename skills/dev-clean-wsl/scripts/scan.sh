#!/usr/bin/env bash
# Read-only WSL disk scan. Measures reclaimable caches and orphaned build dirs,
# locates the WSL ext4.vhdx on the Windows side, and contrasts the Linux ext4
# filesystem against the Windows C: drive (the distinction that matters on WSL2:
# freeing space inside WSL does NOT shrink the vhdx until it is compacted from Windows).
#
# Deletes nothing. Prints sections that the calling agent turns into a confirm-table.
#
# Usage: scan.sh [CODE_ROOT]
#   CODE_ROOT: directory to scan for node_modules / orphaned target dirs.
#              Defaults to $HOME/repos if present, else $HOME.

set -uo pipefail
HOME_DIR="${HOME:?}"
CODE_ROOT="${1:-}"
if [ -z "$CODE_ROOT" ]; then
  if [ -d "$HOME_DIR/repos" ]; then CODE_ROOT="$HOME_DIR/repos"; else CODE_ROOT="$HOME_DIR"; fi
fi

hr() { printf '\n========== %s ==========\n' "$1"; }
sz() { du -xsh "$1" 2>/dev/null | cut -f1; }   # size of one path, stay on one fs

# --- environment sanity -------------------------------------------------------
hr "ENVIRONMENT"
if grep -qiE "microsoft|wsl" /proc/version 2>/dev/null; then
  echo "WSL: yes ($(grep -oiE 'microsoft[^ ]*' /proc/version | head -1))"
else
  echo "WSL: NO — this looks like a non-WSL Linux/host. The cache-purge sections still"
  echo "apply, but the vhdx/compaction guidance at the end does NOT. Confirm before use."
fi
echo "CODE_ROOT for repo scans: $CODE_ROOT"

# --- filesystem usage: Linux ext4 vs Windows C: -------------------------------
hr "DISK USAGE (the key WSL2 distinction)"
echo "--- Linux root (/) — the ext4 filesystem inside WSL ---"
df -h / 2>/dev/null
if [ -d /mnt/c ]; then
  echo "--- Windows C: (/mnt/c) — the drive that physically holds the vhdx ---"
  df -h /mnt/c 2>/dev/null
  echo "NOTE: if C: is near-full but / looks fine, the real problem is the Windows"
  echo "drive. Purging inside WSL only helps after the vhdx is compacted (see end)."
fi

# --- locate the ext4.vhdx on the Windows side ---------------------------------
hr "WSL vhdx LOCATION + SIZE (for the compaction step)"
found_vhdx=0
for g in \
  /mnt/c/Users/*/AppData/Local/wsl/*/ext4.vhdx \
  /mnt/c/Users/*/AppData/Local/Packages/*/LocalState/ext4.vhdx \
  /mnt/c/Users/*/AppData/Local/Docker/wsl/*/ext4.vhdx ; do
  [ -e "$g" ] || continue
  found_vhdx=1
  # ls -lah size is the on-disk vhdx size as Windows sees it
  printf '%s\n' "$(ls -lah "$g" 2>/dev/null | awk '{print $5"\t"$9}')"
done
[ "$found_vhdx" = 0 ] && echo "(no ext4.vhdx found under common paths — distro may store it elsewhere;"
[ "$found_vhdx" = 0 ] && echo " find it on Windows with: (Get-ChildItem -Recurse \$env:LOCALAPPDATA -Filter ext4.vhdx) )"

# --- top consumers in home ----------------------------------------------------
hr "TOP HOME CONSUMERS (du --max-depth=1, may take ~1 min)"
du -xh --max-depth=1 "$HOME_DIR" 2>/dev/null | sort -rh | head -20

# --- cargo --------------------------------------------------------------------
hr "CARGO — target dir(s), incremental cache, registry"
CARGO_HOME_DIR="${CARGO_HOME:-$HOME_DIR/.cargo}"
active_target="${CARGO_TARGET_DIR:-}"
cfg=""
for c in "$CARGO_HOME_DIR/config.toml" "$CARGO_HOME_DIR/config"; do
  [ -f "$c" ] && cfg="$c" && break
done
if [ -z "$active_target" ] && [ -n "$cfg" ]; then
  active_target="$(grep -E '^[[:space:]]*target-dir' "$cfg" 2>/dev/null | head -1 | sed -E 's/.*=[[:space:]]*"?([^"]*)"?.*/\1/')"
fi
if [ -n "$active_target" ]; then
  echo "ACTIVE target-dir (all builds write here): $active_target  [$(sz "$active_target")]"
  for sub in debug/incremental release/incremental debug/deps release/deps; do
    [ -d "$active_target/$sub" ] || continue
    case "$sub" in
      *incremental) note="pure incremental cache — safe to wipe, only slows the next build" ;;
      *deps)        note="compiled deps — biggest chunk; only cargo clean / rm reclaims it (forces a cold rebuild)" ;;
    esac
    echo "  - $sub  [$(sz "$active_target/$sub")]  ($note)"
  done
else
  echo "No global target-dir redirect (env or $cfg). Each project builds into its own ./target."
fi
echo "registry cache: $CARGO_HOME_DIR/registry  [$(sz "$CARGO_HOME_DIR/registry")]"
for sub in src cache index; do
  [ -d "$CARGO_HOME_DIR/registry/$sub" ] && echo "  - registry/$sub  [$(sz "$CARGO_HOME_DIR/registry/$sub")]  (src+cache re-fetched on demand; keep index to avoid slow refresh)"
done

echo "--- in-repo target/ dirs under $CODE_ROOT (ORPHANED if a redirect is active above) ---"
while IFS= read -r t; do
  [ -e "$t/CACHEDIR.TAG" ] || [ -d "$t/debug" ] || [ -d "$t/release" ] || continue
  newest=$(find "$t" -maxdepth 2 -type f \( -name '*.rlib' -o -name '*.d' \) -printf '%TY-%Tm-%Td\n' 2>/dev/null | sort -r | head -1)
  echo "  $t  [$(sz "$t")]  newest-artifact:${newest:-?}"
done < <(find "$CODE_ROOT" -maxdepth 4 -type d -name target -prune 2>/dev/null)

# --- pnpm ---------------------------------------------------------------------
hr "PNPM — store versions (old versions are orphaned; prune only touches the active one)"
pstore="$(pnpm store path 2>/dev/null)"
if [ -n "$pstore" ]; then
  echo "active store: $pstore"
  parent="$(dirname "$pstore")"
  active_ver="$(basename "$pstore")"
  for v in "$parent"/*; do
    [ -d "$v" ] || continue
    tag="orphaned (safe to rm)"; [ "$(basename "$v")" = "$active_ver" ] && tag="ACTIVE (use: pnpm store prune)"
    echo "  $(basename "$v")  [$(sz "$v")]  $tag"
  done
else
  echo "(pnpm not found)"
fi

# --- npm ----------------------------------------------------------------------
hr "NPM — cache"
[ -d "$HOME_DIR/.npm" ] && echo "$HOME_DIR/.npm  [$(sz "$HOME_DIR/.npm")]  (npm cache clean --force)" || echo "(no ~/.npm)"
[ -d "$HOME_DIR/.npm/_cacache" ] && echo "  - _cacache  [$(sz "$HOME_DIR/.npm/_cacache")]"

# --- node_modules aggregate ---------------------------------------------------
hr "NODE_MODULES — reinstallable; clear idle projects' copies"
nm_dirs=$(find "$CODE_ROOT" -maxdepth 5 -type d -name node_modules -prune 2>/dev/null)
if [ -n "$nm_dirs" ]; then
  echo "aggregate: $(du -xsch $nm_dirs 2>/dev/null | tail -1 | cut -f1)  across $(printf '%s\n' "$nm_dirs" | wc -l) dirs"
  echo "largest:"
  du -xsh $nm_dirs 2>/dev/null | sort -rh | head -10
else
  echo "(none found under $CODE_ROOT)"
fi

hr "SCAN COMPLETE"
echo "Reminder: nothing was deleted. Freeing space inside WSL does not shrink the"
echo "vhdx until it is compacted from Windows (see the skill's compaction step)."
