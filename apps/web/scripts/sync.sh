#!/usr/bin/env bash
# Sync apps/web/ from this monorepo to the standalone aicon-web repo,
# commit and push.  Cloudflare Pages auto-deploys from the push.
#
# Usage:
#   bash apps/web/scripts/sync.sh "feat: tweak hero copy"
#
# First-time setup expects ~/dev/aicon-web to exist as a git repo
# (see apps/web/README.md for one-time setup).

set -euo pipefail

MONO_WEB="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${AICON_WEB_DIR:-$HOME/Develop/aicon-web}"

if [ ! -d "$TARGET/.git" ]; then
  echo "✗ $TARGET is not a git repo."
  echo "  Set up the standalone aicon-web repo first — see apps/web/README.md."
  exit 1
fi

MSG="${1:-sync from monorepo $(date +%Y-%m-%d)}"

echo "→ Syncing $MONO_WEB → $TARGET ..."
rsync -av --delete \
  --exclude='.git' \
  --exclude='scripts/' \
  --exclude='node_modules' \
  "$MONO_WEB/" "$TARGET/"

cd "$TARGET"
# porcelain covers untracked files too — plain `git diff --quiet` misses
# brand-new directories and silently skips the commit.
if [ -z "$(git status --porcelain)" ]; then
  echo "✓ Nothing changed."
  exit 0
fi

git add -A
git commit -m "$MSG"
git push

echo ""
echo "✓ Pushed. Cloudflare Pages will redeploy in ~30 seconds."
echo "  Live at: https://aicon-web.pages.dev/   (and https://aicon.solutions/ once domain is wired)"
