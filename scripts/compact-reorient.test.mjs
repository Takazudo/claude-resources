// Fixture tests for the post-compaction re-orientation pair:
//   scripts/orientation.js      — writes the per-session pointer
//   hooks/compact-reorient.sh   — reads it back on PreCompact / SessionStart:compact
//
// Everything runs against a throwaway HOME and throwaway git repos, so the real
// ~/.claude/orientation and the real cclogs dir are never touched.
//
// The two properties worth protecting here are easy to regress silently:
//   1. the hook is SILENT unless it actually found live workflow state — an
//      unconditional hook would inject noise into every compaction of every session;
//   2. the SessionStart leg emits valid JSON no matter what characters end up in
//      the pointer fields, and never exits non-zero (an exit 2 on the PreCompact
//      leg BLOCKS compaction).
//
// Run:  node --test scripts/compact-reorient.test.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ORIENTATION = path.join(HERE, 'orientation.js');
const HOOK = path.join(HERE, '..', 'hooks', 'compact-reorient.sh');

const cleanups = [];
after(() => {
  for (const dir of cleanups.splice(0)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reorient-test-'));
  cleanups.push(root);
  return root;
}

function makeRepo(root, branch = 'main') {
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo, { recursive: true });
  const git = (...args) =>
    execFileSync('git', args, { cwd: repo, stdio: ['pipe', 'pipe', 'pipe'] });
  git('init', '-q', '.');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  git('commit', '-q', '--allow-empty', '-m', 'init');
  // -B, not -b: `git init` may already have created the requested name.
  git('checkout', '-q', '-B', branch);
  return repo;
}

function orientation(args, { home, cwd, sessionId = 'sess-1' }) {
  return spawnSync(process.execPath, [ORIENTATION, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, HOME: home, CLAUDE_CODE_SESSION_ID: sessionId },
  });
}

function pointerFile(home, sessionId = 'sess-1') {
  return path.join(home, '.claude', 'orientation', `${sessionId}.json`);
}

function readPointer(home, sessionId = 'sess-1') {
  return JSON.parse(fs.readFileSync(pointerFile(home, sessionId), 'utf8'));
}

// A stand-in for GNU stat(1), which is what the hook meets on WSL. The trap it
// reproduces: GNU reads `-f` as --file-system and `%m` as a filename, so it
// prints a multi-line filesystem report for the real file BEFORE failing.
function gnuStatShim(root) {
  const bin = path.join(root, 'shim-bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(
    path.join(bin, 'stat'),
    `#!/bin/bash
if [ "$1" = "-f" ]; then
  echo "stat: cannot read file system information for '$2': No such file or directory" >&2
  printf '  File: "%s"\\n    ID: 1 Namelen: 255 Type: ext2/ext3\\nBlock size: 4096\\n' "$3"
  exit 1
fi
if [ "$1" = "-c" ]; then
  exec ${JSON.stringify(process.execPath)} -e 'process.stdout.write(String(Math.floor(require("fs").statSync(process.argv[1]).mtimeMs/1000)))' "$3"
fi
exit 1
`,
    { mode: 0o755 }
  );
  return bin;
}

function runHook({ home, cwd, event = 'SessionStart', sessionId = 'sess-1', raw, pathPrefix }) {
  const input =
    raw ??
    JSON.stringify({
      hook_event_name: event,
      source: event === 'SessionStart' ? 'compact' : undefined,
      trigger: event === 'PreCompact' ? 'auto' : undefined,
      session_id: sessionId,
      cwd,
    });
  const env = { ...process.env, HOME: home };
  if (pathPrefix) env.PATH = `${pathPrefix}${path.delimiter}${env.PATH}`;
  return spawnSync('/bin/bash', [HOOK], { cwd, input, encoding: 'utf8', env });
}

// --------------------------------------------------------------------------
// orientation.js
// --------------------------------------------------------------------------

test('orientation: no session id writes nothing and still exits 0', () => {
  const home = sandbox();
  const res = spawnSync(process.execPath, [ORIENTATION, 'set', '--issue', '1'], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, CLAUDE_CODE_SESSION_ID: '', CLAUDE_SESSION_ID: '' },
  });
  assert.equal(res.status, 0);
  assert.equal(fs.existsSync(path.join(home, '.claude', 'orientation')), false);
});

test('orientation: begin records an active run with repo root', () => {
  const home = sandbox();
  const repo = makeRepo(home);
  orientation(['begin', '--workflow', 'x-wt-teams', '--issue', '42'], { home, cwd: repo });
  const rec = readPointer(home);
  assert.equal(rec.workflow, 'x-wt-teams');
  assert.equal(rec.issue, '42');
  assert.equal(rec.status, 'active');
  assert.equal(rec.repoRoot, fs.realpathSync(repo));
});

test('orientation: set merges into the current run', () => {
  const home = sandbox();
  const repo = makeRepo(home);
  orientation(['begin', '--workflow', 'x-wt-teams', '--issue', '42'], { home, cwd: repo });
  orientation(['set', '--step', 'Step 5'], { home, cwd: repo });
  const rec = readPointer(home);
  assert.equal(rec.issue, '42', 'earlier field survives a later set');
  assert.equal(rec.step, 'Step 5');
});

