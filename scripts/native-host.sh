#!/bin/sh
set -eu

export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/sbin:/usr/sbin:$PATH"
export PYTHONUNBUFFERED="1"

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
local_python="$project_dir/.venv/bin/python"

if [ -x "$local_python" ]; then
  exec "$local_python" "$project_dir/service/native_host.py"
elif [ -x "/opt/homebrew/bin/python3" ]; then
  exec "/opt/homebrew/bin/python3" "$project_dir/service/native_host.py"
elif command -v python3 >/dev/null 2>&1; then
  exec "$(command -v python3)" "$project_dir/service/native_host.py"
else
  echo "Python 3 not found." >&2
  exit 1
fi
