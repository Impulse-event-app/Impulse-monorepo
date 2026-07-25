// Huddle join screen — the shared link/QR lands here. Works signed in (seat
// tied to the account, rejoin-safe) or as a lightweight guest (name only).
import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontDisplay, fontUI, useApp } from '../../../../src/theme';
import { joinHuddle, ApiError } from '../../../../src/api';
import { supabase } from '../../../../src/supabase';
import { Btn } from '../../../../src/components';

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
    if (!token) return;
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
    <View style={{ flex: 1, backgroundColor: T.bg, paddingHorizontal: 24, paddingTop: insets.top + 60 }}>
      <Text style={{ fontFamily: fontDisplay(700), fontSize: 30, letterSpacing: -0.9, color: T.text }}>
        You're invited
      </Text>
      <Text style={{ marginTop: 12, fontFamily: fontUI(400), fontSize: 16, lineHeight: 24, color: T.muted, maxWidth: 320 }}>
        Join the huddle, vote your top three, split one booking. {signedIn === false ? 'No account needed.' : ''}
      </Text>

      <Text style={{ marginTop: 36, fontFamily: fontUI(600), fontSize: 15, color: T.text, marginBottom: 10 }}>
        Your name
      </Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="e.g. Sam"
        placeholderTextColor={T.faint}
        autoCorrect={false}
        style={[{ backgroundColor: T.surface, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 14, fontFamily: fontUI(400), fontSize: 16, color: T.text }, T.shadow]}
      />

      <View style={{ marginTop: 24 }}>
        {loading || signedIn === null
          ? <ActivityIndicator color={T.accent} style={{ height: 54 }} />
          : <Btn full onPress={join} disabled={!name.trim()}>Join huddle</Btn>}
      </View>
    </View>
  );
}
