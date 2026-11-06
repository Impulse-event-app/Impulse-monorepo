// UpdateGate.tsx — blocks the app behind an "update Impulse" screen when the
// API says this build is too old (GET /app/config → min_version). Raised on the
// server when a release changes a contract older builds rely on, as the move to
// Stripe did for payments. Fails open: if the check can't run, the app works.
import Constants from 'expo-constants';
import { useEffect, useState, type ReactNode } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { getAppConfig } from './api';
import type { Theme } from './theme';

const STORE_URL = process.env.EXPO_PUBLIC_APP_STORE_URL ?? 'https://apps.apple.com/app/impulse';

/** "1.10.0" > "1.9.2"; missing parts count as 0. */
export function isOlder(version: string, minimum: string): boolean {
  const a = version.split('.').map((n) => parseInt(n, 10) || 0);
  const b = minimum.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  }
  return false;
}

export function UpdateGate({ T, children }: { T: Theme; children: ReactNode }) {
  const [outdated, setOutdated] = useState(false);

  useEffect(() => {
    const current = Constants.expoConfig?.version ?? '0.0.0';
    getAppConfig()
      .then((c) => setOutdated(isOlder(current, c.min_version)))
      .catch(() => {});   // offline or API down: never lock people out
  }, []);

  if (!outdated) return <>{children}</>;
  return (
    <View style={{ flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>
      <Text accessibilityRole="header" style={{ fontSize: 22, fontWeight: '600', color: T.text, textAlign: 'center' }}>
        Time to update Impulse
      </Text>
      <Text style={{ fontSize: 16, lineHeight: 23, color: T.muted, textAlign: 'center', maxWidth: 320 }}>
        This version can no longer book. Update to the latest version to keep finding and booking deals.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => { Linking.openURL(STORE_URL).catch(() => {}); }}
        style={{ marginTop: 8, backgroundColor: T.accent, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28 }}
      >
        <Text style={{ color: T.accentInk, fontSize: 16, fontWeight: '600' }}>Update</Text>
      </Pressable>
    </View>
  );
}
