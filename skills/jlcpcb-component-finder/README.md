# JLCPCB Parts Finder - Claude Code Skill

A Claude Code skill for searching the JLCPCB electronic components database (~7 million parts).

## What is This?

This is a Claude Code **skill** that enables Claude to search through JLCPCB's massive parts database to help you find components for your PCB projects. Unlike the old MCP server approach, this skill is:

- ✅ **Token efficient** - Only loaded when you need it
- ✅ **Easy to use** - Just type `/jlcpcb` in Claude Code
- ✅ **Fast** - Direct database queries via Node.js
- ✅ **Comprehensive** - Searches ~7 million electronic components

## Installation

### Prerequisites

1. **Claude Code** installed and configured
2. **Node.js** (for running the query script)
3. **JLCPCB database** (~11GB) downloaded to `~/.jlcpcb-db/`

### Step 1: Install the Skill

#### Option A: As Git Submodule (Recommended)

```bash
cd ~/.claude
git submodule add git@github.com:Takazudo/jlcpcb-parts-finder-skill.git skills/jlcpcb
cd skills/jlcpcb
npm install
```

#### Option B: Manual Installation

```bash
git clone git@github.com:Takazudo/jlcpcb-parts-finder-skill.git ~/.claude/skills/jlcpcb
cd ~/.claude/skills/jlcpcb
npm install
```

### Step 2: Download the JLCPCB Database

The skill requires the JLCPCB parts database (~11GB).

1. Visit https://yaqwsx.github.io/jlcparts/
2. Download all database parts:
   - `cache.zip`
   - `cache.z01` through `cache.z18`
3. Combine and extract:

```bash
# Combine all parts
cat cache.z* cache.zip > cache_combined.zip

# Extract the database
unzip cache_combined.zip

# Move to the expected location
mkdir -p ~/.jlcpcb-db
mv cache.sqlite3 ~/.jlcpcb-db/
```

### Step 3: Add the Custom Command (Optional)

For the `/jlcpcb` slash command to appear in autocomplete:

```bash
# Copy or create the command file
cp jlcpcb.md ~/.claude/commands/jlcpcb.md
```

Or create `~/.claude/commands/jlcpcb.md` manually (see command template below).

### Step 4: Restart Claude Code

Completely restart Claude Code for the skill to be recognized.

## Usage

### Via Slash Command

Type `/jlcpcb` in Claude Code, then ask:

```
/jlcpcb find me a 3.5mm audio jack for modular synth
```

```
/jlcpcb search for LDO voltage regulators
```

### Direct Script Usage

You can also run the query script directly:

```bash
# List all categories
node ~/.claude/skills/jlcpcb/query.js list-categories

# Search for 3.5mm audio jacks
node ~/.claude/skills/jlcpcb/query.js search-parts 208 "3.5" 10

# Search for LDO regulators
node ~/.claude/skills/jlcpcb/query.js search-parts 111 "LDO" 15
```

## Common Categories

Quick reference for frequently used component categories:

- **Audio Connectors**: 208
- **Linear Voltage Regulators**: 130
- **LDO Regulators**: 111, 120
- **PMIC - Current & Power Monitors & Regulators**: 512

Use `list-categories` to find other categories.

## Output Format

Results include:
- Part number (LCSC C-number)
- Manufacturer
- Description
- Package type
- Stock availability
- **JLCPCB detail page URL** 🔗

Example:
```
C5155561: PJ-393-8P - 3.5mm Headphone Jack 1A -20℃~+70℃ 20V Gold Phosphor Bronze SMD Audio Connectors (SMD, Stock: 1995)
   → https://jlcpcb.com/partdetail/C5155561
```

## Repository Structure

```
jlcpcb-parts-finder-skill/
├── SKILL.md           # AI agent instructions (with YAML frontmatter)
├── query.js           # Database query script
├── package.json       # Node.js dependencies
├── .gitignore         # Git ignore rules
└── README.md          # This file (human documentation)
```

## Requirements

- **Node.js**: v14 or higher
- **Database**: `~/.jlcpcb-db/cache.sqlite3` (11GB)
- **Claude Code**: Latest version
- **Dependencies**: `better-sqlite3` (installed via npm)

## Troubleshooting

### Database not found

```
ERROR: Database not found at ~/.jlcpcb-db/cache.sqlite3
```

**Solution**: Download and extract the database to `~/.jlcpcb-db/cache.sqlite3` (see installation steps above).

### Skill not appearing

**Solution**:
1. Verify skill is in `~/.claude/skills/jlcpcb/`
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
cd ~/.claude/skills/jlcpcb
npm list better-sqlite3
```

If missing, run `npm install`.

## Development

### Testing the Query Script

```bash
# Test listing categories
node query.js list-categories | head -20

# Test searching
node query.js search-parts 208 "3.5" 5
```

### Updating the Skill

```bash
cd ~/.claude/skills/jlcpcb
git pull origin main
npm install  # If dependencies changed
```

## License

MIT

## Credits

- Database from [JLC Parts](https://yaqwsx.github.io/jlcparts/) by Jan Mrázek
- JLCPCB component data

## Contributing

Issues and pull requests welcome at: https://github.com/Takazudo/jlcpcb-parts-finder-skill
