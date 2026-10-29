#!/bin/sh
set -e

# Navigate to this script's directory regardless of where it was called from
DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd)"
cd "$DIR"

# Ensure all scripts and helpers have execute permissions
chmod +x "$DIR/setup-linux.sh" "$DIR"/scripts/*.sh "$DIR"/service/*.py 2>/dev/null || true

# Execute setup.sh using sh so it works even in restrictive execution environments
exec sh "$DIR/scripts/setup.sh" "$@"

