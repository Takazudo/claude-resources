#!/usr/bin/env bash
set -euo pipefail

# Upload one or more images to a repo's `_attachments` release and print their
# public download URLs (one per input path, in the same order).
#
# Usage: upload-to-release.sh <owner/repo> <path> [<path> ...]
#
# Why copy-to-temp instead of `gh release upload file#name`:
#   The `#name` suffix only sets the asset's *display label* — the asset `name`
#   (and thus the download URL) stays the sanitized original basename. So two
#   files with the same basename collide. We copy each file to a temp path with
#   a unique, URL-safe basename and upload that, giving a predictable URL.

if [[ $# -lt 2 ]]; then
  echo "Usage: upload-to-release.sh <owner/repo> <path> [<path> ...]" >&2
  exit 1
fi

REPO="$1"
shift

# --- Ensure a non-draft `_attachments` release exists ---
if ! gh release view _attachments --repo "$REPO" >/dev/null 2>&1; then
  # Clean up any old *draft* release named "_attachments" (draft assets 404 for
  # anonymous access because draft releases have no tag).
  OLD_DRAFT_ID=$(gh api "repos/${REPO}/releases" \
    --jq '.[] | select(.draft == true and .name == "_attachments") | .id' 2>/dev/null || true)
  if [[ -n "$OLD_DRAFT_ID" ]]; then
    gh api -X DELETE "repos/${REPO}/releases/${OLD_DRAFT_ID}" >/dev/null
  fi
  gh release create _attachments \
    --title "_attachments" \
    --notes "Image attachments for issues. Do not delete." \
    --repo "$REPO" >/dev/null
fi

TMPDIR_UP=$(mktemp -d)
trap 'rm -rf "$TMPDIR_UP"' EXIT

# A per-run counter keeps names unique even when Date.now-style timestamps
# collide within the same second across multiple files.
COUNT=0
STAMP=$(date +%Y%m%d_%H%M%S)

for SRC in "$@"; do
  if [[ ! -f "$SRC" ]]; then
    echo "Error: file not found: $SRC" >&2
    exit 1
  fi
  COUNT=$((COUNT + 1))

  BASE=$(basename "$SRC")
  # URL-safe basename: replace any char outside [A-Za-z0-9._-] with '_'
  SAFE=$(printf '%s' "$BASE" | LC_ALL=C tr -c 'A-Za-z0-9._-' '_')
  UNIQUE_NAME="${STAMP}-${COUNT}-${SAFE}"

  TMPFILE="${TMPDIR_UP}/${UNIQUE_NAME}"
  cp "$SRC" "$TMPFILE"

  gh release upload _attachments "$TMPFILE" --repo "$REPO" --clobber >/dev/null

  URL=$(gh api "repos/${REPO}/releases/tags/_attachments" \
    --jq ".assets[] | select(.name == \"${UNIQUE_NAME}\") | .browser_download_url")

  if [[ -z "$URL" ]]; then
    echo "Error: uploaded '$SRC' but could not resolve its download URL" >&2
    exit 1
  fi
  echo "$URL"
done
