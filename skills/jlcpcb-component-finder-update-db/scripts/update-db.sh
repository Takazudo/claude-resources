#!/bin/bash
set -euo pipefail

# JLCPCB Parts Database Updater
# Downloads the split-zip database from yaqwsx.github.io/jlcparts and installs to ~/.jlcpcb-db/

BASE_URL="https://yaqwsx.github.io/jlcparts/data"
DB_DIR="$HOME/.jlcpcb-db"
WORK_DIR="$DB_DIR/.download-tmp"
DB_FILE="$DB_DIR/cache.sqlite3"

echo "=== JLCPCB Parts Database Updater ==="
echo ""

# Check dependencies
for cmd in curl 7z; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: '$cmd' is required but not installed."
    if [ "$cmd" = "7z" ]; then
      echo "Install with: brew install p7zip"
    fi
    exit 1
  fi
done

# Show current DB info if exists
if [ -f "$DB_FILE" ]; then
  DB_SIZE=$(du -h "$DB_FILE" | cut -f1)
  DB_DATE=$(stat -f "%Sm" -t "%Y-%m-%d" "$DB_FILE" 2>/dev/null || stat -c "%y" "$DB_FILE" 2>/dev/null | cut -d' ' -f1)
  echo "Current database: $DB_SIZE (modified: $DB_DATE)"
  echo ""
fi

# Create working directory
mkdir -p "$WORK_DIR"
cd "$WORK_DIR"

# Clean any previous partial downloads
rm -f cache.zip cache.z[0-9]*

echo "Step 1/4: Discovering download files..."

# First download cache.zip to check if it exists
HTTP_CODE=$(curl -sI -o /dev/null -w "%{http_code}" "$BASE_URL/cache.zip")
if [ "$HTTP_CODE" != "200" ]; then
  echo "ERROR: Could not reach $BASE_URL/cache.zip (HTTP $HTTP_CODE)"
  echo "The download server may be down. Try again later."
  rm -rf "$WORK_DIR"
  exit 1
fi

# Discover how many split parts exist (try z01 through z30)
PARTS=()
for i in $(seq -w 1 30); do
  URL="$BASE_URL/cache.z$i"
  CODE=$(curl -sI -o /dev/null -w "%{http_code}" "$URL")
  if [ "$CODE" = "200" ]; then
    PARTS+=("cache.z$i")
  else
    break
  fi
done

TOTAL_FILES=$((${#PARTS[@]} + 1))
echo "Found $TOTAL_FILES files to download (cache.zip + ${#PARTS[@]} split parts)"
echo ""

echo "Step 2/4: Downloading files..."

# Download split parts first
DOWNLOADED=0
for part in "${PARTS[@]}"; do
  DOWNLOADED=$((DOWNLOADED + 1))
  echo "  [$DOWNLOADED/$TOTAL_FILES] Downloading $part..."
  curl -# -L -o "$part" "$BASE_URL/$part"
done

# Download main zip last
DOWNLOADED=$((DOWNLOADED + 1))
echo "  [$DOWNLOADED/$TOTAL_FILES] Downloading cache.zip..."
curl -# -L -o "cache.zip" "$BASE_URL/cache.zip"

echo ""
echo "Step 3/4: Extracting database..."

# Extract using 7z (handles split zip archives)
7z x -y cache.zip -o"$WORK_DIR" 2>&1 | tail -5

if [ ! -f "$WORK_DIR/cache.sqlite3" ]; then
  echo "ERROR: Extraction failed - cache.sqlite3 not found"
  rm -rf "$WORK_DIR"
  exit 1
fi

echo ""
echo "Step 4/4: Installing database..."

# Backup old database if exists
if [ -f "$DB_FILE" ]; then
  BACKUP="$DB_DIR/cache.sqlite3.bak"
  echo "  Backing up old database to cache.sqlite3.bak"
  mv "$DB_FILE" "$BACKUP"
fi

# Move new database into place
mv "$WORK_DIR/cache.sqlite3" "$DB_FILE"

# Clean up
rm -rf "$WORK_DIR"

# Show result
NEW_SIZE=$(du -h "$DB_FILE" | cut -f1)
echo ""
echo "=== Done! ==="
echo "Database installed: $DB_FILE ($NEW_SIZE)"
echo ""
echo "Verify with: node ~/.claude/skills/jlcpcb-component-finder/query.js db-info"
