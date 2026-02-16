---
name: dev-docusaurus-claude-resources
description: >-
  Add a Claude Code resources documentation section to a Docusaurus site. Auto-discovers and
  generates browsable docs for CLAUDE.md files, commands, skills, and agents with sidebar
  navigation. Use when: (1) User wants to document Claude Code resources in Docusaurus, (2) User
  says 'add claude resources', 'claude docs section', or 'show commands and skills', (3) User wants
  a navigable sidebar for Claude Code components.
---

# Docusaurus Claude Resources

Add a documentation section to a Docusaurus site that auto-discovers and renders all Claude Code resources as browsable pages with sidebar navigation.

Generates docs for four resource types:
- **CLAUDE.md** - All CLAUDE.md files found recursively in the project
- **Commands** - Custom slash commands from `commands/*.md` (frontmatter: `description`)
- **Skills** - Skill packages from `skills/*/SKILL.md` (frontmatter: `name`, `description`), including nested reference pages
- **Agents** - Custom subagents from `agents/*.md` (frontmatter: `name`, `description`, `model`)

Empty categories are automatically hidden from the sidebar.

## Prerequisites

- Docusaurus v3.x project
- `gray-matter` npm package (for YAML frontmatter parsing)

## Implementation Steps

### Step 1: Detect Docusaurus Root

Find the Docusaurus project root by locating `docusaurus.config.ts` or `docusaurus.config.js`. Store this as `{DOCUSAURUS_ROOT}`.

Also identify the Claude Code configuration directory. This is typically a `.claude/` subdirectory in the project root containing `commands/`, `skills/`, and `agents/`.

### Step 2: Install dependency

```bash
cd {DOCUSAURUS_ROOT}
npm install --save-dev gray-matter
```

### Step 3: Create the generation script

Read `assets/generate-claude-docs.js` from this skill directory and copy it to `{DOCUSAURUS_ROOT}/scripts/generate-claude-docs.js`.

Then adjust the **Configuration** section at the top of the script:

```javascript
// Where Claude Code resources live (commands/, skills/, agents/)
// For projects with .claude/ subdirectory, point to that directory
const CLAUDE_DIR = path.resolve(__dirname, "../../.claude");

// Project root for CLAUDE.md file discovery (scanned recursively)
const PROJECT_ROOT = path.resolve(__dirname, "../..");

// Docusaurus root (where docusaurus.config.js lives)
const DOCUSAURUS_ROOT = path.resolve(__dirname, "..");

// Doc prefix used in sidebar IDs and output path
const DOCS_PREFIX = "claude";

// Label shown in navbar and index page
const SECTION_LABEL = "Claude";
```

Key configuration:
- **`CLAUDE_DIR`**: Must point to the directory containing `commands/`, `skills/`, `agents/`. For most projects this is `{PROJECT_ROOT}/.claude`. Adjust the relative path based on where the Docusaurus site lives within the project.
- **`PROJECT_ROOT`**: The project root where CLAUDE.md files are searched recursively. Kept separate from `CLAUDE_DIR` so that CLAUDE.md files at the project root are discovered while commands/skills/agents are read from `.claude/`.
- **`DOCS_PREFIX`**: Controls the output directory under `docs/` and the sidebar JSON filename. Default `"claude"` produces `docs/claude/` and `claude-sidebar.json`.
- **`SECTION_LABEL`**: The heading shown on the index page.

### Step 4: Configure sidebar loading

Update `{DOCUSAURUS_ROOT}/sidebars.js` to load the generated sidebar JSON:

```javascript
let claudeSidebar = [];

try {
  claudeSidebar = require("./src/data/claude-sidebar.json");
} catch {
  claudeSidebar = ["claude/index"];
}

const sidebars = {
  // Add alongside any existing sidebars
  claudeSidebar,
};

module.exports = sidebars;
```

If the project already has sidebars, merge `claudeSidebar` into the existing exports object.

### Step 5: Add navbar item

In `{DOCUSAURUS_ROOT}/docusaurus.config.js` (or `.ts`), add a navbar item:

```javascript
navbar: {
  items: [
    // ...existing items
    {
      type: "doc",
      docId: "claude/index",
      position: "left",
      label: "Claude",
    },
  ],
},
```

Adjust `docId` if you changed `DOCS_PREFIX`. Adjust `label` to match your preference.

### Step 6: Add npm scripts

Add generation scripts to `{DOCUSAURUS_ROOT}/package.json`:

```json
{
  "scripts": {
    "generate-claude-docs": "node scripts/generate-claude-docs.js",
    "prestart": "npm run generate-claude-docs",
    "prebuild": "npm run generate-claude-docs"
  }
}
```

This ensures docs are regenerated before every dev server start and production build. If the project already has `prestart`/`prebuild` scripts, chain them (e.g., `"prestart": "npm run generate-claude-docs && npm run other-generate"`).

### Step 7: Add generated files to .gitignore

Add to `{DOCUSAURUS_ROOT}/.gitignore`:

```
# Generated Claude Code docs
docs/claude/
src/data/claude-sidebar.json
```

These files are regenerated on every build, so they should not be committed.

### Step 8: Verify

1. Run the generation: `node {DOCUSAURUS_ROOT}/scripts/generate-claude-docs.js`
2. Check that `{DOCUSAURUS_ROOT}/docs/claude/` contains generated MDX files
3. Check that `{DOCUSAURUS_ROOT}/src/data/claude-sidebar.json` exists
4. Start the dev server and verify:
- Navbar shows the "Claude" item
- Clicking it shows the index page with resource counts
- Sidebar shows categories (CLAUDE.md, Commands, Skills, Agents)
- Each resource page renders correctly

## How It Works

The generation script runs before Docusaurus starts and:

1. **Cleans** the output directory to remove stale files from previous runs
2. **Discovers** source files by scanning the Claude Code config directory (skips broken symlinks gracefully)
3. **Parses** YAML frontmatter using `gray-matter` to extract metadata (name, description, model)
4. **Escapes** content for MDX compatibility (angle brackets that look like JSX tags)
5. **Generates** individual MDX pages for each resource, plus index pages per category
6. **Builds** a Docusaurus sidebar JSON structure with nested categories
7. **Hides** empty categories automatically (if no commands exist, the Commands category is omitted)

Skills with `references/*.md` subdirectories become nested sidebar categories, with each reference as a child page.

## CategoryNav Integration

Generated index pages use the `<CategoryNav>` component for auto-generated navigation lists instead of hardcoded markdown links. This ensures the navigation stays in sync with the actual doc structure.

### Prerequisites

- The `CategoryNav` component must exist at `{DOCUSAURUS_ROOT}/src/components/CategoryNav/` and support the `subcategory` prop
- The `generate-category-nav.js` script must run **after** `generate-claude-docs.js` in the build pipeline, so that `category-nav.json` includes the generated claude docs

### How it works

- The main index page uses `<CategoryNav category="{DOCS_PREFIX}" />` to show all subcategories (CLAUDE.md, Commands, Skills, Agents)
- Each subcategory index page uses `<CategoryNav category="{DOCS_PREFIX}" subcategory="..." />` to show only its pages
- `DOCS_PREFIX` (default: `"claude"`) doubles as the category key for CategoryNav

### Configuration

The `DOCS_PREFIX` constant (default `"claude"`) is used both as the output directory prefix and the CategoryNav category key. Ensure this value matches a key in `CATEGORY_STRUCTURE` in `generate-category-nav.js`.

## Assets

- `assets/generate-claude-docs.js` - The generation script. Copy to `{DOCUSAURUS_ROOT}/scripts/generate-claude-docs.js` and adjust the Configuration section at the top.
