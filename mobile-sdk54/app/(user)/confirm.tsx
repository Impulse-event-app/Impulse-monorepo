import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontDisplay, fontMono, fontUI, useApp } from '../../src/theme';
import { Btn, FauxQR, PulseMark } from '../../src/components';

export default function ConfirmScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { T, plans } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const plan = plans.find((p) => p.code === code) || plans[0] || null;

  if (!plan) {
    return (
      <View style={{ flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: fontUI(400), fontSize: 16, color: T.muted }}>No plan found</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 30, paddingHorizontal: 24, paddingBottom: 160, alignItems: 'center' }}
      >
        <PulseMark size={64} radius={17} />
        <Text style={{ marginTop: 20, fontFamily: fontDisplay(700), fontSize: 32, color: T.text, letterSpacing: -0.96 }}>You're on.</Text>
        <Text style={{ fontFamily: fontUI(400), fontSize: 16, color: T.muted, marginTop: 8, lineHeight: 23, textAlign: 'center' }}>
          {plan.venue} · {plan.time} · {plan.party} {plan.party === 1 ? 'person' : 'people'}
        </Text>

        <View style={[{ marginTop: 28, padding: 22, backgroundColor: T.surface, borderRadius: 24, alignItems: 'center', gap: 16 }, T.shadow]}>
          <FauxQR code={plan.code} size={168} />
          <Text style={{ fontFamily: fontMono(700), fontSize: 22, color: T.text, letterSpacing: 2.6 }}>{plan.code}</Text>
          <Text style={{ fontFamily: fontUI(400), fontSize: 13.5, color: T.faint, maxWidth: 230, lineHeight: 20, textAlign: 'center' }}>
            Show this at the door at {plan.venue}. Your slot's held for 20 minutes.
          </Text>
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 22, paddingTop: 14, paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : 24, backgroundColor: T.bg, borderTopWidth: 0.5, borderTopColor: T.line, gap: 10 }}>
        <Btn full onPress={() => router.replace('/(user)/plans')}>View in plans</Btn>
        <Btn full variant="ghost" onPress={() => router.replace('/(user)/home')}>Back to tonight</Btn>
      </View>
    </View>
  );
}
