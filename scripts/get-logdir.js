#!/usr/bin/env node

/**
 * Resolves the centralized log directory for the current git project.
 *
 * Usage:
 *   - As module: import { getLogDir } from './get-logdir.js';
 *   - As CLI:    node $HOME/.claude/scripts/get-logdir.js  (prints path to stdout)
 *   - In agents: {logdir} placeholder in save-file.js resolves via this module
 *
 * Base dir is the Dropbox-synced cclogs dir (shared across Mac + WSL):
 *   1. $DROPBOX_CCLOGS_DIR when set (defined in ~/.zshrc for macOS + WSL2)
 *   2. platform default when the env var is missing (hooks / cron / non-login
 *      shells don't source ~/.zshrc): macOS -> ~/Library/CloudStorage/Dropbox/cclogs,
 *      WSL2/Linux -> /mnt/c/Users/takaz/Dropbox/cclogs
 *   3. ~/cclogs as a last-resort fallback (on macOS this is a symlink to #2)
 *
 * Returns: <base>/{repo-basename}/ (worktrees resolve to main repo)
 * Fallback: <base>/_misc/ (when not in a git repository)
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

function cclogsBase() {
  const env = process.env.DROPBOX_CCLOGS_DIR;
  if (env && env.trim()) return env.trim();
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'CloudStorage', 'Dropbox', 'cclogs');
  }
  if (process.platform === 'linux') {
    return '/mnt/c/Users/takaz/Dropbox/cclogs';
  }
  return path.join(os.homedir(), 'cclogs');
}

function sanitizeSlug(raw) {
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (cleaned === '.' || cleaned === '..' || cleaned === '') {
    return '_unnamed';
  }
  return cleaned;
}

export function getLogDir() {
  const base = cclogsBase();
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
    return path.join(base, sanitizeSlug(slug));
  } catch {
    return path.join(base, '_misc');
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
