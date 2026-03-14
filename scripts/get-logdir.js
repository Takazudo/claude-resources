#!/usr/bin/env node

/**
 * Resolves the centralized log directory for the current git project.
 *
 * Usage:
 *   - As module: import { getLogDir } from './get-logdir.js';
 *   - As CLI:    node ~/.claude/scripts/get-logdir.js  (prints path to stdout)
 *   - In agents: {logdir} placeholder in save-file.js resolves via this module
 *
 * Returns: ~/cclogs/{repo-basename}/ (worktrees resolve to main repo)
 * Fallback: ~/cclogs/_misc/ (when not in a git repository)
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

function sanitizeSlug(raw) {
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (cleaned === '.' || cleaned === '..' || cleaned === '') {
    return '_unnamed';
  }
  return cleaned;
}

export function getLogDir() {
  try {
    const toplevel = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const gitPath = path.join(toplevel, '.git');
    let slug;
    if (fs.statSync(gitPath).isFile()) {
      // Inside a worktree — trace to main repo
      const commonDir = execSync('git rev-parse --git-common-dir', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      slug = path.basename(path.dirname(path.resolve(commonDir)));
    } else {
      slug = path.basename(toplevel);
    }
    return path.join(os.homedir(), 'cclogs', sanitizeSlug(slug));
  } catch {
    return path.join(os.homedir(), 'cclogs', '_misc');
  }
}

// CLI mode: print logdir path when run directly
const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(new URL(import.meta.url).pathname);
if (isDirectRun) {
  console.log(getLogDir());
}
