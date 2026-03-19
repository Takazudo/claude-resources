#!/usr/bin/env bash
# Download Node.js standalone binary for Tauri sidecar bundling.
# Places the binary at app/binaries/node-<target-triple> following
# Tauri's externalBin naming convention.

set -euo pipefail

NODE_VERSION="v24.13.0"
ARCH="aarch64"
PLATFORM="darwin"
TARGET_TRIPLE="${ARCH}-apple-${PLATFORM}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BINARIES_DIR="${APP_DIR}/binaries"
OUTPUT="${BINARIES_DIR}/node-${TARGET_TRIPLE}"

URL="https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-darwin-arm64.tar.gz"
EXPECTED_SHA256="d595961e563fcae057d4a0fb992f175a54d97fcc4a14dc2d474d92ddeea3b9f8"

if [[ -f "${OUTPUT}" ]]; then
  echo "Node binary already exists at ${OUTPUT}"
  echo "Delete it first if you want to re-download."
  exit 0
fi

mkdir -p "${BINARIES_DIR}"

TMPDIR_DL="$(mktemp -d)"
trap 'rm -rf "${TMPDIR_DL}"' EXIT

echo "Downloading Node.js ${NODE_VERSION} for macOS arm64..."
curl -fSL --progress-bar "${URL}" -o "${TMPDIR_DL}/node.tar.gz"

echo "Verifying checksum..."
ACTUAL_SHA256="$(shasum -a 256 "${TMPDIR_DL}/node.tar.gz" | cut -d ' ' -f 1)"
if [[ "${ACTUAL_SHA256}" != "${EXPECTED_SHA256}" ]]; then
  echo "ERROR: SHA256 mismatch!"
  echo "  Expected: ${EXPECTED_SHA256}"
  echo "  Actual:   ${ACTUAL_SHA256}"
  exit 1
fi
echo "Checksum OK."

echo "Extracting binary..."
tar -xzf "${TMPDIR_DL}/node.tar.gz" -C "${TMPDIR_DL}" --strip-components=2 "node-${NODE_VERSION}-darwin-arm64/bin/node"

mv "${TMPDIR_DL}/node" "${OUTPUT}"
chmod +x "${OUTPUT}"

echo "Done: ${OUTPUT}"
echo "Size: $(du -h "${OUTPUT}" | cut -f1)"
