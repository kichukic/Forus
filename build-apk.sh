#!/usr/bin/env bash
# Builds the ForUs release APK into ./builds. Every build gets the next version
# (1.0.0, 1.0.1, ...); the newest is named ForUs-v<version>-latest.apk.
#
#   ./build-apk.sh             build
#   ./build-apk.sh --install   build, then install on the phone connected by USB
#   ./build-apk.sh --push      build, then copy it to the phone's Download folder
#   ./build-apk.sh --clean     regenerate the android/ project first, even if nothing changed
#
# Options can be combined, e.g. ./build-apk.sh --install --push
set -euo pipefail

cd "$(dirname "$0")"

INSTALL=false
PUSH=false
CLEAN=false
for arg in "$@"; do
  case "$arg" in
    --install) INSTALL=true ;;
    --push) PUSH=true ;;
    --clean) CLEAN=true ;;
    -h | --help)
      sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (try --help)" >&2
      exit 1
      ;;
  esac
done

step() { printf '\n\033[1;35m==> %s\033[0m\n' "$*"; }
fail() {
  printf '\033[1;31m%s\033[0m\n' "$*" >&2
  exit 1
}

# Java 21 and the Android SDK, as installed for this project. The system's
# Java 27 is too new for the Android build tools.
export JAVA_HOME="${JAVA_HOME_FORUS:-$HOME/Android/jdk-21}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

[ -x "$JAVA_HOME/bin/javac" ] || fail "No JDK at $JAVA_HOME (expected Java 21 with javac)."
[ -d "$ANDROID_HOME/platforms" ] || fail "No Android SDK at $ANDROID_HOME."
command -v npx > /dev/null || fail "npx not found; install Node.js."

[ -d node_modules ] || {
  step "Installing npm packages"
  npm install
}

# The android/ folder is generated from app.json and the native packages, so
# it is only rebuilt when one of those is newer than it.
stamp=android/.forus-prebuild
needs_prebuild=$CLEAN
if [ ! -f "$stamp" ]; then
  needs_prebuild=true
elif [ -n "$(find app.json package.json assets/images -newer "$stamp" -print -quit 2> /dev/null)" ]; then
  needs_prebuild=true
fi

# The next version: Android needs versionCode to grow for an install to count
# as an update, and versionName is what people see.
code=$(node -p "require('./app.json').expo.android.versionCode || 1")
code=$((code + 1))
version="1.0.$((code - 1))"
node -e '
  const fs = require("fs");
  const cfg = JSON.parse(fs.readFileSync("app.json", "utf8"));
  cfg.expo.version = process.argv[1];
  cfg.expo.android.versionCode = Number(process.argv[2]);
  fs.writeFileSync("app.json", JSON.stringify(cfg, null, 2) + "\n");
' "$version" "$code"

if $needs_prebuild; then
  step "Regenerating the Android project"
  npx expo prebuild --platform android --clean --no-install
else
  # Same version change, without regenerating the whole project.
  sed -i -E "s/^( *)versionCode [0-9]+/\1versionCode $code/; s/^( *)versionName \"[^\"]*\"/\1versionName \"$version\"/" \
    android/app/build.gradle
fi
# The version bump above shouldn't count as a change next time.
touch "$stamp"
echo "sdk.dir=$ANDROID_HOME" > android/local.properties

step "Building ForUs $version (build $code)"
start=$(date +%s)
(
  cd android
  # Limited parallelism and memory: with everything at full speed the native
  # build can run the machine out of memory.
  ./gradlew assembleRelease --no-daemon --max-workers=3 \
    -Dorg.gradle.parallel=false \
    "-Dorg.gradle.jvmargs=-Xmx3g -XX:MaxMetaspaceSize=768m" \
    -Pkotlin.daemon.jvm.options=-Xmx1g \
    -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
)

apk=android/app/build/outputs/apk/release/app-release.apk
[ -f "$apk" ] || fail "The build finished but no APK was found at $apk."

# The previous newest build loses its -latest tag.
mkdir -p builds
for old in builds/*-latest.apk; do
  [ -e "$old" ] && mv "$old" "${old%-latest.apk}.apk"
done
out="builds/ForUs-v$version-latest.apk"
cp "$apk" "$out"

step "Done in $(($(date +%s) - start))s"
echo "  $out ($(du -h "$out" | cut -f1))"

if $INSTALL || $PUSH; then
  adb get-state > /dev/null 2>&1 || fail "No phone connected over USB (check 'adb devices')."
fi
if $INSTALL; then
  step "Installing on $(adb shell getprop ro.product.model | tr -d '\r')"
  adb install -r "$out"
fi
if $PUSH; then
  step "Copying to the phone's Download folder"
  adb push "$out" /sdcard/Download/ForUs.apk
  echo "  Internal storage → Download → ForUs.apk"
fi
