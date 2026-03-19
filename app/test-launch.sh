#!/bin/bash
# Test script: launch app via open (Finder simulation), verify docs load.
# Usage: bash test-launch.sh [count]
# Exits 0 on success, 1 on failure.

COUNT=${1:-3}
PASS=0
FAIL=0

for RUN in $(seq 1 $COUNT); do
  echo "=== Run $RUN/$COUNT ==="

  # Kill everything
  ps aux | grep "claude-resources" | grep -v grep | awk '{print $2}' | xargs kill 2>/dev/null
  lsof -ti :4892 | xargs kill 2>/dev/null
  sleep 3

  # Launch via open (use build output or installed app)
  APP_PATH="${APP_OVERRIDE:-/Users/takazudo/.claude/app/target/release/bundle/macos/Claude Resources.app}"
  open "$APP_PATH"

  # Wait up to 60s for docs to be available
  OK=0
  for i in $(seq 1 20); do
    sleep 3
    READY=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4892/___ready 2>/dev/null)
    if [ "$READY" = "200" ]; then
      # Verify docs page
      TITLE=$(curl -s http://localhost:4892/docs/claude 2>/dev/null | grep -o '<title>[^<]*</title>')
      if echo "$TITLE" | grep -q "Claude"; then
        echo "  Run $RUN: PASS (ready at $((i*3))s, title=$TITLE)"
        OK=1
        PASS=$((PASS + 1))
        break
      fi
    fi
  done

  if [ "$OK" = "0" ]; then
    echo "  Run $RUN: FAIL (server not ready after 60s)"
    FAIL=$((FAIL + 1))
  fi
done

# Cleanup
ps aux | grep "claude-resources" | grep -v grep | awk '{print $2}' | xargs kill 2>/dev/null
lsof -ti :4892 | xargs kill 2>/dev/null

echo ""
echo "=== Results: $PASS/$COUNT passed, $FAIL failed ==="
[ "$FAIL" -gt 0 ] && exit 1 || exit 0
