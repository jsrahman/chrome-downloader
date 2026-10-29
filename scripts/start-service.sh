#!/bin/sh
set -eu

export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/sbin:/usr/sbin:$PATH"
export PYTHONUNBUFFERED="1"

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
local_yt_dlp="$project_dir/.venv/bin/yt-dlp"
local_python="$project_dir/.venv/bin/python"

# Resolve yt-dlp binary
if [ -z "${OKJA_YT_DLP:-}" ]; then
  if [ -x "$local_yt_dlp" ]; then
    export OKJA_YT_DLP="$local_yt_dlp"
  elif [ -x "/opt/homebrew/bin/yt-dlp" ]; then
    export OKJA_YT_DLP="/opt/homebrew/bin/yt-dlp"
  elif command -v yt-dlp >/dev/null 2>&1; then
    export OKJA_YT_DLP="$(command -v yt-dlp)"
  else
    echo "yt-dlp not found. Run ./scripts/setup.sh first or install via your package manager." >&2
    exit 1
  fi
fi

# Resolve python binary
python_runner=""
if [ -x "$local_python" ]; then
  python_runner="$local_python"
elif [ -x "/opt/homebrew/bin/python3" ]; then
  python_runner="/opt/homebrew/bin/python3"
elif command -v python3 >/dev/null 2>&1; then
  python_runner="$(command -v python3)"
else
  echo "Python 3 was not found." >&2
  exit 1
fi

cd "$project_dir"
exec "$python_runner" -m service.app "$@"
