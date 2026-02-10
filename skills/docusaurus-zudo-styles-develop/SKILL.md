---
name: docusaurus-zudo-styles-develop
description: >-
  Apply zudo-style CSS to a Docusaurus site: Noto Sans JP font, orange oklch color palette, improved
  typography, sidebar styling, and responsive layout. Use when: (1) Setting up a new Docusaurus
  project with zudo styles, (2) User says 'apply zudo styles', 'add noto sans', or 'zudo css', (3)
  User wants the orange theme and Japanese font styling on a Docusaurus site.
---

# Docusaurus Zudo Styles

Apply a comprehensive style package to a Docusaurus site featuring Noto Sans JP font, an orange oklch-based color palette, refined typography, sidebar improvements, and responsive layout tweaks.

## What This Replaces

The default Docusaurus `custom.css` contains only basic color variables (green palette). This skill replaces it entirely with a polished style system that includes:

- **Noto Sans JP** web font (Google Fonts) as the primary font family
- **Orange oklch color palette** with proper light/dark mode variants
- **Typography**: improved line-height, font sizes, heading spacing
- **Content layout**: optimal reading width (860px), wider container
- **Sidebar**: refined spacing, border separators, Japanese text optimization
- **Elements**: styled images, code blocks, tables, blockquotes, admonitions
- **Responsive**: mobile/tablet/desktop/large-desktop breakpoints
- **Navbar/Footer**: branded colors matching the palette

## Prerequisites

- Docusaurus v3.x project with the classic theme

## Implementation Steps

### Step 1: Detect Docusaurus Root

Find the Docusaurus project root by locating `docusaurus.config.ts` (or `.js`). The `src/css/custom.css` file is relative to this root.

### Step 2: Replace custom.css

Read the asset file `assets/custom.css` from this skill directory and write it to `{DOCUSAURUS_ROOT}/src/css/custom.css`, replacing the default content entirely.

**Important**: If the target `custom.css` already has project-specific rules beyond the Docusaurus defaults (e.g., `.theme-doc-meta` styles from the h1-metainfo skill), preserve those rules by appending them after the new content.

### Step 3: Verify docusaurus.config references custom.css

Ensure the Docusaurus config has the custom CSS path configured. In the classic preset, this should already be present:

```js
theme: {
  customCss: "./src/css/custom.css",
},
```

If not present, add it.

### Step 4: Verify

After implementing, verify:
1. `{DOCUSAURUS_ROOT}/src/css/custom.css` exists and contains the `@import url` for Noto Sans JP
2. Run the dev server and confirm:
  - Font is Noto Sans JP (check body text)
  - Primary color is orange (check links, navbar brand)
  - Sidebar has border separators between items
  - Content area is constrained to ~860px width
  - Dark mode has a lighter orange palette

## Customization Notes

The base color is `oklch(55.5% 0.163 48.998)` (vibrant orange). To change the palette:

1. Replace all `oklch(55.5% 0.163 48.998)` occurrences with your desired oklch light-mode color
2. Replace all `oklch(65% 0.14 48.998)` occurrences with your desired oklch dark-mode color
3. Adjust the lightness values in the `-dark`, `-darker`, `-darkest`, `-light`, `-lighter`, `-lightest` variants proportionally

## How It Works

The CSS overrides Infima (Docusaurus's CSS framework) variables and adds custom rules:
- `--ifm-font-family-base` sets the global font stack with Noto Sans JP first
- `--ifm-color-primary-*` variables control all themed colors via oklch
- `.markdown` selectors style the doc content area
- `.menu__*` selectors customize the sidebar navigation
- Media queries provide 4-tier responsive behavior (mobile/tablet/desktop/large-desktop)

## Assets

- `assets/custom.css` - Complete replacement CSS file with all styles
