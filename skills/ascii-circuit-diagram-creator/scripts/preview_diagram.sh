#!/bin/bash
# Preview ASCII diagram in monospace font using headless browser
# Usage: preview_diagram.sh <diagram-text-or-file>

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

node ~/.claude/skills/headless-browser/scripts/headless-check.js \
  --url file:///tmp/ascii_preview.html \
  --screenshot viewport

echo "Preview saved to screenshot"
