import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { tokens } from '../src/theme';
import { supabase } from '../src/supabase';
import { isOnboarded } from '../src/auth';

const T = tokens(true);

// Root route: no landing screen — send the user straight into the app. Also the
// web OAuth landing page: signInWithGoogle() on web redirects back here with a
// "?code=", and supabase-js (detectSessionInUrl, see src/supabase.ts) exchanges
// it for a session automatically during init. getSession() awaits that init, so
// by the time it resolves the session is ready. Renders a blank themed view for
// the brief moment that takes.
export default function Index() {
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      // No session → sign-in. Signed in but not onboarded → onboarding.
      // Signed in and onboarded → straight to the app.
      if (!session) {
        router.replace('/(user)/sign-in');
      } else {
        router.replace(isOnboarded(session) ? '/(user)/home' : '/(user)/onboarding');
      }
    });
  }, []);

  return <View style={{ flex: 1, backgroundColor: T.bg }} />;
}
