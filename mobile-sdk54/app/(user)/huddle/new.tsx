// Start a Huddle — clean centered popup over the app. Pick group size, create,
// land on the huddle status popup.
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { fontDisplay, fontUI, useApp } from '../../../src/theme';
import { createHuddle, ApiError } from '../../../src/api';
import { Btn, HuddleMark, Stepper } from '../../../src/components';

export default function NewHuddlePopup() {
  const { T, setActiveHuddle } = useApp();
  const router = useRouter();
  const [size, setSize] = useState(4);
  const [loading, setLoading] = useState(false);

  const start = async () => {
    setLoading(true);
    try {
      const res = await createHuddle(size);
      setActiveHuddle({ huddleId: res.huddle.id, memberToken: res.member_token });
      router.replace(`/(user)/huddle/${res.huddle.id}?mt=${encodeURIComponent(res.member_token)}`);
    } catch (err) {
      Alert.alert(
        'Could not start huddle',
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Pressable
      onPress={() => router.back()}
      style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}
    >
      <Pressable
        onPress={() => {}}
        style={[{ width: '100%', maxWidth: 400, backgroundColor: T.bg, borderRadius: 24, padding: 24 }, T.shadow]}
      >
        <View style={{ alignItems: 'center', marginBottom: 4 }}>
          <HuddleMark size={56} radius={17} />
        </View>
        <Text style={{ marginTop: 14, fontFamily: fontDisplay(700), fontSize: 24, letterSpacing: -0.7, color: T.text, textAlign: 'center' }}>
          Start a huddle
        </Text>
        <Text style={{ marginTop: 8, fontFamily: fontUI(400), fontSize: 14.5, lineHeight: 21, color: T.muted, textAlign: 'center' }}>
          Everyone votes their top three from tonight's drops. The winner becomes one booking, split between you.
        </Text>

        <View style={{ marginTop: 24, alignItems: 'center' }}>
          <Text style={{ fontFamily: fontUI(600), fontSize: 15, color: T.text, marginBottom: 14 }}>How many of you?</Text>
          <Stepper value={size} onChange={setSize} min={2} max={10} />
          <Text style={{ marginTop: 12, fontFamily: fontUI(400), fontSize: 12.5, color: T.faint, textAlign: 'center' }}>
            2–10 people. Only drops that fit all {size} of you go on the ballot.
          </Text>
        </View>

        <View style={{ marginTop: 24, gap: 8 }}>
          {loading
            ? <ActivityIndicator color={T.accent} style={{ height: 54 }} />
            : <Btn full onPress={start}>Create huddle</Btn>}
          <Pressable onPress={() => router.back()} style={{ paddingVertical: 10, alignItems: 'center' }}>
            <Text style={{ fontFamily: fontUI(500), fontSize: 15, color: T.muted }}>Cancel</Text>
          </Pressable>
        </View>
      </Pressable>
    </Pressable>
  );
}
