// Map tab route. The implementation lives in src/MapScreen so the native-only
// react-native-maps import stays out of this route file's web bundle: Metro
// resolves ../../../src/MapScreen to MapScreen.web.tsx (a list fallback) on web
// and MapScreen.tsx (the interactive map) on iOS/Android.
export { default } from '../../../src/MapScreen';