test('orientation: begin clears the previous run instead of inheriting it', () => {
  const home = sandbox();
  const repo = makeRepo(home);
  orientation(['begin', '--workflow', 'x-wt-teams', '--issue', '42', '--pr', 'url'], {
    home,
    cwd: repo,
  });
  orientation(['begin', '--workflow', 'x-as-pr'], { home, cwd: repo });
  const rec = readPointer(home);
  assert.equal(rec.workflow, 'x-as-pr');
  assert.equal(rec.issue, undefined, 'a second workflow must not inherit issue #42');
  assert.equal(rec.pr, undefined, 'a second workflow must not inherit the old PR');
});

test('orientation: complete keeps the record but flips status', () => {
  const home = sandbox();
  const repo = makeRepo(home);
  orientation(['begin', '--workflow', 'x-wt-teams', '--issue', '42'], { home, cwd: repo });
  orientation(['complete'], { home, cwd: repo });
  const rec = readPointer(home);
  assert.equal(rec.status, 'complete');
  assert.equal(rec.issue, '42');
  assert.ok(rec.completedAt);
});

test('orientation: clear removes the record', () => {
  const home = sandbox();
  const repo = makeRepo(home);
  orientation(['begin', '--workflow', 'x-wt-teams'], { home, cwd: repo });
  orientation(['clear'], { home, cwd: repo });
  assert.equal(fs.existsSync(pointerFile(home)), false);
});

test('orientation: empty flag values are dropped, not stored', () => {
  // The skills pass every flag unconditionally (`--issue "$ISSUE_NUMBER"`) and
  // rely on this. The tempting `${ISSUE_NUMBER:+--issue "$ISSUE_NUMBER"}` form
  // is broken under zsh, which does not word-split it.
  const home = sandbox();
  const repo = makeRepo(home);
  orientation(
    ['begin', '--workflow', 'x-wt-teams', '--issue', '', '--local-dir', '/tmp/coord'],
    { home, cwd: repo }
  );
  const rec = readPointer(home);
  assert.equal(rec.issue, undefined, 'an empty --issue must not become a field');
  assert.equal(rec.localDir, '/tmp/coord');
});

test('orientation: an unknown flag fails loudly rather than writing a dead field', () => {
  const home = sandbox();
  const repo = makeRepo(home);
  const res = orientation(['set', '--typo', 'x'], { home, cwd: repo });
  assert.equal(res.status, 2);
});

test('orientation: a session id that could escape the directory is refused', () => {
  const home = sandbox();
  const repo = makeRepo(home);
  const res = orientation(['set', '--issue', '1'], {
    home,
    cwd: repo,
    sessionId: '../../escape',
  });
  assert.equal(res.status, 0);
  assert.equal(fs.existsSync(path.join(home, '.claude', 'orientation')), false);
});

// --------------------------------------------------------------------------
// compact-reorient.sh
// --------------------------------------------------------------------------

test('hook: silent when there is no workflow signal at all', () => {
  const home = sandbox();
  const repo = makeRepo(home, 'topic/ordinary-work');
  const res = runHook({ home, cwd: repo });
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), '');
});

test('hook: silent on malformed or empty stdin', () => {
  const home = sandbox();
  const repo = makeRepo(home, 'topic/ordinary-work');
  for (const raw of ['not json', '']) {
    const res = runHook({ home, cwd: repo, raw });
    assert.equal(res.status, 0);
    assert.equal(res.stdout.trim(), '');
  }
});

test('hook: silent outside a git repository', () => {
  const home = sandbox();
  const plain = path.join(home, 'not-a-repo');
  fs.mkdirSync(plain, { recursive: true });
  const res = runHook({ home, cwd: plain });
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), '');
});

test('hook: SessionStart emits valid additionalContext JSON naming the tracker', () => {
  const home = sandbox();
  const repo = makeRepo(home, 'topic/ordinary-work');
  orientation(['begin', '--workflow', 'x-wt-teams', '--issue', '42', '--step', 'Step 5'], {
    home,
    cwd: repo,
  });
  const res = runHook({ home, cwd: repo });
  assert.equal(res.status, 0);
  const payload = JSON.parse(res.stdout);
  assert.equal(payload.hookSpecificOutput.hookEventName, 'SessionStart');
  const ctx = payload.hookSpecificOutput.additionalContext;
  assert.match(ctx, /gh issue view 42/);
  assert.match(ctx, /Step 5/);
  assert.match(ctx, /re-read/i);
});

test('hook: PreCompact emits plain text, not JSON', () => {
  const home = sandbox();
  const repo = makeRepo(home, 'topic/ordinary-work');
  orientation(['begin', '--workflow', 'x-wt-teams', '--issue', '42'], { home, cwd: repo });
  const res = runHook({ home, cwd: repo, event: 'PreCompact' });
  assert.equal(res.status, 0);
  assert.throws(() => JSON.parse(res.stdout), 'PreCompact output must stay plain text');
  assert.match(res.stdout, /TODO checklist/);
});

