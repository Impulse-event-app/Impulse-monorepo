// split.tsx — the shared split experience for direct bookings and Huddles.
//
//  - SplitSelector: "Split evenly" (default, one tap) or "Not even" with
//    per-person dollar amounts (drag or type) and a remaining-balance line.
//    Tapping someone offers "Cover their share". Dollars only, never %.
//  - LiveMeter: avatars fill as people pay; what's still to come in counts
//    down. No ordering, no "fastest", nothing that singles anyone out.
//  - Completion: the one code everyone sees at the same moment.
//  - useLiveBooking: realtime on the bookings row (the backend bumps
//    updated_at on every change) with a slow poll as a safety net.
//
// Amount math mirrors backend/booking_logic.py exactly — the server is the
// authority and re-validates everything; this only keeps the screen honest.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Animated, PanResponder, Platform, Pressable, Text, TextInput, View,
} from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { fontMono, fontUI, useApp } from './theme';
import { supabase } from './supabase';
import { Btn, Chip, CodeDisplay, EASE, Label, NUM, useReduceMotion } from './components';
import { Check } from './icons';
import { hapticSelection, hapticSuccess } from './haptics';
import type { ApiBookingView, Participant, SeatCover, SplitMode } from './api';

export const fmtCents = (c: number) => `$${(c / 100).toFixed(2)}`;

const DRAG_STEP = 50;          // drag snaps to 50c; typing is exact to the cent
const POLL_MS = 15000;         // realtime is primary; this only catches a missed event

// ── amount math (mirrors booking_logic.py) ───────────────────

/** Even split: base each, the remainder on seat 0 (the person booking). */
export function evenAmounts(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => base + (i === 0 ? total - base * n : 0));
}

/** Re-split what's left across seats that haven't paid (recalc_unpaid). */
export function recalcUnpaid(total: number, current: number[], locked: boolean[], covers: Map<number, number>): number[] {
  const fixedTotal = current.reduce((s, a, i) => s + (locked[i] ? a : 0), 0);
  const remaining = total - fixedTotal;
  const open = current.map((_, i) => i).filter((i) => !locked[i] && !(covers.has(i) && locked[covers.get(i)!]));
  const next = current.map((a, i) => (locked[i] ? a : 0));
  if (!open.length || remaining < 0) return current;
  const payers = open.filter((i) => !covers.has(i));
  if (!payers.length) return current;
  const base = Math.floor(remaining / open.length);
  open.forEach((i) => { next[i] = base; });
  next[payers[0]] += remaining - base * open.length;
  covers.forEach((coverer, covered) => {
    if (open.includes(covered)) { next[coverer] += next[covered]; next[covered] = 0; }
  });
  return next;
}

// ── links + invitation copy ──────────────────────────────────

export function seatUrl(token: string): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/seat/${token}`;
  }
  return `${(process.env.EXPO_PUBLIC_WEB_URL ?? 'https://impulse.expo.app').replace(/\/$/, '')}/seat/${token}`;
}

/** An invitation, not an invoice. */
export function inviteLine(o: { initiator: string; venue: string; when: string; shareCents: number }): string {
  const who = o.initiator === 'You' ? 'I' : o.initiator;
  return `${who} booked ${o.venue}, ${o.when} — your share is ${fmtCents(o.shareCents)}.`;
}

// ── realtime ─────────────────────────────────────────────────

/** Live booking state. Every participant's screen refetches on the same
 *  realtime poke, so the final share lands everywhere at once; the success
 *  haptic fires exactly once, on the transition to confirmed. */
export function useLiveBooking(id: string | undefined, fetcher: (id: string) => Promise<ApiBookingView>) {
  const [view, setView] = useState<ApiBookingView | null>(null);
  const lastStatus = useRef<string | null>(null);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    if (!id) return;
    const mine = ++seq.current;
    try {
      const next = await fetcher(id);
      if (mine !== seq.current) return;   // a newer fetch already landed
      if (lastStatus.current && lastStatus.current !== 'confirmed' && next.status === 'confirmed') {
        hapticSuccess();
      }
      lastStatus.current = next.status;
      setView(next);
    } catch {
      // keep the last known state; the next poke or poll retries
    }
  }, [id, fetcher]);

  useEffect(() => {
    if (!id) return;
    refresh();
    let channel: RealtimeChannel | null = supabase
      .channel(`booking-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bookings', filter: `id=eq.${id}` },
        () => { refresh(); },
      )
      .subscribe();
    const t = setInterval(refresh, POLL_MS);
    return () => {
      clearInterval(t);
      channel?.unsubscribe();
      channel = null;
    };
  }, [id, refresh]);

  return { view, setView, refresh };
}

// ── Split selector ───────────────────────────────────────────

