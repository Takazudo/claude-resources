#!/usr/bin/env node
// Report which shell commands used by skills are NOT covered by the Bash
// allowlist in settings.json. Anything uncovered goes to the auto-mode
// classifier at runtime, which costs a round-trip and may soft-block.
//
//   node scan-skill-commands.js                 # scan every skill
//   node scan-skill-commands.js x-wt-teams pr   # scan named skills only
//   node scan-skill-commands.js --min 1         # include one-off commands
//
// Signatures are reported only for real binaries (see BINARIES) so that prose
// inside unfenced code blocks does not pollute the output.

import fs from 'node:fs';
import path from 'node:path';

const HOME = process.env.HOME;
const SKILLS = path.join(HOME, '.claude/skills');
const SETTINGS = path.join(HOME, '.claude/settings.json');

const argv = process.argv.slice(2);
let min = 2;
const minIdx = argv.indexOf('--min');
if (minIdx !== -1) {
  min = parseInt(argv[minIdx + 1], 10) || 1;
  argv.splice(minIdx, 2);
}

// Commands worth reasoning about for permissions. Everything else is noise.
const BINARIES = new Set([
  'git', 'gh', 'node', 'npx', 'npm', 'pnpm', 'yarn', 'jq', 'codex', 'bash', 'sh',
  'rm', 'mkdir', 'cp', 'mv', 'touch', 'chmod', 'rsync', 'curl', 'wget', 'find',
  'xargs', 'sed', 'awk', 'grep', 'cat', 'ls', 'tee', 'docker', 'open', 'osascript',
  'kill', 'pkill', 'tmux', 'playwright', 'wrangler', 'netlify',
]);

// CLIs where the meaningful unit is a subcommand, not just the binary name.
const DEPTH = { git: 3, gh: 3, pnpm: 2, npm: 2, npx: 2, yarn: 2, codex: 2, docker: 2 };

const settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
const allowPrefixes = (settings.permissions?.allow || [])
  .filter(r => r.startsWith('Bash('))
  .map(r => r.slice(5, -1))
  .map(r => (r.endsWith(':*') ? r.slice(0, -2) : r));

function collectFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...collectFiles(p));
    else if (/\.(md|sh|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

const targets = argv.length
  ? argv
  : fs.readdirSync(SKILLS, { withFileTypes: true }).filter(e => e.isDirectory() || e.isSymbolicLink()).map(e => e.name);

const counts = new Map();
const origins = new Map();

for (const skill of targets) {
  for (const file of collectFiles(path.join(SKILLS, skill))) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    let inFence = false;
    for (const raw of text.split('\n')) {
      const fence = raw.match(/^\s*```(\w*)/);
      if (fence) {
        inFence = fence[1] === '' ? !inFence : /^(bash|sh|shell|console|zsh)$/.test(fence[1]);
        continue;
      }
      if (!inFence) continue;
      const line = raw.trim().replace(/^\$\s+/, '');
      if (!line || line.startsWith('#')) continue;

      for (let part of line.split(/&&|\|\||[|;]/)) {
        const words = part.trim().replace(/^[({]\s*/, '').split(/\s+/).filter(Boolean);
        if (!words.length || !BINARIES.has(words[0])) continue;

        const depth = DEPTH[words[0]] || 1;
        const sig = [];
        for (const w of words) {
          if (sig.length >= depth) break;
          if (sig.length && w.startsWith('-')) {
            // keep one trailing flag so `git branch -D` stays distinct from `git branch`
            if (sig.length >= 2 && /^-{1,2}[A-Za-z]/.test(w)) sig.push(w);
            break;
          }
          if (/[<{$"'`]/.test(w)) break;
          sig.push(w);
        }
        if (!sig.length) continue;
        const s = sig.join(' ');
        counts.set(s, (counts.get(s) || 0) + 1);
        if (!origins.has(s)) origins.set(s, new Set());
        origins.get(s).add(skill);
      }
    }
  }
}

const covered = s => allowPrefixes.some(p => s === p || s.startsWith(p + ' ') || p.startsWith(s + ' '));

const rows = [...counts.entries()]
  .filter(([s, n]) => !covered(s) && n >= min)
  .sort((a, b) => b[1] - a[1]);

console.log(`scanned ${targets.length} skill(s) against ${allowPrefixes.length} Bash allow prefixes`);
if (!rows.length) {
  console.log('\nno uncovered command signatures.');
} else {
  console.log(`\n${rows.length} uncovered signature(s), seen >=${min}x:\n`);
  for (const [s, n] of rows) {
    console.log(`${String(n).padStart(4)}  ${s.padEnd(28)} ${[...origins.get(s)].slice(0, 3).join(',')}`);
  }
  console.log('\nAdd as "Bash(<signature>:*)" in permissions.allow, or leave uncovered');
  console.log('on purpose when the same binary can also do something destructive.');
}
