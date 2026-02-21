#!/usr/bin/env node

/**
 * Figma page capture script.
 * Uses Playwright to open a URL, inject Figma's capture.js, and submit the DOM to Figma.
 *
 * Usage:
 *   node figma-capture.mjs --url <URL> --capture-id <ID>
 *
 * Options:
 *   --url          Target page URL (required)
 *   --capture-id   Figma capture ID from generate_figma_design (required)
 *   --headless     Run headless (default: true)
 *   --delay        Wait ms before capture (default: 1000)
 *   --selector     CSS selector to capture (default: body)
 *   --viewport-w   Viewport width (default: 1440)
 *   --viewport-h   Viewport height (default: 900)
 */

import { chromium } from 'playwright';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    url: null,
    captureId: null,
    headless: true,
    delay: 1000,
    selector: 'body',
    viewportW: 1440,
    viewportH: 900,
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--url': opts.url = args[++i]; break;
      case '--capture-id': opts.captureId = args[++i]; break;
      case '--headless': opts.headless = args[++i] !== 'false'; break;
      case '--delay': opts.delay = parseInt(args[++i], 10); break;
      case '--selector': opts.selector = args[++i]; break;
      case '--viewport-w': opts.viewportW = parseInt(args[++i], 10); break;
      case '--viewport-h': opts.viewportH = parseInt(args[++i], 10); break;
    }
  }
  if (!opts.url || !opts.captureId) {
    console.error('Usage: node figma-capture.mjs --url <URL> --capture-id <ID>');
    process.exit(1);
  }
  return opts;
}

const opts = parseArgs();
const endpoint = `https://mcp.figma.com/mcp/capture/${opts.captureId}/submit`;

const browser = await chromium.launch({ headless: opts.headless });
const context = await browser.newContext({
  viewport: { width: opts.viewportW, height: opts.viewportH },
});
const page = await context.newPage();

// Log browser console for debugging
page.on('console', (msg) => {
  const text = msg.text();
  if (text.includes('[Figma Capture]')) {
    console.log(text);
  }
});

// Strip CSP headers to allow script injection
await page.route('**/*', async (route) => {
  const response = await route.fetch();
  const headers = { ...response.headers() };
  delete headers['content-security-policy'];
  delete headers['content-security-policy-report-only'];
  await route.fulfill({ response, headers });
});

console.log(`Opening ${opts.url}...`);
await page.goto(opts.url, { waitUntil: 'networkidle' });
console.log('Page loaded');

// Inject Figma capture script
const r = await context.request.get('https://mcp.figma.com/mcp/html-to-design/capture.js');
await page.evaluate((s) => {
  const el = document.createElement('script');
  el.textContent = s;
  document.head.appendChild(el);
}, await r.text());
console.log('Capture script injected');

// Wait for window.figma.captureForDesign
const ready = await page.evaluate(() => {
  return new Promise((resolve) => {
    let tries = 0;
    const check = () => {
      if (window.figma && window.figma.captureForDesign) return resolve(true);
      if (++tries > 50) return resolve(false);
      setTimeout(check, 200);
    };
    check();
  });
});

if (!ready) {
  console.error('ERROR: window.figma.captureForDesign not available');
  await browser.close();
  process.exit(1);
}

if (opts.delay > 0) {
  await page.waitForTimeout(opts.delay);
}

console.log('Capturing...');
try {
  await Promise.race([
    page.evaluate(({ captureId, endpoint, selector }) => {
      return window.figma.captureForDesign({ captureId, endpoint, selector });
    }, { captureId: opts.captureId, endpoint, selector: opts.selector }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 60000)),
  ]);
  console.log('CAPTURE_COMPLETE');
} catch (err) {
  // The capture often succeeds (confirmed by console logs) but the promise doesn't resolve.
  // Check if we saw success in the console output.
  console.log(`CAPTURE_DONE_WITH_TIMEOUT`);
}

await browser.close();
