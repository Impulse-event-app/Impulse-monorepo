// Huddle join screen — the shared link/QR lands here. On a phone with the app,
// the universal link (see public/.well-known + app.json associatedDomains)
// opens this screen; signed-out users are asked to sign in and come back here
// to join. Opened on the web, the app isn't installed, so redirect onwards.
import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontUI, useApp } from '../../../../src/theme';
import { joinHuddle, ApiError } from '../../../../src/api';
import { supabase } from '../../../../src/supabase';
import { useRequireAuth } from '../../../../src/auth';
import { Btn, Field, HuddleMark, Label, ScreenTitle } from '../../../../src/components';

const APP_FALLBACK_URL = process.env.EXPO_PUBLIC_APP_FALLBACK_URL ?? 'https://impulseapp.au';

export default function HuddleJoinScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { T, profile, setActiveHuddle } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const requireAuth = useRequireAuth();
  const [name, setName] = useState('');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  // No app on this device — send them to the site (later, the store listing).
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.replace(APP_FALLBACK_URL);
    }
  }, []);

  // Live, so returning from sign-in flips this screen to the join form.
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (active) setSignedIn(!!session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setSignedIn(!!session);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  // Prefill from the profile once it loads (signed-in users can still edit).
  useEffect(() => {
    if (!name && profile.name && profile.name !== 'You') setName(profile.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.name]);

  const join = async () => {
    if (!token || !name.trim()) return;
    setLoading(true);
    try {
      const res = await joinHuddle(token, name.trim() || undefined);
      setActiveHuddle({ huddleId: res.huddle.id, memberToken: res.member_token });
      router.replace(`/(user)/huddle/${res.huddle.id}?mt=${encodeURIComponent(res.member_token)}`);
    } catch (err) {
      Alert.alert(
        'Could not join',
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  if (Platform.OS === 'web') {
    return (
      <View style={{ flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={T.accent} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 60, paddingHorizontal: 16, paddingBottom: 40 }}
      >
        <HuddleMark size={56} />
        <ScreenTitle style={{ marginTop: 22 }}>You're invited.</ScreenTitle>
        <Text style={{ marginTop: 10, ...fontUI(400), fontSize: 17, lineHeight: 25, letterSpacing: -0.19, color: T.muted, maxWidth: 330 }}>
          Join the huddle, vote your top three and split one booking.{signedIn === false ? ' Sign in to take your seat.' : ''}
        </Text>

        {signedIn && (
          <>
            <Label style={{ marginTop: 36, marginBottom: 8, marginHorizontal: 4 }}>Your name</Label>
            <Field
              value={name}
              onChangeText={setName}
              placeholder="Sam"
              autoCorrect={false}
              autoCapitalize="words"
              returnKeyType="go"
              onSubmitEditing={join}
            />
          </>
        )}

        <View style={{ marginTop: signedIn ? 24 : 36 }}>
          {loading || signedIn === null
            ? <ActivityIndicator color={T.accent} style={{ height: 52 }} />
            : signedIn
              ? <Btn full onPress={join} disabled={!name.trim()}>Join huddle</Btn>
              : <Btn full onPress={() => requireAuth(() => {})}>Sign in to join</Btn>}
        </View>
      </ScrollView>
    </View>
  );
}
