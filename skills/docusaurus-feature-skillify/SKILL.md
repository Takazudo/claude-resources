---
name: docusaurus-feature-skillify
description: >-
  Extract a Docusaurus feature from the current project and package it as a reusable global skill.
  Takes a feature name as argument, explores the implementation in the current project's Docusaurus
  directory, then creates a new skill under ~/.claude/skills/ that can reproduce the feature in any
  other Docusaurus project. Use when: (1) User says 'docusaurus feature skillify', 'skillify
  docusaurus feature', 'extract docusaurus feature', (2) User wants to turn a Docusaurus
  customization into a reusable skill, (3) User wants to package a Docusaurus theme/plugin/component
  tweak for reuse across projects.
user-invocable: true
argument-hint: <feature-name> [optional description]
---

# Docusaurus Feature Skillify

Extract a Docusaurus feature implementation from the current project and create a reusable global skill from it.

## Usage

```
/docusaurus-feature-skillify sidebar filter feature
/docusaurus-feature-skillify category nav with auto-generation
/docusaurus-feature-skillify doc metadata display
```

The argument is a short name/description of the feature to extract.

## Workflow

### Phase 1: Parse Input

Extract from the argument:
- **Feature name**: Convert to kebab-case for the skill name (e.g., "sidebar filter" → `docusaurus-sidebar-filter-develop`)
- **Skill directory**: `~/.claude/skills/docusaurus-<feature-kebab>-develop/`

If the skill directory already exists, warn the user and ask whether to overwrite or pick a different name.

### Phase 2: Find the Docusaurus Project

Locate the Docusaurus root in the current project. Search for `docusaurus.config.ts` or `docusaurus.config.js`. Common locations:
- Project root (`./`)
- `_doc/`, `doc/`, `docs/`
- Any subdirectory

If multiple are found, ask the user which one. Store this path as `DOCUSAURUS_ROOT`.

### Phase 3: Explore the Feature Implementation

Use the Explore agent (subagent_type=Explore, thoroughness=very thorough) to find ALL files related to the feature. Search across:

1. **Swizzled theme components**: `{DOCUSAURUS_ROOT}/src/theme/` - React components that override Docusaurus defaults
2. **Custom components**: `{DOCUSAURUS_ROOT}/src/components/` - Standalone React components
3. **CSS/styles**: `{DOCUSAURUS_ROOT}/src/css/custom.css` and any CSS modules (`.module.css`)
4. **Plugins**: `{DOCUSAURUS_ROOT}/plugins/` - Custom Docusaurus plugins (remark, rehype, etc.)
5. **Scripts**: `{DOCUSAURUS_ROOT}/scripts/` - Build-time data generation scripts
6. **Config changes**: `docusaurus.config.ts` - Plugin registrations, theme config
7. **Sidebar config**: `sidebars.ts` - If the feature affects sidebar structure
8. **Static assets**: `{DOCUSAURUS_ROOT}/static/` - Images, fonts, etc. used by the feature
9. **Generated data**: Any JSON files the feature depends on

Read EVERY relevant file completely. The goal is to understand:
- What files need to be created/modified in a target project
- What is project-specific vs. what is generic/reusable
- What npm dependencies the feature requires (if any beyond Docusaurus core)

### Phase 4: Generalize the Code

For each file found, decide how to handle it:

| File Type | Action |
|-----------|--------|
| Swizzled component (`src/theme/*/index.tsx`) | Store as asset template. Remove project-specific code (hardcoded paths, project-specific API routes, Japanese-only strings). Use generic defaults with customization instructions. |
| Custom component (`src/components/*/`) | Store as asset template. Same generalization as above. |
| CSS in `custom.css` | Extract only the feature-relevant CSS rules. Include as inline code block in SKILL.md with instructions to append. |
| CSS module (`.module.css`) | Store as asset template alongside its component. |
| Plugin (`plugins/*.js`) | Store as asset template. |
| Build script (`scripts/*.js`) | Store as asset template. |
| Config changes | Document as instructions in SKILL.md (do NOT store the whole config as an asset). |
| Generated JSON data | Document the generation process, don't store the data itself. |
| npm dependencies | List in SKILL.md as a prerequisite install step. |

