import React, { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  Text,
  View,
} from 'react-native';
import {
  CATEGORIES,
  DEFAULT_FILTERS,
  Filters,
  applyFilters,
  money,
} from '../../src/data';
import { fontMono, fontUI, useApp } from '../../src/theme';
import { Btn, Chip, NATIVE_SHEETS, SheetFrame, TextBtn } from '../../src/components';
import { hapticSelection } from '../../src/haptics';

const ACTS = CATEGORIES.filter((c) => c !== 'All');
const SORTS = [
  { id: 'closest', label: 'Closest' },
  { id: 'price', label: 'Lowest price' },
  { id: 'rating', label: 'Top rated' },
] as const;

function FRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  const { T } = useApp();
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 20, borderTopWidth: 0.5, borderTopColor: T.line }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 12, marginBottom: 14 }}>
        <Text accessibilityRole="header" style={{ ...fontUI(500), fontSize: 17, letterSpacing: -0.19, color: T.text }}>{label}</Text>
        {hint && <Text style={{ ...fontUI(400, 13), fontSize: 13, color: T.muted }}>{hint}</Text>}
      </View>
      {children}
    </View>
  );
}

function Segmented({ value, options, onChange }: { value: string; options: { id: string; label: string }[]; onChange: (id: string) => void }) {
  const { T } = useApp();
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', backgroundColor: T.fill, borderRadius: 9, padding: 2, gap: 2 }}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <Pressable
            key={o.id}
            onPress={() => { if (!on) { hapticSelection(); onChange(o.id); } }}
            hitSlop={{ top: 6, bottom: 6 }}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            style={{
              flex: 1, minHeight: 32, paddingVertical: 4, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
              backgroundColor: on ? (T.dark ? T.line2 : T.surface) : 'transparent',
              shadowColor: '#000', shadowOpacity: on && !T.dark ? 0.08 : 0, shadowRadius: 1, shadowOffset: { width: 0, height: 1 },
            }}
          >
            <Text style={{ ...fontUI(on ? 600 : 500), fontSize: 13, letterSpacing: -0.05, color: on ? T.text : T.muted, textAlign: 'center' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PartyInline({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { T } = useApp();
  const set = (v: number) => { hapticSelection(); onChange(v); };
  const btn = (label: string, a11y: string, fn: () => void, dis: boolean) => (
    <Pressable
      onPress={dis ? undefined : fn}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled: dis }}
      style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: T.fill, alignItems: 'center', justifyContent: 'center', opacity: dis ? 0.45 : 1 }}
    >
      <Text style={{ fontSize: 20, color: dis ? T.faint : T.text, lineHeight: 24 }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ ...fontUI(400, 15), fontSize: 15, color: T.muted }}>{value === 1 ? 'Just me' : `${value} people`}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        {btn('−', 'Fewer people', () => set(Math.max(1, value - 1)), value <= 1)}
        <Text style={{ ...fontMono(600), fontSize: 19, color: T.text, minWidth: 20, textAlign: 'center' }}>{value}</Text>
        {btn('+', 'More people', () => set(Math.min(10, value + 1)), value >= 10)}
      </View>
    </View>
  );
}

function PriceSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { T } = useApp();
  const MIN = 10;
  const MAX = 200;
  const STEP = 10;
  const widthRef = useRef(1);
  // PanResponder is created once, so read the latest callback through a ref.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const setFromX = (x: number) => {
    const w = widthRef.current;
    const ratio = Math.max(0, Math.min(1, x / w));
    onChangeRef.current(Math.round(MIN + ratio * (MAX - MIN)));
  };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => setFromX(e.nativeEvent.locationX),
      onPanResponderMove: (e: GestureResponderEvent) => setFromX(e.nativeEvent.locationX),
    }),
  ).current;
  const fillPct = ((value - MIN) / (MAX - MIN)) * 100;
  const label = value >= MAX ? 'Any price' : money(value);
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <Text style={{ ...fontUI(400), fontSize: 15, color: T.muted }}>Up to</Text>
        <Text style={{ ...fontMono(600, 19), fontSize: 19, color: T.text }}>{label}</Text>
      </View>
      <View
        {...pan.panHandlers}
        onLayout={(e: LayoutChangeEvent) => (widthRef.current = e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Maximum price"
        accessibilityValue={{ text: label }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'increment') onChange(Math.min(MAX, value + STEP));
          if (e.nativeEvent.actionName === 'decrement') onChange(Math.max(MIN, value - STEP));
        }}
        style={{ height: 44, justifyContent: 'center' }}
      >
        <View pointerEvents="none" style={{ height: 6, borderRadius: 3, backgroundColor: T.fill, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${fillPct}%`, backgroundColor: T.accent }} />
        </View>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute', left: `${fillPct}%`, marginLeft: -13, width: 26, height: 26, borderRadius: 13, backgroundColor: '#fff',
            shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 3,
          }}
        />
      </View>
    </View>
  );
}

export default function FiltersSheet() {
  const { T, filters, setFilters, drops, profile } = useApp();
  const router = useRouter();
  const [f, setF] = useState<Filters>(filters);

  const set = (patch: Partial<Filters>) => setF((p) => ({ ...p, ...patch }));
  const toggle = (key: 'cats' | 'areas', val: string) =>
    setF((p) => ({ ...p, [key]: p[key].includes(val) ? p[key].filter((x) => x !== val) : [...p[key], val] }));

  // Areas from the live feed (plus home suburb and anything already picked, so
  // a selection can always be undone even if its drops have gone).
  const areas = Array.from(new Set([
    ...(profile.suburb ? [profile.suburb] : []),
    ...f.areas,
    ...drops.map((d) => d.suburb).filter(Boolean),
  ]));
  const count = applyFilters(drops, f).length;
  const isDefault = JSON.stringify(f) === JSON.stringify(DEFAULT_FILTERS);

  const close = () => router.back();
  const apply = () => {
    setFilters(f);
    router.back();
  };

  return (
    <SheetFrame
      native={NATIVE_SHEETS}
      onClose={close}
      title="Filters"
      action={
        <TextBtn onPress={() => setF(DEFAULT_FILTERS)} disabled={isDefault} color={isDefault ? T.faint : T.accent}>
          Clear all
        </TextBtn>
      }
      footer={
        <Btn full onPress={apply} disabled={count === 0}>
          {count === 0 ? 'Nothing matches' : `Show ${count}`}
        </Btn>
      }
    >
      <FRow label="What" hint={f.cats.length ? `${f.cats.length} selected` : 'Anything'}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 10 }}>
          {ACTS.map((a) => (
            <Chip key={a} active={f.cats.includes(a)} onPress={() => toggle('cats', a)}>{a}</Chip>
          ))}
        </View>
      </FRow>

      <FRow label="When">
        <Segmented
          value={f.when}
          onChange={(v) => set({ when: v as Filters['when'] })}
          options={[
            { id: 'all', label: 'Anytime' },
            { id: 'now', label: 'On now' },
            { id: 'later', label: 'Later' },
          ]}
        />
      </FRow>

      {areas.length > 0 && (
        <FRow label="Where" hint={f.areas.length ? `${f.areas.length} areas` : 'All of Sydney'}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 10 }}>
            {areas.map((s) => (
              <Chip key={s} active={f.areas.includes(s)} onPress={() => toggle('areas', s)}>{s}</Chip>
            ))}
          </View>
        </FRow>
      )}

      <FRow label="Party size">
        <PartyInline value={f.party} onChange={(v) => set({ party: v })} />
      </FRow>

      <FRow label="Price">
        <PriceSlider value={f.maxPrice} onChange={(v) => set({ maxPrice: v })} />
      </FRow>

      <FRow label="Sort by">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 10 }}>
          {SORTS.map((s) => (
            <Chip key={s.id} active={f.sort === s.id} onPress={() => set({ sort: s.id })}>{s.label}</Chip>
          ))}
        </View>
      </FRow>
    </SheetFrame>
  );
}
