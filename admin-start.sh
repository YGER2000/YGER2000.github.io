#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
LOG_FILE="$ROOT_DIR/.blog-admin.log"
ERR_LOG_FILE="$ROOT_DIR/.blog-admin.err.log"
PORT="${PORT:-4010}"
HOST="${HOST:-127.0.0.1}"
LABEL="io.github.yger2000.blog-admin"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_VALUE=$(id -u)
PATH_VALUE="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

mkdir -p "$HOME/Library/LaunchAgents"
: >"$LOG_FILE"
: >"$ERR_LOG_FILE"

cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>WorkingDirectory</key>
  <string>$ROOT_DIR</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/env</string>
    <string>node</string>
    <string>$ROOT_DIR/scripts/admin.js</string>
    <string>$PORT</string>
    <string>$HOST</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$PATH_VALUE</string>
  </dict>
  <key>StandardOutPath</key>
  <string>$LOG_FILE</string>
  <key>StandardErrorPath</key>
  <string>$ERR_LOG_FILE</string>
  <key>KeepAlive</key>
  <true/>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
EOF

launchctl bootout "gui/$UID_VALUE" "$PLIST" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$UID_VALUE" "$PLIST"
launchctl kickstart -k "gui/$UID_VALUE/$LABEL"

echo "Blog admin started."
echo "URL: http://$HOST:$PORT"
echo "Log: $LOG_FILE"
echo "Error log: $ERR_LOG_FILE"
