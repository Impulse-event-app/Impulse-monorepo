// Huddle Pay — one booking, split between friends. The person booking
// invites people straight into each spot (search Impulse, or send a link),
// sets the split, and pays their own share to lock the slot in. Invitees
// see the plan right away and pay once it's locked. Everyone watches the
// avatars fill in realtime; when the last share lands every phone shows the
// same code at once.
import { useCallback, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Platform, ScrollView, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontMono, fontUI, useApp } from '../../../src/theme';
import {
  declineSeat, editSplit, getSplit, inviteToSeat, removeSeat,
  ApiBookingView, ApiError, Participant, UserSearchResult,
} from '../../../src/api';
import { BackButton, Group, HuddleMark, Label, NUM, ReadableColumn, Row, ScreenTitle, TextBtn } from '../../../src/components';
import { Plus } from '../../../src/icons';
import { Completion, LiveMeter, SplitSelector, fmtCents, inviteLine, seatUrl, useLiveBooking } from '../../../src/split';
import { SharePay, shareTerms } from '../../../src/SharePay';
import { InviteSheet } from '../../../src/InviteSheet';
import { hapticError, hapticSuccess } from '../../../src/haptics';

function when(v: ApiBookingView): string {
  return [v.deal?.date?.split(' ')[0], v.slot_time].filter(Boolean).join(' ');
}

const OPEN = 'Open spot';

function seatName(p: Participant): string {
  if (p.is_me) return 'You';
  return p.claimed ? p.display_name : OPEN;
}

function seatStatus(p: Participant): string {
  if (p.state === 'covered') return 'You’re covering this one';
  if (p.state === 'paid' || p.state === 'guaranteed' || p.state === 'settled') return 'In';
  if (!p.claimed) return 'Not invited yet';
  return p.invited ? 'Invited' : 'Seen it';
}

