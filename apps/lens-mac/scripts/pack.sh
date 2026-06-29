#!/usr/bin/env bash
# Build a signed + notarized .dmg for distribution.
# Run: bash apps/lens-mac/scripts/pack.sh
#
# Required env vars (one-time setup):
#   APPLE_SIGNING_IDENTITY  e.g. "Developer ID Application: Your Name (TEAMID)"
#   APPLE_ID                your Apple Developer email
#   APPLE_PASSWORD          app-specific password from appleid.apple.com
#   APPLE_TEAM_ID           10-char team ID from developer.apple.com/account
#
# Set them once in your shell profile (~/.zshrc):
#   export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
#   export APPLE_ID="your@email.com"
#   export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"
#   export APPLE_TEAM_ID="ABC1234567"

set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./package.json').version")
ARCH=$(uname -m)

# Detect signing capability (three modes)
SIGN_MODE="unsigned"
if [ -n "${APPLE_SIGNING_IDENTITY:-}" ]; then
  if [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_PASSWORD:-}" ] && [ -n "${APPLE_TEAM_ID:-}" ]; then
    SIGN_MODE="signed+notarized"
    echo "→ Building SIGNED + NOTARIZED .dmg (v${VERSION}, ${ARCH})"
    echo "  Signing as: ${APPLE_SIGNING_IDENTITY}"
    echo "  Notarizing as: ${APPLE_ID} (team ${APPLE_TEAM_ID})"
    echo "  Expect 5-10 min for Apple's notary service."
  else
    SIGN_MODE="signed-only"
    echo "→ Building SIGNED (NOT notarized) .dmg (v${VERSION}, ${ARCH})"
    echo "  Signing as: ${APPLE_SIGNING_IDENTITY}"
    echo "  Notarization skipped — users will see 'unidentified developer' warning"
    echo "  but no 'damaged' error. Add APPLE_ID / APPLE_PASSWORD / APPLE_TEAM_ID"
    echo "  later for full notarization."
  fi
else
  echo "→ Building UNSIGNED .dmg (v${VERSION}, ${ARCH})"
  echo "  Set APPLE_SIGNING_IDENTITY (and APPLE_ID / APPLE_PASSWORD / APPLE_TEAM_ID)"
  echo "  in your shell to enable signing + notarization."
fi
echo ""

pnpm tauri build --bundles dmg

DMG_DIR="src-tauri/target/release/bundle/dmg"
SRC_DMG=$(ls "$DMG_DIR"/*.dmg 2>/dev/null | head -1)

if [ -z "$SRC_DMG" ] || [ ! -f "$SRC_DMG" ]; then
  echo "✗ Build did not produce a .dmg in $DMG_DIR"
  exit 1
fi

OUT="nodx-lens-${VERSION}-${ARCH}.dmg"
cp "$SRC_DMG" "$OUT"
SIZE=$(du -h "$OUT" | cut -f1)

echo ""
echo "✓ Built: $(pwd)/${OUT}"
echo "  Source: ${SRC_DMG}"
echo "  Size:   ${SIZE}"
echo "  Mode:   ${SIGN_MODE}"
echo ""

# Verification — only meaningful if signed
case "$SIGN_MODE" in
  signed+notarized)
    echo "→ Verifying notarization..."
    spctl -a -t install -vv "$OUT" 2>&1 | sed 's/^/   /' || true
    echo ""
    echo "Look for 'source=Notarized Developer ID' above. ✓"
    echo "Users can now double-click → Open without Gatekeeper warnings."
    ;;
  signed-only)
    echo "→ Signed but not notarized."
    echo "   Users will see 'unidentified developer — Open Anyway' flow, no 'damaged' error."
    echo "   When ready, set APPLE_ID / APPLE_PASSWORD / APPLE_TEAM_ID and rebuild for the smoother experience."
    ;;
  unsigned)
    echo "⚠️  Unsigned build — users will see 'damaged / can't be opened' warning."
    echo "   For public distribution, set APPLE_* env vars and rebuild."
    ;;
esac
