import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme, View } from 'react-native';
import { tokens } from '../src/theme';
import { supabase } from '../src/supabase';
import { hasSeenIntro, isOnboarded } from '../src/auth';

// Root route: no landing screen — send the user straight into the app. Also the
// web OAuth landing page: signInWithGoogle() on web redirects back here with a
// "?code=", and supabase-js (detectSessionInUrl, see src/supabase.ts) exchanges
// it for a session automatically during init. getSession() awaits that init, so
// by the time it resolves the session is ready. Renders a blank themed view for
// the brief moment that takes.
export default function Index() {
  const router = useRouter();
  const T = tokens(useColorScheme() !== 'light');

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // Signed in but not onboarded → onboarding; otherwise straight in.
        router.replace(isOnboarded(session) ? '/(user)/home' : '/(user)/onboarding');
        return;
      }
      // Guests can browse. The brand intro (with sign-in) shows once, on first
      // launch; after that the app opens on the feed.
      router.replace((await hasSeenIntro()) ? '/(user)/home' : '/(user)/sign-in');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <View style={{ flex: 1, backgroundColor: T.bg }} />;
}
