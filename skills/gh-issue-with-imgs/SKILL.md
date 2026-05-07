---
name: gh-issue-with-imgs
description: "Create GitHub issues with embedded images via CLI. Uploads images as GitHub release assets and embeds them in the issue body. Use when: (1) Creating an issue that needs screenshots, (2) Programmatically attaching images without browser UI, (3) User says 'issue with images', 'gh issue with imgs', or 'create issue with screenshots'."
user-invocable: true
argument-hint: <owner/repo> <title> --body <body> --img <path> [--img <path>...]
allowed-tools:
  - Bash
  - Read
  - Glob
---

# GitHub Issue with Images

Create GitHub issues with embedded images using release assets as image hosting.

GitHub CLI does not support attaching images to issues natively. This skill works around that by uploading images to a dedicated release, then embedding the asset URLs in the issue body markdown.

## Usage

Arguments: `<owner/repo> <title> --body <body> --img <path> [--img <path>...]`

Multiple `--img` flags supported. If no `--body`, use empty string.

## Process

### Step 1: Parse Arguments

Extract from the skill arguments:

- `owner/repo` (required) - the target repository
- Title (required) - the issue title
- `--body` (optional) - issue body text
- `--img` (one or more) - paths to image files

### Step 2: Ensure Attachments Release Exists

Check for a non-draft release tagged `_attachments` in the repo. Create if missing.

If an old **draft** `_attachments` release exists (from before this fix), delete it first — draft releases don't have tags, so assets uploaded to them return 404 for unauthenticated access.

```bash
# Check if a tagged (non-draft) release exists
gh release view _attachments --repo <owner/repo> 2>/dev/null

# If it doesn't exist, check for and clean up any old draft release named "_attachments"
# (Draft releases have no tag, so we search by title via the API)
OLD_DRAFT_ID=$(gh api repos/<owner/repo>/releases --jq '.[] | select(.draft == true and .name == "_attachments") | .id' 2>/dev/null)
if [ -n "$OLD_DRAFT_ID" ]; then
  gh api -X DELETE repos/<owner/repo>/releases/$OLD_DRAFT_ID
fi

# Create the non-draft release (NOT --draft — draft assets require auth and return 404 for anonymous access)
gh release create _attachments --title "_attachments" --notes "Image attachments for issues. Do not delete." --repo <owner/repo>
```

### Step 3: Upload Images

For each `--img` path, generate a unique filename to avoid collisions, then upload.

```bash
# Generate unique name: timestamp + original filename
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
UNIQUE_NAME="${TIMESTAMP}-$(basename <path>)"

# Upload
gh release upload _attachments "<path>#${UNIQUE_NAME}" --repo <owner/repo> --clobber
```

**Important**: The `#name` syntax renames the asset on upload. Use `--clobber` to overwrite if name collision occurs.

If `gh release upload` does not support the `#name` rename syntax, copy the file to a temp location with the unique name instead:

```bash
TMPFILE="/tmp/${UNIQUE_NAME}"
cp "<path>" "$TMPFILE"
gh release upload _attachments "$TMPFILE" --repo <owner/repo> --clobber
rm "$TMPFILE"
```

### Step 4: Get Asset URLs

Fetch the download URLs for uploaded assets.

```bash
gh api repos/<owner/repo>/releases/tags/_attachments \
  --jq '.assets[] | select(.name == "<UNIQUE_NAME>") | .browser_download_url'
```

### Step 5: Build Issue Body

Append image markdown to the body:

```markdown
<original body text>

![<filename>](<asset_url>)
```

For multiple images, add each on its own line.

### Step 6: Create the Issue

```bash
gh issue create \
  --repo <owner/repo> \
  --title "<title>" \
  --body "$(cat <<'EOF'
<constructed body with embedded images>
EOF
)"
```

Print the created issue URL.

## Notes

- The `_attachments` release is a real (non-draft) release so asset URLs are publicly accessible without authentication
- Never use `--draft` — draft release assets return 404 for unauthenticated requests (e.g., Claude API vision, curl), even though they appear to work in browsers where the user is logged in
- Asset URLs are permanent as long as the release exists
- Works for both public and private repos (private repo assets require authentication to view)
- Image size limit: same as GitHub release assets (2 GB per file)
- Supported formats: any image format (png, jpg, gif, svg, webp, etc.)
