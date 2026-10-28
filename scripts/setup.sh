#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
venv_dir="$project_dir/.venv"

python_cmd=""
for candidate in python3.15 python3.14 python3.13 python3.12 python3.11 /opt/homebrew/bin/python3; do
  if [ -x "$candidate" ] || command -v "$candidate" >/dev/null 2>&1; then
    python_cmd="$candidate"
    break
  fi
done

if [ -z "$python_cmd" ]; then
  echo "Python 3.11 or newer is required for current yt-dlp." >&2
  echo "macOS (Homebrew): brew install python@3.15 (or brew install yt-dlp ffmpeg)" >&2
  exit 1
fi

"$python_cmd" -m venv --clear "$venv_dir"
"$venv_dir/bin/python" -m pip install --upgrade pip
"$venv_dir/bin/python" -m pip install --upgrade "yt-dlp[default]"

if command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg found: $(command -v ffmpeg)"
else
  echo ""
  echo "Warning: ffmpeg was not found. Install it to merge video/audio and create MP3 files."
  echo "macOS (Homebrew): brew install ffmpeg"
  echo "Ubuntu/Debian:     sudo apt install ffmpeg"
fi

echo ""
echo "Setup complete. Start the service with:"
echo "  $project_dir/scripts/start-service.sh"
