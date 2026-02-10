# Claude Code Scripts Migration Guide

## MDX Formatter Migration

### Current Setup (npm package)

The markdown formatting is provided by `@takazudo/mdx-formatter` npm package, installed in `~/.claude/package.json`.

### Command Line Usage

```bash
# Format files and write changes
npx @takazudo/mdx-formatter --write file.md

# Check if files need formatting
npx @takazudo/mdx-formatter --check file.md

# Format multiple files with glob pattern
npx @takazudo/mdx-formatter --write "docs/**/*.{md,mdx}"
```

### Features

The mdx-formatter provides:
- Full MDX/JSX support
- Japanese text formatting
- Docusaurus admonitions
- HTML to Markdown conversion
- GFM tables and features
- Better error handling

### References

- npm: https://www.npmjs.com/package/@takazudo/mdx-formatter
- GitHub: https://github.com/Takazudo/mdx-formatter
- Docs: https://takazudomodular.com/pj/mdx-formatter/

## Directory Organization

The scripts are organized by function:

```
~/.claude/scripts/
├── security/          # Security scripts (deny-check.sh)
├── utilities/         # General utilities (save-file.js)
└── MIGRATION-GUIDE.md # This file
```

## Questions or Issues?

If you encounter any issues:
1. Check the documentation at https://takazudomodular.com/pj/mdx-formatter/
2. Run `npx @takazudo/mdx-formatter --help` for CLI options
