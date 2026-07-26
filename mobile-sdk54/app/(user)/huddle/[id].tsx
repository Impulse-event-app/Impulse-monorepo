// Huddle status — a clean bottom-sheet popup over the app. Shows the join link
// and N avatar slots filling in live, a "Vote your top 3" button that turns the
// home feed into the ballot, and (after resolution) the winner, your share, and
// the group code. Polls while the huddle is live.
import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontDisplay, fontMono, fontUI, useApp } from '../../../src/theme';
import { getHuddle, getHuddleCandidates, payHuddleShare, ApiHuddle, ApiError } from '../../../src/api';
import QRCode from 'react-native-qrcode-svg';
import { Btn, HuddleMark } from '../../../src/components';
import { PinchCardField } from '../../../src/PinchCardField';

const POLL_MS = 4000;

// Gamified journey: Vote → Pay → Code. Highlights the current stage.
function HuddleJourney({ stage }: { stage: number }) {
  const { T } = useApp();
  const steps = ['Vote', 'Pay', 'Code'];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
      {steps.map((s, i) => {
        const done = i < stage;
        const current = i === stage;
        const reached = i <= stage;
        return (
          <View key={s} style={{ flexDirection: 'row', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{
                width: 22, height: 22, borderRadius: 999,
                backgroundColor: reached ? T.accent : T.chipBg,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: current ? 2 : 0, borderColor: T.accentSoft,
              }}>
                <Text style={{ fontFamily: fontMono(700), fontSize: 10, color: reached ? T.accentInk : T.faint }}>
                  {done ? '✓' : i + 1}
                </Text>
              </View>
              <Text style={{ fontFamily: fontUI(current ? 600 : 400), fontSize: 12.5, color: reached ? T.text : T.faint }}>{s}</Text>
            </View>
            {i < steps.length - 1 && (
              <View style={{ flex: 1, height: 2, marginHorizontal: 8, borderRadius: 1, backgroundColor: done ? T.accent : T.line }} />
            )}
          </View>
        );
      })}
    </View>
  );
}