export default function HuddlePayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { T, refreshBookings } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { view, setView, refresh } = useLiveBooking(id, getSplit);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inviteFor, setInviteFor] = useState<Participant | null>(null);

  const fail = (title: string) => (err: unknown) => {
    hapticError();
    Alert.alert(title, err instanceof ApiError ? err.message : 'Please try again.');
  };

  const shareLink = useCallback(async (v: ApiBookingView, p: Participant) => {
    if (!p.seat_token || !v.deal) return;
    const url = seatUrl(p.seat_token);
    const line = inviteLine({ initiator: 'You', venue: v.deal.venue_name, when: when(v), shareCents: p.share_cents ?? 0 });
    if (Platform.OS === 'web') {
      try { await navigator.clipboard.writeText(`${line} ${url}`); } catch { Alert.alert('Invite link', url); }
      return;
    }
    await Share.share({ message: `${line} ${url}` }).catch(() => {});
  }, []);

  const invite = async (v: ApiBookingView, p: Participant, u: UserSearchResult) => {
    setInviteFor(null);
    try {
      setView(await inviteToSeat(v.id, p.id, u.id));
      hapticSuccess();
    } catch (err) {
      fail("Couldn't invite them")(err);
    }
  };

  const remove = (v: ApiBookingView, p: Participant) => {
    const go = () => removeSeat(v.id, p.id).then(setView).catch(fail("Couldn't change the group"));
    if (Platform.OS === 'web') { go(); return; }
    Alert.alert(`Take ${p.claimed ? p.display_name : 'this spot'} out?`, 'The group gets one smaller and the shares that aren’t paid re-split.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Take out', style: 'destructive', onPress: go },
    ]);
  };

  const seatActions = (v: ApiBookingView, p: Participant) => {
    if (!p.claimed) { setInviteFor(p); return; }
    const options: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];
    if (p.invited) options.push({ text: 'Invite someone else', onPress: () => setInviteFor(p) });
    options.push({ text: 'Take them out', style: 'destructive', onPress: () => remove(v, p) });
    options.push({ text: 'Close', style: 'cancel' });
    if (Platform.OS === 'web') { remove(v, p); return; }
    Alert.alert(p.display_name, `${fmtCents(p.share_cents ?? 0)} · ${seatStatus(p)}`, options);
  };

  const decline = (v: ApiBookingView) => {
    const go = async () => {
      try {
        await declineSeat(v.id);
        refreshBookings();
        router.replace('/(user)/plans');
      } catch (err) {
        fail("Couldn't update that")(err);
      }
    };
    if (Platform.OS === 'web') { go(); return; }
    Alert.alert("Can't make it?", `${v.initiator_name} will see your spot is open again.`, [
      { text: 'Keep my spot', style: 'cancel' },
      { text: "I can't make it", style: 'destructive', onPress: go },
    ]);
  };

  if (!view) {
    return (
      <View style={{ flex: 1, backgroundColor: T.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={T.accent} />
      </View>
    );
  }

  const v = view;
  const done = v.status === 'confirmed' || v.status === 'redeemed';
  const collecting = v.status === 'collecting';
  const myShare = v.my_share;
  const others = v.participants.filter((p) => !p.is_initiator);
  const canEdit = v.is_initiator && collecting;
  const unpaidOthers = others.filter((p) => p.state === 'waiting');

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 60, paddingHorizontal: 16, paddingBottom: 60 }}
      >
        <ReadableColumn>
          {done ? (
            <Completion view={v} />
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <HuddleMark size={30} />
                <Label>Huddle Pay</Label>
              </View>
              <ScreenTitle style={{ marginTop: 10 }}>{v.deal?.venue_name ?? 'Your booking'}</ScreenTitle>
              <Text style={{ ...fontUI(400), fontSize: 17, color: T.muted, marginTop: 7 }}>
                {[v.deal?.title, when(v), `${v.group_size} people`].filter(Boolean).join(' · ')}
              </Text>
            </>
          )}

          {/* Once it's locked in, the live meter leads. */}
          {v.locked_in && !done && (
            <View style={{ marginTop: 28 }}>
              <LiveMeter view={v} />
            </View>
          )}

          {/* ── The person booking: who's coming, the split, lock it in ── */}
          {canEdit && !editing && (
            <>
              <Group label="Who's coming" footer={v.locked_in ? undefined : 'Invite people now — they can see the plan and pay once you’ve locked it in.'}>
                <Row label="You" value={fmtCents(myShare?.share_cents ?? 0)} sublabel={v.locked_in ? 'In' : 'Paying below'} />
                {others.map((p) => {
                  const settledSeat = p.state !== 'waiting' && p.state !== 'covered';
                  return p.claimed ? (
                    <Row
                      key={p.id}
                      label={p.display_name}
                      sublabel={seatStatus(p)}
                      value={fmtCents(p.share_cents ?? 0)}
                      onPress={settledSeat ? undefined : () => seatActions(v, p)}
                    />
                  ) : (
                    <Row
                      key={p.id}
                      icon={<Plus size={13} color={T.accent} />}
                      label="Invite someone"
                      sublabel={p.state === 'covered' ? 'You’re covering this spot' : undefined}
                      value={fmtCents(p.share_cents ?? 0)}
                      accent
                      onPress={() => setInviteFor(p)}
                    />
                  );
                })}
              </Group>
              <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ ...fontUI(400), fontSize: 15, color: T.muted }}>
                  {v.split_mode === 'even' ? 'Split evenly' : 'Split your way'} · {fmtCents(v.locked_price_cents ?? 0)} total
                </Text>
                <TextBtn onPress={() => setEditing(true)} color={T.accent} size={15}>Change</TextBtn>
              </View>
              {unpaidOthers.length > 0 && v.locked_in && (
                <Label style={{ marginTop: 16, lineHeight: 18 }}>
                  Anything still open an hour before you go is added to your card, so the booking's safe either way.
                </Label>
              )}
            </>
          )}

          {canEdit && editing && (
            <View style={{ marginTop: 28 }}>
              <SplitSelector
                seats={v.participants.map((p) => ({
                  name: seatName(p),
                  locked: p.state === 'paid' || p.state === 'guaranteed',
                }))}
                totalCents={v.locked_price_cents ?? 0}
                initialMode={v.split_mode}
                initialAmounts={v.participants.map((p) => p.share_cents ?? 0)}
                initialCovers={v.participants
                  .map((p, i) => (p.state === 'covered' ? { covered: i, coverer: 0 } : null))
                  .filter((c): c is { covered: number; coverer: number } => c !== null)}
                submitLabel="Save the split"
                submitting={saving}
                onSubmit={async (r) => {
                  setSaving(true);
                  try {
                    const ids = v.participants.map((p) => p.id);
                    setView(await editSplit(v.id, {
                      split_mode: r.mode,
                      amounts: r.mode === 'custom' ? Object.fromEntries(ids.map((pid, i) => [pid, r.amounts[i]])) : undefined,
                      covers: Object.fromEntries(r.covers.map((c) => [ids[c.covered], ids[c.coverer]])),
                    }));
                    setEditing(false);
                  } catch (err) {
                    fail("Couldn't save the split")(err);
                  } finally {
                    setSaving(false);
                  }
                }}
              />
              <TextBtn onPress={() => setEditing(false)} style={{ marginTop: 6 }}>Never mind</TextBtn>
            </View>
          )}

          {canEdit && !editing && !v.locked_in && myShare && (
            <View style={{ marginTop: 32 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Text style={{ ...fontUI(500), fontSize: 17, color: T.text }}>Your share</Text>
                <Text style={{ ...fontMono(600), fontSize: 24, color: T.text, ...NUM }}>{fmtCents(myShare.share_cents)}</Text>
              </View>
              <Label style={{ marginTop: 6, lineHeight: 18 }}>{shareTerms(myShare)}</Label>
              <View style={{ marginTop: 16 }}>
                <SharePay
                  bookingId={v.id}
                  share={myShare}
                  label={`Pay my ${fmtCents(myShare.deposit_cents)} and lock it in`}
                  onPaid={() => { hapticSuccess(); refresh(); }}
                  onShareChanged={refresh}
                />
              </View>
            </View>
          )}

          {/* ── Invited friend ── */}
          {!v.is_initiator && collecting && myShare && (
            <View style={{ marginTop: 28 }}>
              <Text style={{ ...fontUI(400), fontSize: 17, lineHeight: 24, color: T.text }}>
                {v.initiator_name} booked {v.deal?.venue_name}, {when(v)}
                {myShare.covered_by_name
                  ? ` — ${myShare.covered_by_name} has your share covered.`
                  : ` — your share is ${fmtCents(myShare.share_cents)}.`}
              </Text>
              {myShare.status === 'unpaid' && myShare.share_cents > 0 && (
                v.locked_in ? (
                  <>
                    <Label style={{ marginTop: 6 }}>{shareTerms(myShare)}</Label>
                    <View style={{ marginTop: 16 }}>
                      <SharePay bookingId={v.id} share={myShare} onPaid={refresh} onShareChanged={refresh} />
                    </View>
                  </>
                ) : (
                  <Label style={{ marginTop: 10, lineHeight: 18 }}>
                    {v.initiator_name} is locking it in — you can confirm your spot as soon as they have.
                  </Label>
                )
              )}
              {myShare.status === 'unpaid' && (
                <TextBtn onPress={() => decline(v)} style={{ marginTop: 12 }}>I can't make it</TextBtn>
              )}
            </View>
          )}

          {done && (
            <TextBtn onPress={() => { refreshBookings(); router.replace('/(user)/plans'); }} style={{ marginTop: 28 }}>
              Go to Plans
            </TextBtn>
          )}
          {!collecting && !done && (
            <Label style={{ marginTop: 24 }}>This booking didn't go ahead.</Label>
          )}
        </ReadableColumn>
      </ScrollView>

      <View style={{ position: 'absolute', top: insets.top + 4, left: 16, zIndex: 22 }}>
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/(user)/plans'))} />
      </View>

      <InviteSheet
        visible={!!inviteFor}
        onPick={(u) => inviteFor && invite(v, inviteFor, u)}
        onShareLink={inviteFor?.seat_token && inviteFor.share_cents !== null
          ? () => { const p = inviteFor; setInviteFor(null); shareLink(v, p); }
          : undefined}
        onClose={() => setInviteFor(null)}
      />
    </View>
  );
}
