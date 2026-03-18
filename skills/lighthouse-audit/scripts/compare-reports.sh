#!/usr/bin/env bash
# Compare before/after Lighthouse summaries
# Usage: compare-reports.sh <before-summary.json> <after-summary.json>

set -euo pipefail

BEFORE="$1"
AFTER="$2"

node -e "
const before = JSON.parse(require('fs').readFileSync('$BEFORE', 'utf8'));
const after = JSON.parse(require('fs').readFileSync('$AFTER', 'utf8'));

console.log('# Lighthouse Before/After Comparison\n');

for (const afterAudit of after.audits) {
  const beforeAudit = before.audits.find(a => a.url === afterAudit.url && a.preset === afterAudit.preset);
  if (!beforeAudit) continue;

  console.log('## ' + afterAudit.url + ' (' + afterAudit.preset + ')\n');
  console.log('| Category | Before | After | Change |');
  console.log('|----------|--------|-------|--------|');

  for (const [cat, afterScore] of Object.entries(afterAudit.scores)) {
    const beforeScore = beforeAudit.scores[cat] || 0;
    const diff = afterScore - beforeScore;
    const arrow = diff > 0 ? '⬆️ +' + diff : diff < 0 ? '⬇️ ' + diff : '➡️ 0';
    console.log('| ' + cat + ' | ' + beforeScore + ' | ' + afterScore + ' | ' + arrow + ' |');
  }
  console.log('');
}
"
