#!/usr/bin/env node
// resolve-bumps.mjs — discover every @takazudo/* registry dependency in a project and
// compute its bump target from the channel its CURRENT spec already tracks:
//   • prerelease pin (e.g. 0.1.0-next.58, ^1.2.0-beta.3) → newest release on that prerelease line
//   • plain stable semver (1.2.3, ^1.2.3, ~1.2.3)        → dist-tags.latest
//   • literal dist-tag string ("next" / "latest" / …)    → reported only, NOT auto-pinned
//   • floating range ("*" / "x" / "")                    → skipped (left as-is)
// Operator style (exact / ^ / ~) and the prerelease channel are preserved on write-back.
// workspace:/file:/link:/portal:/catalog:/npm:/git/url specs are left untouched.
//
// Usage:
//   node resolve-bumps.mjs [--root DIR] [--json] [--write] [--dry-run] [PKG ...]
//     PKG        limit to these exact package names (default: all @takazudo/* registry deps)
//     --write    apply targets in place (minimal string edit, preserves formatting)
//     --dry-run  report only (this is the default; flag is accepted as an explicit no-op)
//     --json     also print a machine-readable plan
//     --root     project root to scan (default: cwd)

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const rootIdx = args.indexOf('--root');
const root = rootIdx >= 0 ? args[rootIdx + 1] : process.cwd();
const pkgFilter = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--root');
const SCOPE = '@takazudo/';
const DEP_MAPS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.turbo', '.cache', 'out',
]);

// ---------- semver ----------
function splitPre(v) {
  const core = String(v).split('+')[0];
  const dash = core.indexOf('-');
  return dash === -1 ? [core, ''] : [core.slice(0, dash), core.slice(dash + 1)];
}
function cmpNums(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return Math.sign(d);
  }
  return 0;
}
function cmpPre(a, b) {
  const sa = a.split('.');
  const sb = b.split('.');
  for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
    const x = sa[i];
    const y = sb[i];
    if (x === undefined) return -1; // shorter prerelease has lower precedence
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny) {
      const d = Number(x) - Number(y);
      if (d) return Math.sign(d);
    } else if (nx !== ny) {
      return nx ? -1 : 1; // numeric identifiers are lower than alphanumeric
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}
function semverCmp(a, b) {
  const [ra, pa] = splitPre(a);
  const [rb, pb] = splitPre(b);
  const rc = cmpNums(ra, rb);
  if (rc) return rc;
  if (!pa && pb) return 1; // release > prerelease
  if (pa && !pb) return -1;
  if (!pa && !pb) return 0;
  return cmpPre(pa, pb);
}
const preId = (v) => {
  const [, p] = splitPre(v);
  return p ? p.split('.')[0] : null;
};
const isVersion = (s) => /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(s);

// ---------- spec classification ----------
function classify(spec) {
  const s = String(spec).trim();
  if (s.includes(':')) return { skip: `non-registry spec (${s})` };
  // floating ranges have nothing to pin and were deliberately left open — never rewrite them
  if (s === '' || s === '*' || s === 'x' || s === 'X')
    return { skip: `floating range (${s || 'empty'}) — left as-is` };
  // optional operator, then optional leading `v`, then a version
  const m = s.match(/^(\^|~|>=|<=|>|<|=)?\s*v?(.+)$/i);
  const operator = m[1] || '';
  const ver = m[2];
  if (isVersion(ver))
    return { kind: 'semver', operator, version: ver, prerelease: preId(ver) };
  // a literal dist-tag string (next / latest / beta / canary …) — reported, not auto-pinned
  if (/^[a-z][a-z0-9._-]*$/i.test(s)) return { kind: 'tag', tag: s };
  return { skip: `unrecognized/complex range (${s})` };
}

