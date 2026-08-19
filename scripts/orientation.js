#!/usr/bin/env node

/**
 * Session-scoped "where am I" pointer, written by the long-running workflow
 * skills and read back by hooks/compact-reorient.sh after a context compaction.
 *
 * Why this exists: a long workflow (/x-wt-teams, /x-as-pr, /big-plan) keeps its
 * real progress in a GitHub tracking issue or a cclogs progress.md. Neither
 * survives compaction intact — the issue was read via `gh` (not a file, so the
 * post-compaction file-restore pass cannot bring it back), and the summary drops
 * step-level detail. This file deliberately stores *where to look*, never the
 * progress itself: a few hundred bytes the compaction hook can turn into a
 * re-orientation instruction that sends the session back to the real tracker.
 *
 * Usage:
 *   node $HOME/.claude/scripts/orientation.js begin --workflow x-wt-teams --issue 42
 *   node $HOME/.claude/scripts/orientation.js set --step "Step 5: spawn children"
 *   node $HOME/.claude/scripts/orientation.js complete
 *   node $HOME/.claude/scripts/orientation.js show
 *   node $HOME/.claude/scripts/orientation.js clear
 *
 * `begin` starts a run, dropping every field of the previous one — without it a
 * second workflow in the same session inherits the first one's issue / PR /
 * localDir and the hook confidently points at the wrong tracker. `set` merges,
 * so each later call passes only what it learned. `complete` marks the run
 * finished but keeps the record: the hook then explicitly says "do not resume",
 * which is more useful after a compaction than the pointer simply vanishing.
 *
 * Session id comes from CLAUDE_CODE_SESSION_ID — note that CLAUDE_SESSION_ID
 * (the name one would guess) is NOT set by Claude Code. With no session id there
 * is nothing to key on, so every subcommand exits 0 in silence: a bookkeeping
 * helper must never break the workflow that calls it.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const PRUNE_AFTER_DAYS = 7;

// --flag-name -> record key. Anything not listed here is rejected, so a typo'd
// flag fails loudly at authoring time instead of silently writing a dead field
// the hook will never read.
const FIELDS = {
  '--workflow': 'workflow',
  '--issue': 'issue',
  '--issue-url': 'issueUrl',
  '--repo': 'repo',
  '--local-dir': 'localDir',
  '--base-branch': 'baseBranch',
  '--branch': 'branch',
  '--pr': 'pr',
  '--step': 'step',
  '--note': 'note',
};

// Fields owned by a single workflow run. `begin` wipes exactly these and leaves
// the session-level bookkeeping (sessionId, startedAt) alone. repoRoot is in the
// list because the hook DROPS a pointer whose repoRoot disagrees with the repo it
// is running in: if `begin` fires somewhere git cannot answer, a retained root
// from the previous run would silently disable re-orientation for the new one.
const RUN_SCOPED = [...Object.values(FIELDS), 'status', 'completedAt', 'repoRoot'];

const USAGE = `usage: orientation.js begin [flags]   start a run (clears the previous run's fields)
       orientation.js set   [flags]   merge-update the current run
       orientation.js complete        mark the run finished (record kept)
       orientation.js show            print the current record
       orientation.js clear           delete the record

flags: --workflow N --issue N --issue-url U --repo O/R --local-dir P
       --base-branch B --branch B --pr U --step S --note S
`;

function orientationDir() {
  return path.join(os.homedir(), '.claude', 'orientation');
}

function sessionId() {
  const id = process.env.CLAUDE_CODE_SESSION_ID || process.env.CLAUDE_SESSION_ID;
  return id && id.trim() ? id.trim() : null;
}

// Session ids are UUIDs from the harness, but this value becomes a filename —
// refuse anything that could escape the directory rather than trusting it.
function pointerPath(id) {
  if (!/^[A-Za-z0-9._-]+$/.test(id)) return null;
  return path.join(orientationDir(), `${id}.json`);
}

// Recorded so the hook can refuse to re-orient a session that has since moved to
// a different repository — a stale pointer aimed at the wrong repo is worse than
// no pointer at all.
function repoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

function readPointer(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function writePointer(file, record) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Write-then-rename: the compaction hook may read this at any moment, and a
  // torn half-written JSON would make it silently emit nothing.
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

// Session pointers are per-session and never revisited, so they accumulate the
// way ~/.claude/session-env has (2300+ dirs). Sweep opportunistically on write.
function prune(dir, keepFile) {
  const cutoff = Date.now() - PRUNE_AFTER_DAYS * 24 * 60 * 60 * 1000;
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const full = path.join(dir, entry);
    if (full === keepFile) continue;
    try {
      if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
    } catch {
      // A pointer we cannot stat or unlink is not worth failing a workflow over.
    }
  }
}

function parseArgs(argv) {
  const updates = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const key = FIELDS[flag];
    if (!key) {
      process.stderr.write(`orientation.js: unknown flag ${flag}\n`);
      process.exit(2);
    }
    const value = argv[++i];
    if (value === undefined) {
      process.stderr.write(`orientation.js: ${flag} needs a value\n`);
      process.exit(2);
    }
    // An empty value means the caller's variable was unset — callers pass the
    // full flag set unconditionally (`--issue "$ISSUE_NUMBER"`) and let this
    // drop the blanks. The obvious alternative, `${ISSUE_NUMBER:+--issue "$…"}`,
    // is a trap: zsh does not word-split it, so the flag and value arrive as a
    // single argv element and the call fails.
    if (value !== '') updates[key] = value;
  }
  return updates;
}

function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === 'help' || command === '--help') {
    process.stdout.write(USAGE);
    return;
  }
  if (!['begin', 'set', 'complete', 'show', 'clear'].includes(command)) {
    process.stderr.write(`orientation.js: unknown command ${command}\n${USAGE}`);
    process.exit(2);
  }

  const id = sessionId();
  const file = id ? pointerPath(id) : null;
  // No session id (or an unusable one) means no key to store under. Stay quiet:
  // the caller is a workflow step, not a user asking for this file.
  if (!file) return;

  if (command === 'show') {
    if (fs.existsSync(file)) process.stdout.write(fs.readFileSync(file, 'utf8'));
    return;
  }

  if (command === 'clear') {
    try {
      fs.unlinkSync(file);
    } catch {
      // Already gone is the desired end state.
    }
    return;
  }

  const updates = command === 'complete' ? {} : parseArgs(rest);
  const existing = readPointer(file);
  const now = new Date().toISOString();

  let record;
  if (command === 'begin') {
    record = { ...existing };
    for (const key of RUN_SCOPED) delete record[key];
    record = { ...record, ...updates, status: 'active', startedAt: now };
  } else if (command === 'complete') {
    record = { ...existing, status: 'complete', completedAt: now };
  } else {
    // A bare `set` with no prior `begin` still starts an active run, so a skill
    // that only ever calls `set` is not silently useless.
    record = { ...existing, ...updates, status: 'active' };
    delete record.completedAt;
    if (!record.startedAt) record.startedAt = now;
  }

  record.sessionId = id;
  record.cwd = process.cwd();
  record.updatedAt = now;
  const root = repoRoot();
  if (root) record.repoRoot = root;

  try {
    writePointer(file, record);
    prune(orientationDir(), file);
  } catch (err) {
    process.stderr.write(`orientation.js: could not write pointer (${err.message})\n`);
    // Deliberately exit 0 — a lost pointer degrades re-orientation, it does not
    // invalidate the workflow step that called us.
  }
}

main();
