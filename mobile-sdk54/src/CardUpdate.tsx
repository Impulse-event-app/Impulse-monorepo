// CardUpdate.tsx — shown on a booking whose card couldn't be held (it declined,
// expired or was removed before the hold was placed). One button opens
// Stripe's sheet to hold a different card; the old hold is released once the
// new one is in. The push sent when the hold fails lands on these screens.
import { useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { ApiBooking, ApiError } from './api';
import { Btn, Label } from './components';
import { hapticError, hapticSuccess } from './haptics';
import { useStripePay } from './stripePay';
import { fontUI, useApp } from './theme';

export function CardUpdate({ bookingId, onUpdated }: {
  bookingId: string;
  onUpdated: (booking: ApiBooking) => void;
}) {
  const { T } = useApp();
  const stripePay = useStripePay();
  const [busy, setBusy] = useState(false);

  const update = async () => {
    setBusy(true);
    try {
      const booking = await stripePay.updateCard(bookingId);
      if (booking) {
        hapticSuccess();
        onUpdated(booking);
      }
    } catch (err) {
      hapticError();
      Alert.alert('That card didn’t go through', err instanceof ApiError || err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      accessibilityRole="alert"
      style={{ borderRadius: 16, borderCurve: 'continuous', padding: 16, gap: 10, backgroundColor: T.accentSoft, alignSelf: 'stretch' }}
    >
      <Text style={{ ...fontUI(600), fontSize: 16, color: T.text }}>Your card couldn’t be held</Text>
      <Label style={{ lineHeight: 19 }}>
        Update your card so your spot stays booked. Nothing is charged until the venue checks you in.
      </Label>
      {busy ? (
        <ActivityIndicator color={T.accent} style={{ height: 48 }} accessibilityLabel="Updating your card" />
      ) : (
        <Btn full onPress={update}>Update card</Btn>
      )}
      {stripePay.overlay}
    </View>
  );
}
