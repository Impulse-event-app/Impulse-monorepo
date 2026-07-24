import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { money, apiDealToDrop, apiBookingToPlan } from '../../../src/data';
import { fontDisplay, fontUI, useApp } from '../../../src/theme';
import { createBooking, getMe, payBooking, ApiError, ApiBooking } from '../../../src/api';
import { Btn, Chip, Stepper } from '../../../src/components';
import { ChevronBack } from '../../../src/icons';
import { PinchCardField } from '../../../src/PinchCardField';

// Mirrors the server's deposit formula: 20% of the discounted total,
// floored at $1.00, clamped to the total.
function depositSplit(totalCents: number): { depositCents: number; balanceCents: number } {
  const depositCents = Math.min(Math.max(Math.round(totalCents * 0.2), 100), totalCents);
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
  const [time, setTime] = useState(times[0]);
  const [loading, setLoading] = useState(false);
  // Once the slot is reserved we hold the unpaid booking and collect card details.
  const [pendingBooking, setPendingBooking] = useState<ApiBooking | null>(null);

  if (!d || !apiDeal) {
    return (
      <View style={{ flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: fontUI(400), fontSize: 16, color: T.muted }}>Drop not found</Text>
      </View>
    );
  }

  const perPerson = d.unit === 'pp';
  const total = perPerson ? d.now * party : d.now;
  const totalCents = Math.round(total * 100);
  const { depositCents, balanceCents } = depositSplit(totalCents);

  const onReserve = async () => {
    setLoading(true);
    try {
      const booking = await createBooking({
        deal_id: apiDeal.id,
        slot_time: time,
        num_people: party,
      });
      setPendingBooking(booking);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Something went wrong. Please try again.';
      Alert.alert('Booking failed', message);
    } finally {
      setLoading(false);
    }
  };

  const onCardToken = async (token: string, cardHolderName: string) => {
    if (!pendingBooking) return;
    setLoading(true);
    try {
      const profile = await getMe().catch(() => null);
      const fullName = (profile?.full_name ?? cardHolderName).trim();
      const [firstName, ...rest] = fullName.split(/\s+/);
      const paid = await payBooking(pendingBooking.id, {
        token,
        card_holder_name: cardHolderName,
        email: profile?.email ?? `no-email-${pendingBooking.id.slice(0, 8)}@impulse.app`,
        first_name: firstName || 'Impulse',
        last_name: rest.join(' ') || 'Customer',
      });
      addPlan(apiBookingToPlan(paid));
      router.replace(
        `/(user)/confirm?code=${encodeURIComponent(paid.confirmation_code ?? '')}&balance=${paid.balance_amount_cents ?? balanceCents}`,
      );
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Something went wrong. Please try again.';
      Alert.alert('Payment failed', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <Pressable
        onPress={() => (pendingBooking ? setPendingBooking(null) : router.back())}
        style={{ position: 'absolute', top: insets.top + 4, left: 16, zIndex: 10, width: 40, height: 40, borderRadius: 999, backgroundColor: T.chipBg, alignItems: 'center', justifyContent: 'center' }}
      >
        <ChevronBack size={11} color={T.text} />
      </Pressable>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 56, paddingHorizontal: 22, paddingBottom: 140 }}>
        <Text style={{ fontFamily: fontDisplay(700), fontSize: 28, color: T.text, letterSpacing: -0.84 }}>
          {pendingBooking ? 'Secure your slot' : 'Claim your slot'}
        </Text>
        <Text style={{ fontFamily: fontUI(400), fontSize: 15, color: T.muted, marginTop: 6 }}>{d.venue} · {d.suburb}</Text>

        {!pendingBooking ? (
          <>
            <View style={{ marginTop: 30 }}>
              <Text style={{ fontFamily: fontUI(600), fontSize: 17, color: T.text }}>How many?</Text>
              <Text style={{ fontFamily: fontUI(400), fontSize: 13.5, color: T.faint, marginTop: 2, marginBottom: 16 }}>{d.gets}</Text>
              <Stepper value={party} onChange={setParty} max={d.cap} />
            </View>

            <View style={{ marginTop: 34 }}>
              <Text style={{ fontFamily: fontUI(600), fontSize: 17, color: T.text, marginBottom: 14 }}>Pick a time</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
                {times.map((t) => (
                  <Chip key={t} active={time === t} onPress={() => setTime(t)}>{t}</Chip>
                ))}
              </View>
            </View>
          </>
        ) : (
          <View style={{ marginTop: 26 }}>
            <Text style={{ fontFamily: fontUI(600), fontSize: 17, color: T.text, marginBottom: 12 }}>Card details</Text>
            <PinchCardField
              depositLabel={fmtCents(depositCents)}
              colors={{ bg: T.bg, text: T.text, muted: T.muted, line: T.line, accent: T.accent, surface: T.surface }}
              onToken={({ token, cardHolderName }) => onCardToken(token, cardHolderName)}
              onError={(message) => Alert.alert('Card error', message)}
            />
          </View>
        )}

        <View style={[{ marginTop: 36, paddingHorizontal: 18, paddingVertical: 16, backgroundColor: T.surface, borderRadius: 18 }, T.shadow]}>
          {[
            ["Tonight's price", `${money(d.now)}${d.unit}`],
            [perPerson ? `${party} × people` : 'Slot', perPerson ? `× ${party}` : '1'],
            ['Pay now (deposit)', `${fmtCents(depositCents)} + card fee`],
            ['Pay at code scan', fmtCents(balanceCents)],
          ].map(([k, v]) => (
            <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
              <Text style={{ fontFamily: fontUI(400), fontSize: 14.5, color: T.muted }}>{k}</Text>
              <Text style={{ fontFamily: fontUI(400), fontSize: 14.5, color: T.text }}>{v}</Text>
            </View>
          ))}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 12, borderTopWidth: 1, borderTopColor: T.line }}>
            <Text style={{ fontFamily: fontUI(600), fontSize: 16, color: T.text }}>Total</Text>
            <Text style={{ fontFamily: fontDisplay(700), fontSize: 26, color: T.text }}>{money(total)}</Text>
          </View>
          <Text style={{ fontFamily: fontUI(400), fontSize: 12.5, color: T.faint, marginTop: 10, lineHeight: 18 }}>
            The {fmtCents(depositCents)} deposit (plus card processing fee) is non-refundable. The remaining {fmtCents(balanceCents)} is charged to your card when your code is scanned at the venue.
          </Text>
        </View>
      </ScrollView>

      {!pendingBooking && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 22, paddingTop: 14, paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : 24, backgroundColor: T.bg, borderTopWidth: 0.5, borderTopColor: T.line }}>
          {loading ? (
            <ActivityIndicator color={T.accent} style={{ height: 48 }} />
          ) : (
            <Btn full onPress={onReserve}>Continue to payment</Btn>
          )}
        </View>
      )}
      {pendingBooking && loading && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 14, paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : 24, backgroundColor: T.bg, borderTopWidth: 0.5, borderTopColor: T.line }}>
          <ActivityIndicator color={T.accent} style={{ height: 48 }} />
        </View>
      )}
    </View>
  );
}