**Generalization rules:**
- **CRITICAL: All file paths in SKILL.md must use `{DOCUSAURUS_ROOT}/` placeholder** instead of the actual directory name (e.g., `doc/`, `docs/`, `website/`). Example: write `{DOCUSAURUS_ROOT}/src/components/Foo/index.tsx`, NOT `doc/src/components/Foo/index.tsx`
- Replace hardcoded paths like `/docs/api` with configurable patterns or comments
- Replace language-specific text with neutral English defaults, noting alternative language support
- Remove project-specific business logic (project names, specific URLs, hardcoded category names)
- Keep all Docusaurus CSS variable usage (`--ifm-*`) as-is (these are universal)
- Preserve TypeScript types from `@docusaurus/*` packages

**Project-specificity detection checklist** (verify NONE of these remain in the generated skill):
- [ ] Hardcoded project/directory name (e.g., `doc/`, `my-docs/`, `website/`) — use `{DOCUSAURUS_ROOT}/` instead
- [ ] Project-specific localhost URLs (e.g., `http://localhost:3000/my-site/`)
- [ ] Hardcoded project title, repo name, or company name
- [ ] Hardcoded API endpoints, domain names, or deployment URLs (use placeholders like `https://your-site.example.com`)
- [ ] Hardcoded category/section names that only apply to the source project
- [ ] Language-specific strings without noting they should be customized
- [ ] References to specific package managers (prefer generic "install" over `pnpm`/`npm`/`yarn`)
- [ ] Hardcoded file paths in shell scripts or code that assume a specific directory structure

### Phase 5: Create the Skill

1. **Initialize**: Run `~/.claude/skills/skill-creator/scripts/init_skill.py <skill-name> --path ~/.claude/skills`
2. **Clean up**: Remove example files (`scripts/example.py`, `references/api_reference.md`, `assets/example_asset.txt`) and empty directories not needed
3. **Write assets**: Copy generalized template files to `assets/`
4. **Write SKILL.md** following this structure:

```markdown
---
name: docusaurus-<feature>-develop
description: "<What it does>. Use when: (1) <trigger>, (2) <trigger>, (3) <trigger>."
---

# <Feature Title>

<1-2 sentence summary of what the feature adds to a Docusaurus site.>

## Prerequisites

- Docusaurus v3.x project
- <Any extra dependencies>

## Implementation Steps

### Step 1: Detect Docusaurus Root

Find the Docusaurus project root by locating `docusaurus.config.ts` (or `.js`).

### Step N: <Action>

<Clear instructions for each file to create/modify.>
For assets: "Read `assets/<filename>` from this skill directory" → target path.
For CSS: Inline the CSS in a code block with append instructions.
For config: Describe what to add/change.

### Step Last: Verify

After implementing, verify:
1. <file exists checks>
2. Run the dev server to confirm: <what to look for>

## How It Works

<Brief technical explanation of the feature's mechanism.>

## Assets

- `assets/<file>` - <description>
```

**SKILL.md quality checklist:**
- [ ] Description has 3+ "Use when" triggers with natural phrases users would say
- [ ] Implementation steps are ordered and actionable
- [ ] Step 1 is ALWAYS "Detect Docusaurus Root" (find `docusaurus.config.ts`/`.js`)
- [ ] ALL file paths use `{DOCUSAURUS_ROOT}/` placeholder, NEVER a hardcoded directory name like `doc/`
- [ ] Each asset file is referenced with source path and target path
- [ ] CSS blocks are complete and copy-pasteable
- [ ] No project-specific hardcoded values remain (run the detection checklist from Phase 4)
- [ ] Verify step describes observable behavior

### Phase 6: Report

After creating the skill, report to the user:
- Skill location: `~/.claude/skills/docusaurus-<feature>-develop/`
- Files created (list the tree)
- What the skill does when invoked
- Trigger phrases
- Any project-specific parts that were intentionally excluded
