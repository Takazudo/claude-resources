---
name: dev-docusaurus-sidebar-desc-sort
description: >-
  Apply descending (reverse) sidebar sort to a Docusaurus doc category using inverted
  sidebar_position values. Use when: (1) Adding a changelog or release notes category with
  newest-first ordering, (2) User says 'descending sidebar', 'reverse sort sidebar', 'newest first
  sidebar', (3) Creating any Docusaurus category where items should appear in reverse order.
---

# Descending Sidebar Sort for Docusaurus

Sort a Docusaurus sidebar category in descending order (newest/highest items first) by inverting `sidebar_position` frontmatter values. Docusaurus sorts ascending by default; this strategy subtracts from a high base number so higher-value items get lower positions and appear first.

## Strategy

Given a base number (default `10000`) and a numeric value derived from each item's natural ordering:

```
sidebar_position = BASE - item_numeric_value
```

Higher `item_numeric_value` = lower `sidebar_position` = appears first in the sidebar.

### Example: Versioned Changelog

For semver versions, derive the numeric value as:

```
item_numeric_value = MAJOR * 1000 + MINOR * 100 + PATCH
sidebar_position = 10000 - item_numeric_value
```

| Version | Numeric Value | sidebar_position | Order |
|---------|--------------|-----------------|-------|
| v1.2.3  | 1230         | 8770            | 1st   |
| v1.1.0  | 1100         | 8900            | 2nd   |
| v0.5.0  | 500          | 9500            | 3rd   |
| v0.1.0  | 100          | 9900            | 4th   |

### Example: Date-Based Items

For date-ordered items (blog posts, meeting notes), use `YYYYMMDD`:

```
sidebar_position = 99999999 - YYYYMMDD
```

| Date       | sidebar_position | Order |
|------------|-----------------|-------|
| 2026-02-18 | 79973782        | 1st   |
| 2026-01-15 | 79973885        | 2nd   |
| 2025-12-01 | 79974099        | 3rd   |

## Implementation Steps

### Step 1: Detect Docusaurus Root

Find the Docusaurus project root by locating `docusaurus.config.ts` (or `.js`).

### Step 2: Set Up Category Index

Create or update the category index page with `sidebar_position: 1` so it always appears at the top:

```mdx
---
sidebar_position: 1
---

# Category Title

Category description.
```

### Step 3: Apply Inverted sidebar_position to Each Item

Add `sidebar_position` frontmatter to each doc using the formula. For a new item being added, calculate its value and set it in the frontmatter:

```mdx
---
sidebar_position: { BASE - item_numeric_value }
---
```

### Step 4: Explicitly Order sidebars.js

In `sidebars.js`, list the category's items in the desired descending order. The explicit array ensures the sidebar renders correctly even without auto-generation:

```js
const sidebars = {
  myCategorySidebar: [
    'my-category/index',
    'my-category/newest-item',   // lowest sidebar_position
    'my-category/second-item',
    'my-category/oldest-item',   // highest sidebar_position
  ],
};
```

When adding a new item, insert it in the correct position in the array (typically right after the index for the newest item).

### Step 5: Verify

After implementing:

1. Run the Docusaurus dev server and confirm sidebar order matches the desired descending sequence
2. Confirm the category index page appears first
3. Confirm new items appear before older items

## Choosing the Base Number

- **10000**: Suitable for semver versions up to v9.9.9
- **100000**: For versions with larger minor/patch ranges
- **99999999**: For date-based (YYYYMMDD) ordering

Pick a base large enough that `sidebar_position` never goes negative.
