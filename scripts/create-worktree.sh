#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check dependencies
command -v gh >/dev/null 2>&1 || { echo -e "${RED}Error: gh CLI is not installed${NC}" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo -e "${RED}Error: jq is not installed${NC}" >&2; exit 1; }
command -v git >/dev/null 2>&1 || { echo -e "${RED}Error: git is not installed${NC}" >&2; exit 1; }

# Parse arguments
ISSUE_NUM=$1
REPO=${2:-""}

if [ -z "$ISSUE_NUM" ]; then
  echo "Error: Issue number is required"
  echo "Usage: $0 <issue-number> [repo]"
  exit 1
fi

# Fetch issue details
if [ -n "$REPO" ]; then
  ISSUE_DATA=$(gh issue view "$ISSUE_NUM" --repo "$REPO" --json title,body,number)
else
  ISSUE_DATA=$(gh issue view "$ISSUE_NUM" --json title,body,number)
fi

ISSUE_TITLE=$(echo "$ISSUE_DATA" | jq -r '.title')
ISSUE_BODY=$(echo "$ISSUE_DATA" | jq -r '.body')
ISSUE_NUMBER=$(echo "$ISSUE_DATA" | jq -r '.number')

# Create slug from issue title (limited to ~30 chars for readable directory names)
# 1. Convert to lowercase
# 2. Replace non-alphanumeric with dashes
# 3. Collapse multiple dashes (use -E for extended regex on macOS)
# 4. Trim leading/trailing dashes
# 5. Truncate to max length, ensuring we don't cut mid-word
MAX_SLUG_LENGTH=30
FULL_SLUG=$(echo "$ISSUE_TITLE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed -E 's/-+/-/g' | sed 's/^-//;s/-$//')

# Truncate slug intelligently - cut at word boundary if possible
if [ ${#FULL_SLUG} -gt $MAX_SLUG_LENGTH ]; then
  # Cut at max length
  SLUG="${FULL_SLUG:0:$MAX_SLUG_LENGTH}"
  # If we cut mid-word, try to find the last dash and cut there
  if [[ "${FULL_SLUG:$MAX_SLUG_LENGTH:1}" != "-" && "${FULL_SLUG:$MAX_SLUG_LENGTH:1}" != "" ]]; then
    LAST_DASH=$(echo "$SLUG" | grep -ob '-' | tail -1 | cut -d: -f1)
    if [ -n "$LAST_DASH" ] && [ "$LAST_DASH" -gt 10 ]; then
      SLUG="${SLUG:0:$LAST_DASH}"
    fi
  fi
  # Remove trailing dash if present
  SLUG="${SLUG%-}"
else
  SLUG="$FULL_SLUG"
fi

# Worktree directory name
WORKTREE_NAME="issue-${ISSUE_NUMBER}-${SLUG}"
WORKTREE_PATH="worktrees/${WORKTREE_NAME}"

# Get repo root
REPO_ROOT=$(git rev-parse --show-toplevel)

# Check if package.json has init-worktree script
HAS_SCRIPT=false
if [ -f "$REPO_ROOT/package.json" ]; then
  if jq -e '.scripts["init-worktree"]' "$REPO_ROOT/package.json" > /dev/null 2>&1; then
    HAS_SCRIPT=true
  fi
fi

# Create worktree
cd "$REPO_ROOT"

# Check if worktree already exists
if [ -d "$WORKTREE_PATH" ]; then
  echo -e "${RED}Error: Worktree already exists at $WORKTREE_PATH${NC}"
  echo "Use: git worktree list"
  exit 1
fi

if [ "$HAS_SCRIPT" = true ]; then
  echo "Using project's init-worktree script..."
  pnpm run init-worktree "$WORKTREE_NAME"
else
  echo "Creating worktree with git commands..."

  # Create worktrees directory if it doesn't exist
  mkdir -p worktrees

  # Create the worktree
  git worktree add "$WORKTREE_PATH" -b "$WORKTREE_NAME"
fi

# Full path to worktree
FULL_WORKTREE_PATH="$REPO_ROOT/$WORKTREE_PATH"

# Create __inbox directory in worktree
mkdir -p "$FULL_WORKTREE_PATH/__inbox"

# Create prompt file
PROMPT_FILE="$FULL_WORKTREE_PATH/__inbox/issue-${ISSUE_NUMBER}-prompt-${SLUG}.md"

# Extract GitHub repo path from remote URL
REMOTE_URL=$(git remote get-url origin)
REPO_PATH=$(echo "$REMOTE_URL" | sed -E 's#.*github\.com[:/]([^/]+/[^/]+)(\.git)?$#\1#' | sed 's/\.git$//')

cat > "$PROMPT_FILE" << EOF
# Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}

## Issue Details

**Issue URL**: https://github.com/${REPO_PATH}/issues/${ISSUE_NUMBER}

## Description

${ISSUE_BODY}

## Implementation Notes

<!-- Add your implementation notes here -->

## Testing Checklist

- [ ] Unit tests added/updated
- [ ] Manual testing completed
- [ ] Documentation updated (if needed)

## PR Checklist

- [ ] Code reviewed
- [ ] Tests passing
- [ ] Ready to merge
EOF

# Output the result
echo ""
echo -e "${GREEN}✅ Worktree created successfully${NC}"
echo ""
echo -e "${BLUE}cd ${FULL_WORKTREE_PATH}${NC}"
echo -e "${BLUE}prompt: ${PROMPT_FILE}${NC}"
echo ""
