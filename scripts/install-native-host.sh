#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
host_name="com.okja.saver"
ext_id="enfcgiajdbdmggdicbjndajnmlmolflo"
script_path="$project_dir/scripts/native-host.sh"

chmod +x "$script_path" "$project_dir/service/native_host.py" 2>/dev/null || true

os_type=$(uname -s 2>/dev/null || echo "Unknown")

if [ "$os_type" = "Darwin" ]; then
  targets="
$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts
$HOME/Library/Application Support/Chromium/NativeMessagingHosts
$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts
$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts
$HOME/Library/Application Support/Vivaldi/NativeMessagingHosts
"
elif [ "$os_type" = "Linux" ]; then
  targets="
$HOME/.config/google-chrome/NativeMessagingHosts
$HOME/.config/google-chrome-beta/NativeMessagingHosts
$HOME/.config/google-chrome-unstable/NativeMessagingHosts
$HOME/.config/chromium/NativeMessagingHosts
$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts
$HOME/.config/microsoft-edge/NativeMessagingHosts
$HOME/.config/microsoft-edge-dev/NativeMessagingHosts
$HOME/.config/vivaldi/NativeMessagingHosts
$HOME/.config/opera/NativeMessagingHosts
$HOME/.config/opera-beta/NativeMessagingHosts
$HOME/.config/opera-developer/NativeMessagingHosts
$HOME/.var/app/com.google.Chrome/config/google-chrome/NativeMessagingHosts
$HOME/.var/app/org.chromium.Chromium/config/chromium/NativeMessagingHosts
$HOME/.var/app/com.brave.Browser/config/BraveSoftware/Brave-Browser/NativeMessagingHosts
$HOME/.var/app/com.microsoft.Edge/config/microsoft-edge/NativeMessagingHosts
$HOME/.var/app/com.vivaldi.Vivaldi/config/vivaldi/NativeMessagingHosts
$HOME/.var/app/com.opera.Opera/config/opera/NativeMessagingHosts
$HOME/snap/chromium/current/.config/chromium/NativeMessagingHosts
$HOME/snap/brave/current/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts
$HOME/snap/google-chrome/current/.config/google-chrome/NativeMessagingHosts
$HOME/snap/edge/current/.config/microsoft-edge/NativeMessagingHosts
"
else
  # Generic POSIX fallback
  targets="
$HOME/.config/google-chrome/NativeMessagingHosts
$HOME/.config/chromium/NativeMessagingHosts
"
fi

manifest_content="{
  \"name\": \"$host_name\",
  \"description\": \"Okja YouTube Saver On-Demand Launcher\",
  \"path\": \"$script_path\",
  \"type\": \"stdio\",
  \"allowed_origins\": [
    \"chrome-extension://$ext_id/\"
  ]
}"

echo "Registering Okja Saver native messaging host for $os_type..."
registered_count=0

while IFS= read -r dir; do
  [ -z "$dir" ] && continue
  parent_dir=$(dirname "$dir")
  if [ -d "$parent_dir" ]; then
    mkdir -p "$dir"
    printf '%s\n' "$manifest_content" > "$dir/$host_name.json"
    echo "  Registered in: $dir/$host_name.json"
    registered_count=$((registered_count + 1))
  fi
done <<EOF
$targets
EOF

# On Linux, if no browser configuration directories exist yet, create default Chrome and Chromium directories
if [ "$os_type" = "Linux" ] && [ "$registered_count" -eq 0 ]; then
  for default_dir in "$HOME/.config/google-chrome/NativeMessagingHosts" "$HOME/.config/chromium/NativeMessagingHosts"; do
    mkdir -p "$default_dir"
    printf '%s\n' "$manifest_content" > "$default_dir/$host_name.json"
    echo "  Registered in default directory: $default_dir/$host_name.json"
    registered_count=$((registered_count + 1))
  done
fi

# Clean up accidental unquoted target if created
rm -f "$HOME/Library/Application/com.okja.saver.json" 2>/dev/null || true
rmdir "$HOME/Library/Application" 2>/dev/null || true

echo "Native Messaging Host registration complete ($registered_count locations registered)."
echo "Chromium-based browsers can now start Okja Saver automatically before downloading."