function joinUrl(token: string): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/huddle/join/${token}`;
  }
  return `${(process.env.EXPO_PUBLIC_WEB_URL ?? 'https://impulse.expo.app').replace(/\/$/, '')}/huddle/join/${token}`;
}

function AvatarSlot({ name, voted, empty }: { name?: string; voted?: boolean; empty?: boolean }) {
  const { T } = useApp();
  const initial = (name ?? '').trim().charAt(0).toUpperCase();
  return (
    <View style={{ alignItems: 'center', width: 60 }}>
      <View
        style={{
          width: 48, height: 48, borderRadius: 999,
          backgroundColor: empty ? 'transparent' : T.accentSoft,
          borderWidth: empty ? 1.5 : voted ? 2 : 0,
          borderColor: voted ? T.accent : T.line2,
          borderStyle: empty ? 'dashed' : 'solid',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        {empty
          ? <Text style={{ fontFamily: fontUI(400), fontSize: 18, color: T.faint }}>·</Text>
          : <Text style={{ fontFamily: fontDisplay(600), fontSize: 19, color: T.accent }}>{initial || '?'}</Text>}
        {voted && !empty && (
          <View style={{ position: 'absolute', right: -2, bottom: -2, width: 18, height: 18, borderRadius: 999, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: T.bg }}>
            <Text style={{ fontSize: 9, color: T.accentInk, fontFamily: fontMono(700) }}>✓</Text>
          </View>
        )}
      </View>
      <Text numberOfLines={1} style={{ marginTop: 5, fontFamily: fontUI(500), fontSize: 11.5, color: empty ? T.faint : T.text, maxWidth: 58 }}>
        {empty ? 'open' : name}
      </Text>
      {!empty && (
        <Text style={{ fontFamily: fontUI(400), fontSize: 10, color: voted ? T.accent : T.faint }}>
          {voted ? 'voted' : 'joined'}
        </Text>
      )}
    </View>
  );
}

export default function HuddlePopup() {
  const { id, mt } = useLocalSearchParams<{ id: string; mt?: string }>();
  const { T, profile, startVoting } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [huddle, setHuddle] = useState<ApiHuddle | null>(null);
  const [copied, setCopied] = useState(false);
  const [paying, setPaying] = useState(false);      // card field revealed
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      setHuddle(await getHuddle(id, mt));
    } catch {
      // keep last known state; next poll retries
    }
  }, [id, mt]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const share = async () => {
    if (!huddle) return;
    const url = joinUrl(huddle.join_token);
    if (Platform.OS === 'web') {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        Alert.alert('Join link', url);
      }
    } else {
      await Share.share({ message: `Join our huddle on Impulse: ${url}` }).catch(() => {});
    }
  };

  // Turn the home feed into the ballot, then dismiss the popup.
  const goVote = async () => {
    if (!id) return;
    try {
      const cands = await getHuddleCandidates(id, mt);
      startVoting({ huddleId: id, memberToken: mt, candidateIds: cands.map((d) => d.id) });
      router.back();   // reveal home in voting mode
    } catch (err) {
      Alert.alert('Could not load deals', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  const onCardToken = async (token: string, cardHolderName: string) => {
    if (!id) return;
    setSubmitting(true);
    try {
      const fullName = (profile.name && profile.name !== 'You' ? profile.name : cardHolderName).trim();
      const [firstName, ...rest] = fullName.split(/\s+/);
      const updated = await payHuddleShare(id, {
        token,
        card_holder_name: cardHolderName,
        email: profile.email || `no-email-${id.slice(0, 8)}@impulse.app`,
        first_name: firstName || 'Impulse',
        last_name: rest.join(' ') || 'Member',
      }, mt);
      setHuddle(updated);
      setPaying(false);
    } catch (err) {
      Alert.alert('Payment failed', err instanceof ApiError ? err.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const filled = huddle?.members ?? [];
  const emptyCount = huddle ? Math.max(0, huddle.group_size - filled.length) : 0;
  const canVote = huddle?.status === 'open' && !huddle.my_has_voted && !!huddle.my_member_id;
  const resolved = huddle && ['awaiting_payment', 'active', 'redeemed'].includes(huddle.status);
  const myMember = huddle?.members.find((m) => m.id === huddle.my_member_id);
  const myDepositPaid = myMember?.deposit_status === 'paid';
  const paidCount = filled.filter((m) => m.deposit_status === 'paid').length;
  const stage = !huddle ? 0
    : huddle.status === 'open' ? 0
    : huddle.status === 'awaiting_payment' ? 1
    : ['active', 'redeemed'].includes(huddle.status) ? 2 : 0;

  return (
    <Pressable onPress={() => router.back()} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
      <Pressable
        onPress={() => {}}
        style={[{ backgroundColor: T.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 10, paddingBottom: insets.bottom > 0 ? insets.bottom + 12 : 28, maxHeight: '86%' }, T.shadow]}
      >
        {/* grabber */}
        <View style={{ alignItems: 'center', paddingBottom: 6 }}>
          <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: T.line2 }} />
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 8 }} showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <HuddleMark size={44} radius={14} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fontDisplay(700), fontSize: 22, letterSpacing: -0.6, color: T.text }}>Your huddle</Text>
              <Text style={{ fontFamily: fontUI(400), fontSize: 12.5, color: T.muted }}>
                {huddle ? `${huddle.group_size} people · one code` : 'Loading…'}
              </Text>
            </View>
          </View>

          {/* gamified journey */}
          {huddle && <HuddleJourney stage={stage} />}

          <Text style={{ marginTop: 14, fontFamily: fontUI(400), fontSize: 14.5, lineHeight: 21, color: T.muted }}>
            {!huddle
              ? ''
              : resolved
              ? "It's decided — details below."
              : huddle.my_has_voted
              ? `Your vote's in. ${filled.filter((m) => m.has_voted).length} of ${huddle.group_size} voted so far.`
              : `${filled.length} of ${huddle.group_size} in. Vote any time — the result locks once everyone has.`}
          </Text>

          {/* avatar slots */}
          <View style={{ marginTop: 22, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {filled.map((m) => <AvatarSlot key={m.id} name={m.display_name} voted={m.has_voted} />)}
            {[...Array(emptyCount)].map((_, i) => <AvatarSlot key={`e-${i}`} empty />)}
          </View>

          {/* vote CTA */}
          {canVote && (
            <View style={{ marginTop: 22 }}>
              <Btn full onPress={goVote}>Vote your top 3</Btn>
            </View>
          )}

          {/* join QR + link while open */}
          {huddle && huddle.status === 'open' && (
            <View style={[{ marginTop: 18, padding: 16, backgroundColor: T.surface, borderRadius: 16, gap: 12 }, T.shadow]}>
              <View style={{ alignItems: 'center', gap: 8 }}>
                <View style={{ backgroundColor: '#fff', padding: 12, borderRadius: 14 }}>
                  <QRCode value={joinUrl(huddle.join_token)} size={168} backgroundColor="#fff" color="#0F0E0D" />
                </View>
                <Text style={{ fontFamily: fontUI(500), fontSize: 13, color: T.muted }}>Scan to join the huddle</Text>
              </View>
              <View style={{ height: 1, backgroundColor: T.line }} />
              <Text style={{ fontFamily: fontMono(400), fontSize: 10.5, letterSpacing: 1.2, textTransform: 'uppercase', color: T.faint }}>Or share the link</Text>
              <Text selectable numberOfLines={2} style={{ fontFamily: fontMono(400), fontSize: 12.5, color: T.text }}>
                {joinUrl(huddle.join_token)}
              </Text>
              <Pressable onPress={share} style={{ height: 42, borderRadius: 12, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: fontUI(600), fontSize: 14.5, color: T.accentInk }}>
                  {copied ? 'Copied ✓' : Platform.OS === 'web' ? 'Copy link' : 'Share link'}
                </Text>
              </Pressable>
            </View>
          )}

          {/* resolved: winner + share + code */}
          {resolved && huddle.winning_deal && (
            <View style={[{ marginTop: 18, padding: 16, backgroundColor: T.surface, borderRadius: 16, gap: 5, borderWidth: 1, borderColor: T.accentSoft }, T.shadow]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 2 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: T.accent }} />
                <Text style={{ fontFamily: fontMono(700), fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: T.accent }}>
                  It's decided — the winner
                </Text>
              </View>
              <Text style={{ fontFamily: fontDisplay(700), fontSize: 21, letterSpacing: -0.4, color: T.text }}>{huddle.winning_deal.venue_name}</Text>
              <Text style={{ fontFamily: fontUI(400), fontSize: 13.5, color: T.muted }}>{huddle.winning_deal.title}</Text>
              {huddle.my_share && (
                <Text style={{ marginTop: 8, fontFamily: fontUI(500), fontSize: 14.5, color: T.text }}>
                  Your share: pay ${(huddle.my_share.deposit_cents / 100).toFixed(2)} now,
                  {' '}${(huddle.my_share.balance_cents / 100).toFixed(2)} at the venue.
                </Text>
              )}

              {/* Deposit payment — reuses the standard Pinch card field */}
              {huddle.status === 'awaiting_payment' && huddle.my_member_id && (
                myDepositPaid ? (
                  <View style={{ marginTop: 10, padding: 12, backgroundColor: T.accentSoft, borderRadius: 12 }}>
                    <Text style={{ fontFamily: fontUI(600), fontSize: 14, color: T.text }}>
                      ✓ Your share is paid — {paidCount} of {huddle.group_size} in. Your code unlocks once everyone pays.
                    </Text>
                  </View>
                ) : paying ? (
                  <View style={{ marginTop: 12 }}>
                    {submitting ? (
                      <ActivityIndicator color={T.accent} style={{ height: 120 }} />
                    ) : (
                      <PinchCardField
                        depositLabel={`$${((huddle.my_share?.deposit_cents ?? 0) / 100).toFixed(2)}`}
                        colors={{ bg: T.bg, text: T.text, muted: T.muted, line: T.line, accent: T.accent, surface: T.surface }}
                        onToken={({ token, cardHolderName }) => onCardToken(token, cardHolderName)}
                        onError={(m) => Alert.alert('Card error', m)}
                      />
                    )}
                  </View>
                ) : (
                  <View style={{ marginTop: 12 }}>
                    <Btn full onPress={() => setPaying(true)}>
                      Pay my ${((huddle.my_share?.deposit_cents ?? 0) / 100).toFixed(2)} share
                    </Btn>
                    <Text style={{ marginTop: 6, fontFamily: fontUI(400), fontSize: 12, color: T.faint, textAlign: 'center' }}>
                      Non-refundable deposit (plus a small card fee). ${((huddle.my_share?.balance_cents ?? 0) / 100).toFixed(2)} due at the venue · {paidCount} of {huddle.group_size} paid
                    </Text>
                  </View>
                )
              )}

              {huddle.status === 'active' && huddle.common_code && (
                <View style={{ marginTop: 10, alignItems: 'center', paddingVertical: 12, backgroundColor: T.sunken, borderRadius: 12 }}>
                  <Text style={{ fontFamily: fontMono(400), fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: T.faint }}>Group code</Text>
                  <Text style={{ fontFamily: fontMono(700), fontSize: 34, letterSpacing: 6, color: T.text, marginTop: 4 }}>{huddle.common_code}</Text>
                </View>
              )}
            </View>
          )}

          <Pressable onPress={() => router.back()} style={{ paddingVertical: 14, alignItems: 'center', marginTop: 6 }}>
            <Text style={{ fontFamily: fontUI(500), fontSize: 15, color: T.muted }}>Close</Text>
          </Pressable>
        </ScrollView>
      </Pressable>
    </Pressable>
  );
}
