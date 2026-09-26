#!/usr/bin/env bash
# Publish the web app to the Mac's OTA hub, reachable on the tailnet at
#   https://davids-macbook-pro.tailb97fc.ts.net/bio45-nutrition/
#
# This is a WEB-ONLY hub card. There is no IPA, no manifest.plist and no signing,
# so nothing here needs the Mac's login keychain or a GUI tmux session — unlike a
# native deploy. It copies files and regenerates the hub index.
#
# GitHub Pages is the other target and is a separate thing entirely: `git push`.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CARD="bio45-nutrition"
HOST="${OTA_HOST:-mac}"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

cd "$REPO"
command -v git >/dev/null || { echo "git required"; exit 1; }

# Ship only what the running app needs: no .git, tests, tools or authoring seed.
git ls-files \
  | grep -vE '^(tests/|tools/|scripts/|\.github/)' \
  | grep -vE '\.md$|^package\.json$|^\.gitignore$' > "$STAGE/files.txt"

mkdir -p "$STAGE/card/web"
tar -cf - -T "$STAGE/files.txt" | (cd "$STAGE/card/web" && tar -xf -)
for doc in README.md LICENSE SHARING.md ATTRIBUTION.md AI-POLICY.md; do
  [ -f "$doc" ] && cp "$doc" "$STAGE/card/web/"
done
cp icon-192.png "$STAGE/card/icon.png"
cp "$REPO/scripts/ota-install.html" "$STAGE/card/install.html"
cp "$REPO/scripts/ota-index.html"   "$STAGE/card/index.html"

BUILD="$(date -u +%Y%m%d%H%M%S)"
VERSION="$(python3 -c "import json;print(json.load(open('course.json'))['version'])")"
cat > "$STAGE/card/meta.json" <<JSON
{
  "bundle_id": "$CARD",
  "title": "Nutrition 45 (BIOL 45.01W)",
  "version": "$VERSION",
  "build": "$BUILD",
  "updated": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSON

tar -czf "$STAGE/card.tgz" -C "$STAGE/card" .
scp -q "$STAGE/card.tgz" "$HOST:/tmp/$CARD.tgz"

# refresh-ota-hub.sh regenerates index.html wholesale. Never edit it by hand.
ssh "$HOST" "set -e
  D=\~/Sites/ios-ota/$CARD
  rm -rf \"\$D\" && mkdir -p \"\$D\"
  tar -xzf /tmp/$CARD.tgz -C \"\$D\"
  rm -f /tmp/$CARD.tgz
  cd \~/Sites && ./refresh-ota-hub.sh >/dev/null 2>&1
  echo \"deployed \$(find \"\$D/web\" -type f | wc -l | tr -d ' ') files\""

echo "→ https://davids-macbook-pro.tailb97fc.ts.net/$CARD/   (tailnet only)"
