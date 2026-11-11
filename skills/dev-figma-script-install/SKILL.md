---
name: dev-figma-script-install
description: "Guide installing the Figma capture script in a web project. Use for 'figma script install', 'add figma capture', 'figma setup'."
argument-hint: ""
---

# Figma Capture Script Installation

Guide for adding Figma's capture script to a web project so pages can be captured to Figma without Playwright injection.

## Background

Figma MCP's `generate_figma_design` tool captures a rendered web page and converts it into editable Figma layers. The capture requires Figma's serializer script loaded on the page. Two approaches:

1. **Script in HTML** (this skill) - embed the script for dev-only use. Simpler, faster.
2. **Playwright injection** (via `/dev-figma-capture`) - inject at runtime. No source changes but heavier.

## The Script

```html
<script src="https://mcp.figma.com/mcp/html-to-design/capture.js" async></script>
```

What it does:

- Walks entire DOM tree, reads computed styles, layout, fonts, images
- Serializes everything into JSON (~several MB for typical pages)
- Listens for capture parameters via URL hash fragment
- POSTs serialized data to Figma's API when triggered

## Installation Guidance

Add the script to the project's HTML **only in development mode**. Never ship to production.

### Recommended Pattern (React/Vite)

```jsx
{process.env.NODE_ENV === 'development' && (
  <script src="https://mcp.figma.com/mcp/html-to-design/capture.js" async />
)}
```

## Important Notes

- Place in `<head>` or end of `<body>`
- Loads asynchronously, minimal performance impact
- **Never ship to production** - serializes entire DOM structure
- After installation, `/dev-figma-capture` can use the simpler URL fragment approach instead of Playwright
- The actual file edit should be done by the main agent based on the project's framework