export type SplitSeat = { name: string; locked?: boolean };
export type SplitResult = { mode: SplitMode; amounts: number[]; covers: SeatCover[] };

/** Seat 0 is always the person choosing (the one booking); covering adds
 *  to their amount. Locked seats have paid and never change. */
export function SplitSelector({
  seats, totalCents, initialMode = 'even', initialAmounts, initialCovers = [], submitLabel, submitting, onSubmit,
}: {
  seats: SplitSeat[];
  totalCents: number;
  initialMode?: SplitMode;
  initialAmounts?: number[];
  initialCovers?: SeatCover[];
  submitLabel: string;
  submitting?: boolean;
  onSubmit: (r: SplitResult) => void;
}) {
  const { T } = useApp();
  const n = seats.length;
  const locked = useMemo(() => seats.map((s) => !!s.locked), [seats]);
  const [mode, setMode] = useState<SplitMode>(initialMode);
  const [covers, setCovers] = useState<Map<number, number>>(
    () => new Map(initialCovers.map((c) => [c.covered, c.coverer])),
  );
  const [custom, setCustom] = useState<number[]>(() => initialAmounts ?? evenAmounts(totalCents, n));

  const evenNow = useMemo(
    () => (locked.some(Boolean) && initialAmounts
      ? recalcUnpaid(totalCents, initialAmounts, locked, covers)
      : recalcUnpaid(totalCents, evenAmounts(totalCents, n), locked, covers)),
    [totalCents, n, locked, covers, initialAmounts],
  );
  const amounts = mode === 'even' ? evenNow : custom;
  const remaining = totalCents - amounts.reduce((s, a) => s + a, 0);
  const canCover = !locked[0];

  const setAmount = (i: number, cents: number) => {
    setCustom((prev) => prev.map((a, j) => (j === i ? Math.max(0, Math.min(totalCents, cents)) : a)));
  };

  // In "Not even", covering moves exactly that seat's amount onto seat 0;
  // undoing moves the same amount back.
  const moved = useRef(new Map<number, number>());
  const toggleCover = (i: number) => {
    hapticSelection();
    const next = new Map(covers);
    if (next.has(i)) {
      next.delete(i);
      const back = moved.current.get(i) ?? 0;
      moved.current.delete(i);
      if (mode === 'custom') setCustom((prev) => prev.map((a, j) => (j === i ? back : j === 0 ? a - back : a)));
    } else {
      next.set(i, 0);
      moved.current.set(i, custom[i]);
      if (mode === 'custom') setCustom((prev) => prev.map((a, j) => (j === 0 ? a + prev[i] : j === i ? 0 : a)));
    }
    setCovers(next);
  };

  const offerCover = (i: number) => {
    if (i === 0 || locked[i] || !canCover) return;
    const name = seats[i].name;
    if (covers.has(i)) { toggleCover(i); return; }
    if (Platform.OS === 'web') { toggleCover(i); return; }
    Alert.alert(name, `Add ${fmtCents(amounts[i])} to your share so ${name} doesn't pay anything?`, [
      { text: 'Not now', style: 'cancel' },
      { text: 'Cover their share', onPress: () => toggleCover(i) },
    ]);
  };

  const submit = () => {
    const coverList = [...covers.keys()].map((covered) => ({ covered, coverer: 0 }));
    onSubmit({ mode, amounts, covers: coverList });
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip active={mode === 'even'} onPress={() => { hapticSelection(); setMode('even'); }}>Split evenly</Chip>
        <Chip
          active={mode === 'custom'}
          onPress={() => { hapticSelection(); setCustom(evenNow); setMode('custom'); }}
        >
          Not even
        </Chip>
      </View>

      <View style={{ marginTop: 16, backgroundColor: T.surface, borderCurve: 'continuous', borderRadius: 12, borderWidth: 1, borderColor: T.line }}>
        {seats.map((seat, i) => (
          <View key={i}>
            <SplitRow
              name={i === 0 ? `${seat.name} (you)` : seat.name}
              cents={amounts[i]}
              totalCents={totalCents}
              editable={mode === 'custom' && !locked[i] && !covers.has(i)}
              note={locked[i] ? 'Paid' : covers.has(i) ? 'Covered by you' : undefined}
              onAvatar={i > 0 && canCover && !locked[i] ? () => offerCover(i) : undefined}
              onChange={(c) => setAmount(i, c)}
            />
            {i < n - 1 && <View style={{ height: 0.5, backgroundColor: T.line, marginLeft: 64 }} />}
          </View>
        ))}
      </View>

      {canCover && n > 1 && (
        <Label style={{ marginTop: 8, marginHorizontal: 4 }}>Tap someone to cover their share.</Label>
      )}

      {/* Persistent remaining balance — the submit waits until it's exactly zero. */}
      <View
        accessibilityLiveRegion="polite"
        style={{
          marginTop: 16, paddingVertical: 12, paddingHorizontal: 14, borderCurve: 'continuous', borderRadius: 12,
          backgroundColor: remaining === 0 ? T.accentSoft : T.fill,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <Text style={{ ...fontUI(500), fontSize: 15, color: T.text }}>
          {remaining === 0 ? 'Adds up' : remaining > 0 ? 'Left to split' : 'Over by'}
        </Text>
        <Text style={{ ...fontMono(600), fontSize: 17, color: remaining === 0 ? T.accent : T.text, ...NUM }}>
          {remaining === 0 ? fmtCents(totalCents) : fmtCents(Math.abs(remaining))}
        </Text>
      </View>

      <View style={{ marginTop: 16 }}>
        <Btn full disabled={remaining !== 0 || submitting} onPress={submit}>{submitLabel}</Btn>
      </View>
    </View>
  );
}

function Avatar({ name, filled, size = 36 }: { name: string; filled?: Animated.AnimatedInterpolation<number> | number; size?: number }) {
  const { T } = useApp();
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const fill = typeof filled === 'number' ? new Animated.Value(filled) : filled ?? new Animated.Value(0);
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          position: 'absolute', width: size, height: size, borderCurve: 'continuous', borderRadius: size / 2,
          backgroundColor: T.surface2, borderWidth: 1, borderColor: T.line,
        }}
      />
      <Animated.View
        style={{
          position: 'absolute', width: size, height: size, borderCurve: 'continuous', borderRadius: size / 2,
          backgroundColor: T.accent, opacity: fill, transform: [{ scale: fill.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
        }}
      />
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ ...fontUI(600), fontSize: size * 0.4, color: T.text }}>{initial}</Text>
      </View>
    </View>
  );
}

