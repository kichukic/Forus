#!/usr/bin/env bash
# Builds the release APK and publishes it to GitHub Releases with a version.json
# manifest that the in-app updater polls.
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(python3 -c "import json;print(json.load(open('app.json'))['expo']['version'])")
CODE=$(python3 -c "import json;print(json.load(open('app.json'))['expo']['android']['versionCode'])")
REPO="kichukic/Forus"
APK="android/app/build/outputs/apk/release/app-release.apk"
TAG="v${VERSION}"
ASSET="forus-${VERSION}.apk"
MANIFEST="version.json"

echo "==> building release APK ($VERSION / code $CODE)"
(cd android && JAVA_HOME=/home/hijack/Android/jdk-21 ANDROID_HOME=/home/hijack/Android/Sdk ./gradlew assembleRelease --console=plain)

if [ ! -f "$APK" ]; then
  echo "APK not found at $APK" >&2; exit 1
fi
SIZE=$(stat -c %s "$APK")
# The manifest carries the checksum so the in-app updater can reject a
# truncated or tampered download before it reaches the installer.
SHA256=$(sha256sum "$APK" | cut -d ' ' -f1)
URL="https://github.com/$REPO/releases/latest/download/$ASSET"

cat > "$MANIFEST" <<JSON
{
  "version": "$VERSION",
  "versionCode": $CODE,
  "url": "$URL",
  "size": $SIZE,
  "sha256": "$SHA256",
  "notes": "Latest release of ForUs."
}
JSON
echo "==> manifest:"; cat "$MANIFEST"

# Rename the APK to the versioned name and copy into a staging dir.
STAGE="$(mktemp -d)"
cp "$APK" "$STAGE/$ASSET"
cp "$MANIFEST" "$STAGE/$MANIFEST"

echo "==> publishing release $TAG to $REPO"
gh release create "$TAG" \
  "$STAGE/$ASSET" \
  "$STAGE/$MANIFEST" \
  --repo "$REPO" \
  --title "ForUs $VERSION" \
  --notes "Release $VERSION (versionCode $CODE)."

echo "==> done: https://github.com/$REPO/releases/tag/$TAG"
rm -rf "$STAGE"
