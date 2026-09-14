// Huddle join screen — the shared link/QR lands here. Works signed in (seat
// tied to the account, rejoin-safe) or as a lightweight guest (name only).
import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontUI, useApp } from '../../../../src/theme';
import { joinHuddle, ApiError } from '../../../../src/api';
import { supabase } from '../../../../src/supabase';
import { Btn, Field, HuddleMark, Label, ScreenTitle } from '../../../../src/components';

export default function HuddleJoinScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { T, profile, setActiveHuddle } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSignedIn(!!session));
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

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 60, paddingHorizontal: 16, paddingBottom: 40 }}
      >
        <HuddleMark size={56} />
        <ScreenTitle style={{ marginTop: 22 }}>You're invited.</ScreenTitle>
        <Text style={{ marginTop: 10, ...fontUI(400), fontSize: 17, lineHeight: 25, letterSpacing: -0.19, color: T.muted, maxWidth: 330 }}>
          Join the huddle, vote your top three and split one booking.{signedIn === false ? ' No account needed.' : ''}
        </Text>

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

        <View style={{ marginTop: 24 }}>
          {loading || signedIn === null
            ? <ActivityIndicator color={T.accent} style={{ height: 52 }} />
            : <Btn full onPress={join} disabled={!name.trim()}>Join huddle</Btn>}
        </View>
      </ScrollView>
    </View>
  );
}
