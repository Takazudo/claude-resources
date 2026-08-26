#!/usr/bin/env node

/**
 * Git clean filter for settings.json: pins the "model" field to a fixed
 * value before staging, so switching models locally via /model doesn't
 * produce commit/diff noise on that one field. Also strips "modelSettings"
 * (the per-model effortLevel map /model and /config write to) entirely,
 * since it's the same class of local-only preference — unlike "model" it
 * has no single committed default worth pinning per model id, so it's
 * simply never tracked.
 *
 * Wired up via .gitattributes (filter=normalize-model) + local git config:
 *   git config filter.normalize-model.clean "node $HOME/.claude/scripts/normalize-settings-model.js"
 *   git config filter.normalize-model.smudge cat
 *
 * Update PINNED_MODEL when the intentional committed default changes.
 */

const PINNED_MODEL = 'claude-fable-5';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    if ('model' in data) {
      data.model = PINNED_MODEL;
    }
    delete data.modelSettings;
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  } catch {
    // Not valid JSON (mid-edit, etc.) — pass through unchanged.
    process.stdout.write(input);
  }
});
