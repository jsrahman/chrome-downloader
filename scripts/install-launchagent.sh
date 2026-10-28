#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
launch_agents_dir="$HOME/Library/LaunchAgents"
plist_path="$launch_agents_dir/com.okja.saver.plist"
log_dir="$project_dir/.runtime"

mkdir -p "$launch_agents_dir" "$log_dir"

# Stop existing agent if running
if launchctl list com.okja.saver >/dev/null 2>&1; then
  launchctl unload "$plist_path" 2>/dev/null || true
fi

cat <<EOF > "$plist_path"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.okja.saver</string>
    <key>ProgramArguments</key>
    <array>
        <string>$project_dir/scripts/start-service.sh</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$project_dir</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$log_dir/service.log</string>
    <key>StandardErrorPath</key>
    <string>$log_dir/service.error.log</string>
</dict>
</plist>
EOF

chmod 644 "$plist_path"
launchctl load "$plist_path"

echo "Okja YouTube Saver background service installed and running."
echo "It will automatically start on login and keep running in the background."
