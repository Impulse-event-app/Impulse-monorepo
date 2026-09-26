// Huddle status — a bottom sheet over the app. Shows the join link and N avatar
// slots filling in live, a "Vote your top 3" button that turns the home feed
// into the ballot, and (after resolution) the shared split flow: the creator
// picks how to split, everyone confirms their share, the live meter fills,
// and the one code appears on every phone at once. Live via realtime.
import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Platform, Share, Text, View } from 'react-native';
import { fontMono, fontUI, useApp } from '../../../src/theme';
import { editSplit, getHuddle, getHuddleCandidates, cancelHuddle, ApiError } from '../../../src/api';
import QRCode from 'react-native-qrcode-svg';
import {
  Btn,
  HuddleMark,
  Label,
  LiveDot,
  SheetFrame,
  TextBtn,
} from '../../../src/components';
import { Check, ShareGlyph } from '../../../src/icons';
import { hapticError } from '../../../src/haptics';
import { Completion, LiveMeter, SplitSelector, fmtCents, useLiveBooking } from '../../../src/split';
import { SharePay, shareTerms } from '../../../src/SharePay';

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
  const { id } = useLocalSearchParams<{ id: string }>();
  const { T, startVoting, setActiveHuddle } = useApp();
  const router = useRouter();
  const { view: huddle, setView: setHuddle, refresh } = useLiveBooking(id, getHuddle);
  const [copied, setCopied] = useState(false);
  const [savingSplit, setSavingSplit] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const share = async () => {
    if (!huddle?.join_token) return;
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
      const cands = await getHuddleCandidates(id);
      startVoting({ huddleId: id, candidateIds: cands.map((d) => d.id) });
      router.back();   // reveal home in voting mode
    } catch (err) {
      Alert.alert('Could not load deals', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  const doCancel = async () => {
    if (!id) return;
    setCancelling(true);
    try {
      await cancelHuddle(id);
      setActiveHuddle(null);   // home card reverts to "Start a huddle"
      router.back();
    } catch (err) {
      Alert.alert('Could not cancel', err instanceof ApiError ? err.message : 'Please try again.');
      setCancelling(false);
      setConfirmingCancel(false);
    }
  };

  const filled = huddle?.participants ?? [];
  const emptyCount = huddle ? Math.max(0, huddle.group_size - filled.length) : 0;
  const canVote = huddle?.status === 'voting' && !huddle.my_has_voted && !!huddle.my_member_id;
  const imCreator = !!huddle?.is_initiator;
  // Creator can call it off until the group is confirmed.
  const canCancel = imCreator && (huddle?.status === 'voting' || huddle?.status === 'collecting');
  const resolved = huddle && ['collecting', 'confirmed', 'redeemed'].includes(huddle.status);
  const done = huddle && ['confirmed', 'redeemed'].includes(huddle.status);
  const paidCount = filled.filter((m) => m.state === 'paid').length;
  const stage = !huddle ? 0
    : huddle.status === 'voting' ? 0
    : huddle.status === 'collecting' ? 1
    : done ? 2 : 0;
  const myShare = huddle?.my_share ?? null;

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

      {!!huddle && !resolved && (
        <Text style={{ marginTop: 16, ...fontUI(400), fontSize: 15, lineHeight: 21, letterSpacing: -0.12, color: T.muted }}>
          {huddle.my_has_voted
            ? `Your vote is in. ${filled.filter((m) => m.has_voted).length} of ${huddle.group_size} have voted.`
            : `${filled.length} of ${huddle.group_size} in. The result locks when everyone votes.`}
        </Text>
      )}

      {/* member slots while voting; the live meter takes over after */}
      {!resolved && (
        <View style={{ marginTop: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {filled.map((m) => <AvatarSlot key={m.id} name={m.display_name} voted={m.has_voted} />)}
          {[...Array(emptyCount)].map((_, i) => <AvatarSlot key={`e-${i}`} empty />)}
        </View>
      )}

      {canVote && (
        <View style={{ marginTop: 22 }}>
          <Btn full onPress={goVote}>Vote your top 3</Btn>
        </View>
      )}

      {/* join QR + link while voting */}
      {huddle && huddle.status === 'voting' && huddle.join_token && (
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

      {/* resolved: winner → split → shares → code */}
      {resolved && huddle.deal && (
        <View style={card}>
          {done ? (
            <Completion view={huddle} />
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <LiveDot color={T.accent} />
                <Text style={{ ...fontUI(500), fontSize: 13, color: T.accent }}>It's decided</Text>
              </View>
              <Text style={{ marginTop: 8, ...fontUI(600), fontSize: 22, letterSpacing: -0.48, color: T.text }}>{huddle.deal.venue_name}</Text>
              <Text style={{ marginTop: 2, ...fontUI(400), fontSize: 15, color: T.muted }}>{huddle.deal.title}</Text>
            </>
          )}

          {!huddle.split_confirmed && huddle.status === 'collecting' && (
            imCreator ? (
              <View style={{ marginTop: 18 }}>
                <Text style={{ ...fontUI(500), fontSize: 15, color: T.text, marginBottom: 12 }}>How are you splitting it?</Text>
                <SplitSelector
                  seats={filled.map((p) => ({ name: p.is_me ? 'You' : p.display_name }))}
                  totalCents={huddle.locked_price_cents ?? 0}
                  submitLabel="Confirm the split"
                  submitting={savingSplit}
                  onSubmit={async (r) => {
                    setSavingSplit(true);
                    try {
                      const ids = filled.map((p) => p.id);
                      setHuddle(await editSplit(huddle.id, {
                        split_mode: r.mode,
                        amounts: r.mode === 'custom' ? Object.fromEntries(ids.map((pid, i) => [pid, r.amounts[i]])) : undefined,
                        covers: Object.fromEntries(r.covers.map((c) => [ids[c.covered], ids[c.coverer]])),
                      }));
                    } catch (err) {
                      hapticError();
                      Alert.alert("Couldn't save the split", err instanceof ApiError ? err.message : 'Please try again.');
                    } finally {
                      setSavingSplit(false);
                    }
                  }}
                />
              </View>
            ) : (
              <Text style={{ marginTop: 14, ...fontUI(400, 15), fontSize: 15, lineHeight: 21, color: T.muted }}>
                {huddle.initiator_name} is sorting out the split — you'll see your share here in a moment.
              </Text>
            )
          )}

          {huddle.split_confirmed && huddle.status === 'collecting' && myShare && (
            <View style={{ marginTop: 16 }}>
              <Text style={{ ...fontUI(400, 15), fontSize: 15, lineHeight: 21, color: T.text }}>
                {myShare.covered_by_name
                  ? `${myShare.covered_by_name} has your share covered.`
                  : `Your share is ${fmtCents(myShare.share_cents)}.`}
              </Text>
              {myShare.status === 'unpaid' && myShare.share_cents > 0 && (
                <>
                  <Label style={{ marginTop: 6, lineHeight: 18 }}>{shareTerms(myShare)}</Label>
                  <View style={{ marginTop: 14 }}>
                    <SharePay bookingId={huddle.id} share={myShare} onPaid={refresh} onShareChanged={refresh} />
                  </View>
                </>
              )}
              <View style={{ marginTop: 20 }}>
                <LiveMeter view={huddle} />
              </View>
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
