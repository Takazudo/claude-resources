# JLCPCB Parts Finder - Claude Code Skill

A Claude Code skill for searching the JLCPCB electronic components database (~7 million parts).

## What is This?

This is a Claude Code **skill** that enables Claude to search through JLCPCB's massive parts database to help you find components for your PCB projects. It is:

- ✅ **Token efficient** - Only loaded when you need it
- ✅ **Easy to use** - Just type `/jlcpcb-component-finder`
- ✅ **Fast** - Direct database queries via Node.js
- ✅ **Comprehensive** - Searches ~7 million electronic components

## Installation

This skill ships as part of the `$HOME/.claude` config repo, so it's already present at `$HOME/.claude/skills/jlcpcb-component-finder/` once that repo is cloned. What's left is installing its Node dependency and getting the database in place.

### Prerequisites

1. **Claude Code** installed and configured
2. **Node.js** (for running the query script)
3. **JLCPCB database** (~5 GB installed) downloaded to `$HOME/.jlcpcb-db/`

### Step 1: Install Dependencies

```bash
cd $HOME/.claude/skills/jlcpcb-component-finder
npm install
```

### Step 2: Download the JLCPCB Database

The skill requires the JLCPCB parts database. Run the companion updater skill:

```
/jlcpcb-component-finder-update-db
```

See that skill for prerequisites (`curl`, `7z`, `sqlite3`) and details — it downloads the current `source-db-v2` dataset and installs it to `$HOME/.jlcpcb-db/cache.sqlite3`.

### Step 3: Restart Claude Code

Completely restart Claude Code for the skill to be recognized.

## Usage

### Via Skill

Type `/jlcpcb-component-finder` in Claude Code, then ask:

```
/jlcpcb-component-finder find me a 3.5mm audio jack for modular synth
```

```
/jlcpcb-component-finder search for LDO voltage regulators
```

### Direct Script Usage

You can also run the query script directly:

```bash
# Show database stats
node $HOME/.claude/skills/jlcpcb-component-finder/query.js db-info

# List categories, optionally filtered by keyword
node $HOME/.claude/skills/jlcpcb-component-finder/query.js list-categories "audio"

# Search for 3.5mm audio jacks within the "Audio" category
node $HOME/.claude/skills/jlcpcb-component-finder/query.js search-parts "Audio" "3.5" 10

# Search for LDO regulators across all categories
node $HOME/.claude/skills/jlcpcb-component-finder/query.js search-all "LDO" 15

# Look up a specific part by LCSC number
node $HOME/.claude/skills/jlcpcb-component-finder/query.js lookup C12084
```

## Commands

| Command | Usage | Description |
|---------|-------|-------------|
| `db-info` | `node query.js db-info` | Show DB stats (total parts, categories, stock count, DB date) |
| `list-categories` | `node query.js list-categories [keyword]` | List categories, optionally filtered by keyword |
| `search-parts` | `node query.js search-parts <category> [keyword] [limit]` | Search within a category — `category` is a NAME substring matched against category/subcategory, not a numeric ID |
| `search-all` | `node query.js search-all <keyword> [limit]` | Search across ALL categories by keyword |
| `lookup` | `node query.js lookup <lcsc_number>` | Look up a specific part by LCSC number (e.g. C12084) |

There is no separate categories table — run `list-categories [keyword]` to discover the exact category/subcategory names to pass to `search-parts`.

## Output Format

Results include:
- Part number (LCSC C-number)
- Manufacturer
- Description
- Package type
- Stock availability
- Basic/Preferred tags
- Category / subcategory
- Price tiers (when available)
- Datasheet URL (when available)
- **JLCPCB detail page URL** 🔗

Example:
```
C5155561: PJ-393-8P - 3.5mm Headphone Jack 1A -20℃~+70℃ 20V Gold Phosphor Bronze SMD (SMD, Stock: 1995) [Basic, Preferred] | Audio Connectors > 3.5mm Audio Jacks | Price: 1-9: $0.1234, 10-49: $0.1000, …
   Datasheet: https://...
   → https://jlcpcb.com/partdetail/C5155561
```

## Skill Directory Structure

```
skills/jlcpcb-component-finder/
├── SKILL.md           # AI agent instructions (with YAML frontmatter)
├── query.js           # Database query script
├── package.json       # Node.js dependencies
└── README.md          # This file (human documentation)
```

## Requirements

- **Node.js**: v14 or higher
- **Database**: `$HOME/.jlcpcb-db/cache.sqlite3` (~5 GB, `source-db-v2` schema, table `jlc_components`)
- **Claude Code**: Latest version
- **Dependencies**: `better-sqlite3` (installed via npm)

## Troubleshooting

### Database not found

```
ERROR: Database not found at $HOME/.jlcpcb-db/cache.sqlite3
```

**Solution**: Run `/jlcpcb-component-finder-update-db` to download and install the database.

### Skill not appearing

**Solution**:
1. Verify the skill is in `$HOME/.claude/skills/jlcpcb-component-finder/`
2. Check that `SKILL.md` exists with proper frontmatter
3. Run `npm install` in the skill directory
4. Completely restart Claude Code (not just new conversation)

### npm install fails

**Solution**: Make sure you have Node.js installed:
```bash
node --version  # Should show v14 or higher
npm --version
```

### Query script not working

**Solution**: Check that better-sqlite3 is installed:
```bash
cd $HOME/.claude/skills/jlcpcb-component-finder
npm list better-sqlite3
```

If missing, run `npm install`.

## Development

### Testing the Query Script

```bash
# Test listing categories
node query.js list-categories | head -20

# Test searching
node query.js search-parts "Audio" "3.5" 5
```

### Updating the Database

Database updates go through the companion skill, not this one:

```
/jlcpcb-component-finder-update-db
```

## License

MIT

## Credits

- Database from [JLC Parts](https://yaqwsx.github.io/jlcparts/) by Jan Mrázek
- JLCPCB component data

## Contributing

Issues and pull requests welcome at: https://github.com/Takazudo/claude-settings
