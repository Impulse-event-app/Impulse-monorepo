import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { tokens } from '../src/theme';
import { supabase } from '../src/supabase';

const T = tokens(true);

// Root route: no landing screen — send the user straight into the app.
// Signed in → home, otherwise → onboarding. Renders a blank themed view
// for the brief moment the session check takes to resolve.
export default function Index() {
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      router.replace(session ? '/(user)/home' : '/(user)/onboarding');
    });
  }, []);

  return <View style={{ flex: 1, backgroundColor: T.bg }} />;
}
