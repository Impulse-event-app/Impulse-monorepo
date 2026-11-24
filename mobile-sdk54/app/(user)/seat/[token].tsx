// Seat link landing — a friend opens the link the person who booked sent
// them. It reads as an invitation: who booked, where, when, and exactly what
// their share is, with one button to confirm. Signed-out users sign in and
// come straight back here. Works on the web too, so a friend without the app
// can still take their spot (the card field has a web build).
import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontUI, useApp } from '../../../src/theme';
import { claimSeat, ApiError, SeatLanding } from '../../../src/api';
import { supabase } from '../../../src/supabase';
import { useRequireAuth } from '../../../src/auth';
import { BackButton, Btn, EmptyState, Label, ScreenTitle } from '../../../src/components';
import { SharePay, shareTerms } from '../../../src/SharePay';
import { fmtCents } from '../../../src/split';

export default function SeatLandingScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { T, refreshBookings } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const requireAuth = useRequireAuth();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [seat, setSeat] = useState<SeatLanding | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Live, so returning from sign-in flips straight to the invitation.
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => { if (active) setSignedIn(!!session); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (active) setSignedIn(!!session);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setSeat(await claimSeat(token));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  }, [token]);

  useEffect(() => { if (signedIn) load(); }, [signedIn, load]);

  const openGroup = () => {
    if (!seat) return;
    refreshBookings();
    router.replace(`/(user)/split/${seat.booking_id}`);
  };

  const share = seat?.share;
  const settled = share && share.status !== 'unpaid';
  const closed = seat && seat.booking_status !== 'collecting' && !settled;

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 60, paddingHorizontal: 16, paddingBottom: 40 }}
      >
        {error ? (
          <EmptyState title="This link isn't working." body={error} />
        ) : signedIn === false ? (
          <>
            <ScreenTitle>You're invited.</ScreenTitle>
            <Text style={{ marginTop: 10, ...fontUI(400), fontSize: 17, lineHeight: 25, color: T.muted, maxWidth: 330 }}>
              A friend saved you a spot. Sign in to see the plan.
            </Text>
            <View style={{ marginTop: 36 }}>
              <Btn full onPress={() => requireAuth(() => {})}>Sign in to see it</Btn>
            </View>
          </>
        ) : !seat || !share ? (
          <ActivityIndicator color={T.accent} style={{ marginTop: 40 }} />
        ) : (
          <>
            <ScreenTitle>{settled ? "You're in." : "You're invited."}</ScreenTitle>
            <Text style={{ marginTop: 14, ...fontUI(400), fontSize: 20, lineHeight: 28, letterSpacing: -0.3, color: T.text }}>
              {seat.initiator_name} booked {seat.venue_name}, {seat.slot}
              {share.status === 'settled' && share.covered_by_name
                ? ` — ${share.covered_by_name} has your share covered.`
                : ` — your share is ${fmtCents(share.share_cents)}.`}
            </Text>
            <Label style={{ marginTop: 8 }}>{seat.deal_title}</Label>

            {closed ? (
              <Text style={{ marginTop: 28, ...fontUI(400), fontSize: 15, lineHeight: 21, color: T.muted }}>
                This booking isn't taking new spots any more.
              </Text>
            ) : settled ? (
              <View style={{ marginTop: 32 }}>
                <Btn full onPress={openGroup}>See the group</Btn>
              </View>
            ) : !seat.locked_in ? (
              <>
                <Text style={{ marginTop: 20, ...fontUI(400), fontSize: 15, lineHeight: 21, color: T.muted }}>
                  {seat.initiator_name} is locking it in — you can confirm your spot as soon as they have.
                </Text>
                <View style={{ marginTop: 24 }}>
                  <Btn full variant="secondary" onPress={openGroup}>See the plan</Btn>
                </View>
              </>
            ) : (
              <>
                <Text style={{ marginTop: 20, ...fontUI(400), fontSize: 15, lineHeight: 21, color: T.muted }}>
                  {shareTerms(share)}
                </Text>
                <View style={{ marginTop: 24 }}>
                  <SharePay bookingId={seat.booking_id} share={share} onPaid={openGroup} onShareChanged={load} />
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
      <View style={{ position: 'absolute', top: insets.top + 4, left: 16, zIndex: 22 }}>
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/(user)/home'))} />
      </View>
    </View>
  );
}
