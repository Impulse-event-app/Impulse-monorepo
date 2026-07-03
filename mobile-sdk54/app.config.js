// Dynamic Expo config. Inherits everything from app.json (passed in as `config`)
// and injects the Android Google Maps key from the environment, so the key stays
// in .env rather than committed in app.json.
//
// react-native-maps on Android reads android.config.googleMaps.apiKey.
// iOS uses Apple Maps (no key) and Expo Go supplies its own key, so this only
// matters for native Android builds.
export default ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    config: {
      ...config.android?.config,
      googleMaps: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY,
      },
    },
  },
});
