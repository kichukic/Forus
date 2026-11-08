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
(cd android && JAVA_HOME="${JAVA_HOME_FORUS:-/home/hijack/Android/jdk-21}" ANDROID_HOME="${ANDROID_HOME:-/home/hijack/Android/Sdk}" ./gradlew assembleRelease --console=plain --no-daemon --max-workers=2 -Dorg.gradle.parallel=false "-Dorg.gradle.jvmargs=-Xmx2560m -XX:MaxMetaspaceSize=768m" -PreactNativeArchitectures=arm64-v8a,armeabi-v7a)

if [ ! -f "$APK" ]; then
  echo "APK not found at $APK" >&2; exit 1
fi
SIZE=$(stat -c %s "$APK")
# The manifest carries the checksum so the in-app updater can reject a
# truncated or tampered download before it reaches the installer.
SHA256=$(sha256sum "$APK" | cut -d ' ' -f1)
URL="https://github.com/$REPO/releases/download/$TAG/$ASSET"

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

# Keep the repository version.json updated so Fastly CDN (raw.githubusercontent.com)
# has instant, reliable manifest availability worldwide with zero 504 risk.
git add "$MANIFEST"
git commit -m "chore(release): manifest for $VERSION ($CODE)" || true
git push origin HEAD || true

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
  --notes "Release $VERSION (versionCode $CODE)." \
  --latest

echo "==> done: https://github.com/$REPO/releases/tag/$TAG"
rm -rf "$STAGE"
