#!/usr/bin/env node

/**
 * Surveys the repo-scoped cclogs dir and prints its entries newest-first.
 *
 * Usage:
 *   node $HOME/.claude/scripts/../.claude/skills/cclogs/scripts/survey.js [options]
 *   --limit N     entries to print (default 12; 0 = all)
 *   --dir PATH    survey PATH instead of the current repo's cclogs dir
 *   --repo NAME   survey <cclogs base>/NAME instead of the current repo's dir
 *   --repos       list repo dirs under the cclogs base, newest activity first
 *   --dirs        directories only — prototypes and workflow dirs, which flat
 *                 log files otherwise bury in a log-heavy repo
 *   --find TERM   only entries whose name contains TERM (case-insensitive)
 *
 * Directories are ranked by the newest mtime found *inside* them, not by their
 * own mtime: editing a file deep in a prototype does not touch the parent dir's
 * timestamp, so a plain `ls -t` buries the thing that was just worked on.
 */

import fs from 'fs';
import path from 'path';
import { getLogDir } from '../../../scripts/get-logdir.js';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.cache',
  '.venv',
]);
const WALK_MAX_DEPTH = 4;
const WALK_MAX_ENTRIES = 4000;

function parseArgs(argv) {
  const opts = {
    limit: 12,
    dir: null,
    repo: null,
    repos: false,
    dirs: false,
    find: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') opts.limit = parseInt(argv[++i], 10) || 0;
    else if (a === '--dir') opts.dir = argv[++i];
    else if (a === '--repo') opts.repo = argv[++i];
    else if (a === '--repos') opts.repos = true;
    else if (a === '--dirs') opts.dirs = true;
    else if (a === '--find') opts.find = (argv[++i] || '').toLowerCase();
  }
  return opts;
}

function cclogsBase(logdir) {
  return path.dirname(logdir);
}

/** Newest mtime under `dir`, plus file count and a sample of names. */
function walk(dir) {
  let newest = 0;
  let files = 0;
  let seen = 0;
  const names = [];
  const stack = [[dir, 0]];
  while (stack.length) {
    const [cur, depth] = stack.pop();
    if (depth > WALK_MAX_DEPTH || seen > WALK_MAX_ENTRIES) break;
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name.startsWith('.') && e.name !== '.gitignore') continue;
      seen++;
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        stack.push([full, depth + 1]);
        continue;
      }
      if (!e.isFile()) continue;
      files++;
      if (depth === 0) names.push(e.name);
      try {
        const m = fs.statSync(full).mtimeMs;
        if (m > newest) newest = m;
      } catch {
        /* unreadable — ignore */
      }
    }
  }
  return { newest, files, names };
}

/**
 * What kind of thing is this directory? Drives how the agent opens it: a
 * prototype gets its entry point read, a workflow dir gets plan/progress read,
 * an image dir gets viewed rather than dumped as text.
 */
function classifyDir(dirPath, names) {
  const base = path.basename(dirPath);
  if (base === 'local-workflow') return 'workflow-runs (subdirs)';
  const has = (n) => names.some((f) => f.toLowerCase() === n);
  const anyExt = (exts) =>
    names.some((f) => exts.includes(path.extname(f).toLowerCase()));
  if (has('plan.md') || has('progress.md')) return 'workflow coordination';
  if (has('index.html')) return 'prototype (web)';
  if (anyExt(['.html'])) return 'prototype (web)';
  if (has('package.json')) return 'prototype (node/vite)';
  if (anyExt(['.mjs', '.js', '.ts', '.py']) && !anyExt(['.md']))
    return 'prototype (script)';
  if (anyExt(['.png', '.jpg', '.jpeg', '.gif', '.webp']) && !anyExt(['.md']))
    return 'images';
  if (anyExt(['.scad', '.stl', '.step', '.3mf'])) return 'prototype (cad/3d)';
  if (anyExt(['.md'])) return 'notes';
  return 'files';
}

function classifyFile(name) {
  const ext = path.extname(name).toLowerCase();
  if (ext === '.log') return 'raw log';
  if (ext === '.md') return 'report/log';
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext))
    return 'image';
  return ext.replace('.', '') || 'file';
}

function ago(ms) {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  return d < 60 ? `${d}d ago` : `${Math.floor(d / 30)}mo ago`;
}

function stamp(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function collect(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  const rows = [];
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      const { newest, files, names } = walk(full);
      let mtime = newest;
      if (!mtime) {
        try {
          mtime = fs.statSync(full).mtimeMs;
        } catch {
          mtime = 0;
        }
      }
      rows.push({
        name: e.name + '/',
        mtime,
        kind: classifyDir(full, names),
        detail: `${files} file${files === 1 ? '' : 's'}`,
      });
    } else if (e.isFile()) {
      let st;
      try {
        st = fs.statSync(full);
      } catch {
        continue;
      }
      rows.push({
        name: e.name,
        mtime: st.mtimeMs,
        kind: classifyFile(e.name),
        // A 0-byte file in Dropbox is usually an unsynced online-only
        // placeholder, not an empty artifact — flag it so it is not read as real.
        detail: st.size === 0 ? '0 B (unsynced?)' : `${Math.ceil(st.size / 1024)} KB`,
      });
    }
  }
  rows.sort((a, b) => b.mtime - a.mtime);
  return rows;
}

function render(rows, limit, { kind = true } = {}) {
  const shown = limit > 0 ? rows.slice(0, limit) : rows;
  const w = Math.min(52, Math.max(...shown.map((r) => r.name.length), 4));
  const lines = shown.map(
    (r) =>
      `  ${r.name.padEnd(w).slice(0, w)}  ${stamp(r.mtime)}  ${ago(r.mtime).padStart(8)}  ${kind ? r.kind + '  ' : ''}${r.detail}`
  );
  if (limit > 0 && rows.length > limit) {
    lines.push(`  … ${rows.length - limit} older entr${rows.length - limit === 1 ? 'y' : 'ies'} not shown`);
  }
  return lines.join('\n');
}

const opts = parseArgs(process.argv.slice(2));
const logdir = getLogDir();
const base = cclogsBase(logdir);

if (opts.repos) {
  const rows = collect(base);
  if (!rows) {
    console.log(`cclogs base not readable: ${base}`);
    process.exit(0);
  }
  console.log(`cclogs base: ${base}`);
  console.log(`Repo dirs (${rows.length}), newest activity first:\n`);
  console.log(
    render(
      rows.filter((r) => r.name.endsWith('/')),
      opts.limit,
      { kind: false }
    )
  );
  process.exit(0);
}

const target = opts.dir || (opts.repo ? path.join(base, opts.repo) : logdir);

if (!fs.existsSync(target)) {
  console.log(`No cclogs dir yet: ${target}`);
  console.log(`(base: ${base}) — nothing has been saved for this repo.`);
  process.exit(0);
}

let rows = collect(target) || [];
if (opts.dirs) rows = rows.filter((r) => r.name.endsWith('/'));
if (opts.find) rows = rows.filter((r) => r.name.toLowerCase().includes(opts.find));

console.log(`cclogs dir: ${target}`);
if (opts.dirs || opts.find) {
  console.log(
    `Filter: ${[opts.dirs && 'directories only', opts.find && `"${opts.find}"`].filter(Boolean).join(', ')}`
  );
}
console.log(`${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}, newest first:\n`);
console.log(rows.length ? render(rows, opts.limit) : '  (nothing matched)');