test('hook: a completed run says do-not-resume instead of re-orient', () => {
  const home = sandbox();
  const repo = makeRepo(home, 'topic/ordinary-work');
  orientation(['begin', '--workflow', 'x-wt-teams', '--issue', '42'], { home, cwd: repo });
  orientation(['complete'], { home, cwd: repo });
  const ctx = JSON.parse(runHook({ home, cwd: repo }).stdout).hookSpecificOutput
    .additionalContext;
  assert.match(ctx, /COMPLETE/);
  assert.match(ctx, /Do NOT\s*\n?resume/);
});

test('hook: a pointer written for another repo is ignored', () => {
  const home = sandbox();
  const repo = makeRepo(home, 'topic/ordinary-work');
  orientation(['begin', '--workflow', 'x-wt-teams', '--issue', '42'], { home, cwd: repo });
  const file = pointerFile(home);
  const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
  rec.repoRoot = '/somewhere/else';
  fs.writeFileSync(file, JSON.stringify(rec));
  const res = runHook({ home, cwd: repo });
  assert.equal(res.stdout.trim(), '', 'a pointer from another repo must not re-orient this one');
});

test('hook: a stale pointer is ignored', () => {
  const home = sandbox();
  const repo = makeRepo(home, 'topic/ordinary-work');
  orientation(['begin', '--workflow', 'x-wt-teams', '--issue', '42'], { home, cwd: repo });
  const file = pointerFile(home);
  const old = Date.now() / 1000 - 8 * 24 * 3600;
  fs.utimesSync(file, old, old);
  assert.equal(runHook({ home, cwd: repo }).stdout.trim(), '');
});

test('hook: quotes, newlines and shell metacharacters keep the JSON valid', () => {
  const home = sandbox();
  const repo = makeRepo(home, 'topic/ordinary-work');
  orientation(
    [
      'begin',
      '--workflow',
      'x-wt-teams',
      '--step',
      'merge "topic/a" & topic/b\nline two $VAR `cmd` \\slash',
      '--note',
      "it's got a quote",
    ],
    { home, cwd: repo }
  );
  const res = runHook({ home, cwd: repo });
  const payload = JSON.parse(res.stdout); // throws if escaping regressed
  assert.match(payload.hookSpecificOutput.additionalContext, /line two \$VAR/);
});

test('hook: the pointer still resolves when stat(1) is the GNU build', () => {
  // Regression: `stat -f %m || stat -c %Y` in one substitution glues GNU's
  // filesystem dump onto the epoch, the age arithmetic dies, and every pointer
  // is silently discarded — i.e. the whole feature is dead on WSL.
  const home = sandbox();
  const repo = makeRepo(home, 'topic/ordinary-work');
  orientation(['begin', '--workflow', 'x-wt-teams', '--issue', '42'], { home, cwd: repo });
  const res = runHook({ home, cwd: repo, pathPrefix: gnuStatShim(home) });
  assert.equal(res.status, 0);
  assert.match(
    JSON.parse(res.stdout).hookSpecificOutput.additionalContext,
    /gh issue view 42/
  );
});

test('hook: the working branch is surfaced, not just the base branch', () => {
  const home = sandbox();
  const repo = makeRepo(home, 'topic/ordinary-work');
  orientation(['begin', '--workflow', 'x-as-pr', '--branch', 'feat/dark-mode'], {
    home,
    cwd: repo,
  });
  const ctx = JSON.parse(runHook({ home, cwd: repo }).stdout).hookSpecificOutput
    .additionalContext;
  assert.match(ctx, /feat\/dark-mode/, 'a stored --branch must reach the re-orientation block');
});

test('orientation: begin in a non-git dir drops the previous run repo root', () => {
  // The hook refuses a pointer whose repoRoot names a different repo, so a
  // retained root from run #1 would disable re-orientation for run #2 entirely.
  const home = sandbox();
  const repo = makeRepo(home);
  orientation(['begin', '--workflow', 'x-wt-teams', '--issue', '42'], { home, cwd: repo });
  const plain = path.join(home, 'not-a-repo');
  fs.mkdirSync(plain, { recursive: true });
  orientation(['begin', '--workflow', 'big-plan'], { home, cwd: plain });
  assert.equal(readPointer(home).repoRoot, undefined);
});

test('hook: a base/* branch alone is enough to re-orient, topic/* is not', () => {
  const home = sandbox();
  const workflowRepo = makeRepo(home, 'base/dark-mode');
  const withBase = runHook({ home, cwd: workflowRepo, sessionId: 'no-pointer' });
  assert.match(
    JSON.parse(withBase.stdout).hookSpecificOutput.additionalContext,
    /base\/dark-mode/
  );

  execFileSync('git', ['checkout', '-q', '-b', 'topic/plain'], { cwd: workflowRepo });
  const withTopic = runHook({ home, cwd: workflowRepo, sessionId: 'no-pointer' });
  assert.equal(withTopic.stdout.trim(), '', 'topic/* is an ordinary branch, not a signal');
});
