#!/usr/bin/env node

/**
 * Lightweight Headless Browser Checker
 *
 * A token-efficient webpage checker that captures essential information
 * without the overhead of full MCP Playwright.
 *
 * Features:
 * - Headless Chromium via Playwright
 * - Compact JSON output with size limits
 * - Console error detection
 * - Network error tracking
 * - Optional screenshot capture
 * - Resource blocking for faster loads
 *
 * Usage:
 *   node scripts/headless-check.js --url https://example.com
 *   node scripts/headless-check.js --url https://example.com --screenshot viewport
 *   echo '{"url":"https://example.com"}' | node scripts/headless-check.js
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// API Version
const API_VERSION = 'v1';
const SKILL_VERSION = '1.0.0';

// Default configuration
const DEFAULT_CONFIG = {
  timeoutMs: 15000,
  waitUntil: 'networkidle',
  captureScreenshot: 'none', // 'none' | 'viewport' | 'full'
  javascriptEnabled: true,
  blockResources: true,
  maxConsoleEntries: 20,
  maxFailedRequests: 10,
  maxTextLength: 512,
  userAgent: null,
  viewport: { width: 1280, height: 720 },
};

/**
 * Parse command line arguments and stdin
 */
async function parseInput() {
  const args = process.argv.slice(2);

  // Try to parse stdin if available
  if (!process.stdin.isTTY) {
    try {
      const stdin = await new Promise((resolve, reject) => {
        let data = '';
        process.stdin.on('data', (chunk) => (data += chunk));
        process.stdin.on('end', () => resolve(data));
        process.stdin.on('error', reject);
        setTimeout(() => resolve(null), 100);
      });

      if (stdin) {
        return JSON.parse(stdin);
      }
    } catch (error) {
      console.error('Failed to parse stdin JSON:', error.message);
    }
  }

  // Parse CLI arguments
  const config = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    if (arg === '--url' && nextArg) {
      config.url = nextArg;
      i++;
    } else if (arg === '--timeout' && nextArg) {
      config.timeoutMs = parseInt(nextArg, 10);
      i++;
    } else if (arg === '--wait-until' && nextArg) {
      config.waitUntil = nextArg;
      i++;
    } else if (arg === '--screenshot' && nextArg) {
      config.captureScreenshot = nextArg;
      i++;
    } else if (arg === '--no-javascript') {
      config.javascriptEnabled = false;
    } else if (arg === '--no-block-resources') {
      config.blockResources = false;
    } else if (arg === '--user-agent' && nextArg) {
      config.userAgent = nextArg;
      i++;
    }
  }

  return config;
}

/**
 * Truncate text to max length
 */
function truncateText(text, maxLength = DEFAULT_CONFIG.maxTextLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '... [truncated]';
}

/**
 * Collapse duplicate console messages
 */
function collapseConsoleMessages(logs, maxEntries) {
  const collapsed = new Map();

  for (const log of logs) {
    const key = `${log.type}:${log.text}`;
    if (collapsed.has(key)) {
      collapsed.get(key).count++;
    } else {
      collapsed.set(key, { ...log, count: 1 });
    }
  }

  const result = Array.from(collapsed.values())
    .slice(0, maxEntries)
    .map((log) => ({
      type: log.type,
      text: truncateText(log.text),
      count: log.count,
    }));

  return {
    entries: result,
    total: logs.length,
    truncated: logs.length > maxEntries,
  };
}

/**
 * Check a single URL
 */
