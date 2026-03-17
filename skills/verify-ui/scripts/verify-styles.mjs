#!/usr/bin/env node

// Extracts computed styles, bounding box, and captures screenshots for a target element.
// Usage: node verify-styles.mjs <URL> <SELECTOR> [SCREENSHOT_DIR] [WIDTHS] [SCHEMES]
//
// Examples:
//   node verify-styles.mjs "http://localhost:4321/" "dialog"
//   node verify-styles.mjs "http://localhost:4321/" ".card" "./screenshots" "400,800,1200" "light,dark"
//
// Playwright must be importable. The script tries common locations.

async function findPlaywright() {
  // Try project node_modules first (pnpm stores in .pnpm/)
  const { execSync } = await import("node:child_process");
  try {
    const result = execSync(
      'find node_modules/.pnpm -name "playwright-core" -type d -maxdepth 4 2>/dev/null | head -1',
      { encoding: "utf-8" }
    ).trim();
    if (result) {
      const mod = await import(`${process.cwd()}/${result}/index.mjs`);
      return mod;
    }
  } catch {}
  // Try direct import
  try {
    return await import("playwright-core");
  } catch {}
  try {
    return await import("playwright");
  } catch {}
  console.error(
    "Error: playwright-core not found. Install it in the project or globally."
  );
  process.exit(1);
}

const CSS_PROPERTIES = [
  "display",
  "position",
  "width",
  "height",
  "max-width",
  "max-height",
  "margin",
  "padding",
  "border-width",
  "border-style",
  "border-color",
  "border-radius",
  "background-color",
  "color",
  "font-size",
  "font-weight",
  "line-height",
  "box-shadow",
  "z-index",
  "opacity",
  "overflow",
  "top",
  "right",
  "bottom",
  "left",
  "inset",
];

const url = process.argv[2];
const selector = process.argv[3];
const ssDir = process.argv[4] || "./verify-ui-screenshots";
const widths = (process.argv[5] || "400,800,1200")
  .split(",")
  .map((w) => parseInt(w.trim(), 10));
const schemes = (process.argv[6] || "light,dark").split(",").map((s) => s.trim());

if (!url || !selector) {
  console.error("Usage: node verify-styles.mjs <URL> <SELECTOR> [SS_DIR] [WIDTHS] [SCHEMES]");
  process.exit(1);
}

const { mkdirSync } = await import("node:fs");
const path = await import("node:path");
mkdirSync(ssDir, { recursive: true });

const { chromium } = await findPlaywright();
const browser = await chromium.launch();
const report = { url, selector, timestamp: new Date().toISOString(), styles: {}, screenshots: [] };

// --- Layer 1: Computed style extraction (use first width/scheme) ---
const stylePage = await browser.newPage({
  viewport: { width: widths[0], height: 800 },
  colorScheme: schemes[0],
});
await stylePage.goto(url, { waitUntil: "networkidle" });

report.styles = await stylePage.evaluate(
  ({ sel, props }) => {
    const el = document.querySelector(sel);
    if (!el) return { error: `Element not found: ${sel}` };
    const computed = window.getComputedStyle(el);
    const result = {};
    for (const prop of props) {
      result[prop] = computed.getPropertyValue(prop);
    }
    const rect = el.getBoundingClientRect();
    result["__boundingBox"] = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
    result["__visible"] = el.offsetParent !== null || el.tagName === "DIALOG";
    result["__tagName"] = el.tagName.toLowerCase();
    result["__classList"] = Array.from(el.classList);
    return result;
  },
  { sel: selector, props: CSS_PROPERTIES }
);
await stylePage.close();

// --- Layer 2: Screenshots at each width x scheme ---
for (const scheme of schemes) {
  for (const width of widths) {
    const page = await browser.newPage({
      viewport: { width, height: 800 },
      colorScheme: scheme,
    });
    await page.goto(url, { waitUntil: "networkidle" });
    const filename = `${scheme}-${width}w.png`;
    const filepath = path.join(ssDir, filename);
    await page.screenshot({ path: filepath });
    report.screenshots.push({ scheme, width, path: filepath });
    await page.close();
  }
}

await browser.close();

// --- Output ---
console.log(JSON.stringify(report, null, 2));
