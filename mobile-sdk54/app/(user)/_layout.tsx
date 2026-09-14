import { useEffect, useState } from 'react';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { AppProvider, useTheme } from '../../src/theme';
import { supabase } from '../../src/supabase';
import { NATIVE_SHEETS } from '../../src/components';

export const unstable_settings = {
  // Deep links (straight to an event, say) get the tabs underneath, so Back
  // lands on the feed rather than the sign-in hero.
  initialRouteName: '(tabs)',
};

// Routes reachable without a session. The deal feed is public, so guests can
// browse (feed, map, event detail, filters) and are only asked to sign in at
// the point of need — booking, starting a huddle. Also public:
//  - the Plans and You tabs, which render their own signed-out state
//  - legal docs, so Terms/Privacy/Help stay readable before anyone signs up
//  - the appearance setting, which needs no account
//  - the huddle join link and huddle status sheet, which intentionally support
//    guest access by name only (see huddle/join/[token].tsx) — invited friends
//    may not have an account, and their member token authenticates them.
const PUBLIC_PATHS = new Set([
  '/sign-in', '/home', '/map', '/plans', '/profile', '/filters', '/area', '/profile-edit/appearance',
]);

function isPublicPath(pathname: string): boolean {
  const p = pathname.replace(/^\/\(user\)/, '').replace(/^\/\(tabs\)/, '');
  if (PUBLIC_PATHS.has(p)) return true;
  if (p.startsWith('/event/') || p.startsWith('/legal/') || p.startsWith('/huddle/join/')) return true;
  return /^\/huddle\/(?!new$)[^/]+$/.test(p);
}

// Gates every other route in this group behind a live session, so a direct
// URL or deep link (e.g. straight to /claim/abc) can't skip sign-in. Re-checks
// on every navigation (matters on web, where any path can be typed) and reacts
// live to sign-out. Sends the user to sign-in with `next`, so they come back.
function AuthGate({ children }: { children: React.ReactNode }) {
  const T = useTheme();
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
      router.replace({ pathname: '/(user)/sign-in', params: { next: pathname } });
    }
  }, [hasSession, pathname, router]);

  // Blank (never the route underneath) while the session is unknown, or once
  // we know there isn't one and this path needs it — so protected content
  // can't flash on screen a frame before the redirect above kicks in.
  const blocked = hasSession === null || (hasSession === false && !isPublicPath(pathname));
  if (blocked) {
    return <View style={{ flex: 1, backgroundColor: T.bg }} />;
  }
  return <>{children}</>;
}

export default function UserLayout() {
  return (
    <AppProvider>
      <AuthGate>
        <UserStack />
      </AuthGate>
    </AppProvider>
  );
}

function UserStack() {
  const T = useTheme();

  // Sheets: native iOS formSheet (grabber, detents, swipe down to dismiss,
  // centred form on iPad). Elsewhere, a transparent modal that SheetFrame
  // draws its own scrim and sheet into.
  const sheet = (detents: number[]) =>
    NATIVE_SHEETS
      ? {
          presentation: 'formSheet' as const,
          sheetAllowedDetents: detents,
          sheetGrabberVisible: true,
          sheetCornerRadius: 16,
          contentStyle: { backgroundColor: T.surface },
        }
      : {
          presentation: 'transparentModal' as const,
          animation: 'fade' as const,
          contentStyle: { backgroundColor: 'transparent' },
        };

  return (
    <>
      <StatusBar style={T.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: T.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="event/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="claim/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="huddle/new" options={sheet([0.6, 1])} />
        <Stack.Screen name="huddle/[id]" options={sheet([0.75, 1])} />
        <Stack.Screen name="huddle/join/[token]" options={{ animation: 'fade' }} />
        <Stack.Screen name="legal/[doc]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="confirm" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="filters" options={sheet([0.75, 1])} />
        <Stack.Screen name="area" options={sheet([0.5, 1])} />
        <Stack.Screen name="profile-edit/[field]" options={sheet([0.6, 1])} />
      </Stack>
    </>
  );
}
