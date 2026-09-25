// Huddle status — a bottom sheet over the app. Shows the join link and N avatar
// slots filling in live, a "Vote your top 3" button that turns the home feed
// into the ballot, and (after resolution) the winner, your share, and the group
// code. Polls while the huddle is live.
import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Platform, Share, Text, View } from 'react-native';
import { fontMono, fontUI, useApp } from '../../../src/theme';
import { getHuddle, getHuddleCandidates, payHuddleShare, cancelHuddle, describeCard, ApiHuddle, ApiError } from '../../../src/api';
import QRCode from 'react-native-qrcode-svg';
import {
  Btn,
  CodeDisplay,
  Group,
  HuddleMark,
  Label,
  LiveDot,
  Radio,
  Row,
  SheetFrame,
  Switch,
  TextBtn,
} from '../../../src/components';
import { Check, Plus, RowIcons, ShareGlyph } from '../../../src/icons';
import { PinchCardField } from '../../../src/PinchCardField';
import { useWallet } from '../../../src/wallet';
import { hapticError, hapticSuccess } from '../../../src/haptics';

const POLL_MS = 4000;
const fmtCents = (c: number) => `$${(c / 100).toFixed(2)}`;

// Vote → Pay → Code. Highlights the current stage.
function HuddleJourney({ stage }: { stage: number }) {
  const { T } = useApp();
  const steps = ['Vote', 'Pay', 'Code'];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {steps.map((s, i) => {
        const done = i < stage;
        const current = i === stage;
        const reached = i <= stage;
        return (
          <View key={s} style={{ flexDirection: 'row', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <View
                style={{
                  width: 22, height: 22, borderCurve: 'continuous', borderRadius: 13, backgroundColor: reached ? T.accent : T.fill,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                {done ? (
                  <Check size={11} color={T.accentInk} />
                ) : (
                  <Text style={{ ...fontMono(600), fontSize: 12, color: reached ? T.accentInk : T.muted }}>{i + 1}</Text>
                )}
              </View>
              <Text style={{ ...fontUI(current ? 500 : 400), fontSize: 13, color: reached ? T.text : T.muted }}>{s}</Text>
            </View>
            {i < steps.length - 1 && (
              <View style={{ flex: 1, height: 1, marginHorizontal: 10, backgroundColor: done ? T.accent : T.line2 }} />
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
          width: 48, height: 48, borderCurve: 'continuous', borderRadius: 24,
          backgroundColor: empty ? 'transparent' : T.surface2,
          borderWidth: empty ? 1.5 : voted ? 1.5 : 1,
          borderColor: empty ? T.line2 : voted ? T.accent : T.line,
          borderStyle: empty ? 'dashed' : 'solid',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        {!empty && <Text style={{ ...fontUI(600), fontSize: 17, color: T.text }}>{initial || '?'}</Text>}
        {voted && !empty && (
          <View
            style={{
              position: 'absolute', right: -3, bottom: -3, width: 18, height: 18, borderCurve: 'continuous', borderRadius: 11,
              backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: T.surface,
            }}
          >
            <Check size={8} color={T.accentInk} />
          </View>
        )}
      </View>
      <Text numberOfLines={1} style={{ marginTop: 6, ...fontUI(500), fontSize: 12, color: empty ? T.muted : T.text, maxWidth: 58 }}>
        {empty ? 'Open' : name}
      </Text>
      {!empty && (
        <Text style={{ ...fontUI(400), fontSize: 12, color: voted ? T.accent : T.muted }}>{voted ? 'Voted' : 'Joined'}</Text>
      )}
    </View>
  );
}

export default function HuddlePopup() {
  const { id, mt } = useLocalSearchParams<{ id: string; mt?: string }>();
  const { T, profile, startVoting, setActiveHuddle } = useApp();
  const router = useRouter();
  const [huddle, setHuddle] = useState<ApiHuddle | null>(null);
  const [copied, setCopied] = useState(false);
  const [paying, setPaying] = useState(false);      // card field revealed
  // Saved cards. A guest who joined by name has no account, so the wallet
  // comes back empty and they simply get the card form.
  const wallet = useWallet();
  const defaultCard = wallet.cards?.find((c) => c.is_default) ?? wallet.cards?.[0] ?? null;
  const [useNewCard, setUseNewCard] = useState(false);
  const [saveCard, setSaveCard] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

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

  // Turn the home feed into the ballot, then dismiss the sheet.
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

  /** Charge a card already on file — no card form, no re-entry. */
  const onPayWithSavedCard = async () => {
    if (!id || !defaultCard) return;
    setSubmitting(true);
    try {
      setHuddle(await payHuddleShare(id, { payment_method_id: defaultCard.id }, mt));
      hapticSuccess();
      setPaying(false);
    } catch (err) {
      hapticError();
      // 409 = the server won't charge this stored card (expired, detached,
      // never authorised). Drop straight to the card form rather than dead-end.
      if (err instanceof ApiError && err.status === 409) {
        setUseNewCard(true);
        Alert.alert('Card unavailable', err.message);
      } else {
        Alert.alert('Payment failed', err instanceof ApiError ? err.message : 'Please try again.');
      }
    } finally {
      setSubmitting(false);
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
        save_card: saveCard,
        card_holder_name: cardHolderName,
        email: profile.email || `no-email-${id.slice(0, 8)}@impulse.app`,
        first_name: firstName || 'Impulse',
        last_name: rest.join(' ') || 'Member',
      }, mt);
      setHuddle(updated);
      hapticSuccess();
      setPaying(false);
    } catch (err) {
      hapticError();
      Alert.alert('Payment failed', err instanceof ApiError ? err.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const doCancel = async () => {
    if (!id) return;
    setCancelling(true);
    try {
      await cancelHuddle(id, mt);
      setActiveHuddle(null);   // home card reverts to "Start a huddle"
      router.back();
    } catch (err) {
      Alert.alert('Could not cancel', err instanceof ApiError ? err.message : 'Please try again.');
      setCancelling(false);
      setConfirmingCancel(false);
    }
  };

  const filled = huddle?.members ?? [];
  const emptyCount = huddle ? Math.max(0, huddle.group_size - filled.length) : 0;
  const canVote = huddle?.status === 'open' && !huddle.my_has_voted && !!huddle.my_member_id;
  const imCreator = !!huddle?.members.find((m) => m.id === huddle.my_member_id)?.is_creator;
  // Creator can call it off until the group is confirmed (active).
  const canCancel = imCreator && (huddle?.status === 'open' || huddle?.status === 'awaiting_payment');
  const resolved = huddle && ['awaiting_payment', 'active', 'redeemed'].includes(huddle.status);
  const myMember = huddle?.members.find((m) => m.id === huddle.my_member_id);
  const myDepositPaid = myMember?.deposit_status === 'paid';
  const paidCount = filled.filter((m) => m.deposit_status === 'paid').length;
  const stage = !huddle ? 0
    : huddle.status === 'open' ? 0
    : huddle.status === 'awaiting_payment' ? 1
    : ['active', 'redeemed'].includes(huddle.status) ? 2 : 0;
  const deposit = fmtCents(huddle?.my_share?.deposit_cents ?? 0);
  const balance = fmtCents(huddle?.my_share?.balance_cents ?? 0);

  // Inner cards sit one step off the sheet surface.
  const card = { marginTop: 18, padding: 16, backgroundColor: T.dark ? T.surface2 : T.bg, borderCurve: 'continuous', borderRadius: 12, borderWidth: 1, borderColor: T.line } as const;

  return (
    <SheetFrame
      native={Platform.OS === 'ios'}
      onClose={() => router.back()}
      leading={<HuddleMark size={44} />}
      title="Your huddle"
      subtitle={huddle ? `${huddle.group_size} people · one code` : 'Loading…'}
      maxHeight="90%"
      bodyStyle={{ paddingHorizontal: 16 }}
    >
      {huddle && <HuddleJourney stage={stage} />}

      {!!huddle && (
        <Text style={{ marginTop: 16, ...fontUI(400), fontSize: 15, lineHeight: 21, letterSpacing: -0.12, color: T.muted }}>
          {resolved
            ? "It's decided. Details below."
            : huddle.my_has_voted
            ? `Your vote is in. ${filled.filter((m) => m.has_voted).length} of ${huddle.group_size} have voted.`
            : `${filled.length} of ${huddle.group_size} in. The result locks when everyone votes.`}
        </Text>
      )}

      {/* member slots */}
      <View style={{ marginTop: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {filled.map((m) => <AvatarSlot key={m.id} name={m.display_name} voted={m.has_voted} />)}
        {[...Array(emptyCount)].map((_, i) => <AvatarSlot key={`e-${i}`} empty />)}
      </View>

      {canVote && (
        <View style={{ marginTop: 22 }}>
          <Btn full onPress={goVote}>Vote your top 3</Btn>
        </View>
      )}

      {/* join QR + link while open */}
      {huddle && huddle.status === 'open' && (
        <View style={[card, { gap: 12 }]}>
          <View style={{ alignItems: 'center', gap: 10 }}>
            <View style={{ backgroundColor: '#fff', padding: 12, borderCurve: 'continuous', borderRadius: 16 }}>
              <QRCode value={joinUrl(huddle.join_token)} size={160} backgroundColor="#fff" color="#0A0A0A" />
            </View>
            <Label>Scan to join</Label>
          </View>
          <View style={{ height: 1, backgroundColor: T.line, marginVertical: 2 }} />
          <Label>Or share the link</Label>
          <Text selectable numberOfLines={2} style={{ ...fontUI(400, 15), fontSize: 15, color: T.text }}>
            {joinUrl(huddle.join_token)}
          </Text>
          <Btn full small variant="secondary" onPress={share}>
            {!copied && <ShareGlyph size={16} color={T.text} />}
            <Text style={{ ...fontUI(500), fontSize: 15, letterSpacing: -0.12, color: T.text }}>
              {copied ? 'Copied' : Platform.OS === 'web' ? 'Copy link' : 'Share link'}
            </Text>
          </Btn>
        </View>
      )}

      {/* resolved: winner + share + code */}
      {resolved && huddle.winning_deal && (
        <View style={card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <LiveDot color={T.accent} />
            <Text style={{ ...fontUI(500), fontSize: 13, color: T.accent }}>It's decided</Text>
          </View>
          <Text style={{ marginTop: 8, ...fontUI(600), fontSize: 22, letterSpacing: -0.48, color: T.text }}>{huddle.winning_deal.venue_name}</Text>
          <Text style={{ marginTop: 2, ...fontUI(400), fontSize: 15, color: T.muted }}>{huddle.winning_deal.title}</Text>
          {huddle.my_share && (
            <Text style={{ marginTop: 12, ...fontUI(400, 15), fontSize: 15, lineHeight: 21, color: T.text }}>
              Your share: {deposit} now, {balance} at the venue.
            </Text>
          )}

          {/* Deposit payment — reuses the standard Pinch card field */}
          {huddle.status === 'awaiting_payment' && huddle.my_member_id && (
            myDepositPaid ? (
              <View style={{ marginTop: 14, padding: 12, backgroundColor: T.accentSoft, borderCurve: 'continuous', borderRadius: 12 }}>
                <Text style={{ ...fontUI(500, 15), fontSize: 15, lineHeight: 21, color: T.text }}>
                  Paid. {paidCount} of {huddle.group_size} in. Your code unlocks when everyone pays.
                </Text>
              </View>
            ) : paying ? (
              <View style={{ marginTop: 14 }}>
                {submitting ? (
                  <ActivityIndicator color={T.accent} style={{ height: 120 }} />
                ) : defaultCard && !useNewCard ? (
                  <>
                    <Group style={{ marginTop: 0 }}>
                      <Row
                        icon={RowIcons.card(T.muted)}
                        label={describeCard(defaultCard)}
                        sublabel={defaultCard.expiry_date ? `Expires ${defaultCard.expiry_date}` : undefined}
                        trailing={<Radio on />}
                      />
                      <Row icon={<Plus size={13} color={T.accent} />} label="Use a different card" accent chevron={false} onPress={() => setUseNewCard(true)} />
                    </Group>
                    <View style={{ marginTop: 12 }}>
                      <Btn full onPress={onPayWithSavedCard}>{`Pay ${deposit}`}</Btn>
                    </View>
                  </>
                ) : (
                  <>
                    <PinchCardField
                      depositLabel={deposit}
                      colors={{ bg: T.bg, text: T.text, muted: T.muted, line: T.line, accent: T.accent, surface: T.surface, fill: T.fill }}
                      onToken={({ token, cardHolderName }) => onCardToken(token, cardHolderName)}
                      onError={(m) => { hapticError(); Alert.alert('Card error', m); }}
                    />
                    {/* Only offer to save for members with an account —
                        guests who joined by name have nowhere to save it. */}
                    {(wallet.signedIn === true || defaultCard) && (
                      <Group style={{ marginTop: 12 }} inset={16}>
                        {wallet.signedIn === true && (
                          <Row label="Save this card" trailing={<Switch on={saveCard} onChange={setSaveCard} />} />
                        )}
                        {defaultCard && (
                          <Row label={`Use ${describeCard(defaultCard)}`} accent chevron={false} onPress={() => setUseNewCard(false)} />
                        )}
                      </Group>
                    )}
                  </>
                )}
              </View>
            ) : (
              <View style={{ marginTop: 14 }}>
                <Btn full onPress={() => setPaying(true)}>{`Pay my ${deposit} share`}</Btn>
                <Label style={{ marginTop: 8, lineHeight: 18, textAlign: 'center' }}>
                  The deposit and card fee are non-refundable. {balance} is due at the venue. {paidCount} of {huddle.group_size} paid.
                </Label>
              </View>
            )
          )}

          {huddle.status === 'active' && huddle.common_code && (
            <View style={{ marginTop: 16, paddingTop: 18, borderTopWidth: 1, borderTopColor: T.line, alignItems: 'center', gap: 12 }}>
              <CodeDisplay code={huddle.common_code} size="md" label="Group code" />
              <Label style={{ textAlign: 'center' }}>Show this at the door. One code for everyone.</Label>
            </View>
          )}
        </View>
      )}

      {/* Creator: cancel the huddle (inline confirm, works on web + native) */}
      {canCancel && (
        confirmingCancel ? (
          <View style={[card, { gap: 12 }]}>
            <Text style={{ ...fontUI(500), fontSize: 15, lineHeight: 21, color: T.text, textAlign: 'center' }}>
              Cancel this huddle for everyone?{paidCount > 0 ? ' Anyone who paid is refunded.' : ''}
            </Text>
            {cancelling ? (
              <ActivityIndicator color={T.accent} style={{ height: 44 }} />
            ) : (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Btn small variant="ghost" style={{ flex: 1 }} onPress={() => setConfirmingCancel(false)}>Keep it</Btn>
                <Btn small style={{ flex: 1 }} onPress={doCancel}>Yes, cancel</Btn>
              </View>
            )}
          </View>
        ) : (
          <TextBtn
            onPress={() => {
              // Native gets the system destructive alert; web keeps the inline confirm.
              if (Platform.OS === 'web') { setConfirmingCancel(true); return; }
              Alert.alert(
                'Cancel this huddle?',
                `It's cancelled for everyone.${paidCount > 0 ? ' Anyone who paid is refunded.' : ''}`,
                [
                  { text: 'Keep it', style: 'cancel' },
                  { text: 'Cancel huddle', style: 'destructive', onPress: () => { setConfirmingCancel(true); doCancel(); } },
                ],
              );
            }}
            color={T.accent}
            style={{ marginTop: 10 }}
          >
            Cancel huddle
          </TextBtn>
        )
      )}

      <TextBtn onPress={() => router.back()} style={{ marginTop: 2 }}>Close</TextBtn>
    </SheetFrame>
  );
}
