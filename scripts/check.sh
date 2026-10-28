#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_dir"
export PYTHONPYCACHEPREFIX="$project_dir/.runtime/pycache"

python3 -m py_compile service/*.py
python3 -m json.tool extension/manifest.json >/dev/null
python3 -m unittest discover -s tests -v

if command -v node >/dev/null 2>&1; then
  for file in extension/*.js; do
    node --check "$file"
  done
fi

echo "All checks passed."
