// Start a Huddle — a sheet over the app (native formSheet on iOS). Pick group
// size, create, land on the huddle status sheet.
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { fontUI, useApp } from '../../../src/theme';
import { createHuddle, ApiError } from '../../../src/api';
import { Btn, HuddleMark, Label, NATIVE_SHEETS, SheetFrame, Stepper, TextBtn } from '../../../src/components';
import { hapticError, hapticSuccess } from '../../../src/haptics';

export default function NewHuddlePopup() {
  const { T, profile, setActiveHuddle } = useApp();
  const router = useRouter();
  const [size, setSize] = useState(4);
  const [loading, setLoading] = useState(false);

  const start = async () => {
    setLoading(true);
    try {
      // Pass the app's computed display name so the creator shows as their
      // username, not the "Creator" fallback.
      const myName = profile.name && profile.name !== 'You' ? profile.name : undefined;
      const res = await createHuddle(size, myName);
      hapticSuccess();
      setActiveHuddle({ huddleId: res.huddle.id, memberToken: res.member_token });
      router.replace(`/(user)/huddle/${res.huddle.id}?mt=${encodeURIComponent(res.member_token)}`);
    } catch (err) {
      hapticError();
      Alert.alert(
        'Could not start huddle',
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SheetFrame
      native={NATIVE_SHEETS}
      onClose={() => router.back()}
      leading={<HuddleMark size={44} />}
      title="Start a huddle"
      subtitle="One vote, one booking, one code"
      bodyStyle={{ paddingHorizontal: 16 }}
      footer={
        <>
          {loading
            ? <ActivityIndicator color={T.accent} style={{ height: 52 }} accessibilityLabel="Creating your huddle" />
            : <Btn full onPress={start}>Create huddle</Btn>}
          <TextBtn onPress={() => router.back()}>Cancel</TextBtn>
        </>
      }
    >
      <Text style={{ ...fontUI(400), fontSize: 17, lineHeight: 25, letterSpacing: -0.19, color: T.muted }}>
        Everyone votes their top three from tonight's drops. The winner becomes one booking, split between you.
      </Text>

      <View style={{ marginTop: 28, alignItems: 'center', paddingBottom: 8 }}>
        <Text accessibilityRole="header" style={{ ...fontUI(500), fontSize: 17, letterSpacing: -0.19, color: T.text }}>How many of you?</Text>
        <View style={{ marginTop: 16 }}>
          <Stepper value={size} onChange={setSize} min={2} max={10} label="Group size" />
        </View>
        <Label style={{ marginTop: 14, textAlign: 'center' }}>
          Only drops that fit all {size} of you go on the ballot.
        </Label>
      </View>
    </SheetFrame>
  );
}
