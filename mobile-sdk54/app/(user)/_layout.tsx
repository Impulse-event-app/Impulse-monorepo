import { useEffect, useState } from 'react';
import { Stack, usePathname, useRouter } from 'expo-router';
import { View } from 'react-native';
import { AppProvider } from '../../src/theme';
import { supabase } from '../../src/supabase';

export const unstable_settings = {
  initialRouteName: 'sign-in',
};

// Routes reachable without a session:
//  - sign-in itself (the entry point)
//  - legal docs, so Terms/Privacy/Help stay readable before anyone signs up
//  - the huddle join link, which intentionally supports guest access by name
//    only (see huddle/join/[token].tsx) — invited friends may not have an
//    account yet, and requiring one would break the invite flow.
function isPublicPath(pathname: string): boolean {
  const p = pathname.replace(/^\/\(user\)/, '');
  return p === '/sign-in' || p.startsWith('/legal/') || p.startsWith('/huddle/join/');
}

// Gates every other route in this group behind a live session, so a direct
// URL or deep link (e.g. straight to /home or /event/abc) can't skip sign-in
// — index.tsx's own redirect only runs when the app is launched at "/", so it
// never sees traffic that lands mid-tree. Re-checks on every navigation
// (matters on web, where any path can be typed) and reacts live to sign-out.
function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (active) setHasSession(!!session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setHasSession(!!session);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (hasSession === false && !isPublicPath(pathname)) {
      router.replace('/(user)/sign-in');
    }
  }, [hasSession, pathname, router]);

  // Blank (never the route underneath) while the session is unknown, or once
  // we know there isn't one and this path needs it — so protected content
  // can't flash on screen a frame before the redirect above kicks in.
  const blocked = hasSession === null || (hasSession === false && !isPublicPath(pathname));
  if (blocked) {
    return <View style={{ flex: 1, backgroundColor: '#0F0E0D' }} />;
  }
  return <>{children}</>;
}

export default function UserLayout() {
  return (
    <AppProvider>
      <AuthGate>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0F0E0D' } }}>
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="event/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="claim/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen
            name="huddle/new"
            options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }}
          />
          <Stack.Screen
            name="huddle/[id]"
            options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }}
          />
          <Stack.Screen name="huddle/join/[token]" options={{ animation: 'fade' }} />
          <Stack.Screen name="legal/[doc]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="confirm" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
          <Stack.Screen
            name="filters"
            options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }}
          />
        </Stack>
      </AuthGate>
    </AppProvider>
  );
}
