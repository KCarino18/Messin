#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$ROOT/app"
PORT="${PORT:-3000}"

cd "$APP_DIR"

if [[ ! -d node_modules ]]; then
  echo "Dependencies missing. Run the installer first (./install.sh)."
  exit 1
fi

(
  sleep 1
  if command -v open >/dev/null 2>&1; then
    open "http://localhost:${PORT}" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://localhost:${PORT}" >/dev/null 2>&1 || true
  fi
) &

npm run start -- -p "$PORT"
