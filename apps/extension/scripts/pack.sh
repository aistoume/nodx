#!/usr/bin/env bash
# Build and pack nodx Lens for Chrome Web Store submission.
# Run from repo root: bash apps/extension/scripts/pack.sh

set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./package.json').version")
ZIP_NAME="nodx-lens-v${VERSION}.zip"

echo "→ Building production bundle..."
pnpm --filter @nodx/extension build

echo "→ Packing dist/ into ${ZIP_NAME}..."
cd dist
zip -r "../${ZIP_NAME}" . -x ".DS_Store" -x "*.map"
cd ..

echo ""
echo "✓ Done: $(pwd)/${ZIP_NAME}"
echo "  Size: $(du -h "${ZIP_NAME}" | cut -f1)"
echo ""
echo "Next steps:"
echo "  1. Verify the zip by drag-loading it as unpacked extension"
echo "     (chrome://extensions/ → Load unpacked → select dist/)"
echo "  2. Upload ${ZIP_NAME} to Chrome Web Store dev console"
echo "  3. Fill in store listing from STORE.md"
