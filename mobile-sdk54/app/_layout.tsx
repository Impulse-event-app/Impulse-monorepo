import { useEffect } from 'react';
import { Platform, useColorScheme, useWindowDimensions } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { DesktopNotice } from '../src/DesktopNotice';
import { tokens } from '../src/theme';

/**
 * Phones stay portrait (the layouts are designed for it). iPad and Android
 * tablets rotate and multitask freely — app.json allows every orientation, and
 * iPad Split View ignores orientation locks anyway.
 */
function usePhonePortraitLock() {
  const { width, height } = useWindowDimensions();
  const isTablet = Platform.OS === 'ios' ? Platform.isPad : Math.min(width, height) >= 600;
  useEffect(() => {
    if (Platform.OS === 'web' || isTablet) return;
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, [isTablet]);
}

export default function RootLayout() {
  usePhonePortraitLock();
  // Before the app's own appearance preference loads, follow the system.
  const T = tokens(useColorScheme() !== 'light');
  // Brand v2 uses the system face, so there are no fonts to wait on.
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: T.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(user)" />
      </Stack>
      {/* Web-only; compiles to null on native. Above the Stack so it covers
          every route, including the auth gate's blank frames. */}
      <DesktopNotice />
    </SafeAreaProvider>
  );
}