function newestOnChannel(versions, distTags, channel) {
  const onCh = versions.filter((v) => preId(v) === channel).sort(semverCmp);
  let target = onCh.length ? onCh[onCh.length - 1] : null;
  const notes = [];
  const tagged = distTags[channel];
  if (tagged && target && semverCmp(tagged, target) < 0)
    notes.push(`npm "${channel}" dist-tag is STALE (${tagged} < newest published ${target}); using ${target}`);
  if (tagged && (!target || semverCmp(tagged, target) > 0)) target = tagged;
  const latest = distTags.latest;
  if (channel !== 'latest' && latest && target && semverCmp(latest, target) > 0)
    notes.push(`"latest" (${latest}) > newest "${channel}" (${target}) — line may have graduated to stable; confirm before staying on the prerelease channel`);
  return { target, note: notes.join('; ') };
}

function resolveTarget(meta, cls) {
  const distTags = meta['dist-tags'] || {};
  // npm returns a JSON string (not an array) for a single-version package — normalize
  const versions = Array.isArray(meta.versions)
    ? meta.versions
    : meta.versions
      ? [meta.versions]
      : [];
  const channel = cls.kind === 'tag' ? cls.tag : cls.prerelease;
  if (channel) return newestOnChannel(versions, distTags, channel);
  return { target: distTags.latest || null, note: distTags.latest ? '' : 'no "latest" dist-tag' };
}

// semver deps are rewritten with their operator preserved; tag specs are reported, never rewritten
const writeSpec = (cls, target) => (cls.operator || '') + target;

// ---------- discovery ----------
function findPackageJsons(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    // e.isDirectory() is false for symlinks, so symlinked nested workspaces are not followed
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) findPackageJsons(join(dir, e.name), acc);
    } else if (e.name === 'package.json') {
      acc.push(join(dir, e.name));
    }
  }
  return acc;
}

const files = findPackageJsons(root);
const occurrences = []; // {file, map, name, spec}
for (const file of files) {
  let json;
  try {
    json = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    continue;
  }
  for (const map of DEP_MAPS) {
    const deps = json[map];
    if (!deps) continue;
    for (const [name, spec] of Object.entries(deps)) {
      if (!name.startsWith(SCOPE)) continue;
      if (pkgFilter.length && !pkgFilter.includes(name)) continue;
      occurrences.push({ file, map, name, spec: String(spec) });
    }
  }
}

if (!occurrences.length) {
  console.log(`No @takazudo/* registry dependencies found under ${root}`);
  process.exit(0);
}

