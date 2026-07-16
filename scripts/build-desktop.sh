#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARGET="${1:-current}"

echo "==> Installing deps"
npm ci

echo "==> Preparing database + desktop bundles"
export DATABASE_URL="${DATABASE_URL:-file:./prisma/dev.db}"
printf 'DATABASE_URL=%s\nPREORDER_POLL_MS=60000\nTAX_RATE=0.08\nPRICE_MODE=demo\n' "$DATABASE_URL" > .env
npx prisma generate
npx prisma migrate deploy
npm run db:seed
node scripts/prepare-desktop.mjs

echo "==> Packaging Electron installer"
case "$TARGET" in
  win|windows)
    npx electron-builder --win nsis portable --x64 --publish never
    ;;
  linux)
    npx electron-builder --linux AppImage --x64 --publish never
    ;;
  mac|darwin)
    npx electron-builder --mac dmg --publish never
    ;;
  current)
    npx electron-builder --publish never
    ;;
  *)
    echo "Unknown target: $TARGET (use win|linux|mac|current)"
    exit 1
    ;;
esac

echo "==> Artifacts in dist-desktop/"
ls -lah dist-desktop || true
