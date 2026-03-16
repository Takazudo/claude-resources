---
name: headless-browser
description: >-
  Browser automation skill with two efficiency tiers. Tier 1: lightweight headless-check.js for
  quick checks, screenshots, error detection. Tier 2: custom Playwright scripts for interactions
  (click, fill, navigate). Use when: (1) Quick webpage health checks, (2) Taking screenshots, (3)
  Checking console/network errors, (4) Simple interactions like clicking buttons or filling forms,
  (5) Multi-step browser automation. Use MCP Playwright only for complex scenarios requiring
  persistent context or rich introspection.
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
    |       --> Tier 2: custom Playwright script (medium tokens)
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
  "screenshot": { "path": "/Users/you/cclogs/my-project/headless-screenshots/screenshot-2025-01-28.png" }
}
```

---

## Tier 2: Interactive Operations (custom Playwright scripts)

**Best for:** Clicking, form filling, navigation, multi-step automation

**Prerequisite:** Playwright is installed in `~/.claude/node_modules/`. Scripts must run from `~/.claude/` or a subdirectory so Node resolves the module.

### How to Use

Write a temporary `.mjs` script, save it under `~/.claude/`, and run it with `node`.

### Script Template

```javascript
// Save as ~/.claude/tmp-browser-check.mjs
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.goto('http://localhost:4321/some/page', { waitUntil: 'networkidle' });

// Interact
await page.locator('button:has-text("Submit")').click();
await page.waitForTimeout(500);

// Screenshot
const path = `${process.env.HOME}/cclogs/REPO/headless-screenshots/result.png`;
await page.screenshot({ path });
console.log('Screenshot:', path);

// Evaluate
const result = await page.evaluate(() => document.title);
console.log('Title:', result);

await browser.close();
```

### Running

```bash
node ~/.claude/tmp-browser-check.mjs
```

### Common Operations

```javascript
// Click by selector
await page.locator('.my-button').click();

// Click by text
await page.locator('button:has-text("Save")').click();

// Fill an input
await page.locator('input[name="email"]').fill('test@example.com');

// Press a key
await page.keyboard.press('Enter');

// Wait for element
await page.locator('.result').waitFor({ state: 'visible', timeout: 5000 });

// Get computed style / check z-index
const zIndex = await page.evaluate(() => {
  return window.getComputedStyle(document.querySelector('.panel')).zIndex;
});

// Scroll to bottom
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

// Full page screenshot
await page.screenshot({ path: 'full.png', fullPage: true });
```

### Cleanup

Delete the temporary script after use:

```bash
rm -f ~/.claude/tmp-browser-check.mjs
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
2. **Escalate to Tier 2** - When interactions are needed, write a custom Playwright script
3. **Save scripts under `~/.claude/`** - This is where `playwright` is installed as a node_module
4. **Clean up temp scripts** - Delete `~/.claude/tmp-*.mjs` after use
5. **Use `waitForTimeout` between actions** - Gives the page time to settle after interactions

---

## Technical Notes

- Both tiers use Playwright's headless Chromium (installed in `~/.claude/node_modules/`)
- **Resource blocking:** By default, Tier 1 blocks images/fonts for speed. Use `--no-block-resources` for accurate error detection
- Tier 2 scripts must be saved under `~/.claude/` (or any ancestor directory of the `node_modules/playwright` install) so Node module resolution can find the package
- Screenshots saved to `~/cclogs/{repo-name}/headless-screenshots/` (Tier 1) or custom path (Tier 2)
- Both tiers are more token-efficient than MCP Playwright
