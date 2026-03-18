#!/usr/bin/env bash
# Run Lighthouse audit on multiple URLs and save JSON reports
# Usage: run-lighthouse.sh <output-dir> <preset> <url1> [url2] [url3] ...
# preset: "mobile" or "desktop"

set -euo pipefail

OUTPUT_DIR="$1"
PRESET="$2"
shift 2

if [ $# -eq 0 ]; then
  echo "Error: No URLs provided"
  echo "Usage: run-lighthouse.sh <output-dir> <preset> <url1> [url2] ..."
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

SUMMARY_FILE="$OUTPUT_DIR/summary.json"
echo '{"audits":[' > "$SUMMARY_FILE"
FIRST=true

for URL in "$@"; do
  # Create safe filename from URL
  SAFE_NAME=$(echo "$URL" | sed 's|https\?://||' | sed 's|[/:?&#=]|_|g' | sed 's|_$||')
  REPORT_FILE="$OUTPUT_DIR/${SAFE_NAME}.json"
  HTML_FILE="$OUTPUT_DIR/${SAFE_NAME}.html"

  echo "--- Auditing: $URL (${PRESET}) ---"

  PRESET_FLAG=""
  if [ "$PRESET" = "desktop" ]; then
    PRESET_FLAG="--preset=desktop"
  fi

  # Run lighthouse
  npx lighthouse "$URL" \
    --output=json,html \
    --output-path="$OUTPUT_DIR/${SAFE_NAME}" \
    --chrome-flags="--headless=new --no-sandbox --disable-gpu" \
    --only-categories=performance,accessibility,best-practices,seo \
    $PRESET_FLAG \
    --quiet \
    2>&1 || {
      echo "Warning: Lighthouse failed for $URL, skipping..."
      continue
    }

  # Extract scores from JSON report
  if [ -f "$REPORT_FILE" ]; then
    SCORES=$(node -e "
      const r = JSON.parse(require('fs').readFileSync('$REPORT_FILE', 'utf8'));
      const cats = r.categories || {};
      const scores = {};
      for (const [k, v] of Object.entries(cats)) {
        scores[k] = Math.round((v.score || 0) * 100);
      }
      console.log(JSON.stringify(scores));
    ")

    # Extract top opportunities
    OPPORTUNITIES=$(node -e "
      const r = JSON.parse(require('fs').readFileSync('$REPORT_FILE', 'utf8'));
      const audits = r.audits || {};
      const opps = [];
      for (const [k, v] of Object.entries(audits)) {
        if (v.score !== null && v.score < 1 && v.details && v.details.type === 'opportunity') {
          opps.push({
            id: k,
            title: v.title,
            score: v.score,
            savings: v.details.overallSavingsMs || 0,
            description: v.description
          });
        }
      }
      opps.sort((a, b) => a.score - b.score);
      console.log(JSON.stringify(opps.slice(0, 10)));
    ")

    # Extract failed audits (non-opportunity)
    DIAGNOSTICS=$(node -e "
      const r = JSON.parse(require('fs').readFileSync('$REPORT_FILE', 'utf8'));
      const audits = r.audits || {};
      const diags = [];
      for (const [k, v] of Object.entries(audits)) {
        if (v.score !== null && v.score < 1 && (!v.details || v.details.type !== 'opportunity')) {
          diags.push({ id: k, title: v.title, score: v.score, description: v.description });
        }
      }
      diags.sort((a, b) => a.score - b.score);
      console.log(JSON.stringify(diags.slice(0, 15)));
    ")

    if [ "$FIRST" = true ]; then
      FIRST=false
    else
      echo ',' >> "$SUMMARY_FILE"
    fi

    echo "{\"url\":\"$URL\",\"preset\":\"$PRESET\",\"scores\":$SCORES,\"opportunities\":$OPPORTUNITIES,\"diagnostics\":$DIAGNOSTICS}" >> "$SUMMARY_FILE"

    echo "Scores: $SCORES"
  fi
done

echo ']}' >> "$SUMMARY_FILE"
echo ""
echo "Reports saved to: $OUTPUT_DIR"
echo "Summary: $SUMMARY_FILE"
