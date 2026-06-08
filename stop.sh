#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PID_FILE="$ROOT_DIR/.hexo-server.pid"
LABEL="io.github.yger2000.hexo"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_VALUE=$(id -u)

if [ ! -f "$PLIST" ]; then
  rm -f "$PID_FILE"
  echo "Hexo server is not running: LaunchAgent not found."
  exit 0
fi

launchctl bootout "gui/$UID_VALUE" "$PLIST" >/dev/null 2>&1 || true
rm -f "$PLIST"
rm -f "$PID_FILE"

echo "Static blog server stopped."
