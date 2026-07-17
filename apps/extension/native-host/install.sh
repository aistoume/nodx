#!/bin/bash
# ──────────────────────────────────────────────────────────────────────
# nodx Lens native host installer (macOS + Linux).
#
# Registers the Chrome native-messaging host that bridges nodx Lens to
# your local Claude Code CLI — after this, the extension can talk to
# `claude` directly with NO gateway command and NO open port.
#
# Usage:
#   ./install.sh                  # register for the store extension
#   ./install.sh <extension-id>   # ALSO allow a dev/unpacked extension id
#   ./install.sh --uninstall
#
# What it does:
#   1. Finds `node` and `claude` on YOUR path and bakes the absolute paths
#      into a wrapper (Chrome spawns hosts with a minimal PATH).
#   2. Copies host.mjs + wrapper to ~/.nodx-lens/
#   3. Writes the host manifest into every installed Chromium-family
#      browser's NativeMessagingHosts directory.
# ──────────────────────────────────────────────────────────────────────
set -euo pipefail

HOST_NAME="solutions.aicon.nodx_lens"
STORE_EXT_ID="ipljkbefemodjbihcnmmaallcfndmild"
INSTALL_DIR="$HOME/.nodx-lens"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_SRC="$SCRIPT_DIR/host.mjs"
HOST_URL="https://aicon.solutions/nodx/lens-host/host.mjs"

# Manifest directories per browser (macOS, then Linux).
manifest_dirs() {
  if [ "$(uname)" = "Darwin" ]; then
    local as="$HOME/Library/Application Support"
    echo "$as/Google/Chrome/NativeMessagingHosts"
    echo "$as/Google/Chrome Beta/NativeMessagingHosts"
    echo "$as/Google/Chrome Canary/NativeMessagingHosts"
    echo "$as/Chromium/NativeMessagingHosts"
    echo "$as/Microsoft Edge/NativeMessagingHosts"
    echo "$as/BraveSoftware/Brave-Browser/NativeMessagingHosts"
    echo "$as/Arc/User Data/NativeMessagingHosts"
  else
    echo "$HOME/.config/google-chrome/NativeMessagingHosts"
    echo "$HOME/.config/chromium/NativeMessagingHosts"
    echo "$HOME/.config/microsoft-edge/NativeMessagingHosts"
    echo "$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"
  fi
}

if [ "${1:-}" = "--uninstall" ]; then
  rm -rf "$INSTALL_DIR"
  while IFS= read -r dir; do
    rm -f "$dir/$HOST_NAME.json"
  done < <(manifest_dirs)
  echo "✓ nodx Lens native host removed."
  exit 0
fi

NODE_BIN="$(command -v node || true)"
CLAUDE_BIN="$(command -v claude || true)"
if [ -z "$NODE_BIN" ]; then
  echo "✗ node not found — install Node.js 18+ first (https://nodejs.org)"; exit 1
fi
if [ -z "$CLAUDE_BIN" ]; then
  echo "✗ claude not found — install Claude Code and log in first (https://claude.com/claude-code)"; exit 1
fi

mkdir -p "$INSTALL_DIR"

# host.mjs: prefer the copy sitting next to this script; else download.
if [ -f "$HOST_SRC" ]; then
  cp "$HOST_SRC" "$INSTALL_DIR/host.mjs"
else
  echo "· host.mjs not found locally — downloading from $HOST_URL"
  curl -fsSL "$HOST_URL" -o "$INSTALL_DIR/host.mjs"
fi

# Wrapper with absolute paths (Chrome's spawn PATH may lack homebrew etc.)
cat > "$INSTALL_DIR/host-wrapper.sh" << WRAP
#!/bin/bash
export CLAUDE_BIN="$CLAUDE_BIN"
exec "$NODE_BIN" "$INSTALL_DIR/host.mjs"
WRAP
chmod +x "$INSTALL_DIR/host-wrapper.sh" "$INSTALL_DIR/host.mjs"

# allowed_origins: store id + optional extra (dev/unpacked) id.
ORIGINS="\"chrome-extension://$STORE_EXT_ID/\""
if [ -n "${1:-}" ]; then
  ORIGINS="$ORIGINS, \"chrome-extension://$1/\""
fi

MANIFEST="{
  \"name\": \"$HOST_NAME\",
  \"description\": \"nodx Lens ↔ local Claude Code CLI bridge\",
  \"path\": \"$INSTALL_DIR/host-wrapper.sh\",
  \"type\": \"stdio\",
  \"allowed_origins\": [$ORIGINS]
}"

INSTALLED=0
while IFS= read -r dir; do
  # Only register where the browser actually exists (parent dir present).
  parent="$(dirname "$dir")"
  if [ -d "$parent" ]; then
    mkdir -p "$dir"
    printf '%s\n' "$MANIFEST" > "$dir/$HOST_NAME.json"
    echo "✓ registered: $dir"
    INSTALLED=$((INSTALLED + 1))
  fi
done < <(manifest_dirs)

if [ "$INSTALLED" -eq 0 ]; then
  echo "✗ no Chromium-family browser profile found — is Chrome installed?"; exit 1
fi

echo ""
echo "Done. In the extension: ⚙ Settings → AI Provider → nodx (local gateway),"
echo "then click 「连接本地 Claude / Connect local Claude」 to grant the"
echo "nativeMessaging permission. Restart Chrome if the host isn't picked up."