async function checkUrl(url, config) {
  const startTime = Date.now();
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  let browser = null;
  let context = null;
  let page = null;

  try {
    // Launch browser
    browser = await chromium.launch({
      headless: true,
      timeout: mergedConfig.timeoutMs,
    });

    // Create context
    const contextOptions = {
      ignoreHTTPSErrors: true,
      viewport: mergedConfig.viewport,
      javaScriptEnabled: mergedConfig.javascriptEnabled,
    };

    if (mergedConfig.userAgent) {
      contextOptions.userAgent = mergedConfig.userAgent;
    }

    context = await browser.newContext(contextOptions);
    page = await context.newPage();

    // Collectors
    const consoleLogs = [];
    const pageErrors = [];
    const failedRequests = [];
    let blockedCount = 0;

    // Block heavy resources if requested
    if (mergedConfig.blockResources) {
      await page.route(
        '**/*.{png,jpg,jpeg,gif,webp,svg,ico,mp4,webm,woff,woff2,ttf,eot}',
        (route) => {
          blockedCount++;
          route.abort();
        },
      );
    }

    // Collect console messages
    page.on('console', (msg) => {
      consoleLogs.push({
        type: msg.type(),
        text: msg.text(),
      });
    });

    // Collect page errors
    page.on('pageerror', (err) => {
      pageErrors.push({
        message: truncateText(err.message),
        stack: truncateText(err.stack),
      });
    });

    // Collect failed requests
    page.on('requestfailed', (request) => {
      if (failedRequests.length < mergedConfig.maxFailedRequests) {
        failedRequests.push({
          url: request.url(),
          method: request.method(),
          error: request.failure()?.errorText || 'Unknown error',
        });
      }
    });

    // Navigate to page
    const response = await page.goto(url, {
      timeout: mergedConfig.timeoutMs,
      waitUntil: mergedConfig.waitUntil,
    });

    // Wait a bit for dynamic content
    await page.waitForTimeout(2000);

    // Get basic page info
    const title = await page.title();
    const finalUrl = page.url();
    const statusCode = response?.status() || null;

    // Get performance metrics
    const metrics = await page.evaluate(() => {
      const perfData = window.performance.timing;
      return {
        domContentLoadedMs:
          perfData.domContentLoadedEventEnd - perfData.navigationStart,
        loadMs: perfData.loadEventEnd - perfData.navigationStart,
      };
    });

    // Capture screenshot if requested
    let screenshot = null;
    if (mergedConfig.captureScreenshot !== 'none') {
      const screenshotBuffer = await page.screenshot({
        fullPage: mergedConfig.captureScreenshot === 'full',
        type: 'png',
      });

      // Save to temp file in current working directory
      const tempDir = path.join(process.cwd(), '__inbox/headless-screenshots');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `screenshot-${timestamp}.png`;
      const filepath = path.join(tempDir, filename);

      fs.writeFileSync(filepath, screenshotBuffer);

      screenshot = {
        path: filepath,
        bytes: screenshotBuffer.length,
      };
    }

    const duration = Date.now() - startTime;

    // Process console logs
    const console = collapseConsoleMessages(
      consoleLogs,
      mergedConfig.maxConsoleEntries,
    );

    // Determine if there are errors
    const hasErrors =
      pageErrors.length > 0 ||
      console.entries.some((log) => log.type === 'error');

    // Build result
    return {
      apiVersion: API_VERSION,
      skillVersion: SKILL_VERSION,
      url,
      finalUrl,
      title,
      statusCode,
      durationMs: duration,
      hasErrors,
      console,
      pageErrors: pageErrors.slice(0, 10), // Limit to 10
      networkErrors: {
        failedRequests,
        totalFailed: failedRequests.length,
        blockedCount,
      },
      metrics,
      screenshot,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      apiVersion: API_VERSION,
      skillVersion: SKILL_VERSION,
      url,
      error: {
        message: truncateText(error.message),
        stack: truncateText(error.stack),
      },
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  } finally {
    // Cleanup
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    const input = await parseInput();

    if (!input || !input.url) {
      console.error('Error: URL is required');
      console.error(
        'Usage: node scripts/headless-check.js --url https://example.com',
      );
      console.error(
        '   or: echo \'{"url":"https://example.com"}\' | node scripts/headless-check.js',
      );
      process.exit(1);
    }

    console.error(`🔍 Checking: ${input.url}`);

    const result = await checkUrl(input.url, input);

    // Output JSON to stdout
    console.log(JSON.stringify(result, null, 2));

    // Log summary to stderr
    if (result.error) {
      console.error(`❌ Error: ${result.error.message}`);
      process.exit(1);
    } else {
      console.error(`✅ Completed in ${result.durationMs}ms`);
      console.error(`   Title: ${result.title}`);
      console.error(`   Status: ${result.statusCode}`);
      console.error(`   Console entries: ${result.console.total}`);
      console.error(`   Page errors: ${result.pageErrors.length}`);
      console.error(`   Failed requests: ${result.networkErrors.totalFailed}`);
      if (result.screenshot) {
        console.error(`   Screenshot: ${result.screenshot.path}`);
      }
      process.exit(0);
    }
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Execute
main();
