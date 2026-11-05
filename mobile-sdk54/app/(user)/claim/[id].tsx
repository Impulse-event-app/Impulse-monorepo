import { useEffect, useState } from 'react';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { money, apiDealToDrop, apiBookingToPlan } from '../../../src/data';
import { fontMono, fontUI, useApp } from '../../../src/theme';
import { createBooking, ApiError, ApiBooking } from '../../../src/api';
import {
  BackButton,
  Btn,
  Chip,
  EmptyState,
  FloatingFooter,
  Group,
  HuddleMark,
  Label,
  Radio,
  ReadableColumn,
  Row,
  ScreenTitle,
  Stepper,
  unitLabel,
} from '../../../src/components';
import { useStripePay } from '../../../src/stripePay';
import { hapticError, hapticSuccess } from '../../../src/haptics';

// Mirrors the server's deposit formula: 10% of the discounted total,
// floored at $1.00, clamped to the total.
function depositSplit(totalCents: number): { depositCents: number; balanceCents: number } {
  const depositCents = Math.min(Math.max(Math.round(totalCents * 0.1), 100), totalCents);
  return { depositCents, balanceCents: totalCents - depositCents };
}

const fmtCents = (c: number) => `$${(c / 100).toFixed(2)}`;

export default function ClaimScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { T, addPlan, apiDeals } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const apiDeal = id ? apiDeals[id] ?? null : null;
  const d = apiDeal ? apiDealToDrop(apiDeal) : null;

  const times = apiDeal?.slots ?? (d?.status === 'now' ? ['Now', '7:30pm', '8:30pm'] : ['7:00pm', '8:00pm', '9:00pm']);
  const [party, setParty] = useState(2);
  // How a group pays: one person covers everyone (default), or Huddle Pay —
  // split it, with each friend invited into their own spot.
  const [huddlePay, setHuddlePay] = useState(false);
  const [time, setTime] = useState(times[0]);
  const [loading, setLoading] = useState(false);
  // Once the slot is reserved we keep the unpaid booking and hold the card.
  const [pendingBooking, setPendingBooking] = useState<ApiBooking | null>(null);
  // Stripe's sheet: saved cards, a new card, Apple Pay and Google Pay.
  const stripePay = useStripePay();

  // While a slot is held, on-screen Back steps from payment to the booking
  // form. Disable the iOS edge swipe then, so the two can't disagree.
  const navigation = useNavigation();
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !pendingBooking });
  }, [navigation, pendingBooking]);

  if (!d || !apiDeal) {
    return (
      <View style={{ flex: 1, backgroundColor: T.bg, justifyContent: 'center' }}>
        <View style={{ position: 'absolute', top: insets.top + 4, left: 16 }}>
          <BackButton onPress={() => router.back()} />
        </View>
        <EmptyState title="This drop has gone." body="It may have sold out or ended." />
      </View>
    );
  }

  const perPerson = d.unit === 'pp';
  const total = perPerson ? d.now * party : d.now;
  const totalCents = Math.round(total * 100);
  // Once the booking exists, show the server's numbers (the locked price),
  // never a client-side guess — that's exactly what gets charged.
  const splitting = party > 1 && huddlePay;
  const estimate = depositSplit(totalCents);
  const depositCents = pendingBooking?.deposit_amount_cents ?? estimate.depositCents;
  const balanceCents = pendingBooking?.balance_amount_cents ?? estimate.balanceCents;

  const onReserve = async () => {
    setLoading(true);
    try {
      const booking = await createBooking({
        deal_id: apiDeal.id,
        slot_time: time,
        num_people: party,
        split: splitting,
      });
      if (splitting) {
        // Huddle Pay: invite people, set the split and lock it in over there.
        router.push(`/(user)/split/${booking.id}`);
        return;
      }
      setPendingBooking(booking);
    } catch (err) {
      hapticError();
      const message =
        err instanceof ApiError
          ? err.message
          : 'Something went wrong. Please try again.';
      Alert.alert('Booking failed', message);
    } finally {
      setLoading(false);
    }
  };

  const finishPayment = async (paid: ApiBooking) => {
    hapticSuccess();
    addPlan(apiBookingToPlan(paid));
    router.replace(
      // The whole amount is held now and charged at the door, so that's what
      // the confirmation says will be charged.
      `/(user)/confirm?code=${encodeURIComponent(paid.confirmation_code ?? '')}&balance=${
        (paid.deposit_amount_cents ?? depositCents) + (paid.balance_amount_cents ?? balanceCents)}`,
    );
  };

  const onPaymentError = (err: unknown) => {
    hapticError();
    const message =
      err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
    Alert.alert('Payment failed', message);
  };

  /** Hold the whole booking on the card. Nothing is charged until the code
   *  is scanned at the venue. */
  const onHold = async () => {
    if (!pendingBooking) return;
    setLoading(true);
    try {
      const paid = await stripePay.holdShare(pendingBooking.id, depositCents + balanceCents);
      if (paid) finishPayment(paid);
    } catch (err) {
      onPaymentError(err);
    } finally {
      setLoading(false);
    }
  };

  const line = (k: string, v: string) => (
    <View
      key={k}
      accessible
      accessibilityLabel={`${k}, ${v}`}
      style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', columnGap: 14, paddingVertical: 12 }}
    >
      <Text style={{ ...fontUI(400), fontSize: 15, letterSpacing: -0.15, color: T.muted }}>{k}</Text>
      <Text style={{ ...fontMono(400), fontSize: 15, letterSpacing: -0.15, color: T.text }}>{v}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 60, paddingHorizontal: 16, paddingBottom: 170 }}
      >
        <ReadableColumn>
          <ScreenTitle>{pendingBooking ? 'Hold your spot' : 'Your booking'}</ScreenTitle>
          <Text style={{ ...fontUI(400), fontSize: 17, letterSpacing: -0.19, color: T.muted, marginTop: 7 }}>
            {d.venue}{d.suburb ? ` · ${d.suburb}` : ''}
          </Text>

          {!pendingBooking ? (
            <>
              <View style={{ marginTop: 36 }}>
                <Text accessibilityRole="header" style={{ ...fontUI(500), fontSize: 17, letterSpacing: -0.19, color: T.text }}>How many?</Text>
                <Label style={{ marginTop: 4, marginBottom: 18 }}>{d.gets}</Label>
                <Stepper value={party} onChange={setParty} max={d.cap} label="People" />
              </View>

              <View style={{ marginTop: 36 }}>
                <Text accessibilityRole="header" style={{ ...fontUI(500), fontSize: 17, letterSpacing: -0.19, color: T.text, marginBottom: 14 }}>Pick a time</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 10 }}>
                  {times.map((t) => (
                    <Chip key={t} active={time === t} onPress={() => setTime(t)}>{t}</Chip>
                  ))}
                </View>
              </View>

              {party > 1 && (
                <Group label="How are you paying?">
                  <Row
                    label="I'll pay for everyone"
                    sublabel="One payment, one code"
                    trailing={<Radio on={!huddlePay} />}
                    selected={!huddlePay}
                    onPress={() => setHuddlePay(false)}
                  />
                  <Row
                    icon={<HuddleMark size={18} />}
                    label="Huddle Pay"
                    sublabel="Split it — invite each person to pay their share"
                    trailing={<Radio on={huddlePay} />}
                    selected={huddlePay}
                    onPress={() => setHuddlePay(true)}
                  />
                </Group>
              )}
            </>
          ) : null}

          <View style={{ marginTop: 40 }}>
            {line("Tonight's price", `${money(d.now)} ${unitLabel(d.unit)}`)}
            {line(perPerson ? 'People' : 'Slot', perPerson ? `× ${party}` : '× 1')}
            {splitting
              ? line('Split between', `${party} people`)
              : line('Charged at check-in', fmtCents(depositCents + balanceCents))}
            <View
              accessible
              accessibilityLabel={`Total, ${money(total)}`}
              style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 14, marginTop: 2, borderTopWidth: 1, borderTopColor: T.line }}
            >
              <Text style={{ ...fontUI(500), fontSize: 17, letterSpacing: -0.19, color: T.text }}>Total</Text>
              <Text style={{ ...fontMono(600), fontSize: 28, letterSpacing: -0.56, color: T.text }}>{money(total)}</Text>
            </View>
            <Label style={{ marginTop: 14, lineHeight: 18 }}>
              {splitting
                ? 'Next, invite everyone and set the split. Each person holds their share on their card, and it’s charged when your code is scanned at the venue.'
                : `We hold ${fmtCents(depositCents + balanceCents)} on your card now and charge it when your code is scanned at the venue. If nobody shows, ${fmtCents(depositCents)} (10%) is kept and the rest is released.`}
            </Label>
          </View>
        </ReadableColumn>
      </ScrollView>

      <View style={{ position: 'absolute', top: insets.top + 4, left: 16, zIndex: 22 }}>
        <BackButton onPress={() => (pendingBooking ? setPendingBooking(null) : router.back())} />
      </View>

      {!pendingBooking && (
        <FloatingFooter>
          {loading ? (
            <ActivityIndicator color={T.accent} style={{ height: 52 }} accessibilityLabel="Reserving your slot" />
          ) : (
            <Btn full onPress={onReserve}>{splitting ? 'Continue to Huddle Pay' : 'Continue to payment'}</Btn>
          )}
        </FloatingFooter>
      )}
      {pendingBooking && (
        <FloatingFooter>
          {loading ? (
            <ActivityIndicator color={T.accent} style={{ height: 52 }} accessibilityLabel="Holding your spot" />
          ) : (
            <Btn full onPress={onHold}>{`Hold my spot · ${fmtCents(depositCents + balanceCents)}`}</Btn>
          )}
        </FloatingFooter>
      )}
      {stripePay.overlay}
    </View>
  );
}
