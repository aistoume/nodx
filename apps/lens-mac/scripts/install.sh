#!/usr/bin/env bash
# Build nodx Lens as a release .app and install to /Applications.
# Run: bash apps/lens-mac/scripts/install.sh

set -euo pipefail

cd "$(dirname "$0")/.."

echo "→ Building release .app..."
pnpm tauri build --bundles app

APP_SRC="src-tauri/target/release/bundle/macos/nodx Lens.app"
APP_DEST="/Applications/nodx Lens.app"

if [ ! -d "$APP_SRC" ]; then
  echo "✗ Build did not produce $APP_SRC"
  exit 1
fi

echo "→ Quitting any running nodx Lens..."
osascript -e 'tell application "nodx Lens" to quit' 2>/dev/null || true
sleep 1

echo "→ Removing old install (if any)..."
rm -rf "$APP_DEST"

echo "→ Copying to /Applications..."
cp -r "$APP_SRC" "$APP_DEST"

echo ""
echo "✓ Installed to: $APP_DEST"
echo ""
echo "Next steps:"
echo "  1. open \"$APP_DEST\"       (or right-click → Open the first time)"
echo "  2. Press ⌥+E"
echo "  3. Grant Accessibility permission in System Settings"
echo "  4. ⌘+Q to quit, then 'open' again to reload"
