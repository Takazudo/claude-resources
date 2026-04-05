---
name: gh-issue-with-imgs
description: "Create GitHub issues with embedded images via CLI. Uploads images as GitHub release assets and embeds them in the issue body. Use when: (1) Creating a GitHub issue that needs screenshots or images attached, (2) Agent needs to programmatically attach images to issues without browser UI, (3) User says 'issue with images', 'gh issue with imgs', or 'create issue with screenshots'."
user-invocable: true
argument-hint: <owner/repo> <title> --body <body> --img <path> [--img <path>...]
allowed-tools:
  - Bash
  - Read
  - Glob
---

# GitHub Issue with Images

Create GitHub issues with embedded images using release assets as image hosting.

GitHub CLI does not support attaching images to issues natively. This skill works around that by uploading images to a draft release, then embedding the asset URLs in the issue body markdown.

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

Check for a draft release named `_attachments` in the repo. Create if missing.

```bash
# Check if release exists
gh release view _attachments --repo <owner/repo> 2>/dev/null

# Create if needed
gh release create _attachments --draft --title "_attachments" --notes "Image attachments for issues. Do not delete." --repo <owner/repo>
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

- The `_attachments` release is a draft so it does not appear in the repo's releases page
- Asset URLs are permanent as long as the release exists
- Works for both public and private repos (private repo assets require authentication to view)
- Image size limit: same as GitHub release assets (2 GB per file)
- Supported formats: any image format (png, jpg, gif, svg, webp, etc.)
