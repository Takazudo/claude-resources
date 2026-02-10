---
name: headless-browser
description: >-
  Browser automation skill with two efficiency tiers. Tier 1: lightweight headless-check.js for
  quick checks, screenshots, error detection. Tier 2: playwright-cli for interactions (click, fill,
  navigate). Use when: (1) Quick webpage health checks, (2) Taking screenshots, (3) Checking
  console/network errors, (4) Simple interactions like clicking buttons or filling forms, (5)
  Multi-step browser automation. Use MCP Playwright only for complex scenarios requiring persistent
  context or rich introspection.
---

# Headless Browser Skill

Browser automation with two efficiency tiers for optimal token usage.

## Decision Tree

```
Need browser automation?
    |
    +-- Just checking page health/errors/screenshot?
    |       --> Tier 1: headless-check.js (fastest, lowest tokens)
    |
    +-- Need to interact (click, fill, navigate)?
    |       --> Tier 2: playwright-cli (medium tokens)
    |
    +-- Need persistent context, rich introspection, or very complex scenarios?
            --> MCP Playwright (highest capability, higher tokens)
```

---

## Tier 1: Lightweight Checks (headless-check.js)

**Best for:** Quick health checks, screenshot capture, error detection

**Script:** `~/.claude/skills/headless-browser/scripts/headless-check.js`

### Commands

Basic check (recommended for error detection):
```bash
node ~/.claude/skills/headless-browser/scripts/headless-check.js --url <URL> --no-block-resources
```

Quick check (faster, but may miss font/image errors):
```bash
node ~/.claude/skills/headless-browser/scripts/headless-check.js --url <URL>
```

With screenshot:
```bash
node ~/.claude/skills/headless-browser/scripts/headless-check.js --url <URL> --screenshot viewport --no-block-resources
node ~/.claude/skills/headless-browser/scripts/headless-check.js --url <URL> --screenshot full --no-block-resources
```

Options:

- `--timeout <ms>` - Timeout (default: 15000)
- `--wait-until load|networkidle|domcontentloaded` - Wait strategy
- `--no-javascript` - Disable JavaScript
- `--no-block-resources` - Load all resources (recommended for accurate error detection)
- `--user-agent "..."` - Custom user agent

**Important:** Always use `--no-block-resources` when checking for errors. Without it, fonts and images are blocked for speed, which can cause false `net::ERR_FAILED` errors or miss real resource loading failures.

### Output

JSON with:

- `title`, `statusCode`, `finalUrl`, `durationMs`
- `hasErrors` - Boolean error indicator
- `console` - Console messages (truncated, collapsed)
- `pageErrors` - JavaScript errors
- `networkErrors` - Failed requests
- `metrics` - Performance timing
- `screenshot` - File path if captured

### Example Output

```
{
  "url": "https://example.com",
  "title": "Example Domain",
  "statusCode": 200,
  "durationMs": 1234,
  "hasErrors": false,
  "console": { "entries": [], "total": 0 },
  "pageErrors": [],
  "screenshot": { "path": "__inbox/headless-screenshots/screenshot-2025-01-28.png" }
}
```

---

## Tier 2: Interactive Operations (playwright-cli)

**Best for:** Clicking, form filling, navigation, multi-step automation

**No installation required** - uses `pnpm dlx` to run latest version on-demand.

### Command Pattern

All commands use this pattern:
```bash
pnpm dlx @playwright/cli@latest <command> [options]
```

### Core Commands

