// SharePay.tsx — hold my share of a booking. One path for everyone who isn't
// paying at checkout: a friend opening their seat link, or a Huddle member once
// the split is set. Stripe's sheet offers saved cards, a new card, Apple Pay and
// Google Pay. The amount sent back as expected_share_cents is exactly the one
// on screen — if the share changed meanwhile, the server refuses and we show
// the new amount instead of holding anything.
import { useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { useApp } from './theme';
import { ApiError, MyShare } from './api';
import { Btn } from './components';
import { useStripePay } from './stripePay';
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
  const { T } = useApp();
  const stripePay = useStripePay();
  const [submitting, setSubmitting] = useState(false);

  const fail = (err: unknown) => {
    hapticError();
    if (err instanceof ApiError && err.status === 409) {
      // Share changed, deadline passed, or already settled — refetch, never hold.
      Alert.alert('Take another look', err.message);
      onShareChanged();
      return;
    }
    Alert.alert('That didn’t go through', err instanceof Error ? err.message : 'Please try again.');
  };

  const hold = async () => {
    setSubmitting(true);
    try {
      if (await stripePay.holdShare(bookingId, share.share_cents)) onPaid();
    } catch (err) {
      fail(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View>
      {submitting ? (
        <ActivityIndicator color={T.accent} style={{ height: 52 }} accessibilityLabel="Confirming" />
      ) : (
        <Btn full onPress={hold}>{`${label} · ${fmtCents(share.share_cents)}`}</Btn>
      )}
      {stripePay.overlay}
    </View>
  );
}

/** "$18.50 held on your card now, charged when you check in." */
export function shareTerms(share: MyShare): string {
  return `${fmtCents(share.share_cents)} held on your card now, charged when you check in.`;
}
