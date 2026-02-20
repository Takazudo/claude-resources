---
name: jlcpcb-component-finder-update-db
description: >-
  Download or update the JLCPCB electronic components database for the jlcpcb-component-finder
  skill. Use when: (1) User says 'update jlcpcb db', 'download jlcpcb database', 'refresh parts
  database', (2) The jlcpcb-component-finder skill reports database not found, (3) User wants to get
  the latest component data from JLCPCB/LCSC, (4) User says 'update db', 'update parts db'.
  Downloads ~11 GB split-zip database from yaqwsx.github.io/jlcparts.
disable-model-invocation: true
allowed-tools:
  - Bash
---

# JLCPCB Database Updater

Download or update the JLCPCB parts database (~11 GB, ~7 million components).

## Prerequisites

- `curl` - for downloading files
- `7z` (p7zip) - for extracting split-zip archives. Install: `brew install p7zip`

## Update Script

Run the automated update script:

```bash
bash ~/.claude/skills/jlcpcb-component-finder-update-db/scripts/update-db.sh
```

This script will:
1. Check prerequisites (`curl`, `7z`)
2. Discover and download split-zip files from `https://yaqwsx.github.io/jlcparts/data/`
3. Extract `cache.sqlite3` using `7z`
4. Back up existing database (if any) to `cache.sqlite3.bak`
5. Install new database to `~/.jlcpcb-db/cache.sqlite3`
6. Clean up temporary files

## Important Notes

- **Download size**: ~3-4 GB compressed, ~11 GB extracted
- **Download time**: Depends on connection speed (may take 30+ minutes)
- **Disk space needed**: ~15 GB free (compressed + extracted during install)
- The old database is backed up as `cache.sqlite3.bak` before replacement
- If the download fails partway, re-run the script - it cleans up partial downloads

## Data Source

Database from [JLC Parts](https://yaqwsx.github.io/jlcparts/) by Jan Mrazek.
Updated periodically from JLCPCB/LCSC component data.

## Verify After Update

```bash
node ~/.claude/skills/jlcpcb-component-finder/query.js db-info
```

## Manual Update (Alternative)

If the script doesn't work, download manually:

1. Visit https://yaqwsx.github.io/jlcparts/
2. Download all `cache.z*` and `cache.zip` files
3. Extract: `7z x cache.zip`
4. Move: `mv cache.sqlite3 ~/.jlcpcb-db/`
