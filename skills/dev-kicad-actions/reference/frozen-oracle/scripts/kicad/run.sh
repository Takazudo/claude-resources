#!/usr/bin/env bash
set -euo pipefail

script_dir=${BASH_SOURCE[0]%/*}
repo_root=$(cd "$script_dir/../.." && pwd -P)
# shellcheck source=scripts/kicad/pin.env
source "$script_dir/pin.env"

usage() {
  printf 'Usage: bash scripts/kicad/run.sh <command> [arguments...]\n' >&2
  printf 'Examples: kicad-cli version | python3 script.py | ngspice -b file.cir\n' >&2
}

if (($# == 0)); then
  usage
  exit 2
fi

version_matches() {
  local actual_version=$1
  [[ $actual_version =~ $KICAD_REQUIRED_VERSION_PATTERN ]]
}

check_version() {
  local actual_version=$1
  if ! version_matches "$actual_version"; then
    printf 'KiCad oracle version mismatch: expected %s, got %s\n' \
      "$KICAD_REQUIRED_VERSION_LABEL" "${actual_version:-<empty>}" >&2
    return 1
  fi
}

run_native() {
  local cli_bin=$1
  shift
  local actual_version
  if ! actual_version=$("$cli_bin" version); then
    printf 'Unable to read the version from KiCad CLI: %s\n' "$cli_bin" >&2
    return 1
  fi
  check_version "$actual_version"
  cd "$repo_root"

  if [[ $1 == kicad-cli ]]; then
    shift
    exec "$cli_bin" "$@"
  fi
  exec "$@"
}

run_docker() {
  local docker_bin=$1
  local home_dir=$2
  shift 2
  "$docker_bin" run --rm --platform linux/amd64 --network none \
    --user "$(id -u):$(id -g)" \
    --volume "$repo_root:/work" \
    --volume "$home_dir:/tmp/kicad-home" \
    --workdir /work \
    --env HOME=/tmp/kicad-home \
    --env XDG_CONFIG_HOME=/tmp/kicad-home/.config \
    --env XDG_CACHE_HOME=/tmp/kicad-home/.cache \
    --env KICAD_CONFIG_HOME=/tmp/kicad-home/.config/kicad/10.0 \
    --env XDG_RUNTIME_DIR=/tmp/kicad-home/.runtime \
    --entrypoint /bin/sh \
    "$KICAD_IMAGE" \
    -c 'mkdir -p "$HOME/.config" "$HOME/.cache" "$HOME/.local/share" "$XDG_RUNTIME_DIR"; chmod 700 "$XDG_RUNTIME_DIR"; exec "$@"' \
    kicad-oracle "$@"
}

run_with_docker() {
  local docker_bin=$1
  shift
  local home_dir
  home_dir=$(mktemp -d "${TMPDIR:-/tmp}/kicad-oracle-home.XXXXXX")
  chmod 700 "$home_dir"
  local cleanup_command
  printf -v cleanup_command 'rm -rf -- %q' "$home_dir"
  trap "$cleanup_command" EXIT

  local actual_version
  if ! actual_version=$(run_docker "$docker_bin" "$home_dir" kicad-cli version); then
    printf 'Unable to start the pinned KiCad Docker oracle (%s).\n' "$KICAD_IMAGE" >&2
    return 1
  fi
  check_version "$actual_version"

  run_docker "$docker_bin" "$home_dir" "$@"
}

if [[ -n ${KICAD_CLI_BIN:-} ]]; then
  if [[ ! -x $KICAD_CLI_BIN ]]; then
    printf 'KICAD_CLI_BIN is set but is not executable: %s\n' "$KICAD_CLI_BIN" >&2
    exit 1
  fi
  run_native "$KICAD_CLI_BIN" "$@"
fi

if docker_bin=$(command -v docker 2>/dev/null); then
  run_with_docker "$docker_bin" "$@"
  exit 0
fi

macos_cli=/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli
if [[ -x $macos_cli ]]; then
  run_native "$macos_cli" "$@"
fi

printf 'KiCad oracle missing: install KiCad 10.0.x, set KICAD_CLI_BIN, or install Docker with the pinned image.\n' >&2
exit 1
