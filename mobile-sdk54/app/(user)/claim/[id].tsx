import { useEffect, useState } from 'react';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { money, apiDealToDrop, apiBookingToPlan, upcomingSlots } from '../../../src/data';
import { fontMono, fontUI, useApp } from '../../../src/theme';
import { createBooking, ApiError, ApiBooking } from '../../../src/api';
import {
  BackButton,
  Btn,
  Chip,
  EmptyState,
  FloatingFooter,
  HuddleMark,
  Label,
  ReadableColumn,
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

  // Only slots that haven't started yet. Re-checked every minute so a slot
  // drops off while the screen is open.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const times = apiDeal ? upcomingSlots(apiDeal.date, apiDeal.slots, now) : [];
  const [party, setParty] = useState(2);
  // How a group pays: one person covers everyone (default), or Huddle Pay —
  // split it, with each friend invited into their own spot.
  const [huddlePay, setHuddlePay] = useState(false);
  const [time, setTime] = useState(times[0]);
  // The picked slot passed (or none was picked yet): move to the next one.
  useEffect(() => {
    if (times.length && !times.includes(time)) setTime(times[0]);
  }, [times.join('|'), time]);
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

  if (!d || !apiDeal || (!pendingBooking && times.length === 0)) {
    return (
      <View style={{ flex: 1, backgroundColor: T.bg, justifyContent: 'center' }}>
        <View style={{ position: 'absolute', top: insets.top + 4, left: insets.left + 16 }}>
          <BackButton onPress={() => router.back()} />
        </View>
        {d && apiDeal ? (
          <EmptyState title="No times left today." body="Every slot for this deal has started." />
        ) : (
          <EmptyState title="This drop has gone." body="It may have sold out or ended." />
        )}
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

  const heldCents = depositCents + balanceCents;
  const card = {
    borderRadius: 20, borderCurve: 'continuous' as const, borderWidth: 1, borderColor: T.line,
    backgroundColor: T.surface,
  };
  const sectionLabel = (text: string) => (
    <Text accessibilityRole="header" style={{ ...fontUI(600), fontSize: 15, letterSpacing: -0.15, color: T.text }}>{text}</Text>
  );

  // Who pays: one tile each, side by side.
  const payTile = (on: boolean, title: string, sub: string, onPress: () => void, icon?: React.ReactNode) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`${title}, ${sub}`}
      style={({ pressed }) => ({
        flex: 1, padding: 14, gap: 4, opacity: pressed ? 0.75 : 1,
        borderRadius: 16, borderCurve: 'continuous', borderWidth: on ? 1.5 : 1,
        borderColor: on ? T.accent : T.line,
        backgroundColor: on ? T.accentSoft : T.surface,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        {icon}
        <Text style={{ ...fontUI(600), fontSize: 16, letterSpacing: -0.2, color: T.text }}>{title}</Text>
      </View>
      <Text style={{ ...fontUI(400), fontSize: 13, letterSpacing: -0.05, color: T.muted }}>{sub}</Text>
    </Pressable>
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
          <Text numberOfLines={2} style={{ ...fontUI(400), fontSize: 16, letterSpacing: -0.15, color: T.muted, marginTop: 6 }}>
            {[d.venue, d.gets].filter(Boolean).join(' · ')}
          </Text>

          {!pendingBooking ? (
            <>
              {/* Guests and time in one card. */}
              <View style={[card, { marginTop: 28 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
                  {sectionLabel(perPerson ? 'Guests' : 'People')}
                  <Stepper value={party} onChange={setParty} max={d.cap} size={36} label="People" />
                </View>
                <View style={{ height: 1, backgroundColor: T.line, marginHorizontal: 16 }} />
                <View style={{ padding: 16, gap: 12 }}>
                  {sectionLabel('Time')}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 8 }}>
                    {times.map((t) => (
                      <Chip key={t} active={time === t} onPress={() => setTime(t)}>{t}</Chip>
                    ))}
                  </View>
                </View>
              </View>

              {party > 1 && (
                <View style={{ marginTop: 24, gap: 10 }}>
                  {sectionLabel("Who's paying?")}
                  <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 10 }}>
                    {payTile(!huddlePay, 'Just me', 'One payment', () => setHuddlePay(false))}
                    {payTile(huddlePay, 'Split it', 'Huddle Pay', () => setHuddlePay(true), <HuddleMark size={18} />)}
                  </View>
                </View>
              )}
            </>
          ) : null}

          {/* Total: the sum, the amount, one line on when it's charged. */}
          <View style={[card, { marginTop: 24, padding: 16 }]}>
            <View
              accessible
              accessibilityLabel={`Total, ${money(total)}${perPerson ? `, ${party} at ${money(d.now)}` : ''}`}
              style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
            >
              <View style={{ gap: 2 }}>
                <Text style={{ ...fontUI(600), fontSize: 15, letterSpacing: -0.15, color: T.text }}>Total</Text>
                <Text style={{ ...fontMono(400), fontSize: 13, color: T.muted }}>
                  {perPerson ? `${party} × ${money(d.now)}` : `${money(d.now)} ${unitLabel(d.unit)}`}
                </Text>
              </View>
              <Text style={{ ...fontMono(600), fontSize: 28, letterSpacing: -0.56, color: T.text }}>{money(total)}</Text>
            </View>
          </View>
          <Label style={{ marginTop: 10, marginHorizontal: 4, lineHeight: 18 }}>
            Charged when you check in. 10% is kept if no one shows.
          </Label>
        </ReadableColumn>
      </ScrollView>

      <View style={{ position: 'absolute', top: insets.top + 4, left: insets.left + 16, zIndex: 22 }}>
        <BackButton onPress={() => (pendingBooking ? setPendingBooking(null) : router.back())} />
      </View>

      {!pendingBooking && (
        <FloatingFooter>
          {loading ? (
            <ActivityIndicator color={T.accent} style={{ height: 52 }} accessibilityLabel="Reserving your slot" />
          ) : (
            <Btn full onPress={onReserve}>Continue</Btn>
          )}
        </FloatingFooter>
      )}
      {pendingBooking && (
        <FloatingFooter>
          {loading ? (
            <ActivityIndicator color={T.accent} style={{ height: 52 }} accessibilityLabel="Holding your spot" />
          ) : (
            <Btn full onPress={onHold}>{`Hold my spot · ${fmtCents(heldCents)}`}</Btn>
          )}
        </FloatingFooter>
      )}
      {stripePay.overlay}
    </View>
  );
}
