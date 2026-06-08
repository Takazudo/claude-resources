---
name: jlcpcb-component-finder-update-db
description: "Download or update the JLCPCB electronic components database for the jlcpcb-component-finder skill. Use when: (1) User says 'update jlcpcb db', 'download jlcpcb database', 'refresh parts database', (2) The jlcpcb-component-finder skill reports database not found, (3) User wants to get the latest component data from JLCPCB/LCSC, (4) User says 'update db', 'update parts db'. Downloads ~0.6 GB split-zip (~5 GB installed) from yaqwsx.github.io/jlcparts."
allowed-tools:
  - Bash
---

> **DO NOT auto-invoke this skill.** This downloads ~0.6 GB and writes a ~5 GB database. Always ask for user confirmation before proceeding.

# JLCPCB Database Updater

Download or update the JLCPCB parts database (~5 GB installed, ~7 million components).
Upstream now ships the slim `source-db-v2` format (table `jlc_components`); the old
v1 format bundled a ~20 GB raw-payload table — this script drops it if it ever reappears.

## Prerequisites

- `curl` - for downloading files
- `7z` (p7zip) - for extracting split-zip archives. Install: `brew install p7zip`
- `sqlite3` - for the defensive slim-down step. Install: `brew install sqlite`

## Update Script

Run the automated update script:

```bash
bash $HOME/.claude/skills/jlcpcb-component-finder-update-db/scripts/update-db.sh
```

This script will:

1. Check prerequisites (`curl`, `7z`, `sqlite3`)
2. Discover and download split-zip files from `https://yaqwsx.github.io/jlcparts/data/`
3. Extract `cache.sqlite3` using `7z`
4. Back up existing database (if any) to `cache.sqlite3.bak`
5. Install new database to `$HOME/.jlcpcb-db/cache.sqlite3`
6. Drop the legacy `jlcpcb_component_details` payload table if present (no-op on v2) + VACUUM
7. Remove the previous `cache.sqlite3.bak` so backups don't pile up
8. Clean up temporary files

## Important Notes

- **Download size**: ~0.6 GB compressed (12×50 MB split parts + a final ~13 MB zip)
- **Installed size**: ~5 GB (`source-db-v2`); the old v1 format was ~26 GB due to a raw-payload table
- **Download time**: usually a minute or two on a decent connection
- **Disk space needed**: during the transition you briefly hold the old DB + new DB; the script

  removes the `.bak` automatically after install

- If the download fails partway, re-run the script - it cleans up partial downloads

## Data Source

Database from [JLC Parts](https://yaqwsx.github.io/jlcparts/) by Jan Mrazek.
Updated periodically from JLCPCB/LCSC component data.

## Verify After Update

```bash
node $HOME/.claude/skills/jlcpcb-component-finder/query.js db-info
```

## Manual Update (Alternative)

If the script doesn't work, download manually:

1. Visit https://yaqwsx.github.io/jlcparts/
2. Download all `cache.z*` and `cache.zip` files
3. Extract: `7z x cache.zip`
4. Move: `mv cache.sqlite3 $HOME/.jlcpcb-db/`
