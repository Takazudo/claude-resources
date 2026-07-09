#!/bin/bash
# Preview ASCII diagram in monospace font using headless browser
# Usage: preview_diagram.sh <diagram-text-or-file>
#
# Requires the headless-browser skill, an external dependency installed from
# Takazudo/zudo-test-wisdom (not part of this repo). If it isn't installed,
# the HTML preview is still written but the screenshot capture is skipped
# with a warning instead of failing.

if [ -f "$1" ]; then
    DIAGRAM=$(cat "$1")
else
    DIAGRAM="$1"
fi

cat > /tmp/ascii_preview.html << EOF
<html>
<head>
  <style>
    body {
      background: #1e1e1e;
      color: #d4d4d4;
      font-family: 'Courier New', Courier, monospace;
      font-size: 14px;
      line-height: 1.4;
      padding: 20px;
      white-space: pre;
    }
  </style>
</head>
<body>$DIAGRAM</body>
</html>
EOF

HEADLESS_CHECK="$HOME/.claude/skills/headless-browser/scripts/headless-check.js"

if [ -f "$HEADLESS_CHECK" ]; then
    node "$HEADLESS_CHECK" \
      --url file:///tmp/ascii_preview.html \
      --screenshot viewport
    echo "Preview saved to screenshot"
else
    echo "headless-browser skill not installed (external: Takazudo/zudo-test-wisdom) — skipping screenshot check. HTML preview written to /tmp/ascii_preview.html"
fi
