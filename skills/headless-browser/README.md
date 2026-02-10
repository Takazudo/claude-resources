# Headless Browser Skill

A lightweight headless browser checking skill for webpage health checks.

## Installation

The skill is installed in `~/.claude/skills/headless-browser/`, making it available globally.

## Script Location

The script has two possible locations:

1. **Project-local** (recommended): `scripts/headless-check.js`
   - Works when you're in a project that has this script
   - Uses the project's Playwright installation
   - No additional setup needed

2. **Global**: `~/bin/headless-check.mjs`
   - Can run from anywhere
   - Requires: `npm install -g playwright`

## Usage

In any Claude Code session, the skill is automatically available. Just ask:

- "Check https://example.com with headless-browser"
- "Use headless-browser to verify this page loads"
- "Check this URL for errors using the lightweight browser"

## Adding to New Projects

To add the script to a new project:

```bash
# Copy from this project (my-project)
cp /path/to/my-project/scripts/headless-check.js ./scripts/

# Or download directly
curl -o scripts/headless-check.js https://raw.githubusercontent.com/your-repo/headless-check.js
```

Make sure the project has Playwright installed:
```bash
npm install --save-dev playwright
```

## For Global Use

If you want to use the script globally (from any directory):

```bash
# Install Playwright globally
npm install -g playwright

# The script is already copied to ~/bin/headless-check.mjs
# Test it:
node ~/bin/headless-check.mjs --url https://example.com
```
