#!/usr/bin/env bash
# Build nodx Lens as a release .dmg for distribution.
# Run: bash apps/lens-mac/scripts/pack.sh

set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./package.json').version")
ARCH=$(uname -m)

echo "→ Building release .dmg (v${VERSION}, ${ARCH})..."
pnpm tauri build --bundles dmg

DMG_DIR="src-tauri/target/release/bundle/dmg"
SRC_DMG=$(ls "$DMG_DIR"/*.dmg 2>/dev/null | head -1)

if [ -z "$SRC_DMG" ] || [ ! -f "$SRC_DMG" ]; then
  echo "✗ Build did not produce a .dmg in $DMG_DIR"
  exit 1
fi

# Rename to a stable, distribution-friendly name
OUT="nodx-lens-${VERSION}-${ARCH}.dmg"
cp "$SRC_DMG" "$OUT"

SIZE=$(du -h "$OUT" | cut -f1)

echo ""
echo "✓ Built: $(pwd)/${OUT}"
echo "  Source: ${SRC_DMG}"
echo "  Size:   ${SIZE}"
echo ""
echo "Distribute by:"
echo "  - Upload to your landing page / GitHub Releases / Cloudflare R2"
echo "  - First-time users: right-click app inside the dmg → Open (Gatekeeper unsigned)"
echo "  - See DISTRIBUTION.md for the install instructions to give end users"
