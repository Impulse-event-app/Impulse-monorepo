// SharePay.tsx — confirm my share of a booking. One path for everyone who
// isn't paying at checkout: a friend opening their seat link, or a Huddle
// member once the split is set. A saved card is a single tap; otherwise the
// standard Pinch card field. The amount sent back as expected_deposit_cents
// is exactly the one on screen — if the share changed meanwhile, the server
// refuses and we show the new amount instead of charging.
import { useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { useApp } from './theme';
import { payBooking, describeCard, ApiError, MyShare } from './api';
import { Btn, Group, Radio, Row, Switch } from './components';
import { Plus, RowIcons } from './icons';
import { PinchCardField } from './PinchCardField';
import { useWallet } from './wallet';
import { hapticError } from './haptics';
import { fmtCents } from './split';

export function SharePay({
  bookingId, share, label = 'Confirm my spot', onPaid, onShareChanged,
}: {
  bookingId: string;
  share: MyShare;
  label?: string;
  onPaid: () => void;
  onShareChanged: () => void;
}) {
  const { T, profile } = useApp();
  const wallet = useWallet();
  const defaultCard = wallet.cards?.find((c) => c.is_default) ?? wallet.cards?.[0] ?? null;
  const [useNewCard, setUseNewCard] = useState(false);
  const [saveCard, setSaveCard] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fail = (err: unknown) => {
    hapticError();
    if (err instanceof ApiError && err.status === 409) {
      // Share changed, deadline passed, or already settled — refetch, never charge.
      Alert.alert('Take another look', err.message);
      onShareChanged();
      return;
    }
    Alert.alert('That didn’t go through', err instanceof ApiError ? err.message : 'Please try again.');
  };

  const payWithSaved = async () => {
    if (!defaultCard) return;
    setSubmitting(true);
    try {
      await payBooking(bookingId, { expected_deposit_cents: share.deposit_cents, payment_method_id: defaultCard.id });
      onPaid();
    } catch (err) {
      fail(err);
    } finally {
      setSubmitting(false);
    }
  };

  const payWithToken = async (token: string, cardHolderName: string) => {
    setSubmitting(true);
    try {
      const fullName = (profile.name && profile.name !== 'You' ? profile.name : cardHolderName).trim();
      const [firstName, ...rest] = fullName.split(/\s+/);
      await payBooking(bookingId, {
        expected_deposit_cents: share.deposit_cents,
        token,
        save_card: saveCard,
        card_holder_name: cardHolderName,
        email: profile.email || `no-email-${bookingId.slice(0, 8)}@impulse.app`,
        first_name: firstName || 'Impulse',
        last_name: rest.join(' ') || 'Member',
      });
      onPaid();
    } catch (err) {
      fail(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitting || wallet.cards === null) {
    return <ActivityIndicator color={T.accent} style={{ height: 120 }} accessibilityLabel="Confirming" />;
  }

  if (defaultCard && !useNewCard) {
    return (
      <View>
        <Btn full onPress={payWithSaved}>{label}</Btn>
        <Group style={{ marginTop: 14 }}>
          <Row
            icon={RowIcons.card(T.muted)}
            label={describeCard(defaultCard)}
            sublabel={`${fmtCents(share.deposit_cents)} now`}
            trailing={<Radio on />}
          />
          <Row icon={<Plus size={13} color={T.accent} />} label="Use a different card" accent chevron={false} onPress={() => setUseNewCard(true)} />
        </Group>
      </View>
    );
  }

  return (
    <View>
      <PinchCardField
        depositLabel={fmtCents(share.deposit_cents)}
        colors={{ bg: T.bg, text: T.text, muted: T.muted, line: T.line, accent: T.accent, surface: T.surface, fill: T.fill }}
        onToken={({ token, cardHolderName }) => payWithToken(token, cardHolderName)}
        onError={(m) => { hapticError(); Alert.alert('Card error', m); }}
      />
      <Group style={{ marginTop: 12 }} inset={16}>
        <Row label="Save this card" sublabel="Remove it any time in You." trailing={<Switch on={saveCard} onChange={setSaveCard} accessibilityLabel="Save this card" />} />
        {defaultCard && (
          <Row label={`Use ${describeCard(defaultCard)}`} accent chevron={false} onPress={() => setUseNewCard(false)} />
        )}
      </Group>
    </View>
  );
}

/** "$3.70 now to hold your spot, $14.80 when you arrive." */
export function shareTerms(share: MyShare): string {
  return share.balance_cents > 0
    ? `${fmtCents(share.deposit_cents)} now to hold your spot, ${fmtCents(share.balance_cents)} when you arrive.`
    : `${fmtCents(share.deposit_cents)} now to hold your spot.`;
}
