#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ext_dir="$project_dir/extension"
key_file="$project_dir/okja-youtube-saver.pem"

chrome_bin=""
for candidate in \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
  "google-chrome" "chromium" "brave-browser"; do
  if [ -x "$candidate" ] || command -v "$candidate" >/dev/null 2>&1; then
    chrome_bin="$candidate"
    break
  fi
done

if [ -z "$chrome_bin" ]; then
  echo "Error: Chromium-based browser (Chrome, Brave, Edge) not found." >&2
  exit 1
fi

echo "Packing CRX using: $chrome_bin"
if [ -f "$key_file" ]; then
  "$chrome_bin" --pack-extension="$ext_dir" --pack-extension-key="$key_file" --no-message-box
else
  "$chrome_bin" --pack-extension="$ext_dir" --no-message-box
  if [ -f "$project_dir/extension.pem" ]; then
    mv "$project_dir/extension.pem" "$key_file"
  fi
fi

if [ -f "$project_dir/extension.crx" ]; then
  mv "$project_dir/extension.crx" "$project_dir/okja-youtube-saver.crx"
fi

echo "Successfully built okja-youtube-saver.crx"
