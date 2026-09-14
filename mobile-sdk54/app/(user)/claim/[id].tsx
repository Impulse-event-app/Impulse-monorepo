import { useEffect, useState } from 'react';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { money, apiDealToDrop, apiBookingToPlan } from '../../../src/data';
import { fontMono, fontUI, useApp } from '../../../src/theme';
import {
  createBooking, getMe, payBooking, listPaymentMethods, describeCard,
  ApiError, ApiBooking, PaymentMethod,
} from '../../../src/api';
import {
  BackButton,
  Btn,
  Chip,
  EmptyState,
  FloatingFooter,
  Group,
  Label,
  Radio,
  ReadableColumn,
  Row,
  ScreenTitle,
  Stepper,
  Switch,
  unitLabel,
} from '../../../src/components';
import { Plus, RowIcons } from '../../../src/icons';
import { PinchCardField } from '../../../src/PinchCardField';
import { hapticError, hapticSuccess } from '../../../src/haptics';

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

  // While a slot is held, on-screen Back steps from payment to the booking
  // form. Disable the iOS edge swipe then, so the two can't disagree.
  const navigation = useNavigation();
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !pendingBooking });
  }, [navigation, pendingBooking]);

  const defaultCard = savedCards?.find((c) => c.is_default) ?? savedCards?.[0] ?? null;

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
      `/(user)/confirm?code=${encodeURIComponent(paid.confirmation_code ?? '')}&balance=${paid.balance_amount_cents ?? balanceCents}`,
    );
  };

  const onPaymentError = (err: unknown) => {
    hapticError();
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
        hapticError();
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
          <ScreenTitle>{pendingBooking ? 'Pay the deposit' : 'Your booking'}</ScreenTitle>
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
            </>
          ) : savedCards === null ? (
            <ActivityIndicator color={T.accent} style={{ height: 80 }} accessibilityLabel="Loading saved cards" />
          ) : defaultCard && !useNewCard ? (
            <Group label="Pay with">
              <Row
                icon={RowIcons.card(T.muted)}
                label={describeCard(defaultCard)}
                sublabel={defaultCard.expiry_date ? `Expires ${defaultCard.expiry_date}` : undefined}
                trailing={<Radio on />}
              />
              <Row icon={<Plus size={13} color={T.accent} />} label="Use a different card" accent chevron={false} onPress={() => setUseNewCard(true)} />
            </Group>
          ) : (
            <View style={{ marginTop: 32 }}>
              <Label style={{ marginHorizontal: 16, marginBottom: 7 }}>Card details</Label>
              <PinchCardField
                depositLabel={fmtCents(depositCents)}
                colors={{ bg: T.bg, text: T.text, muted: T.muted, line: T.line, accent: T.accent, surface: T.surface, fill: T.fill }}
                onToken={({ token, cardHolderName }) => onCardToken(token, cardHolderName)}
                onError={(message) => { hapticError(); Alert.alert('Card error', message); }}
              />
              <Group style={{ marginTop: 16 }} inset={16}>
                <Row
                  label="Save this card"
                  sublabel="Remove it any time in You."
                  trailing={<Switch on={saveCard} onChange={setSaveCard} accessibilityLabel="Save this card" />}
                />
                {defaultCard && (
                  <Row label={`Use ${describeCard(defaultCard)}`} accent chevron={false} onPress={() => setUseNewCard(false)} />
                )}
              </Group>
            </View>
          )}

          <View style={{ marginTop: 40 }}>
            {line("Tonight's price", `${money(d.now)} ${unitLabel(d.unit)}`)}
            {line(perPerson ? 'People' : 'Slot', perPerson ? `× ${party}` : '× 1')}
            {line('Pay now', `${fmtCents(depositCents)} + card fee`)}
            {line('Pay at the venue', fmtCents(balanceCents))}
            <View
              accessible
              accessibilityLabel={`Total, ${money(total)}`}
              style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 14, marginTop: 2, borderTopWidth: 1, borderTopColor: T.line }}
            >
              <Text style={{ ...fontUI(500), fontSize: 17, letterSpacing: -0.19, color: T.text }}>Total</Text>
              <Text style={{ ...fontMono(600), fontSize: 28, letterSpacing: -0.56, color: T.text }}>{money(total)}</Text>
            </View>
            <Label style={{ marginTop: 14, lineHeight: 18 }}>
              The {fmtCents(depositCents)} deposit and card fee are non-refundable. {fmtCents(balanceCents)} is charged when your code is scanned at the venue.
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
            <Btn full onPress={onReserve}>Continue to payment</Btn>
          )}
        </FloatingFooter>
      )}
      {/* The card form carries its own pay button; the saved-card path needs one. */}
      {pendingBooking && (loading || (defaultCard && !useNewCard)) && (
        <FloatingFooter>
          {loading ? (
            <ActivityIndicator color={T.accent} style={{ height: 52 }} accessibilityLabel="Processing payment" />
          ) : (
            <Btn full onPress={onPayWithSavedCard}>{`Pay ${fmtCents(depositCents)} deposit`}</Btn>
          )}
        </FloatingFooter>
      )}
    </View>
  );
}
