#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
STAGE="$DIST/MTG-Budget-Installer"
ZIP_NAME="MTG-Budget-Installer.zip"

rm -rf "$DIST"
mkdir -p "$STAGE/app"

# Copy app source (no node_modules / build artifacts)
tar \
  --exclude=node_modules \
  --exclude=.next \
  --exclude=.git \
  --exclude=dist \
  --exclude=installer \
  --exclude='prisma/dev.db' \
  --exclude='prisma/dev.db-journal' \
  --exclude=.env \
  --exclude=.env.local \
  --exclude=src/generated \
  -C "$ROOT" \
  -cf - . | tar -C "$STAGE/app" -xf -

# Installer wrappers at package root
cp "$ROOT/installer/INSTALL.txt" "$STAGE/"
cp "$ROOT/installer/install.sh" "$STAGE/"
cp "$ROOT/installer/Install.command" "$STAGE/"
cp "$ROOT/installer/start.sh" "$STAGE/"
cp "$ROOT/installer/Start-MTG-Budget.command" "$STAGE/"
cp "$ROOT/installer/Install.bat" "$STAGE/"
cp "$ROOT/installer/Install.ps1" "$STAGE/"
cp "$ROOT/installer/Start-MTG-Budget.bat" "$STAGE/"

chmod +x \
  "$STAGE/install.sh" \
  "$STAGE/Install.command" \
  "$STAGE/start.sh" \
  "$STAGE/Start-MTG-Budget.command"

if [[ ! -f "$STAGE/app/.env.example" ]]; then
  echo "Missing .env.example in package" >&2
  exit 1
fi

if command -v zip >/dev/null 2>&1; then
  (
    cd "$DIST"
    rm -f "$ZIP_NAME"
    zip -r "$ZIP_NAME" "MTG-Budget-Installer" >/dev/null
  )
else
  (
    cd "$DIST"
    rm -f "$ZIP_NAME"
    python3 - <<'PY'
import pathlib, zipfile
root = pathlib.Path("MTG-Budget-Installer")
out = pathlib.Path("MTG-Budget-Installer.zip")
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
    for path in root.rglob("*"):
        if path.is_file():
            zf.write(path, path.as_posix())
print(f"Created {out}")
PY
  )
fi

echo "Created $DIST/$ZIP_NAME"
ls -lh "$DIST/$ZIP_NAME"
