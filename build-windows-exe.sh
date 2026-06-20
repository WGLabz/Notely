#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "==============================================="
echo "Building Windows executable and collecting files"
echo "==============================================="
echo

run_npm() {
  if command -v npm >/dev/null 2>&1; then
    npm "$@"
  elif command -v npm.cmd >/dev/null 2>&1; then
    npm.cmd "$@"
  else
    echo "Error: npm is not available in PATH."
    exit 1
  fi
}

run_npm run dist:win

echo
echo "Build completed successfully."
echo "EXE files are available in: release"
echo
