#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARGET="${1:-current}"

echo "==> Installing deps"
npm ci

echo "==> Generating Prisma client + building Next (standalone)"
export DATABASE_URL="${DATABASE_URL:-file:./prisma/dev.db}"
npx prisma generate
npx prisma migrate deploy
npm run db:seed
npm run build

echo "==> Preparing desktop resources (Node runtime + server + DB)"
case "$TARGET" in
  win|windows)
    DESKTOP_PLATFORM=win32 DESKTOP_ARCH=x64 node scripts/prepare-desktop.mjs
    npx electron-builder --win portable nsis --x64 --publish never
    ;;
  linux)
    DESKTOP_PLATFORM=linux DESKTOP_ARCH=x64 node scripts/prepare-desktop.mjs
    npx electron-builder --linux AppImage --x64 --publish never
    ;;
  mac|darwin)
    DESKTOP_PLATFORM=darwin DESKTOP_ARCH="${DESKTOP_ARCH:-$(node -p process.arch)}" node scripts/prepare-desktop.mjs
    npx electron-builder --mac dmg --publish never
    ;;
  current)
    node scripts/prepare-desktop.mjs
    npx electron-builder --publish never
    ;;
  *)
    echo "Unknown target: $TARGET (use win|linux|mac|current)"
    exit 1
    ;;
esac

echo "==> Artifacts in dist-desktop/"
ls -lah dist-desktop || true
