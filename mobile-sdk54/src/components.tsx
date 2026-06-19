// components.tsx — Impulse shared UI atoms, ported from the design handoff.
import React, { useState } from 'react';
import {
  Pressable,
  PressableProps,
  StyleProp,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { Drop, fmtCountdown, money, pct, useCountdown } from './data';
import { fontDisplay, fontMono, fontUI, hexA, useTheme } from './theme';
import { ChevronDown, LocationPin, PinTriangle } from './icons';

// ── press-scale wrapper (approximates the design's transform scale) ──
export function Touchable({
  children,
  onPress,
  scale = 0.975,
  style,
  disabled,
  hitSlop,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  scale?: number;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  hitSlop?: PressableProps['hitSlop'];
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      style={({ pressed }) => [
        style,
        pressed && !disabled ? { transform: [{ scale }] } : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

// ── impulse wordmark (coral dot) ─────────────────────────────
export function Logo({ size = 22, color }: { size?: number; color?: string }) {
  const T = useTheme();
  const ink = color || T.text;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      <Text style={{ fontFamily: fontDisplay(600), fontSize: size, letterSpacing: -size * 0.02, color: ink }}>
        impulse
      </Text>
      <View
        style={{
          width: size * 0.15, height: size * 0.15, borderRadius: size * 0.15,
          backgroundColor: T.accent, marginLeft: size * 0.07, marginBottom: size * 0.12,
        }}
      />
    </View>
  );
}

// ── pulse-rings app-icon mark ────────────────────────────────
export function PulseMark({ size = 30, radius }: { size?: number; radius?: number }) {
  const T = useTheme();
  const r = radius != null ? radius : size * 0.26;
  const ring = (d: number, col: string, bw: number) => (
    <View
      style={{
        position: 'absolute', left: '50%', top: '50%',
        width: d * size, height: d * size, borderRadius: (d * size) / 2,
        borderWidth: Math.max(1, size * bw), borderColor: col,
        marginLeft: -(d * size) / 2, marginTop: -(d * size) / 2,
      }}
    />
  );
  return (
    <View
      style={{
        width: size, height: size, borderRadius: r, backgroundColor: '#0F0E0D',
        overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {ring(0.82, hexA(T.accent, 0.22), 0.02)}
      {ring(0.6, hexA(T.accent, 0.45), 0.024)}
      <View style={{ width: 0.34 * size, height: 0.34 * size, borderRadius: 0.17 * size, backgroundColor: T.accent }} />
    </View>
  );
}

// ── button ───────────────────────────────────────────────────
export function Btn({
  children, onPress, variant = 'primary', full, style, disabled,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  full?: boolean;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const T = useTheme();
  const base =
    variant === 'primary'
      ? { backgroundColor: T.accent, color: T.accentInk, borderWidth: 0 }
      : variant === 'secondary'
      ? { backgroundColor: 'transparent', color: T.text, borderWidth: 1.5, borderColor: T.line2 }
      : { backgroundColor: T.chipBg, color: T.text, borderWidth: 0 };
  return (
    <Touchable onPress={onPress} disabled={disabled} style={[{ width: full ? '100%' : undefined }, style]}>
      <View
        style={{
          backgroundColor: base.backgroundColor, borderWidth: base.borderWidth,
          borderColor: (base as any).borderColor, height: 54, borderRadius: 16,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          paddingHorizontal: 18, opacity: disabled ? 0.4 : 1, width: full ? '100%' : undefined,
        }}
      >
        {typeof children === 'string' ? (
          <Text style={{ fontFamily: fontUI(600), fontSize: 17, letterSpacing: -0.17, color: base.color }}>
            {children}
          </Text>
        ) : (
          children
        )}
      </View>
    </Touchable>
  );
}

// ── filter chip ──────────────────────────────────────────────
export function Chip({
  children, active, onPress, small,
}: {
  children: React.ReactNode;
  active?: boolean;
  onPress?: () => void;
  small?: boolean;
}) {
  const T = useTheme();
  return (
    <Touchable onPress={onPress} scale={0.96}>
      <View
        style={{
          height: small ? 30 : 36, paddingHorizontal: small ? 13 : 16, borderRadius: 999,
          backgroundColor: active ? T.chipOn : T.chipBg,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Text
          style={{
            fontFamily: fontUI(500), fontSize: small ? 13 : 14.5, letterSpacing: -0.14,
            color: active ? T.chipOnInk : T.chipText,
          }}
        >
          {children}
        </Text>
      </View>
    </Touchable>
  );
}

// ── striped image placeholder ────────────────────────────────
export function Placeholder({
  label = 'venue photo', style, radius = 0,
}: {
  label?: string;
  style?: StyleProp<ViewStyle>;
  radius?: number;
}) {
  const T = useTheme();
  return (
    <View style={[{ backgroundColor: T.ph, borderRadius: radius, overflow: 'hidden' }, style]}>
      {/* faint diagonal hatching */}
      {[...Array(9)].map((_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute', top: -40, left: i * 26 - 30, width: 1, height: 400,
            backgroundColor: T.phLine, transform: [{ rotate: '45deg' }],
          }}
        />
      ))}
      <Text
        style={{
          position: 'absolute', left: 12, bottom: 10, fontFamily: fontMono(400), fontSize: 9.5,
          letterSpacing: 0.8, textTransform: 'uppercase', color: T.phText,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

// ── price block (now + usually struck + −pct chip) ───────────
export function PriceBlock({ d, big }: { d: Drop; big?: boolean }) {
  const T = useTheme();
  const p = pct(d.now, d.usual);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: big ? 10 : 8 }}>
      <Text style={{ fontFamily: fontDisplay(600), fontSize: big ? 34 : 22, color: T.text, letterSpacing: -0.6 }}>
        {money(d.now)}
        <Text style={{ fontFamily: fontUI(500), fontSize: big ? 16 : 12, color: T.muted }}>{d.unit}</Text>
      </Text>
      <Text style={{ fontFamily: fontUI(400), fontSize: big ? 15 : 13, color: T.faint, textDecorationLine: 'line-through' }}>
        usually {money(d.usual)}
      </Text>
      <View style={{ backgroundColor: T.accentSoft, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 }}>
        <Text style={{ fontFamily: fontMono(700), fontSize: big ? 13 : 11, color: T.accent, letterSpacing: 0.2 }}>
          −{p}%
        </Text>
      </View>
    </View>
  );
}

// ── meta line: cat · suburb · km ─────────────────────────────
export function MetaLine({ d, style }: { d: Drop; style?: object }) {
  const T = useTheme();
  return (
    <Text style={[{ fontFamily: fontUI(400), fontSize: 13.5, color: T.muted, letterSpacing: -0.13 }, style]}>
      {d.cat} · {d.suburb} · {d.km} km
    </Text>
  );
}

export function RatingDot({ d }: { d: Drop }) {
  const T = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: T.accent }} />
      <Text style={{ fontFamily: fontMono(400), fontSize: 11.5, color: T.muted }}>{d.rating}</Text>
    </View>
  );
}

// ── countdown pill (live, only on hot drops) ─────────────────
export function CountdownPill({ d, plain }: { d: Drop; plain?: boolean }) {
  const T = useTheme();
  const ms = useCountdown(d.target);
  if (!d.target) return null;
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 7,
        backgroundColor: plain ? 'transparent' : T.accent,
        paddingHorizontal: plain ? 0 : 8, paddingVertical: plain ? 0 : 4,
      }}
    >
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: plain ? T.accent : T.accentInk }} />
      <Text style={{ fontFamily: fontMono(700), fontSize: plain ? 13 : 11.5, letterSpacing: 0.2, color: plain ? T.accent : T.accentInk }}>
        ends in {fmtCountdown(ms)}
      </Text>
    </View>
  );
}

