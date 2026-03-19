import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Returns directories that dev-stable.js should watch for changes.
 * Includes both the doc site sources and the claude resources that
 * the claude-resources Astro integration reads at build time.
 *
 * @param {string} root - The doc project root (e.g. ~/.claude/doc)
 * @returns {string[]} Absolute paths to watch
 */
export function getWatchDirs(root) {
  const claudeDir = resolve(root, "..");

  const candidates = [
    // Doc site sources
    join(root, "src"),
    join(root, "public"),
    // Claude resources (read by claude-resources integration at build time)
    claudeDir,
    join(claudeDir, "commands"),
    join(claudeDir, "skills"),
    join(claudeDir, "agents"),
  ];

  return candidates.filter((dir) => existsSync(dir));
}
