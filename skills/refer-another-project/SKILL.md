---
name: refer-another-project
description: >-
  Refer another project while protecting sensitive information. Use when: (1) User says 'refer
  project', 'copy from project', or 'look at another repo', (2) User wants to reference patterns or
  setup from another codebase, (3) User needs to learn from another project's structure without
  leaking private data.
argument-hint: <slug|path> [slug2 ...] — repo slug (e.g. zmod) or full path
---

# Refer Another Project Command

Use this command when you need to reference, copy, or learn from another project's setup, structure, or patterns.

## Resolving Project Paths

Arguments can be **slugs** (short names) or **full paths**. Multiple slugs/paths can be provided, space-separated.

**Slug resolution rule:**

For each slug argument (any argument that is NOT an absolute path starting with `/`):

1. Search for matching directories at `~/repos/*/{slug}` (one level of category directories)
2. If exactly one match is found, use it as the project path
3. If no match is found, **stop and report the error** to the user — do not guess or continue
4. If multiple matches are found, list them and ask the user to clarify

**Examples:**

- `/refer-another-project zmod` → resolves `~/repos/*/zmod` → e.g. `~/repos/zp/zmod`
- `/refer-another-project zmod dotfiles` → resolves both slugs independently
- `/refer-another-project ~/repos/zp/zmod` → uses full path directly

```bash
# Resolution command for each slug
ls -d ~/repos/*/{slug} 2>/dev/null
```

## Critical Security Warning

When referencing another project, you MUST protect project-specific sensitive information. Never copy concrete content or secrets - only copy patterns, structures, and configurations.

## What You CAN Copy (Safe)

- **Project structure**: Directory organization, folder naming conventions
- **Configuration patterns**: Build tool configs, linter configs, framework setup patterns
- **Package dependencies**: package.json dependencies (not scripts with project-specific values)
- **Code patterns**: Component structures, utility function patterns, architectural approaches
- **Setup procedures**: How things are configured (but not the concrete values)
- **Type definitions**: Generic type patterns and interfaces
- **Test patterns**: Testing setup and structure (not test data with real values)

## What You MUST NOT Copy (Dangerous)

- **Project titles and names**: Product names, brand names, company names
- **Concrete content**: Article text, documentation content, marketing copy
- **HTML content with specific info**: Pages with real product/company information
- **Database information**: Connection strings, table names with business meaning, credentials
- **API keys and secrets**: Any `.env` values, API tokens, passwords
- **URLs and endpoints**: Production URLs, internal service addresses
- **User data**: Any real user information, emails, names
- **Business logic specifics**: Proprietary algorithms, pricing logic, business rules
- **Internal documentation**: Private docs, internal guides, company-specific processes
- **Asset files**: Images, logos, brand assets that belong to the other project

## Instructions

1. **Identify what you need**: Clearly state what patterns or setup you want to learn from
2. **Read with filtering mindset**: When reading files, mentally separate:
- Generic patterns (copy these)
- Project-specific values (never copy these)
3. **Adapt, don't copy verbatim**: Transform patterns to fit the target project
4. **Replace all identifiers**: Any names, titles, or identifiers must be replaced with appropriate values for the target project
5. **Double-check before writing**: Before writing any file, verify no sensitive info leaked through

## Example Scenario

When copying Docusaurus setup from `~/foo/bar/`:

**Safe to reference:**

- `docusaurus.config.js` structure and plugin configurations
- Directory structure (`docs/`, `src/`, `static/`)
- Theme customization patterns
- Sidebar configuration format
- Build and deployment scripts structure

**Must NOT copy:**

- Site title, tagline, organization name in config
- Actual documentation article content
- Logo and favicon files
- Any URLs (baseUrl, url, GitHub links)
- Author information
- Analytics IDs
- Any text content within markdown files

## Reminder

Always ask yourself: "Does this contain information specific to the source project?" If yes, do not copy it directly. Extract the pattern and apply it fresh to the target project.
