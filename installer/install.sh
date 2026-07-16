#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$ROOT/app"
PORT="${PORT:-3000}"

echo ""
echo "========================================"
echo "  MTG Budget installer"
echo "========================================"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required but was not found."
  echo "Install Node 20+ from https://nodejs.org then run this installer again."
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  echo "Node.js 20+ is required (found $(node -v))."
  exit 1
fi

cd "$APP_DIR"

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

echo "Installing dependencies..."
npm install

echo "Setting up database..."
npx prisma migrate deploy
npm run db:seed

echo "Building app..."
npm run build

echo ""
echo "Install complete. Starting MTG Budget on http://localhost:${PORT}"
echo "Press Ctrl+C to stop."
echo ""

# Open browser after a short delay (best-effort)
(
  sleep 2
  if command -v open >/dev/null 2>&1; then
    open "http://localhost:${PORT}" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://localhost:${PORT}" >/dev/null 2>&1 || true
  fi
) &

npm run start -- -p "$PORT"