// ---------- resolve per unique package ----------
const metaCache = new Map();
function fetchMeta(name) {
  if (metaCache.has(name)) return metaCache.get(name);
  let v;
  try {
    const out = execFileSync('npm', ['view', name, 'dist-tags', 'versions', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    v = { meta: JSON.parse(out), err: null };
  } catch (e) {
    const lines = ((e && (e.stderr || e.message)) || '')
      .toString()
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const useful =
      lines.find((l) => /(404|E\d{3}|not found|code )/i.test(l)) ||
      lines.find((l) => /^npm error/i.test(l) && !/complete log|debug-\d|\.log$/i.test(l)) ||
      lines.pop() ||
      'npm view failed';
    v = { meta: null, err: useful.replace(/^npm error\s*/i, '') };
  }
  metaCache.set(name, v);
  return v;
}

const plan = []; // {file, map, name, spec, target, newSpec, action, note}
for (const occ of occurrences) {
  const cls = classify(occ.spec);
  if (cls.skip) {
    plan.push({ ...occ, action: 'skip', note: cls.skip });
    continue;
  }
  const { meta, err } = fetchMeta(occ.name);
  if (!meta) {
    plan.push({ ...occ, action: 'error', note: `npm view failed: ${err}` });
    continue;
  }
  let resolved;
  try {
    resolved = resolveTarget(meta, cls);
  } catch (e) {
    plan.push({ ...occ, action: 'error', note: `resolve failed: ${(e && e.message) || e}` });
    continue;
  }
  const { target, note } = resolved;
  if (!target) {
    plan.push({ ...occ, action: 'error', note: note || 'no target version resolved' });
    continue;
  }
  if (cls.kind === 'tag') {
    // a literal dist-tag spec: report what it currently resolves to, but never auto-pin it
    plan.push({
      ...occ,
      target,
      newSpec: occ.spec,
      action: 'tag',
      note: [`tracks "${cls.tag}" → currently ${target}; not auto-pinned (run your package-manager update, or pin manually)`, note]
        .filter(Boolean)
        .join('; '),
    });
    continue;
  }
  const newSpec = writeSpec(cls, target);
  const action = newSpec === occ.spec ? 'up-to-date' : 'bump';
  plan.push({ ...occ, target, newSpec, action, note });
}

// ---------- report ----------
const rel = (f) => relative(root, f) || 'package.json';
const order = { bump: 0, tag: 1, skip: 2, 'up-to-date': 3, error: 4 };
plan.sort((a, b) => order[a.action] - order[b.action] || a.name.localeCompare(b.name));
const pad = (s, n) => String(s).padEnd(n);
const W = { name: 38, file: 44, cur: 18, new: 18 };
console.log(`\nScanned ${files.length} package.json under ${root}\n`);
console.log(`${pad('ACTION', 11)}${pad('PACKAGE', W.name)}${pad('FILE', W.file)}${pad('CURRENT', W.cur)}${pad('TARGET', W.new)}`);
console.log('-'.repeat(11 + W.name + W.file + W.cur + W.new));
for (const p of plan) {
  const tgt = p.newSpec || '—';
  console.log(`${pad(p.action, 11)}${pad(p.name, W.name)}${pad(rel(p.file), W.file)}${pad(p.spec, W.cur)}${pad(tgt, W.new)}`);
  if (p.note) console.log(`           ↳ ${p.note}`);
}
const bumps = plan.filter((p) => p.action === 'bump');
const errors = plan.filter((p) => p.action === 'error');
console.log(`\n${bumps.length} bump(s), ${plan.filter((p) => p.action === 'up-to-date').length} up-to-date, ` +
  `${plan.filter((p) => p.action === 'tag').length} tag-tracked, ${plan.filter((p) => p.action === 'skip').length} skipped, ${errors.length} error(s).`);

// if every lookup failed, it's almost certainly registry/auth/offline — not missing packages
const lookable = plan.filter((p) => p.action !== 'skip');
if (errors.length && errors.length === lookable.length)
  console.log('⚠ every npm lookup failed — likely a registry/auth/offline issue, not unpublished packages. Check `npm view @takazudo/zfb` works from this shell.');

// cross-file skew guard: same package resolved to differing targets anywhere
const byName = new Map();
for (const p of plan) {
  if (p.action === 'bump' || p.action === 'up-to-date') {
    if (!byName.has(p.name)) byName.set(p.name, new Set());
    byName.get(p.name).add(p.target);
  }
}
for (const [name, targets] of byName) {
  if (targets.size > 1) console.log(`⚠ ${name} resolved to multiple targets across files: ${[...targets].join(', ')}`);
}

if (flags.has('--json')) {
  console.log('\n---PLAN-JSON---');
  console.log(JSON.stringify(plan, null, 2));
}

// ---------- apply ----------
if (flags.has('--write')) {
  const editsByFile = new Map();
  for (const p of bumps) {
    if (!editsByFile.has(p.file)) editsByFile.set(p.file, []);
    editsByFile.get(p.file).push(p);
  }
  for (const [file, edits] of editsByFile) {
    let text = readFileSync(file, 'utf8');
    for (const e of edits) {
      const re = new RegExp(
        `("${e.name.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')}"\\s*:\\s*")${e.spec.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')}(")`,
      );
      const next = text.replace(re, `$1${e.newSpec}$2`);
      if (next === text) console.log(`⚠ could not edit ${e.name} in ${rel(file)} (spec not matched verbatim)`);
      text = next;
    }
    writeFileSync(file, text);
    console.log(`wrote ${rel(file)} (${edits.length} change(s))`);
  }
  const dirs = [...new Set([...editsByFile.keys()].map((f) => rel(f).replace(/package\.json$/, '') || './'))];
  console.log(`\n--write applied to ${editsByFile.size} file(s). Install in each edited directory that has its own lockfile:`);
  for (const d of dirs) console.log(`  • ${d}`);
  console.log('Then verify the build. (A nested workspace with its own lockfile is NOT covered by the root install.)');
} else if (bumps.length) {
  console.log('\nDry-run only. Re-run with --write to apply, then install + verify.');
}
