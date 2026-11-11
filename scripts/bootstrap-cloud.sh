#!/usr/bin/env bash
# Install the Claude cloud profile on a managed host (setup phase). Always installs
# from an export bundle, so only Git-tracked content is ever installed.
set -euo pipefail

usage() {
  printf '%s\n' 'Usage: bootstrap-cloud.sh [--home DIR] [--installed] [--check] [--adopt-checkout-links] [--checkout-root DIR]' \
    'CLAUDE_SETTINGS_SOURCE: export bundle (installed offline) or claude-settings checkout (exported first)' \
    'CLAUDE_SETTINGS_REF: full commit SHA to pin when cloning (default: main)'
}

installer_args=()
installed=false
while (($#)); do
  case $1 in
    --help | -h) usage; exit 0 ;;
    --installed) installed=true; installer_args+=("$1") ;;
    --check | --adopt-checkout-links) installer_args+=("$1") ;;
    --home | --checkout-root)
      (($# >= 2)) || { echo "bootstrap-cloud: $1 needs a value" >&2; exit 2; }
      installer_args+=("$1" "$2"); shift ;;
    --home=* | --checkout-root=*) installer_args+=("$1") ;;
    *) echo "bootstrap-cloud: unsupported option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

command -v python3 >/dev/null || { echo 'bootstrap-cloud: python3 is required' >&2; exit 1; }
if [[ $installed == true ]]; then
  exec python3 "$(dirname -- "${BASH_SOURCE[0]}")/install-cloud-profile.py" "${installer_args[@]}"
fi
provenance=cloud-profile-provenance.json
# Physical path: the exporter rejects symlinked ancestors (macOS TMPDIR is under /var -> /private/var).
stage=$(cd "$(mktemp -d)" && pwd -P)
trap 'rm -rf -- "$stage"' EXIT

export_checkout() {
  python3 "$1/scripts/export-cloud-profile.py" --source "$1" --output "$stage/export"
  bundle=$stage/export
}

source_dir=${CLAUDE_SETTINGS_SOURCE:-}
if [[ -n $source_dir ]]; then
  if [[ -f $source_dir/$provenance ]]; then
    bundle=$source_dir
  elif [[ -e $source_dir/.git ]]; then
    export_checkout "$source_dir"
  else
    echo "bootstrap-cloud: $source_dir is neither an export bundle nor a git checkout" >&2
    exit 1
  fi
else
  command -v git >/dev/null || { echo 'bootstrap-cloud: git is required' >&2; exit 1; }
  ref=${CLAUDE_SETTINGS_REF:-main}
  if [[ -n ${CLAUDE_SETTINGS_REF:-} && ! $ref =~ ^[0-9a-f]{40}$ ]]; then
    echo 'bootstrap-cloud: CLAUDE_SETTINGS_REF must be a full 40-character commit SHA' >&2
    exit 1
  fi
  # Uses platform-provided Git access; never embeds tokens or copies credentials.
  git init -q "$stage/checkout"
  git -C "$stage/checkout" remote add origin https://github.com/Takazudo/claude-settings.git
  git -C "$stage/checkout" fetch -q --depth=1 origin "$ref"
  git -C "$stage/checkout" checkout -q --detach FETCH_HEAD
  if [[ -n ${CLAUDE_SETTINGS_REF:-} && $(git -C "$stage/checkout" rev-parse HEAD) != "$ref" ]]; then
    echo "bootstrap-cloud: fetched revision does not match $ref" >&2
    exit 1
  fi
  export_checkout "$stage/checkout"
fi

python3 "$bundle/scripts/install-cloud-profile.py" --source "$bundle" ${installer_args[@]+"${installer_args[@]}"}
