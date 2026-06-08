#!/bin/sh
set -eu

LABEL="io.github.yger2000.blog-admin"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_VALUE=$(id -u)

if [ ! -f "$PLIST" ]; then
  echo "Blog admin is not running: LaunchAgent not found."
  exit 0
fi

launchctl bootout "gui/$UID_VALUE" "$PLIST" >/dev/null 2>&1 || true
rm -f "$PLIST"

echo "Blog admin stopped."