// ── editorial drop card (image-led, one per row) ─────────────
export function DropCardEditorial({ d, onPress }: { d: Drop; onPress?: () => void }) {
  const T = useTheme();
  return (
    <Touchable onPress={onPress} scale={0.985}>
      <View style={[{ backgroundColor: T.surface, borderRadius: 22, overflow: 'hidden' }, T.shadow]}>
        <View>
          <Placeholder label={d.cat + ' · venue photo'} style={{ height: 168 }} />
          <View style={{ position: 'absolute', top: 12, left: 12, flexDirection: 'row', gap: 7 }}>
            <View style={{ backgroundColor: 'rgba(244,241,234,0.92)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 }}>
              <Text style={{ fontFamily: fontUI(600), fontSize: 12.5, color: '#0F0E0D' }}>{d.cat}</Text>
            </View>
            {d.target ? <CountdownPill d={d} /> : null}
          </View>
        </View>
        <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            <Text style={{ fontFamily: fontDisplay(600), fontSize: 20, color: T.text, letterSpacing: -0.4, flexShrink: 1 }}>
              {d.venue}
            </Text>
            <RatingDot d={d} />
          </View>
          <MetaLine d={d} style={{ marginTop: 3, marginBottom: 12 }} />
          <PriceBlock d={d} />
          <View style={{ marginTop: 11, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: d.status === 'now' ? T.accent : T.faint }} />
            <Text style={{ fontFamily: fontUI(400), fontSize: 12.5, color: T.faint }}>{d.window}</Text>
          </View>
        </View>
      </View>
    </Touchable>
  );
}

// ── compact drop row (dense list) ────────────────────────────
export function DropCardCompact({ d, onPress }: { d: Drop; onPress?: () => void }) {
  const T = useTheme();
  return (
    <Touchable onPress={onPress} scale={0.99}>
      <View style={[{ backgroundColor: T.surface, borderRadius: 16, overflow: 'hidden', flexDirection: 'row' }, T.shadow]}>
        <Placeholder label={d.cat} style={{ width: 92 }} />
        <View style={{ paddingVertical: 11, paddingHorizontal: 13, flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <Text numberOfLines={1} style={{ fontFamily: fontDisplay(600), fontSize: 16.5, color: T.text, letterSpacing: -0.33, flexShrink: 1 }}>
              {d.venue}
            </Text>
            <Text style={{ fontFamily: fontDisplay(600), fontSize: 17, color: T.text }}>
              {money(d.now)}
              <Text style={{ fontFamily: fontUI(500), fontSize: 10.5, color: T.muted }}>{d.unit}</Text>
            </Text>
          </View>
          <MetaLine d={d} style={{ fontSize: 12.5, marginTop: 2 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <View style={{ backgroundColor: T.accentSoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 }}>
              <Text style={{ fontFamily: fontMono(700), fontSize: 10.5, color: T.accent }}>−{pct(d.now, d.usual)}%</Text>
            </View>
            {d.target ? (
              <CountdownPill d={d} plain />
            ) : (
              <Text style={{ fontFamily: fontUI(400), fontSize: 12, color: T.faint }}>
                {d.window.replace('On now · ', '').replace(' tonight', '')}
              </Text>
            )}
          </View>
        </View>
      </View>
    </Touchable>
  );
}

// ── iOS-style switch ─────────────────────────────────────────
export function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  const T = useTheme();
  return (
    <Pressable
      onPress={() => onChange(!on)}
      style={{
        width: 50, height: 30, borderRadius: 999, padding: 2,
        backgroundColor: on ? T.accent : T.line2,
        flexDirection: 'row', justifyContent: on ? 'flex-end' : 'flex-start', alignItems: 'center',
      }}
    >
      <View
        style={{
          width: 26, height: 26, borderRadius: 13, backgroundColor: '#fff',
          shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2,
        }}
      />
    </Pressable>
  );
}

// ── party-size stepper ───────────────────────────────────────
export function Stepper({
  value, onChange, min = 1, max = 8,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  const T = useTheme();
  const btn = (label: string, fn: () => void, dis: boolean) => (
    <Pressable
      onPress={dis ? undefined : fn}
      style={{
        width: 46, height: 46, borderRadius: 13, borderWidth: 1.5, borderColor: T.line2,
        alignItems: 'center', justifyContent: 'center', opacity: dis ? 0.5 : 1,
      }}
    >
      <Text style={{ fontFamily: fontUI(400), fontSize: 24, color: dis ? T.faint : T.text, lineHeight: 28 }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
      {btn('−', () => onChange(Math.max(min, value - 1)), value <= min)}
      <Text style={{ fontFamily: fontDisplay(600), fontSize: 26, color: T.text, minWidth: 28, textAlign: 'center' }}>{value}</Text>
      {btn('+', () => onChange(Math.min(max, value + 1)), value >= max)}
    </View>
  );
}

// ── faux QR (deterministic module grid) ──────────────────────
export function FauxQR({ code, size = 132 }: { code: string; size?: number }) {
  const N = 13;
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
  const rng = (i: number) => {
    const x = Math.sin(h + i * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };
  const isFinder = (r: number, c: number) =>
    (r < 3 && c < 3) || (r < 3 && c >= N - 3) || (r >= N - 3 && c < 3);
  const cells: boolean[] = [];
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const finder = isFinder(r, c);
      const on = finder
        ? r === 0 || r === 2 || r === N - 1 || r === N - 3 || c === 0 || c === 2 || c === N - 1 || c === N - 3
          ? true
          : (r === 1 && c === 1) || (r === 1 && c === N - 2) || (r === N - 2 && c === 1)
        : rng(r * N + c) > 0.5;
      cells.push(on);
    }
  const pad = 12;
  const inner = size - pad * 2;
  const gap = 1.5;
  const cell = (inner - gap * (N - 1)) / N;
  return (
    <View style={{ width: size, height: size, backgroundColor: '#fff', borderRadius: 14, padding: pad }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: inner, height: inner, gap }}>
        {cells.map((on, i) => (
          <View key={i} style={{ width: cell, height: cell, borderRadius: 1, backgroundColor: on ? '#0F0E0D' : 'transparent' }} />
        ))}
      </View>
    </View>
  );
}

// ── map pin (pulse motif) ────────────────────────────────────
export function Pin({ active, onPress, label }: { active?: boolean; onPress?: () => void; label: string }) {
  const T = useTheme();
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center' }}>
      {active && (
        <View
          style={{
            position: 'absolute', top: -7, width: 38, height: 38, borderRadius: 19,
            borderWidth: 2, borderColor: T.accent, opacity: 0.5,
          }}
        />
      )}
      <View
        style={[
          {
            backgroundColor: T.accent, height: active ? 30 : 26, paddingHorizontal: 10, borderRadius: 999,
            alignItems: 'center', justifyContent: 'center',
          },
          T.shadow,
        ]}
      >
        <Text style={{ fontFamily: fontDisplay(700), fontSize: 12, color: T.accentInk }}>{label}</Text>
      </View>
      <View style={{ marginTop: -1 }}>
        <PinTriangle color={T.accent} />
      </View>
    </Pressable>
  );
}

// ── location pill (Tonight header) ───────────────────────────
export function LocPill() {
  const T = useTheme();
  return (
    <Pressable
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: T.chipBg,
        borderRadius: 999, paddingHorizontal: 13, paddingVertical: 7,
      }}
    >
      <LocationPin size={13} color={T.accent} />
      <Text style={{ fontFamily: fontUI(500), fontSize: 14, color: T.text }}>Sydney · CBD</Text>
      <ChevronDown size={11} color={T.muted} />
    </Pressable>
  );
}

// ── avatar (initials) ────────────────────────────────────────
export function Avatar({ size = 36, initials = 'JL' }: { size?: number; initials?: string }) {
  const T = useTheme();
  return (
    <View
      style={{
        width: size, height: size, borderRadius: size / 2, backgroundColor: T.surface2,
        borderWidth: 1, borderColor: T.line, alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Text style={{ fontFamily: fontDisplay(600), fontSize: size * 0.39, color: T.text }}>{initials}</Text>
    </View>
  );
}

export { useState };
