#!/bin/bash

# CI Watch Notification Helper
# Usage: notify.sh <type> <message>
# Types: success, error, warning, info

TYPE="${1:-info}"
MESSAGE="${2:-CI Watch notification}"
TITLE="CI Watch"

case "$TYPE" in
  success)
    SUBTITLE="All Checks Passed"
    SOUND='sound name "Glass"'
    echo -e "\033[0;32m[SUCCESS]\033[0m $MESSAGE"
    ;;
  error)
    SUBTITLE="Check Failed"
    SOUND='sound name "Basso"'
    echo -e "\033[0;31m[ERROR]\033[0m $MESSAGE"
    ;;
  warning)
    SUBTITLE="Warning"
    SOUND='sound name "Purr"'
    echo -e "\033[1;33m[WARNING]\033[0m $MESSAGE"
    ;;
  info)
    SUBTITLE="Info"
    SOUND=""
    echo -e "\033[0;34m[INFO]\033[0m $MESSAGE"
    ;;
esac

osascript -e "display notification \"$MESSAGE\" with title \"$TITLE\" subtitle \"$SUBTITLE\" $SOUND" 2>/dev/null || true