function SplitRow({
  name, cents, totalCents, editable, note, onAvatar, onChange,
}: {
  name: string;
  cents: number;
  totalCents: number;
  editable: boolean;
  note?: string;
  onAvatar?: () => void;
  onChange: (cents: number) => void;
}) {
  const { T } = useApp();
  const [text, setText] = useState(fmtCents(cents).slice(1));
  const [focused, setFocused] = useState(false);
  const width = useRef(1);
  const startCents = useRef(cents);

  // Reflect outside changes (drag, cover, mode switch) unless mid-typing.
  useEffect(() => { if (!focused) setText((cents / 100).toFixed(2)); }, [cents, focused]);

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => editable,
    onMoveShouldSetPanResponder: (_e, g) => editable && Math.abs(g.dx) > 4,
    onPanResponderGrant: () => { startCents.current = cents; },
    onPanResponderMove: (_e, g) => {
      const delta = (g.dx / width.current) * totalCents;
      onChange(Math.round((startCents.current + delta) / DRAG_STEP) * DRAG_STEP);
    },
    onPanResponderRelease: () => hapticSelection(),
  }), [editable, cents, totalCents, onChange]);

  const pct = totalCents > 0 ? Math.min(1, cents / totalCents) : 0;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, paddingHorizontal: 14, minHeight: 60 }}>
      <Pressable
        onPress={onAvatar}
        disabled={!onAvatar}
        accessibilityRole={onAvatar ? 'button' : undefined}
        accessibilityLabel={onAvatar ? `${name}. Cover their share` : name}
      >
        <Avatar name={name} filled={note ? 1 : 0} />
      </Pressable>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ ...fontUI(500), fontSize: 15, color: T.text }}>{name}</Text>
        {editable ? (
          <View
            {...pan.panHandlers}
            onLayout={(e) => { width.current = Math.max(1, e.nativeEvent.layout.width); }}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={`${name}'s share`}
            accessibilityValue={{ text: fmtCents(cents) }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) => onChange(cents + (e.nativeEvent.actionName === 'increment' ? 100 : -100))}
            style={{ marginTop: 8, height: 22, justifyContent: 'center' }}
          >
            <View style={{ height: 4, borderRadius: 2, backgroundColor: T.fill }} />
            <View style={{ position: 'absolute', height: 4, borderRadius: 2, width: `${pct * 100}%`, backgroundColor: T.accent }} />
            <View
              style={{
                position: 'absolute', left: `${pct * 100}%`, marginLeft: -9, width: 18, height: 18, borderRadius: 9,
                backgroundColor: T.surface, borderWidth: 1, borderColor: T.line2,
              }}
            />
          </View>
        ) : note ? (
          <Text style={{ marginTop: 2, ...fontUI(400), fontSize: 13, color: T.muted }}>{note}</Text>
        ) : null}
      </View>
      {editable ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: T.fill, borderCurve: 'continuous', borderRadius: 8, paddingHorizontal: 8 }}>
          <Text style={{ ...fontMono(500), fontSize: 16, color: T.muted }}>$</Text>
          <TextInput
            value={text}
            onChangeText={(t) => {
              const clean = t.replace(/[^0-9.]/g, '');
              setText(clean);
              const v = Number.parseFloat(clean);
              onChange(Number.isFinite(v) ? Math.round(v * 100) : 0);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            keyboardType="decimal-pad"
            accessibilityLabel={`${name}'s share in dollars`}
            style={{ ...fontMono(500), fontSize: 16, color: T.text, minWidth: 64, paddingVertical: 8, textAlign: 'right', ...NUM }}
          />
        </View>
      ) : (
        <Text style={{ ...fontMono(500), fontSize: 16, color: T.text, ...NUM }}>{fmtCents(cents)}</Text>
      )}
    </View>
  );
}

