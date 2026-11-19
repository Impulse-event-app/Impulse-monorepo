import { useEffect } from 'react';
import { Platform, useColorScheme, useWindowDimensions } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { DesktopNotice } from '../src/DesktopNotice';
import { StripeRoot } from '../src/StripeRoot';
import { UpdateGate } from '../src/UpdateGate';
import { tokens } from '../src/theme';

/**
 * Compact windows prefer portrait (the phone layouts are designed for it).
 * Larger windows (iPad, an open iPhone Duo, Android tablets) rotate freely and
 * use the split layouts in src/layout.ts.
 *
 * Decided by window size, never by device idiom: an iPhone Duo is a phone
 * whose window grows when it unfolds. And it is only a preference: from
 * iOS 27 the system may refuse the lock (iPhone apps are resizable), so every
 * layout must still fill whatever window it is given.
 */
const COMPACT_MAX = 500;

function usePhonePortraitLock() {
  const { width, height } = useWindowDimensions();
  const compact = Math.min(width, height) < COMPACT_MAX;
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (compact) {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    } else {
      ScreenOrientation.unlockAsync().catch(() => {});
    }
  }, [compact]);
}

export default function RootLayout() {
  usePhonePortraitLock();
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
      </StripeRoot>
    </SafeAreaProvider>
  );
}
