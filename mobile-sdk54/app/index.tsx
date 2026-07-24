import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Platform, View } from 'react-native';
import { tokens } from '../src/theme';
import { supabase } from '../src/supabase';
import { isOnboarded } from '../src/auth';

const T = tokens(true);

// Root route: no landing screen — send the user straight into the app.
// Signed in → home, otherwise → onboarding. Renders a blank themed view
// for the brief moment the session check takes to resolve.
//
// Also doubles as the web Google OAuth landing page: signInWithGoogle() on
// web redirects back to window.location.origin (this route), with a `code`
// query param Supabase appends. Exchange it for a session before checking
// auth state. Native completes this inline in signInWithGoogle() instead,
// via the "impulse://" deep link, so it never passes through here.
export default function Index() {
  const router = useRouter();

  useEffect(() => {
    const resolveSessionAndRoute = async () => {
      if (Platform.OS === 'web' && window.location.search.includes('code=')) {
        await supabase.auth.exchangeCodeForSession(window.location.href).catch(() => {});
        window.history.replaceState({}, '', window.location.pathname);
      }
      const { data: { session } } = await supabase.auth.getSession();
      // No session → onboarding (starts at the hero/sign-in).
      // Signed in but not onboarded → onboarding, which resumes at the first
      // post-sign-in step (so a web OAuth reload doesn't dump them back at the
      // start). Signed in and onboarded → straight to the app.
      if (!session) {
        router.replace('/(user)/onboarding');
      } else {
        router.replace(isOnboarded(session) ? '/(user)/home' : '/(user)/onboarding');
      }
    };
    resolveSessionAndRoute();
  }, []);

  return <View style={{ flex: 1, backgroundColor: T.bg }} />;
}
