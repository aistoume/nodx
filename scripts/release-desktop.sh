#!/usr/bin/env bash
# Build nodx desktop, sign + (optionally) notarize, copy DMG to aicon-web,
# push the website, and create a GitHub Release.
#
# Usage:
#   bash scripts/release-desktop.sh 0.1.0
#
# Prereqs:
#   - Apple Developer ID env vars set (APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID,
#     APPLE_SIGNING_IDENTITY) for notarization. Otherwise this builds a signed-
#     but-not-notarized DMG that still works (Gatekeeper will warn once).
#   - `gh` CLI installed + authenticated for `aistoume/nodx`.
#   - aicon-web standalone repo cloned at ~/Develop/aicon-web (the
#     sync script will rsync apps/web → there and git push).

set -euo pipefail

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version>     e.g.  $0 0.1.0"
  exit 1
fi

MONO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DESKTOP_DIR="$MONO_ROOT/apps/desktop"
DMG_NAME="nodx-${VERSION}-arm64.dmg"
DMG_SRC="$DESKTOP_DIR/src-tauri/target/release/bundle/dmg/nodx_${VERSION}_aarch64.dmg"
WEB_DOWNLOADS="$MONO_ROOT/apps/web/downloads"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  nodx desktop release pipeline → $VERSION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── 1. Sanity: versions match across all three manifests ─────────────────────
echo "→ [1/6] Verifying version $VERSION across all manifests..."
MISMATCH=0
grep -q "\"version\": \"$VERSION\"" "$DESKTOP_DIR/src-tauri/tauri.conf.json" || { echo "  ✗ tauri.conf.json"; MISMATCH=1; }
grep -q "^version = \"$VERSION\"" "$DESKTOP_DIR/src-tauri/Cargo.toml"        || { echo "  ✗ Cargo.toml";       MISMATCH=1; }
grep -q "\"version\": \"$VERSION\"" "$DESKTOP_DIR/package.json"               || { echo "  ✗ package.json";    MISMATCH=1; }
if [[ $MISMATCH -eq 1 ]]; then
  echo ""
  echo "  Fix the version in those files first, then re-run."
  exit 1
fi
echo "  ✓ All three manifests at $VERSION"

# ── 2. Build (signed, optionally notarized) ──────────────────────────────────
echo ""
echo "→ [2/6] pnpm install + tauri build (3–8 minutes)..."
cd "$MONO_ROOT"
pnpm install
cd "$DESKTOP_DIR"
pnpm tauri build

if [[ ! -f "$DMG_SRC" ]]; then
  echo ""
  echo "  ✗ DMG not found at expected path:"
  echo "    $DMG_SRC"
  echo ""
  echo "  Check what tauri produced:"
  ls "$DESKTOP_DIR/src-tauri/target/release/bundle/dmg/" 2>/dev/null || true
  exit 1
fi
echo "  ✓ Built: $DMG_SRC"

# ── 3. Install to /Applications for local testing ────────────────────────────
echo ""
echo "→ [3/6] Installing to /Applications for local smoke test..."
sudo rm -rf "/Applications/nodx.app" 2>/dev/null || rm -rf "/Applications/nodx.app"
cp -R "$DESKTOP_DIR/src-tauri/target/release/bundle/macos/nodx.app" /Applications/
# Force LaunchServices to register nodx:// scheme
/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister \
  -f -R /Applications/nodx.app
echo "  ✓ /Applications/nodx.app refreshed + nodx:// scheme re-registered"

# ── 4. Copy DMG into aicon-web downloads ─────────────────────────────────────
echo ""
echo "→ [4/6] Copying DMG into aicon-web/downloads/..."
mkdir -p "$WEB_DOWNLOADS"
cp "$DMG_SRC" "$WEB_DOWNLOADS/$DMG_NAME"
echo "  ✓ $WEB_DOWNLOADS/$DMG_NAME"

# ── 5. Push aicon-web ────────────────────────────────────────────────────────
echo ""
echo "→ [5/6] Sync apps/web → aicon-web repo + push..."
bash "$MONO_ROOT/apps/web/scripts/sync.sh" "release(desktop): v$VERSION"

# ── 6. Create GitHub Release on private nodx repo ────────────────────────────
echo ""
echo "→ [6/6] Creating GitHub Release v$VERSION on aistoume/nodx..."
if command -v gh >/dev/null 2>&1; then
  cd "$MONO_ROOT"
  if [[ -f "RELEASE_NOTES_${VERSION}.md" ]]; then
    NOTES_FLAG=(--notes-file "RELEASE_NOTES_${VERSION}.md")
  else
    NOTES_FLAG=(--generate-notes)
  fi
  gh release create "v$VERSION" \
    "$DMG_SRC" \
    --title "nodx desktop v$VERSION" \
    --repo aistoume/nodx \
    "${NOTES_FLAG[@]}"
  echo "  ✓ Release created on GitHub"
else
  echo "  ⚠ gh CLI not installed — skipping. Create the release manually:"
  echo "    https://github.com/aistoume/nodx/releases/new"
  echo "    Tag: v$VERSION"
  echo "    Attach: $DMG_SRC"
  echo "    Notes: RELEASE_NOTES_${VERSION}.md"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✓ Release v$VERSION shipped"
echo ""
echo "  Verify in ~30 seconds:"
echo "    https://aicon.solutions/nodx/                   (page updated)"
echo "    https://aicon.solutions/downloads/$DMG_NAME     (DMG live)"
echo "    https://github.com/aistoume/nodx/releases/tag/v$VERSION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
