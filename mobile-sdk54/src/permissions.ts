// permissions.ts — Impulse: location & notification permission helpers.
// Platform-aware: expo-notifications has no web support (browser Notification
// API is used there), and reverse geocoding is native-only in expo-location.
import * as Location from 'expo-location';
import { Platform } from 'react-native';

/**
 * Ask for foreground location. On grant, best-effort reverse-geocode the
 * current position to a suburb name (native only — expo-location's
 * reverseGeocodeAsync is unsupported on web).
 */
export async function requestLocationAccess(): Promise<{ granted: boolean; suburb: string | null }> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { granted: false, suburb: null };

    if (Platform.OS === 'web') return { granted: true, suburb: null };

    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const places = await Location.reverseGeocodeAsync({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    });
    // "district" is usually the suburb in AU; "city"/"subregion" as fallbacks.
    const p = places[0];
    return { granted: true, suburb: p?.district ?? p?.city ?? p?.subregion ?? null };
  } catch {
    return { granted: false, suburb: null };
  }
}

/** Ask for notification permission. Returns whether it was granted. */
export async function requestNotificationAccess(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      if (typeof Notification === 'undefined') return false;
      const res = await Notification.requestPermission();
      return res === 'granted';
    }
    const Notifications = await import('expo-notifications');
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Fetch this device's Expo push token and register it with the backend.
 * Native only — Expo push tokens don't exist on web (huddle web sessions get
 * the same info via the polling status screen). With `ask`, prompts a user
 * who has never been asked. Never throws; returns what happened so the
 * profile's test button can show it.
 */
export async function syncPushToken({ ask = false }: { ask?: boolean } = {}): Promise<string> {
  if (Platform.OS === 'web') return 'web: no push tokens';
  try {
    const Notifications = await import('expo-notifications');
    let { status } = await Notifications.getPermissionsAsync();
    // Never asked (skipped onboarding, or signed up before it asked): ask
    // now. iOS only ever shows this once, so it can't nag.
    if (status === 'undetermined' && ask) {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== 'granted') return `permission ${status}`;

    let projectId: string | undefined;
    try {
      const Constants = (await import('expo-constants')).default;
      projectId = Constants?.expoConfig?.extra?.eas?.projectId;
    } catch {
      // no project id available; getExpoPushTokenAsync falls back
    }
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    if (!token) return 'no token from Expo';

    const { registerPushToken } = await import('./api');
    await registerPushToken(token);
    return 'registered';
  } catch (e) {
    return `error: ${e instanceof Error ? e.message : String(e)}`;
  }
}
