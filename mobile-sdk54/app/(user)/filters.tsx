import React, { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AREAS,
  CATEGORIES,
  DEFAULT_FILTERS,
  DROPS,
  Filters,
  applyFilters,
  money,
} from '../../src/data';
import { fontDisplay, fontUI, useApp } from '../../src/theme';
import { Btn } from '../../src/components';

const ACTS = CATEGORIES.filter((c) => c !== 'All');
const SORTS = [
  { id: 'closest', label: 'Closest' },
  { id: 'price', label: 'Lowest price' },
  { id: 'rating', label: 'Top rated' },
] as const;

function FRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  const { T } = useApp();
  return (
    <View style={{ paddingHorizontal: 22, paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: T.line }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <Text style={{ fontFamily: fontUI(600), fontSize: 16.5, color: T.text }}>{label}</Text>
        {hint && <Text style={{ fontFamily: fontUI(400), fontSize: 13.5, color: T.faint }}>{hint}</Text>}
      </View>
      {children}
    </View>
  );
}

function FPill({ children, on, onPress, dot }: { children: React.ReactNode; on?: boolean; onPress: () => void; dot?: boolean }) {
  const { T } = useApp();
  return (
    <Pressable
      onPress={onPress}
      style={{ height: 40, paddingHorizontal: 16, borderRadius: 12, backgroundColor: on ? T.accent : T.chipBg, flexDirection: 'row', alignItems: 'center', gap: 8 }}
    >
      {dot && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: on ? T.accentInk : T.faint }} />}
      <Text style={{ fontFamily: fontUI(500), fontSize: 14.5, letterSpacing: -0.14, color: on ? T.accentInk : T.text }}>{children}</Text>
    </Pressable>
  );
}

function Segmented({ value, options, onChange }: { value: string; options: { id: string; label: string }[]; onChange: (id: string) => void }) {
  const { T } = useApp();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: T.chipBg, borderRadius: 13, padding: 4, gap: 4 }}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id)}
            style={[{ flex: 1, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? T.surface : 'transparent' }, on ? T.shadow : null]}
          >
            <Text style={{ fontFamily: fontUI(on ? 600 : 500), fontSize: 14.5, color: on ? T.text : T.muted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PartyInline({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { T } = useApp();
  const btn = (label: string, fn: () => void, dis: boolean) => (
    <Pressable
      onPress={dis ? undefined : fn}
      style={{ width: 40, height: 40, borderRadius: 11, borderWidth: 1.5, borderColor: T.line2, alignItems: 'center', justifyContent: 'center', opacity: dis ? 0.45 : 1 }}
    >
      <Text style={{ fontSize: 22, color: dis ? T.faint : T.text, lineHeight: 26 }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ fontFamily: fontUI(400), fontSize: 15, color: T.muted }}>{value === 1 ? 'Just me' : `${value} people`}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        {btn('−', () => onChange(Math.max(1, value - 1)), value <= 1)}
        <Text style={{ fontFamily: fontDisplay(600), fontSize: 20, color: T.text, minWidth: 20, textAlign: 'center' }}>{value}</Text>
        {btn('+', () => onChange(Math.min(10, value + 1)), value >= 10)}
      </View>
    </View>
  );
}

function PriceSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { T } = useApp();
  const MIN = 10;
  const MAX = 40;
  const widthRef = useRef(1);
  const setFromX = (x: number) => {
    const w = widthRef.current;
    const ratio = Math.max(0, Math.min(1, x / w));
    onChange(Math.round(MIN + ratio * (MAX - MIN)));
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
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <Text style={{ fontFamily: fontUI(400), fontSize: 15, color: T.muted }}>Up to</Text>
        <Text style={{ fontFamily: fontDisplay(600), fontSize: 20, color: T.text }}>{value >= MAX ? 'Any price' : money(value)}</Text>
      </View>
      <View
        {...pan.panHandlers}
        onLayout={(e: LayoutChangeEvent) => (widthRef.current = e.nativeEvent.layout.width)}
        style={{ height: 24, justifyContent: 'center' }}
      >
        <View style={{ height: 6, borderRadius: 6, backgroundColor: T.chipBg, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${fillPct}%`, backgroundColor: T.accent }} />
        </View>
        <View style={{ position: 'absolute', left: `${fillPct}%`, marginLeft: -9, width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.12)' }} />
      </View>
    </View>
  );
}

export default function FiltersSheet() {
  const { T, filters, setFilters } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [f, setF] = useState<Filters>(filters);

  const set = (patch: Partial<Filters>) => setF((p) => ({ ...p, ...patch }));
  const toggle = (key: 'cats' | 'areas', val: string) =>
    setF((p) => ({ ...p, [key]: p[key].includes(val) ? p[key].filter((x) => x !== val) : [...p[key], val] }));

  const count = applyFilters(DROPS, f).length;
  const isDefault = JSON.stringify(f) === JSON.stringify(DEFAULT_FILTERS);

  const close = () => router.back();
  const apply = () => {
    setFilters(f);
    router.back();
  };

  return (
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
      {/* scrim */}
      <Pressable onPress={close} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' }} />

      {/* sheet */}
      <View style={{ backgroundColor: T.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '86%' }}>
        <View style={{ width: 38, height: 5, borderRadius: 3, backgroundColor: T.line2, alignSelf: 'center', marginTop: 10 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 12, paddingBottom: 14 }}>
          <Text style={{ fontFamily: fontDisplay(700), fontSize: 22, color: T.text, letterSpacing: -0.44 }}>Filters</Text>
          <Pressable onPress={() => setF(DEFAULT_FILTERS)} disabled={isDefault}>
            <Text style={{ fontFamily: fontUI(500), fontSize: 15, color: isDefault ? T.faint : T.accent, opacity: isDefault ? 0.5 : 1 }}>Clear all</Text>
          </Pressable>
        </View>

        <ScrollView style={{ borderTopWidth: 1, borderTopColor: T.line }} showsVerticalScrollIndicator={false}>
          <FRow label="What" hint={f.cats.length ? `${f.cats.length} selected` : 'Anything'}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
              {ACTS.map((a) => (
                <FPill key={a} dot on={f.cats.includes(a)} onPress={() => toggle('cats', a)}>{a}</FPill>
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
                { id: 'later', label: 'Later tonight' },
              ]}
            />
          </FRow>

          <FRow label="Where" hint={f.areas.length ? `${f.areas.length} areas` : 'All of Sydney'}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
              {AREAS.map((s) => (
                <FPill key={s} on={f.areas.includes(s)} onPress={() => toggle('areas', s)}>{s}</FPill>
              ))}
            </View>
          </FRow>

          <FRow label="Party size">
            <PartyInline value={f.party} onChange={(v) => set({ party: v })} />
          </FRow>

          <FRow label="Price">
            <PriceSlider value={f.maxPrice} onChange={(v) => set({ maxPrice: v })} />
          </FRow>

          <FRow label="Sort by">
            <View style={{ flexDirection: 'row', gap: 9 }}>
              {SORTS.map((s) => (
                <FPill key={s.id} on={f.sort === s.id} onPress={() => set({ sort: s.id })}>{s.label}</FPill>
              ))}
            </View>
          </FRow>
        </ScrollView>

        <View style={{ paddingHorizontal: 22, paddingTop: 14, paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : 24, borderTopWidth: 0.5, borderTopColor: T.line }}>
          <Btn full onPress={apply} disabled={count === 0}>
            {count === 0 ? 'No drops match' : `Show ${count} ${count === 1 ? 'drop' : 'drops'}`}
          </Btn>
        </View>
      </View>
    </View>
  );
}
