import { useEffect, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Animated, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontUI, useApp } from '../../src/theme';
import {
  Btn, CodeDisplay, EASE, EmptyState, FloatingFooter, Label, Radar, ReadableColumn, ScreenTitle, useReduceMotion,
} from '../../src/components';
import { Check } from '../../src/icons';
import { hapticSuccess } from '../../src/haptics';

export default function ConfirmScreen() {
  const { code, balance } = useLocalSearchParams<{ code: string; balance?: string }>();
  const balanceCents = balance ? parseInt(balance, 10) : null;
  const { T, plans } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const plan = plans.find((p) => p.code === code) || plans[0] || null;

  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(pop, { toValue: 1, duration: 350, easing: EASE, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [pop]);

  // One success tap when a fresh booking lands here (not when reopened from Plans).
  const buzzed = useRef(false);
  useEffect(() => {
    if (plan && balance !== undefined && !buzzed.current) {
      buzzed.current = true;
      hapticSuccess();
    }
  }, [plan, balance]);

  if (!plan) {
    return (
      <View style={{ flex: 1, backgroundColor: T.bg, justifyContent: 'center' }}>
        <EmptyState
          title="No booking found."
          body="It may still be confirming. Check Plans in a moment."
          action={<Btn onPress={() => router.replace('/(user)/home')}>Back to tonight</Btn>}
        />
      </View>
    );
  }

  const verified = plan.status === 'attended';

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 36, paddingHorizontal: 24, paddingBottom: 180 }}
      >
        <ReadableColumn style={{ alignItems: 'center' }}>
          <Animated.View
            style={{
              opacity: pop,
              transform: reduceMotion ? [] : [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
            }}
          >
            <Radar size={60} kind="sweep" decorative />
          </Animated.View>
          <ScreenTitle style={{ marginTop: 22, textAlign: 'center' }}>{verified ? 'Verified.' : "You're booked."}</ScreenTitle>
          <Text style={{ ...fontUI(400), fontSize: 17, lineHeight: 25, letterSpacing: -0.19, color: T.muted, marginTop: 8, textAlign: 'center' }}>
            {plan.venue} · {plan.time} · {plan.party} {plan.party === 1 ? 'person' : 'people'}
          </Text>

          <View
            style={{
              marginTop: 32, padding: 22, alignSelf: 'stretch', backgroundColor: T.surface, borderRadius: 10,
              borderWidth: 1, borderColor: T.line, alignItems: 'center', gap: 18,
            }}
          >
            {verified ? (
              <>
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: T.accentSoft, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Check size={24} color={T.accent} />
                </View>
                <Text style={{ ...fontUI(500), fontSize: 17, letterSpacing: -0.19, color: T.text, textAlign: 'center' }}>Code checked at the door.</Text>
                <Label style={{ maxWidth: 320, lineHeight: 19, textAlign: 'center' }}>{plan.paymentNote ?? 'Enjoy the night.'}</Label>
              </>
            ) : (
              <>
                <CodeDisplay code={plan.code} size="lg" label="Your door code" />
                <Label style={{ maxWidth: 320, lineHeight: 19, textAlign: 'center' }}>
                  Show this at the door at {plan.venue}. Held for twenty minutes.
                </Label>
              </>
            )}
          </View>

          {!verified && balanceCents !== null && balanceCents > 0 && (
            <Label style={{ marginTop: 18, lineHeight: 19, textAlign: 'center', maxWidth: 320 }}>
              ${(balanceCents / 100).toFixed(2)} is charged to your card when the code is scanned.
            </Label>
          )}
        </ReadableColumn>
      </ScrollView>

      <FloatingFooter>
        <Btn full onPress={() => router.replace('/(user)/plans')}>View in plans</Btn>
        <Btn full variant="ghost" onPress={() => router.replace('/(user)/home')}>Back to tonight</Btn>
      </FloatingFooter>
    </View>
  );
}
