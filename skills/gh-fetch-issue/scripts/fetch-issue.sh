#!/usr/bin/env bash
set -euo pipefail

# Fetch a single GitHub issue with attachments downloaded locally.
# Usage: fetch-issue.sh <issue-url-or-number> [--repo owner/repo]
#
# Output directory: $HOME/cclogs/{repo-slug}/{date}-issue-{number}/
# Prints the output directory path on success.

usage() {
  echo "Usage: fetch-issue.sh <issue-url-or-number> [--repo owner/repo]" >&2
  exit 1
}

# --- Parse arguments ---
ISSUE_INPUT=""
REPO_OVERRIDE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO_OVERRIDE="$2"
      shift 2
      ;;
    *)
      ISSUE_INPUT="$1"
      shift
      ;;
  esac
done

[[ -z "$ISSUE_INPUT" ]] && usage

# --- Resolve owner/repo and issue number ---
if [[ "$ISSUE_INPUT" =~ ^https://github\.com/([^/]+/[^/]+)/issues/([0-9]+) ]]; then
  REPO="${BASH_REMATCH[1]}"
  ISSUE_NUM="${BASH_REMATCH[2]}"
elif [[ "$ISSUE_INPUT" =~ ^#?([0-9]+)$ ]]; then
  ISSUE_NUM="${BASH_REMATCH[1]}"
  if [[ -n "$REPO_OVERRIDE" ]]; then
    REPO="$REPO_OVERRIDE"
  else
    # Detect from current git remote
    REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner' 2>/dev/null || true)
    if [[ -z "$REPO" ]]; then
      echo "Error: Could not detect repo. Use --repo owner/repo or provide a full URL." >&2
      exit 1
    fi
  fi
else
  echo "Error: Invalid issue reference: $ISSUE_INPUT" >&2
  usage
fi

# --- Prepare output directory ---
REPO_SLUG=$(echo "$REPO" | tr '/' '-' | tr '[:upper:]' '[:lower:]')
DATE_STR=$(date +%Y%m%d)
OUT_DIR="$HOME/cclogs/${REPO_SLUG}/${DATE_STR}-issue-${ISSUE_NUM}"
ASSETS_DIR="${OUT_DIR}/assets"
mkdir -p "$ASSETS_DIR"

# --- Fetch issue data ---
ISSUE_JSON=$(gh issue view "$ISSUE_NUM" --repo "$REPO" --json number,title,body,state,author,createdAt,updatedAt,closedAt,labels,comments)

TITLE=$(echo "$ISSUE_JSON" | jq -r '.title')
STATE=$(echo "$ISSUE_JSON" | jq -r '.state')
AUTHOR=$(echo "$ISSUE_JSON" | jq -r '.author.login')
CREATED=$(echo "$ISSUE_JSON" | jq -r '.createdAt')
UPDATED=$(echo "$ISSUE_JSON" | jq -r '.updatedAt')
CLOSED=$(echo "$ISSUE_JSON" | jq -r '.closedAt // "N/A"')
BODY=$(echo "$ISSUE_JSON" | jq -r '.body // ""')
LABELS=$(echo "$ISSUE_JSON" | jq -r '[.labels[].name] | join(", ") // ""')

# --- Get GitHub auth token for image downloads ---
GH_TOKEN=$(gh auth token 2>/dev/null || true)

# --- Download images and rewrite URLs in content ---
# Processes content string, downloads images, returns rewritten content.
# Handles both user-attachments and legacy repo assets URLs.
process_content() {
  local content="$1"
  local prefix="$2"  # e.g., "body" or "comment-1"

  # Extract GitHub image URLs (user-attachments, legacy repo assets, and githubusercontent)
  local urls
  urls=$(echo "$content" | grep -oE 'https://github\.com/user-attachments/assets/[a-f0-9-]+' || true)
  urls+=$'\n'
  urls+=$(echo "$content" | grep -oE "https://github\.com/${REPO}/assets/[0-9]+/[a-f0-9-]+" || true)
  urls+=$'\n'
  urls+=$(echo "$content" | grep -oE 'https://(private-)?user-images\.githubusercontent\.com/[^ )"]+' || true)

  # Also extract from <img> tags (macOS-compatible, no grep -P)
  local img_urls
  img_urls=$(echo "$content" | sed -nE 's/.*<img[^>]*src="([^"]+)".*/\1/p' || true)

  # Combine and deduplicate
  local all_urls
  all_urls=$(echo -e "${urls}\n${img_urls}" | grep -E '^https://' | sort -u || true)

  local processed="$content"

  while IFS= read -r url; do
    [[ -z "$url" ]] && continue

    # Extract asset ID from URL: strip query string, then get last path segment without extension
    local asset_id
    local url_path
    url_path=$(echo "$url" | sed 's/[?#].*//')  # strip query string
    asset_id=$(basename "$url_path" | sed 's/\.[^.]*$//')  # filename without extension
    [[ -z "$asset_id" ]] && continue

    # Detect extension from URL path, default to png
    local ext
    ext=$(basename "$url_path" | grep -oE '\.[^.]+$' || echo ".png")
    local filename="${prefix}-${asset_id}${ext}"
    local filepath="${ASSETS_DIR}/${filename}"

    # Avoid collisions: append -2, -3, etc. if filename already taken by a different URL
    if [[ -f "$filepath" ]]; then
      local counter=2
      while [[ -f "${ASSETS_DIR}/${prefix}-${asset_id}-${counter}${ext}" ]]; do
        counter=$((counter + 1))
      done
      filename="${prefix}-${asset_id}-${counter}${ext}"
      filepath="${ASSETS_DIR}/${filename}"
    fi

    # Download if not already present
    if [[ ! -f "$filepath" ]]; then
      local http_code="000"
      if [[ -n "$GH_TOKEN" ]]; then
        http_code=$(curl -sL -w '%{http_code}' -o "$filepath" \
          -H "Authorization: token ${GH_TOKEN}" \
          "$url" 2>/dev/null || echo "000")
      fi
      # Retry without auth if failed
      if [[ "$http_code" != "200" ]]; then
        http_code=$(curl -sL -w '%{http_code}' -o "$filepath" \
          "$url" 2>/dev/null || echo "000")
      fi
      if [[ "$http_code" != "200" ]]; then
        rm -f "$filepath"
        echo "  Warning: Failed to download $url" >&2
        continue
      fi
    fi

    # Replace URL in content with local path
    processed=$(echo "$processed" | sed "s|${url}|./assets/${filename}|g")
  done <<< "$all_urls"

  # Convert <img> tags to markdown image syntax
  processed=$(echo "$processed" | sed -E 's/<img[^>]*src="([^"]+)"[^>]*>/![Image](\1)/g')

  echo "$processed"
}

# --- Process body ---
PROCESSED_BODY=$(process_content "$BODY" "body")

# --- Build markdown ---
{
  echo "# ${TITLE}"
  echo ""
  echo "- Issue: ${REPO}#${ISSUE_NUM}"
  echo "- URL: https://github.com/${REPO}/issues/${ISSUE_NUM}"
  echo "- State: ${STATE}"
  echo "- Author: ${AUTHOR}"
  echo "- Labels: ${LABELS}"
  echo "- Created: ${CREATED}"
  echo "- Updated: ${UPDATED}"
  echo "- Closed: ${CLOSED}"
  echo ""
  echo "$PROCESSED_BODY"

  # --- Process comments ---
  COMMENT_COUNT=$(echo "$ISSUE_JSON" | jq '.comments | length')
  if [[ "$COMMENT_COUNT" -gt 0 ]]; then
    echo ""
    echo "## Comments"
    for i in $(seq 0 $((COMMENT_COUNT - 1))); do
      C_AUTHOR=$(echo "$ISSUE_JSON" | jq -r ".comments[$i].author.login")
      C_CREATED=$(echo "$ISSUE_JSON" | jq -r ".comments[$i].createdAt")
      C_BODY=$(echo "$ISSUE_JSON" | jq -r ".comments[$i].body // \"\"")
      PROCESSED_COMMENT=$(process_content "$C_BODY" "comment-${i}")
      echo ""
      echo "### Comment by ${C_AUTHOR} on ${C_CREATED}"
      echo ""
      echo "$PROCESSED_COMMENT"
    done
  fi
} > "${OUT_DIR}/issue.md"

# --- Clean up empty assets dir ---
if [[ -z "$(ls -A "$ASSETS_DIR" 2>/dev/null)" ]]; then
  rmdir "$ASSETS_DIR"
fi

echo "$OUT_DIR"
