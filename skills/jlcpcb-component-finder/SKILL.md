---
name: jlcpcb-component-finder
description: >-
  Search the JLCPCB electronic components database (~7 million parts) for hardware/electronics
  projects. Use when the user needs to: (1) Find electronic components (resistors, capacitors,
  inductors, ICs, connectors, diodes, transistors, MOSFETs, op-amps, microcontrollers, sensors,
  LEDs, etc.), (2) Look up specific part numbers, LCSC numbers (C-prefix), or manufacturer part
  numbers, (3) Find alternatives or equivalents for components, (4) Check component availability and
  stock at JLCPCB/LCSC, (5) Get component specifications (package type, footprint, description), (6)
  Search for parts for PCB assembly (PCBA) projects, (7) Find SMD or through-hole components, (8)
  Look up voltage regulators (LDO, linear, switching), audio jacks, connectors, or any other
  electronic parts. Keywords: JLCPCB, LCSC, electronic components, PCB parts, SMT assembly, BOM,
  bill of materials, component sourcing.
allowed-tools:
  - Bash
---

# JLCPCB Parts Finder

Search ~7 million electronic components in the local JLCPCB database.

## Database

- Path: `~/.jlcpcb-db/cache.sqlite3` (~11 GB)
- If missing, tell the user to run `/jlcpcb-component-finder-update-db`

## Query Script

All queries use: `node ~/.claude/skills/jlcpcb-component-finder/query.js <command>`

### Commands

| Command | Usage | Description |
|---------|-------|-------------|
| `db-info` | `node query.js db-info` | Show DB stats (total parts, categories, stock count, DB date) |
| `list-categories` | `node query.js list-categories [keyword]` | List categories, optionally filtered by keyword |
| `search-parts` | `node query.js search-parts <cat_id> [keyword] [limit]` | Search within a specific category |
| `search-all` | `node query.js search-all <keyword> [limit]` | Search across ALL categories by keyword |
| `lookup` | `node query.js lookup <lcsc_number>` | Look up a specific part by LCSC number (e.g. C12084) |

### Examples

```bash
# Check database status
node ~/.claude/skills/jlcpcb-component-finder/query.js db-info

# Find audio-related categories
node ~/.claude/skills/jlcpcb-component-finder/query.js list-categories "audio"

# Search for 3.5mm audio jacks in category 208
node ~/.claude/skills/jlcpcb-component-finder/query.js search-parts 208 "3.5" 10

# Search for CH340 across all categories
node ~/.claude/skills/jlcpcb-component-finder/query.js search-all "CH340" 10

# Look up a specific part
node ~/.claude/skills/jlcpcb-component-finder/query.js lookup C12084
```

## Workflow

1. **Understand request** - What component does the user need?
2. **Find category** - Use `list-categories [keyword]` or `search-all` for quick discovery
3. **Search parts** - Use `search-parts` with category ID, or `search-all` for cross-category
4. **Present results** with LCSC number, manufacturer, description, package, stock, price, and URL

## Output Fields

Each result includes:

- **LCSC number** (C-prefix, e.g. C12084)
- **Manufacturer** and **description**
- **Package type** (e.g. SOP-8, 0805)
- **Stock** availability (sorted highest first)
- **Basic/Preferred** tags - Basic parts have lower assembly fees at JLCPCB
- **Price** tiers (quantity breaks)
- **Datasheet** URL (when available)
- **Detail page** URL: `https://jlcpcb.com/partdetail/C{number}`

## Tips

- **Basic parts** have the lowest JLCPCB assembly fee - prefer these when possible
- **Preferred parts** are commonly used and well-stocked
- Start with broader keywords if specific searches return no results
- Use `search-all` when you don't know the category
- Use `list-categories` with a keyword to narrow down category IDs
- Limit initial searches to 10-20 results to avoid overwhelming output
- Results are sorted by stock (descending) - highest stock = most available
- Always include the detail page URL in recommendations
