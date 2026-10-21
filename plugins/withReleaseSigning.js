// Signs release builds with the app's own key from signing/release.properties
// instead of the shared debug key. Without that file (e.g. on another machine)
// release builds fall back to the debug key, as before.
const { withAppBuildGradle } = require('expo/config-plugins');

const SIGNING_CONFIG = `
        release {
            def props = new Properties()
            def file = rootProject.file('../signing/release.properties')
            if (file.exists()) {
                file.withInputStream { props.load(it) }
                storeFile rootProject.file('../signing/' + props['storeFile'])
                storePassword props['storePassword']
                keyAlias props['keyAlias']
                keyPassword props['keyPassword']
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    let gradle = config.modResults.contents;
    if (gradle.includes("'../signing/release.properties'")) return config;

    gradle = gradle.replace(/(signingConfigs\s*\{\s*debug\s*\{[^}]*\})/, `$1${SIGNING_CONFIG}`);
    // The release build type is the second "signingConfig signingConfigs.debug".
    let seen = 0;
    gradle = gradle.replace(/signingConfig signingConfigs\.debug/g, (line) =>
      ++seen === 2
        ? "signingConfig rootProject.file('../signing/release.properties').exists() ? signingConfigs.release : signingConfigs.debug"
        : line,
    );
    if (seen < 2 || !gradle.includes('signingConfigs.release')) {
      throw new Error('withReleaseSigning: app/build.gradle did not have the expected signing blocks');
    }
    config.modResults.contents = gradle;
    return config;
  });
};
