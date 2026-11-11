// Dynamic Expo config. Inherits everything from app.json (passed in as `config`)
// and layers two things on top:
//
// 1. App variant. APP_VARIANT=staging (set by the `staging` EAS build profile)
//    builds "Impulse Staging": its own bundle id, name, icon and URL scheme, so
//    it installs beside the real app and can never be shipped in its place.
//    It talks to the staging backend, database and Stripe test mode through the
//    EAS "preview" environment's EXPO_PUBLIC_* values. Without APP_VARIANT you
//    get the production app, exactly as app.json describes it.
//
// 2. The Android Google Maps key, injected from the environment so it stays out
//    of app.json. react-native-maps on Android reads
//    android.config.googleMaps.apiKey; iOS uses Apple Maps (no key).
const IS_STAGING = process.env.APP_VARIANT === 'staging';

const STAGING_ID = 'au.impulseapp.impulse.staging';

export default ({ config }) => {
  const base = {
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
  };
  if (!IS_STAGING) return base;

  return {
    ...base,
    name: 'Impulse Staging',
    scheme: 'impulse-staging',
    icon: './assets/icon-staging.png',
    ios: {
      ...base.ios,
      bundleIdentifier: STAGING_ID,
      // Universal links stay with the production app: the staging app opens
      // its own links through the impulse-staging:// scheme instead.
      associatedDomains: [],
    },
    android: {
      ...base.android,
      package: STAGING_ID,
      intentFilters: [],
    },
  };
};
