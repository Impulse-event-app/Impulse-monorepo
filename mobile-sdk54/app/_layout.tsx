import { useEffect } from 'react';
import { Platform, useColorScheme, useWindowDimensions } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Device from 'expo-device';
import { DesktopNotice } from '../src/DesktopNotice';
import { StripeRoot } from '../src/StripeRoot';
import { UpdateGate } from '../src/UpdateGate';
import { tokens } from '../src/theme';
import { HingeObserver } from '../src/HingeObserver';

/**
 * Orientation.
 *
 * Normal iPhones: portrait only. Locked once at launch and never unlocked.
 *
 * iPhone Duo: never locked. It follows the pose and uses the split layout
 * (src/layout.ts) when open in landscape. A lock is harmful there: a portrait
 * lock taken while the phone is folded can't be released (unlockAsync()
 * doesn't hand rotation back), so after unfolding the app stays sideways on
 * the open display (seen in the Duo simulator, iOS 27.2). Folded, a Duo's
 * window is phone-sized and the hinge API reports nothing, so the device model
 * (expo-device) is what tells it apart from a normal iPhone. app.json allows
 * every orientation so the Duo can rotate; this lock is what keeps other
 * iPhones upright.
 *
 * Android: phone-sized windows stay portrait; tablets and unfolded foldables
 * rotate freely, decided by window size.
 */
const COMPACT_MAX = 500;

/**
 * iPhone Duo (and any future foldable iPhone expo-device names the same way).
 * Simulators count too: expo-device can only see "arm64" there, never the
 * simulated model, so the lock is skipped on every simulator to keep the
 * iPhone Duo simulator testable. Real iPhones report their model.
 */
const IS_FOLDABLE_IPHONE =
  Platform.OS === 'ios' && (!Device.isDevice || /\bDuo\b|Fold/i.test(Device.modelName ?? ''));

function usePortraitLock() {
  const { width, height } = useWindowDimensions();
  const lock =
    Platform.OS === 'ios' ? !IS_FOLDABLE_IPHONE
    : Platform.OS === 'android' ? Math.min(width, height) < COMPACT_MAX
    : false;
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (lock) {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    } else if (Platform.OS === 'android') {
      // iOS never unlocks: normal iPhones stay locked, and a Duo is never locked.
      ScreenOrientation.unlockAsync().catch(() => {});
    }
  }, [lock]);
}

export default function RootLayout() {
  usePortraitLock();
  // Before the app's own appearance preference loads, follow the system.
  const T = tokens(useColorScheme() !== 'light');
  // Brand v2 uses the system face, so there are no fonts to wait on.
  return (
    <SafeAreaProvider>
      <StripeRoot>
        <StatusBar style="auto" />
        <UpdateGate T={T}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: T.bg } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(user)" />
          </Stack>
        </UpdateGate>
        {/* Web-only; compiles to null on native. Above the Stack so it covers
            every route, including the auth gate's blank frames. */}
        <DesktopNotice />
        {/* iPhone Duo hinge status for the split layout; null off iOS. */}
        <HingeObserver />
      </StripeRoot>
    </SafeAreaProvider>
  );
}
