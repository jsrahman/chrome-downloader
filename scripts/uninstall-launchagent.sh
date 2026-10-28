#!/bin/sh
set -eu

launch_agents_dir="$HOME/Library/LaunchAgents"
plist_path="$launch_agents_dir/com.okja.saver.plist"

if [ -f "$plist_path" ]; then
  launchctl unload "$plist_path" 2>/dev/null || true
  rm -f "$plist_path"
  echo "Okja YouTube Saver background service uninstalled."
else
  echo "Service is not installed."
fi
