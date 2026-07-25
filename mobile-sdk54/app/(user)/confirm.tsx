import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontDisplay, fontMono, fontUI, useApp } from '../../src/theme';
import { Btn, PulseMark } from '../../src/components';

export default function ConfirmScreen() {
  const { code, balance } = useLocalSearchParams<{ code: string; balance?: string }>();
  const balanceCents = balance ? parseInt(balance, 10) : null;
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

  const verified = plan.status === 'attended';

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 30, paddingHorizontal: 24, paddingBottom: 160, alignItems: 'center' }}
      >
        <PulseMark size={64} radius={17} />
        <Text style={{ marginTop: 20, fontFamily: fontDisplay(700), fontSize: 32, color: T.text, letterSpacing: -0.96 }}>
          {verified ? 'Verified.' : "You're on."}
        </Text>
        <Text style={{ fontFamily: fontUI(400), fontSize: 16, color: T.muted, marginTop: 8, lineHeight: 23, textAlign: 'center' }}>
          {plan.venue} · {plan.time} · {plan.party} {plan.party === 1 ? 'person' : 'people'}
        </Text>

        <View style={[{ marginTop: 28, paddingVertical: 30, paddingHorizontal: 24, backgroundColor: T.surface, borderRadius: 24, alignItems: 'center', gap: 14, alignSelf: 'stretch' }, T.shadow]}>
          {verified ? (
            <>
              <View style={{ width: 56, height: 56, borderRadius: 999, backgroundColor: T.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 26, color: T.accent }}>✓</Text>
              </View>
              <Text style={{ fontFamily: fontUI(600), fontSize: 17, color: T.text }}>Code verified at the venue</Text>
              <Text style={{ fontFamily: fontUI(400), fontSize: 13.5, color: T.muted, maxWidth: 260, lineHeight: 20, textAlign: 'center' }}>
                {plan.paymentNote ?? 'Enjoy your night!'}
              </Text>
            </>
          ) : (
            <>
              <Text style={{ fontFamily: fontMono(400), fontSize: 11.5, letterSpacing: 1.6, textTransform: 'uppercase', color: T.faint }}>Your code</Text>
              <Text style={{ fontFamily: fontMono(700), fontSize: 52, color: T.text, letterSpacing: 10, marginLeft: 10 }}>{plan.code}</Text>
              <Text style={{ fontFamily: fontUI(400), fontSize: 13.5, color: T.faint, maxWidth: 240, lineHeight: 20, textAlign: 'center' }}>
                Give this code at the door at {plan.venue}. Your slot's held for 20 minutes.
              </Text>
            </>
          )}
        </View>

        {!verified && balanceCents !== null && balanceCents > 0 && (
          <Text style={{ fontFamily: fontUI(400), fontSize: 13.5, color: T.muted, marginTop: 18, lineHeight: 20, textAlign: 'center', maxWidth: 280 }}>
            Your card will be charged ${(balanceCents / 100).toFixed(2)} when your code is scanned at the venue.
          </Text>
        )}
      </ScrollView>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 22, paddingTop: 14, paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : 24, backgroundColor: T.bg, borderTopWidth: 0.5, borderTopColor: T.line, gap: 10 }}>
        <Btn full onPress={() => router.replace('/(user)/plans')}>View in plans</Btn>
        <Btn full variant="ghost" onPress={() => router.replace('/(user)/home')}>Back to tonight</Btn>
      </View>
    </View>
  );
}
