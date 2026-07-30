import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { money, apiDealToDrop, apiBookingToPlan } from '../../../src/data';
import { fontDisplay, fontUI, useApp } from '../../../src/theme';
import {
  createBooking, getMe, payBooking, listPaymentMethods, describeCard,
  ApiError, ApiBooking, PaymentMethod,
} from '../../../src/api';
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
  // Cards on file. `null` = not loaded yet; a saved card short-circuits the
  // card form entirely, so it's fetched up front rather than at payment time.
  const [savedCards, setSavedCards] = useState<PaymentMethod[] | null>(null);
  const [useNewCard, setUseNewCard] = useState(false);
  // Opt-in, not assumed — keeping a card on file needs explicit consent.
  const [saveCard, setSaveCard] = useState(false);

  useEffect(() => {
    listPaymentMethods().then(setSavedCards).catch(() => setSavedCards([]));
  }, []);

  const defaultCard = savedCards?.find((c) => c.is_default) ?? savedCards?.[0] ?? null;

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

  const finishPayment = async (paid: ApiBooking) => {
    addPlan(apiBookingToPlan(paid));
    router.replace(
      `/(user)/confirm?code=${encodeURIComponent(paid.confirmation_code ?? '')}&balance=${paid.balance_amount_cents ?? balanceCents}`,
    );
  };

  const onPaymentError = (err: unknown) => {
    const message =
      err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
    Alert.alert('Payment failed', message);
  };

  /** Charge a card already on file — no card form, no re-entry. */
  const onPayWithSavedCard = async () => {
    if (!pendingBooking || !defaultCard) return;
    setLoading(true);
    try {
      finishPayment(await payBooking(pendingBooking.id, { payment_method_id: defaultCard.id }));
    } catch (err) {
      // A saved card the server won't charge (expired, detached, never
      // authorised) comes back 409 — drop straight to the card form.
      if (err instanceof ApiError && err.status === 409) {
        setUseNewCard(true);
        Alert.alert('Card unavailable', err.message);
      } else {
        onPaymentError(err);
      }
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
      finishPayment(await payBooking(pendingBooking.id, {
        token,
        save_card: saveCard,
        card_holder_name: cardHolderName,
        email: profile?.email ?? `no-email-${pendingBooking.id.slice(0, 8)}@impulse.app`,
        first_name: firstName || 'Impulse',
        last_name: rest.join(' ') || 'Customer',
      }));
    } catch (err) {
      onPaymentError(err);
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
            {savedCards === null ? (
              <ActivityIndicator color={T.accent} style={{ height: 48 }} />
            ) : defaultCard && !useNewCard ? (
              <>
                <Text style={{ fontFamily: fontUI(600), fontSize: 17, color: T.text, marginBottom: 12 }}>Pay with</Text>
                <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: T.surface, borderRadius: 16, borderWidth: 1, borderColor: T.accent }]}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: T.accent }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: fontUI(600), fontSize: 15, color: T.text }}>
                      {describeCard(defaultCard)}
                    </Text>
                    {!!defaultCard.expiry_date && (
                      <Text style={{ fontFamily: fontUI(400), fontSize: 12.5, color: T.faint, marginTop: 2 }}>
                        Expires {defaultCard.expiry_date}
                      </Text>
                    )}
                  </View>
                </View>
                <Pressable onPress={() => setUseNewCard(true)} style={{ paddingVertical: 14 }}>
                  <Text style={{ fontFamily: fontUI(600), fontSize: 14, color: T.accent }}>
                    Use a different card
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={{ fontFamily: fontUI(600), fontSize: 17, color: T.text, marginBottom: 12 }}>Card details</Text>
                <PinchCardField
                  depositLabel={fmtCents(depositCents)}
                  colors={{ bg: T.bg, text: T.text, muted: T.muted, line: T.line, accent: T.accent, surface: T.surface }}
                  onToken={({ token, cardHolderName }) => onCardToken(token, cardHolderName)}
                  onError={(message) => Alert.alert('Card error', message)}
                />
                <Pressable
                  onPress={() => setSaveCard((v) => !v)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 16 }}
                >
                  <View style={{ width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: saveCard ? T.accent : T.line2, backgroundColor: saveCard ? T.accent : 'transparent' }}>
                    {saveCard && (
                      <Text style={{ fontFamily: fontUI(700), fontSize: 12, color: T.accentInk }}>✓</Text>
                    )}
                  </View>
                  <Text style={{ flex: 1, fontFamily: fontUI(400), fontSize: 14, color: T.muted }}>
                    Save this card for next time. You can remove it any time in your profile.
                  </Text>
                </Pressable>
                {defaultCard && (
                  <Pressable onPress={() => setUseNewCard(false)} style={{ paddingBottom: 6 }}>
                    <Text style={{ fontFamily: fontUI(600), fontSize: 14, color: T.accent }}>
                      Use {describeCard(defaultCard)} instead
                    </Text>
                  </Pressable>
                )}
              </>
            )}
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
      {/* The card form carries its own pay button; the saved-card path needs one. */}
      {pendingBooking && (loading || (defaultCard && !useNewCard)) && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 22, paddingTop: 14, paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : 24, backgroundColor: T.bg, borderTopWidth: 0.5, borderTopColor: T.line }}>
          {loading ? (
            <ActivityIndicator color={T.accent} style={{ height: 48 }} />
          ) : (
            <Btn full onPress={onPayWithSavedCard}>Pay {fmtCents(depositCents)} deposit</Btn>
          )}
        </View>
      )}
    </View>
  );
}