// ── Live meter ───────────────────────────────────────────────

const IN_STATES = new Set(['paid', 'guaranteed', 'covered', 'settled']);

function MeterAvatar({ p }: { p: Participant }) {
  const { T } = useApp();
  const reduceMotion = useReduceMotion();
  const done = IN_STATES.has(p.state);
  const fill = useRef(new Animated.Value(done ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) { fill.setValue(done ? 1 : 0); return; }
    Animated.timing(fill, { toValue: done ? 1 : 0, duration: 520, easing: EASE, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [done, fill, reduceMotion]);
  const name = p.is_me ? 'You' : p.claimed ? p.display_name : (p.seat_label ?? 'Invite');
  return (
    <View style={{ alignItems: 'center', width: 64 }} accessible accessibilityLabel={`${name}, ${done ? 'in' : 'invited'}`}>
      <Avatar name={name} filled={fill} size={48} />
      <Text numberOfLines={1} style={{ marginTop: 6, ...fontUI(500), fontSize: 12, color: T.text, maxWidth: 62 }}>{name}</Text>
      <Text style={{ ...fontUI(400), fontSize: 12, color: done ? T.accent : T.muted }}>
        {p.state === 'covered' ? 'Covered' : done ? 'In' : 'Invited'}
      </Text>
    </View>
  );
}

/** Counts a cents amount smoothly toward its new value. */
function useCountdown(cents: number): string {
  const reduceMotion = useReduceMotion();
  const v = useRef(new Animated.Value(cents)).current;
  const [shown, setShown] = useState(cents);
  useEffect(() => {
    const id = v.addListener(({ value }) => setShown(Math.round(value)));
    return () => v.removeListener(id);
  }, [v]);
  useEffect(() => {
    if (reduceMotion) { v.setValue(cents); setShown(cents); return; }
    Animated.timing(v, { toValue: cents, duration: 700, easing: EASE, useNativeDriver: false }).start();
  }, [cents, v, reduceMotion]);
  return fmtCents(shown);
}

export function LiveMeter({ view }: { view: ApiBookingView }) {
  const { T } = useApp();
  const inCount = view.participants.filter((p) => IN_STATES.has(p.state)).length;
  const toCome = useCountdown(view.initiator_exposure_cents ?? 0);
  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {view.participants.map((p) => <MeterAvatar key={p.id} p={p} />)}
      </View>
      <View style={{ marginTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={{ ...fontUI(500), fontSize: 15, color: T.text, ...NUM }}>{inCount} of {view.group_size} in</Text>
        {view.initiator_exposure_cents !== null && view.status === 'collecting' && (
          <Text accessibilityLiveRegion="polite" style={{ ...fontMono(500), fontSize: 15, color: T.muted, ...NUM }}>
            {toCome} still to come in
          </Text>
        )}
      </View>
    </View>
  );
}

// ── Completion ───────────────────────────────────────────────

export function Completion({ view }: { view: ApiBookingView }) {
  const { T } = useApp();
  if (!view.confirmation_code) return null;
  const when = [view.deal?.date, view.slot_time].filter(Boolean).join(' ');
  return (
    <View style={{ alignItems: 'center', gap: 12 }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' }}>
        <Check size={18} color={T.accentInk} />
      </View>
      <Text accessibilityRole="header" style={{ ...fontUI(600), fontSize: 22, letterSpacing: -0.48, color: T.text }}>You're all set</Text>
      {!!view.deal && (
        <Text style={{ ...fontUI(400), fontSize: 15, color: T.muted, textAlign: 'center' }}>
          {view.deal.venue_name}{when ? ` · ${when}` : ''}
        </Text>
      )}
      <CodeDisplay code={view.confirmation_code} size="lg" label="One code for everyone" />
      <Label style={{ textAlign: 'center' }}>Show it at the door.</Label>
    </View>
  );
}