```bash
# Navigation
pnpm dlx @playwright/cli@latest open <url>           # Open URL (headless)
pnpm dlx @playwright/cli@latest open <url> --headed  # Open with visible browser
pnpm dlx @playwright/cli@latest close                # Close page
pnpm dlx @playwright/cli@latest go-back              # Navigate back
pnpm dlx @playwright/cli@latest go-forward           # Navigate forward
pnpm dlx @playwright/cli@latest reload               # Reload page

# Get Element References (IMPORTANT: run this first!)
pnpm dlx @playwright/cli@latest snapshot             # Get element refs

# Interactions (use refs from snapshot)
pnpm dlx @playwright/cli@latest click <ref>          # Click element
pnpm dlx @playwright/cli@latest dblclick <ref>       # Double-click
pnpm dlx @playwright/cli@latest fill <ref> <text>    # Fill input field
pnpm dlx @playwright/cli@latest type <text>          # Type into focused element
pnpm dlx @playwright/cli@latest select <ref> <val>   # Select dropdown option
pnpm dlx @playwright/cli@latest check <ref>          # Check checkbox
pnpm dlx @playwright/cli@latest uncheck <ref>        # Uncheck checkbox
pnpm dlx @playwright/cli@latest hover <ref>          # Hover over element
pnpm dlx @playwright/cli@latest drag <start> <end>   # Drag and drop

# Screenshots & Output
pnpm dlx @playwright/cli@latest screenshot           # Capture viewport
pnpm dlx @playwright/cli@latest screenshot <ref>     # Capture specific element
pnpm dlx @playwright/cli@latest pdf                  # Save as PDF

# Keyboard & Mouse
pnpm dlx @playwright/cli@latest press <key>          # Press key (Enter, Tab, etc.)
pnpm dlx @playwright/cli@latest keydown <key>        # Key down
pnpm dlx @playwright/cli@latest keyup <key>          # Key up

# Debugging
pnpm dlx @playwright/cli@latest console              # View console messages
pnpm dlx @playwright/cli@latest console error        # View only errors
pnpm dlx @playwright/cli@latest network              # List network requests

# Tabs
pnpm dlx @playwright/cli@latest tab-list             # List tabs
pnpm dlx @playwright/cli@latest tab-new <url>        # Open new tab
pnpm dlx @playwright/cli@latest tab-select <idx>     # Switch tab
pnpm dlx @playwright/cli@latest tab-close            # Close current tab

# JavaScript
pnpm dlx @playwright/cli@latest eval "() => document.title"  # Evaluate JS
```

### Session Management

For persistent browser sessions across commands (REQUIRED for multi-step workflows):

```bash
# Use named session - browser stays open between commands
pnpm dlx @playwright/cli@latest --session mytest open https://example.com
pnpm dlx @playwright/cli@latest --session mytest snapshot
pnpm dlx @playwright/cli@latest --session mytest click ref123
pnpm dlx @playwright/cli@latest --session mytest screenshot

# List/manage sessions
pnpm dlx @playwright/cli@latest session-list
pnpm dlx @playwright/cli@latest session-stop mytest
pnpm dlx @playwright/cli@latest session-stop-all
pnpm dlx @playwright/cli@latest session-delete mytest
```

### Workflow Example

```bash
# 1. Open page with session (keeps browser open)
pnpm dlx @playwright/cli@latest --session todo open https://demo.playwright.dev/todomvc --headed

# 2. Get element references
pnpm dlx @playwright/cli@latest --session todo snapshot
# Output shows refs like: [ref=e5] input.new-todo

# 3. Interact using refs
pnpm dlx @playwright/cli@latest --session todo fill e5 "Buy groceries"
pnpm dlx @playwright/cli@latest --session todo press Enter

# 4. Verify
pnpm dlx @playwright/cli@latest --session todo snapshot

# 5. Screenshot result
pnpm dlx @playwright/cli@latest --session todo screenshot

# 6. Cleanup
pnpm dlx @playwright/cli@latest --session todo close
```

---

## When to Use What

| Task | Recommended Tier |
|------|-----------------|
| Check if page loads | Tier 1 |
| Capture screenshot | Tier 1 |
| Check for console errors | Tier 1 + `--no-block-resources` |
| Check network failures | Tier 1 + `--no-block-resources` |
| Click a button | Tier 2 |
| Fill a form | Tier 2 |
| Navigate through pages | Tier 2 |
| Test login flow | Tier 2 |
| Extract text after interaction | Tier 2 |
| Complex stateful automation | MCP Playwright |
| Self-healing tests | MCP Playwright |
| Deep debugging with tracing | MCP Playwright / Chrome DevTools |

---

## Best Practices

1. **Start with Tier 1** - If you just need to check if a page works, use headless-check.js
2. **Escalate to Tier 2** - When interactions are needed, use playwright-cli
3. **Use sessions** - For multi-step workflows, use `--session` to maintain state
4. **Get refs first** - Always run `snapshot` before interacting to get current element refs
5. **Use --headed for debugging** - See what's happening in the browser

---

## Technical Notes

- Tier 1 script uses headless Chromium
- **Resource blocking:** By default, Tier 1 blocks images/fonts for speed. Use `--no-block-resources` for accurate error detection (fonts/images will load, catching real failures)
- Tier 2 uses `pnpm dlx` - no global install needed, always runs latest version
- Tier 2 is headless by default, use `--headed` to see browser
- Screenshots saved to `__inbox/headless-screenshots/` (Tier 1) or current directory (Tier 2)
- Both tiers are more token-efficient than MCP Playwright
- First `pnpm dlx` call may be slower (downloads package), subsequent calls are cached
