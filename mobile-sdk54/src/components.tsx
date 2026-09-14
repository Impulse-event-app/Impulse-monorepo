// components.tsx — Impulse brand v2 shared UI: liquid-glass chrome, the Radar
// mark, buttons, chips, cards, sheets, grouped lists and the 6-digit code.
// Glass is for chrome only (bars, badges, round controls); content sits on
// solid surfaces so type stays legible.
import React, { forwardRef, useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  PressableProps,
  ScrollView,
  StyleProp,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
  type DimensionValue,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Drop, fmtCountdown, money, pct, useCountdown, venuePhotoUrl } from './data';
import { IMPULSE_RED, fontMono, fontUI, useTheme } from './theme';
import { ChevronBack, ChevronRight, PinTriangle } from './icons';
import { hapticSelection } from './haptics';

export const EASE = Easing.bezier(0.32, 0.72, 0, 1);
export const NUM: TextStyle = { fontVariant: ['tabular-nums'] };
const NATIVE_DRIVER = Platform.OS !== 'web';
// Android blur is costly and uneven across devices — use a near-solid tint there.
const HAS_BLUR = Platform.OS !== 'android';
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

/** Sheets are presented natively (formSheet: grabber, detents, swipe to dismiss) on iOS. */
export const NATIVE_SHEETS = Platform.OS === 'ios';

/** Max width for reading content on wide screens (iPad, Split View). */
export const READABLE_WIDTH = 672;

// ── accessibility settings (Reduce Motion / Reduce Transparency) ─────
// One shared subscription for the whole app rather than a listener per
// component — Glass and FadeIn render many times per screen.
type A11yFlags = { reduceMotion: boolean; reduceTransparency: boolean };
let a11yFlags: A11yFlags = { reduceMotion: false, reduceTransparency: false };
const a11ySubs = new Set<() => void>();
let a11yStarted = false;

function startA11yWatch() {
  if (a11yStarted) return;
  a11yStarted = true;
  const set = (k: keyof A11yFlags) => (v: boolean) => {
    if (a11yFlags[k] === v) return;
    a11yFlags = { ...a11yFlags, [k]: v };
    a11ySubs.forEach((f) => f());
  };
  try {
    AccessibilityInfo.isReduceMotionEnabled().then(set('reduceMotion')).catch(() => {});
    AccessibilityInfo.addEventListener('reduceMotionChanged', set('reduceMotion'));
    if (Platform.OS === 'ios') {
      AccessibilityInfo.isReduceTransparencyEnabled().then(set('reduceTransparency')).catch(() => {});
      AccessibilityInfo.addEventListener('reduceTransparencyChanged', set('reduceTransparency'));
    }
  } catch {
    // unsupported platform — keep defaults
  }
}

function useA11yFlag(k: keyof A11yFlags): boolean {
  startA11yWatch();
  return useSyncExternalStore(
    (cb) => { a11ySubs.add(cb); return () => { a11ySubs.delete(cb); }; },
    () => a11yFlags[k],
    () => a11yFlags[k],
  );
}

/** True when the user has Reduce Motion on: skip slides, scales and blinking. */
export const useReduceMotion = () => useA11yFlag('reduceMotion');
/** True when the user has Reduce Transparency on: glass renders solid. */
export const useReduceTransparency = () => useA11yFlag('reduceTransparency');

// ── readable column ──────────────────────────────────────────
/** Centres content at a comfortable reading width on iPad; full width on phones. */
export function ReadableColumn({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ width: '100%', maxWidth: READABLE_WIDTH, alignSelf: 'center' }, style]}>{children}</View>;
}

// ── press-scale wrapper ──────────────────────────────────────
export function Touchable({
  children,
  onPress,
  scale = 0.985,
  style,
  disabled,
  hitSlop,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole,
  accessibilityState,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  scale?: number;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  hitSlop?: PressableProps['hitSlop'];
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: PressableProps['accessibilityRole'];
  accessibilityState?: PressableProps['accessibilityState'];
}) {
  const reduceMotion = useReduceMotion();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole={accessibilityRole ?? (onPress ? 'button' : undefined)}
      accessibilityState={{ disabled: !!disabled, ...accessibilityState }}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        style,
        pressed && !disabled ? (reduceMotion ? { opacity: 0.7 } : { transform: [{ scale }] }) : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

// ── liquid glass ─────────────────────────────────────────────
/** Blur + tint + half-point specular edge. */
export function Glass({
  radius = 22, style, children, edge = true, intensity = 40, pointerEvents,
}: {
  radius?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  edge?: boolean;
  intensity?: number;
  pointerEvents?: 'box-none' | 'none' | 'box-only' | 'auto';
}) {
  const T = useTheme();
  return (
    // zIndex 0 makes the container its own stacking context so the fill's
    // zIndex -1 stays inside it (web paints positioned layers above static
    // children like a bare <Svg> otherwise).
    <View pointerEvents={pointerEvents} style={[{ borderRadius: radius, overflow: 'hidden', zIndex: 0 }, style]}>
      <GlassFill intensity={intensity} />
      {children}
      {edge && (
        <View pointerEvents="none" style={[FILL, { borderRadius: radius, borderWidth: 0.5, borderColor: T.glassEdge }]} />
      )}
    </View>
  );
}

function GlassFill({ intensity = 40 }: { intensity?: number }) {
  const T = useTheme();
  const solid = useReduceTransparency() || !HAS_BLUR;
  return (
    <>
      {!solid && <BlurView pointerEvents="none" intensity={intensity} tint={T.blurTint} style={[FILL, { zIndex: -1 }]} />}
      <View pointerEvents="none" style={[FILL, { zIndex: -1, backgroundColor: solid ? T.glassSolid : T.glassTint }]} />
    </>
  );
}

/** Round glass control — back, close, filter. */
export function GlassBtn({
  children, onPress, size = 40, style, accessibilityLabel,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  size?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const slop = Math.max(6, (44 - size) / 2);
  return (
    <Touchable onPress={onPress} scale={0.94} hitSlop={slop} style={style} accessibilityLabel={accessibilityLabel}>
      <Glass radius={size / 2} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </Glass>
    </Touchable>
  );
}

export function BackButton({ onPress, style }: { onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const T = useTheme();
  return (
    <GlassBtn onPress={onPress} style={style} accessibilityLabel="Back">
      <ChevronBack size={11} color={T.text} />
    </GlassBtn>
  );
}

/** A glass badge (radius 8, 26pt) for chips over photos. */
export function GlassBadge({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Glass radius={8} style={[{ minHeight: 26, paddingVertical: 3, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center' }, style]}>
      {children}
    </Glass>
  );
}

// ── nav bar ──────────────────────────────────────────────────
/** Tracks whether a scroll view has passed the large title. */
export function useScrolled(threshold = 44): [boolean, (e: NativeSyntheticEvent<NativeScrollEvent>) => void] {
  const [scrolled, setScrolled] = useState(false);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = e.nativeEvent.contentOffset.y > threshold;
    setScrolled((prev) => (prev === next ? prev : next));
  }, [threshold]);
  return [scrolled, onScroll];
}

/** Top clearance for content under a NavBar with a large title. */
export function useNavTop() {
  return useSafeAreaInsets().top + 52;
}

/**
 * iOS-style floating nav bar. The screen renders its own large title; once
 * scrolled, the bar turns to glass and shows the inline title.
 */
export function NavBar({
  title, leading, trailing, scrolled, hideLeadingOnScroll,
}: {
  title?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  scrolled: boolean;
  hideLeadingOnScroll?: boolean;
}) {
  const T = useTheme();
  const insets = useSafeAreaInsets();
  const v = useRef(new Animated.Value(scrolled ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: scrolled ? 1 : 0, duration: 250, easing: EASE, useNativeDriver: NATIVE_DRIVER }).start();
  }, [scrolled, v]);
  const out = v.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 44, zIndex: 22 }}>
      <Animated.View pointerEvents="none" style={[FILL, { opacity: v }]}>
        <GlassFill />
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 0.5, backgroundColor: T.line }} />
      </Animated.View>
      <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top, left: 0, right: 0, height: 44, alignItems: 'center' }}>
        <View
          pointerEvents="box-none"
          style={{ width: '100%', maxWidth: READABLE_WIDTH, height: 44, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}
        >
          {title ? (
            <Animated.Text
              pointerEvents="none"
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              accessibilityElementsHidden={!scrolled}
              importantForAccessibility={scrolled ? 'auto' : 'no-hide-descendants'}
              style={{ position: 'absolute', left: 80, right: 80, textAlign: 'center', ...fontUI(600), fontSize: 17, letterSpacing: -0.19, color: T.text, opacity: v }}
            >
              {title}
            </Animated.Text>
          ) : null}
          <Animated.View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, opacity: hideLeadingOnScroll ? out : 1 }}>
            {leading}
          </Animated.View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>{trailing}</View>
        </View>
      </View>
    </View>
  );
}

// ── type ─────────────────────────────────────────────────────
export function LargeTitle({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const T = useTheme();
  return (
    <Text accessibilityRole="header" style={[{ ...fontUI(600), fontSize: 34, lineHeight: 40, letterSpacing: -1.02, color: T.text }, style]}>
      {children}
    </Text>
  );
}

export function ScreenTitle({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const T = useTheme();
  return (
    <Text accessibilityRole="header" style={[{ ...fontUI(600), fontSize: 30, lineHeight: 34, letterSpacing: -0.66, color: T.text }, style]}>
      {children}
    </Text>
  );
}

/** 13pt grey sentence-case label ("What you get", "Your door code"). */
export function Label({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const T = useTheme();
  return <Text style={[{ ...fontUI(400), fontSize: 13, letterSpacing: -0.05, color: T.muted }, style]}>{children}</Text>;
}

export function ErrorText({ children, center }: { children: React.ReactNode; center?: boolean }) {
  const T = useTheme();
  return (
    <Text
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={{ ...fontUI(400), fontSize: 15, lineHeight: 21, color: T.accent, textAlign: center ? 'center' : 'left' }}
    >
      {children}
    </Text>
  );
}

// ── scrims (smooth vertical gradients of the ground colour) ──
/**
 * A vertical gradient of the bg colour, drawn as one SVG linear gradient so it
 * interpolates smoothly. `stops` are [offset from top 0..1, bg opacity 0..1].
 */
export function Scrim({ stops, style }: { stops: [number, number][]; style?: StyleProp<ViewStyle> }) {
  const T = useTheme();
  // useId output contains ':' which breaks url(#…) references on web.
  const id = `scrim${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View pointerEvents="none" style={[FILL, style]}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            {stops.map(([offset, alpha]) => (
              <Stop key={offset} offset={offset} stopColor={`rgb(${T.bgRGB})`} stopOpacity={alpha} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** Progressive fade behind floating footers and the tab bar: clear at the top, near-solid at the bottom. */
function FooterScrim({ opacity = 0.86, extend = 40 }: { opacity?: number; extend?: number }) {
  return (
    <Scrim
      style={{ top: -extend }}
      stops={[[0, 0], [0.3, 0.52 * opacity], [0.6, 0.9 * opacity], [0.8, opacity], [1, opacity]]}
    />
  );
}

/** Pinned bottom action area that content scrolls beneath. Pad content by ~150. */
export function FloatingFooter({ children, gap = 10, row }: { children: React.ReactNode; gap?: number; row?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 20 }}>
      <FooterScrim />
      <View
        style={{
          width: '100%', maxWidth: READABLE_WIDTH, alignSelf: 'center',
          paddingHorizontal: 16, paddingTop: 14, paddingBottom: insets.bottom > 0 ? insets.bottom + 6 : 24,
          gap, flexDirection: row ? 'row' : 'column', alignItems: row ? 'center' : 'stretch',
        }}
      >
        {children}
      </View>
    </View>
  );
}
export { FooterScrim };

// ── brand marks ──────────────────────────────────────────────
// Radar mark on a 512 grid: core r34, inner ring r98/22, outer ring r172/13.
// Ground is always Impulse Red with a white mark — never recoloured.
export function Radar({
  size = 44, radius, kind = 'full', style, decorative,
}: {
  size?: number;
  radius?: number;
  kind?: 'full' | 'compact' | 'sweep';
  style?: StyleProp<ViewStyle>;
  /** Hide from VoiceOver when the wordmark or a title already names it. */
  decorative?: boolean;
}) {
  const r = radius != null ? radius : size * 0.225;
  const sweep = kind === 'sweep';
  const dash = (rr: number, deg: number) => {
    const c = 2 * Math.PI * rr;
    const on = (c * deg) / 360;
    return `${on} ${c - on}`;
  };
  return (
    <View
      style={[{ width: size, height: size, borderRadius: r, overflow: 'hidden' }, style]}
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={decorative ? undefined : 'Impulse'}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
    >
      <Svg width={size} height={size} viewBox="0 0 512 512">
        <Rect width={512} height={512} fill={IMPULSE_RED} />
        {kind === 'compact' ? (
          <>
            <Circle cx={256} cy={256} r={150} fill="none" stroke="#FFFFFF" strokeWidth={54} />
            <Circle cx={256} cy={256} r={46} fill="#FFFFFF" />
          </>
        ) : (
          <>
            <Circle
              cx={256} cy={256} r={172} fill="none" stroke="#FFFFFF" strokeWidth={13}
              strokeDasharray={sweep ? dash(172, 255) : undefined}
              strokeLinecap={sweep ? 'round' : undefined}
              transform={sweep ? 'rotate(-135 256 256)' : undefined}
            />
            <Circle
              cx={256} cy={256} r={98} fill="none" stroke="#FFFFFF" strokeWidth={22}
              strokeDasharray={sweep ? dash(98, 255) : undefined}
              strokeLinecap={sweep ? 'round' : undefined}
              transform={sweep ? 'rotate(-135 256 256)' : undefined}
            />
            <Circle cx={256} cy={256} r={34} fill="#FFFFFF" />
          </>
        )}
      </Svg>
    </View>
  );
}

/** Huddle mark — the radar's outer ring holding three members. Decorative. */
export function HuddleMark({ size = 30, radius }: { size?: number; radius?: number }) {
  const r = radius != null ? radius : size * 0.225;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: r, overflow: 'hidden' }}
    >
      <Svg width={size} height={size} viewBox="0 0 512 512">
        <Rect width={512} height={512} fill={IMPULSE_RED} />
        <Circle cx={256} cy={256} r={172} fill="none" stroke="#FFFFFF" strokeWidth={13} />
        <Circle cx={256} cy={200} r={42} fill="#FFFFFF" />
        <Circle cx={198} cy={296} r={42} fill="#FFFFFF" />
        <Circle cx={314} cy={296} r={42} fill="#FFFFFF" />
      </Svg>
    </View>
  );
}

export function Wordmark({ size = 22, color }: { size?: number; color?: string }) {
  const T = useTheme();
  return (
    <Text
      maxFontSizeMultiplier={1.2}
      accessibilityRole="header"
      style={{ ...fontUI(600), fontSize: size, lineHeight: size * 1.15, letterSpacing: -size * 0.033, color: color || T.text }}
    >
      Impulse
    </Text>
  );
}

// ── button ───────────────────────────────────────────────────
export function Btn({
  children, onPress, variant = 'primary', full, style, disabled, small, accessibilityLabel, accessibilityHint,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  full?: boolean;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  small?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  const T = useTheme();
  const reduceMotion = useReduceMotion();
  const ink = variant === 'primary' ? T.accentInk : T.text;
  const h = small ? 44 : 52;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        { width: full ? '100%' : undefined },
        pressed && !disabled && !reduceMotion ? { transform: [{ scale: 0.985 }] } : null,
        style,
      ]}
    >
      {({ pressed }) => (
        <View
          style={{
            // minHeight (not height) so the label can grow with Dynamic Type.
            minHeight: h, paddingVertical: 8, borderRadius: h / 2, paddingHorizontal: small ? 18 : 22,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
            opacity: disabled ? 0.35 : 1,
            backgroundColor:
              variant === 'primary' ? (pressed ? T.accentDeep : T.accent)
              : variant === 'ghost' ? (pressed ? T.line : T.fill)
              : pressed ? T.fill : 'transparent',
            borderWidth: variant === 'secondary' ? 1 : 0,
            borderColor: T.line2,
          }}
        >
          {typeof children === 'string' ? (
            <Text style={{ ...fontUI(500), fontSize: small ? 15 : 17, letterSpacing: -0.19, color: ink, textAlign: 'center', ...NUM }}>
              {children}
            </Text>
          ) : (
            children
          )}
        </View>
      )}
    </Pressable>
  );
}

/** Quiet text action ("Not now", "I already have an account"). */
export function TextBtn({
  children, onPress, color, size = 17, weight = 400, disabled, style, accessibilityRole = 'button',
}: {
  children: React.ReactNode;
  onPress?: () => void;
  color?: string;
  size?: number;
  weight?: 400 | 500 | 600;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityRole?: 'button' | 'link';
}) {
  const T = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [{ minHeight: 36, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : pressed ? 0.6 : 1 }, style]}
    >
      <Text style={{ ...fontUI(weight), fontSize: size, letterSpacing: -0.15, color: color || T.muted, textAlign: 'center' }}>{children}</Text>
    </Pressable>
  );
}

// ── chip (radius 8, selected = red) ──────────────────────────
export function Chip({
  children, active, onPress, small,
}: {
  children: React.ReactNode;
  active?: boolean;
  onPress?: () => void;
  small?: boolean;
}) {
  const T = useTheme();
  const h = small ? 30 : 34;
  // Keep the compact visual, but extend the tap area to the 44pt minimum.
  const slop = (44 - h) / 2;
  return (
    <Touchable
      onPress={onPress ? () => { hapticSelection(); onPress(); } : undefined}
      scale={0.96}
      hitSlop={onPress ? { top: slop, bottom: slop } : undefined}
      accessibilityState={onPress ? { selected: !!active } : undefined}
    >
      <View
        style={{
          minHeight: h, paddingVertical: 4, paddingHorizontal: small ? 11 : 14, borderRadius: 8,
          backgroundColor: active ? T.chipOn : T.chipBg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
        }}
      >
        {typeof children === 'string' ? (
          <Text style={{ ...fontUI(500), fontSize: small ? 13 : 15, letterSpacing: -0.12, color: active ? T.chipOnInk : T.chipText, textAlign: 'center', ...NUM }}>
            {children}
          </Text>
        ) : (
          children
        )}
      </View>
    </Touchable>
  );
}

// ── photo placeholder ────────────────────────────────────────
export function Placeholder({
  label = 'Venue photo', style, radius = 0, uri,
}: {
  label?: string;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  uri?: string;
}) {
  const T = useTheme();
  if (uri) {
    return (
      <View style={[{ borderRadius: radius, overflow: 'hidden', backgroundColor: T.ph }, style]}>
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" accessibilityIgnoresInvertColors />
      </View>
    );
  }
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ backgroundColor: T.ph, borderRadius: radius, overflow: 'hidden' }, style]}
    >
      {[...Array(24)].map((_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute', top: -60, left: i * 17 - 60, width: 1, height: 520,
            backgroundColor: T.phLine, transform: [{ rotate: '-45deg' }],
          }}
        />
      ))}
      {label ? (
        <Text style={{ position: 'absolute', left: 14, bottom: 12, ...fontUI(400), fontSize: 12, color: T.phText }}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

// ── price, discount, meta, live state ────────────────────────
/** "/lane" → "a lane", "pp" → "a person", "/table·hr" → "a table an hour". */
export function unitLabel(unit: string): string {
  const u = (unit || '').trim();
  if (!u || u === 'pp' || u === '/pp') return 'a person';
  const base = u.replace(/^\//, '');
  const [thing, per] = base.split('·');
  const art = (w: string) => (/^[aeiou]/i.test(w) ? 'an' : 'a');
  const head = `${art(thing)} ${thing}`;
  if (!per) return head;
  if (per === 'hr') return `${head} an hour`;
  return `${head} per ${per}`;
}

export function DiscountChip({ now, usual }: { now: number; usual: number }) {
  const T = useTheme();
  const p = pct(now, usual);
  if (!(p > 0)) return null;
  return (
    <View
      accessible
      accessibilityLabel={`${p} percent off`}
      style={{ minHeight: 20, paddingHorizontal: 6, borderRadius: 6, backgroundColor: T.accentSoft, justifyContent: 'center' }}
    >
      <Text style={{ ...fontMono(600, 12), fontSize: 12, color: T.accent }}>−{p}%</Text>
    </View>
  );
}

export function PriceBlock({ d, big }: { d: Drop; big?: boolean }) {
  const T = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 9, rowGap: 6 }}>
      <Text style={{ ...fontMono(600), fontSize: big ? 34 : 26, lineHeight: big ? 38 : 30, letterSpacing: big ? -0.68 : -0.52, color: T.text }}>
        {money(d.now)}
      </Text>
      <Text style={{ ...fontUI(400), fontSize: big ? 15 : 13.5, color: T.muted, letterSpacing: big ? -0.12 : -0.05 }}>
        {unitLabel(d.unit)}, usually {money(d.usual)}
      </Text>
      <DiscountChip now={d.now} usual={d.usual} />
    </View>
  );
}

export function MetaLine({ d, style }: { d: Drop; style?: StyleProp<TextStyle> }) {
  const T = useTheme();
  const parts = [d.cat, d.suburb, d.km > 0 ? `${d.km} km` : null].filter(Boolean);
  return (
    <Text numberOfLines={2} style={[{ ...fontUI(400), fontSize: 13, color: T.muted, letterSpacing: -0.05 }, style]}>
      {parts.join(' · ')}
    </Text>
  );
}

export function RatingDot({ d, size = 13 }: { d: Drop; size?: number }) {
  const T = useTheme();
  if (!d.rating) return null;
  const r = Number(d.rating).toFixed(1);
  return (
    <Text accessibilityLabel={`Rated ${r} out of 5`} style={{ ...fontMono(400, size), fontSize: size, color: T.muted }}>
      {r}
    </Text>
  );
}

/** Steps between lit and dim, like the design's steps(1) blink. Holds lit under Reduce Motion. */
export function useBlink(active: boolean, low = 0.28) {
  const v = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReduceMotion();
  useEffect(() => {
    if (!active || reduceMotion) { v.setValue(1); return; }
    let alive = true;
    let t: ReturnType<typeof setTimeout>;
    const tick = (lit: boolean) => {
      if (!alive) return;
      v.setValue(lit ? 1 : low);
      t = setTimeout(() => tick(!lit), lit ? 960 : 640);
    };
    tick(true);
    return () => { alive = false; clearTimeout(t); };
  }, [active, low, v, reduceMotion]);
  return v;
}

export function LiveDot({ color, blink, size = 7 }: { color: string; blink?: boolean; size?: number }) {
  const o = useBlink(!!blink);
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: o }}
    />
  );
}

const sentence = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Live state: blinking dot + "Ends in 12:04" (or the window when there's no countdown). */
export function Live({ d, size = 13, color }: { d: Drop; size?: number; color?: string }) {
  const T = useTheme();
  const ms = useCountdown(d.target);
  const on = d.status === 'now';
  const label = d.target && ms > 0 ? `Ends in ${fmtCountdown(ms)}` : sentence(d.window);
  const c = color ?? (on ? T.accent : T.muted);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 }}>
      <LiveDot color={c} blink={!!d.target && ms > 0} />
      <Text numberOfLines={2} style={{ ...fontMono(500), fontSize: size, letterSpacing: -0.05, color: c, flexShrink: 1 }}>
        {label}
      </Text>
    </View>
  );
}

/** Countdown for hot drops only — a glass badge, or bare text with `plain`. */
export function CountdownPill({ d, plain }: { d: Drop; plain?: boolean }) {
  if (!d.target) return null;
  if (plain) return <Live d={d} size={12.5} />;
  return (
    <GlassBadge>
      <Live d={d} size={12.5} />
    </GlassBadge>
  );
}

// ── staggered enter ──────────────────────────────────────────
export function FadeIn({ delay = 0, children, style }: { delay?: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduceMotion = useReduceMotion();
  const v = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) { v.setValue(1); return; }
    Animated.timing(v, { toValue: 1, duration: 420, delay, easing: EASE, useNativeDriver: NATIVE_DRIVER }).start();
  }, [delay, v, reduceMotion]);
  return (
    <Animated.View
      style={[
        style,
        reduceMotion
          ? null
          : { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

// ── venue card (image-led, hairline, no shadow) ──────────────
/** One spoken summary for a drop card, so VoiceOver reads it as a single element. */
export function dropA11yLabel(d: Drop): string {
  const p = pct(d.now, d.usual);
  return [
    d.venue,
    d.cat,
    d.suburb || null,
    `${money(d.now)} ${unitLabel(d.unit)}`,
    p > 0 ? `${p} percent off` : null,
    d.status === 'now' ? 'On now' : sentence(d.window),
  ].filter(Boolean).join(', ');
}

export function DropCardEditorial({ d, onPress, a11yLabel, a11yHint }: { d: Drop; onPress?: () => void; a11yLabel?: string; a11yHint?: string }) {
  const T = useTheme();
  return (
    <Touchable onPress={onPress} scale={0.99} accessibilityLabel={a11yLabel ?? dropA11yLabel(d)} accessibilityHint={a11yHint}>
      <View style={{ backgroundColor: T.surface, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: T.line }}>
        <View>
          <Placeholder label={`${d.cat} · venue photo`} uri={venuePhotoUrl(d)} style={{ height: 162 }} />
          <View style={{ position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <GlassBadge>
              <Text maxFontSizeMultiplier={1.4} style={{ ...fontUI(500), fontSize: 12.5, color: T.text, letterSpacing: -0.05 }}>{d.cat}</Text>
            </GlassBadge>
            {d.target ? <CountdownPill d={d} /> : null}
          </View>
        </View>
        <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 18 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <Text numberOfLines={2} style={{ flex: 1, ...fontUI(600), fontSize: 22, letterSpacing: -0.48, color: T.text }}>
              {d.venue}
            </Text>
            <RatingDot d={d} />
          </View>
          <MetaLine d={d} style={{ marginTop: 5 }} />
          <View style={{ marginTop: 16 }}>
            <PriceBlock d={d} />
          </View>
          {/* Deals with a countdown show it once, on the photo badge. Only deals
              without one need this row, for their time window. */}
          {!d.target && (
            <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: T.line }}>
              <Live d={d} />
            </View>
          )}
        </View>
      </View>
    </Touchable>
  );
}

// ── compact row ──────────────────────────────────────────────
export function DropCardCompact({ d, onPress }: { d: Drop; onPress?: () => void }) {
  const T = useTheme();
  return (
    <Touchable onPress={onPress} scale={0.994} accessibilityLabel={dropA11yLabel(d)}>
      <View style={{ backgroundColor: T.surface, borderRadius: 14, overflow: 'hidden', flexDirection: 'row', borderWidth: 1, borderColor: T.line }}>
        <Placeholder label="" uri={venuePhotoUrl(d)} style={{ width: 86 }} />
        <View style={{ paddingVertical: 13, paddingHorizontal: 15, flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            <Text numberOfLines={2} style={{ flex: 1, ...fontUI(600), fontSize: 17, letterSpacing: -0.26, color: T.text }}>
              {d.venue}
            </Text>
            <Text style={{ ...fontMono(600, 17), fontSize: 17, color: T.text }}>{money(d.now)}</Text>
          </View>
          <MetaLine d={d} style={{ marginTop: 3, fontSize: 12.5 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            <Live d={d} size={12.5} />
            <DiscountChip now={d.now} usual={d.usual} />
          </View>
        </View>
      </View>
    </Touchable>
  );
}

// ── switch ───────────────────────────────────────────────────
export function Switch({
  on, onChange, disabled, accessibilityLabel,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const T = useTheme();
  return (
    <Pressable
      onPress={() => { hapticSelection(); onChange(!on); }}
      disabled={disabled}
      hitSlop={{ top: 7, bottom: 7, left: 4, right: 4 }}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: on, disabled: !!disabled }}
      style={{
        width: 51, height: 31, borderRadius: 999, padding: 2, opacity: disabled ? 0.5 : 1,
        backgroundColor: on ? T.accent : T.line2,
        flexDirection: 'row', justifyContent: on ? 'flex-end' : 'flex-start', alignItems: 'center',
      }}
    >
      <View
        style={{
          width: 27, height: 27, borderRadius: 14, backgroundColor: '#fff',
          shadowColor: '#000', shadowOpacity: 0.24, shadowRadius: 1.5, shadowOffset: { width: 0, height: 1 }, elevation: 2,
        }}
      />
    </Pressable>
  );
}

// ── radio (selected card, etc.) ──────────────────────────────
// Visual only: the row that contains it carries the selected state.
export function Radio({ on }: { on: boolean }) {
  const T = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: on ? T.accent : T.line2, alignItems: 'center', justifyContent: 'center' }}
    >
      {on && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: T.accent }} />}
    </View>
  );
}

// ── stepper ──────────────────────────────────────────────────
export function Stepper({
  value, onChange, min = 1, max = 8, size = 44, label = 'Party size',
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  size?: number;
  /** What's being counted, for VoiceOver ("Party size, 2"). */
  label?: string;
}) {
  const T = useTheme();
  const set = (v: number) => {
    const next = Math.max(min, Math.min(max, v));
    if (next !== value) { hapticSelection(); onChange(next); }
  };
  const btn = (glyph: string, fn: () => void, dis: boolean) => (
    <Pressable
      onPress={dis ? undefined : fn}
      // The adjustable container below is what VoiceOver focuses.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={({ pressed }) => ({
        width: size, height: size, borderRadius: 8, backgroundColor: T.fill,
        alignItems: 'center', justifyContent: 'center', opacity: dis ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ ...fontUI(400), fontSize: 22, lineHeight: 26, color: dis ? T.faint : T.text }}>{glyph}</Text>
    </Pressable>
  );
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text: String(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment') set(value + 1);
        if (e.nativeEvent.actionName === 'decrement') set(value - 1);
      }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}
    >
      {btn('−', () => set(value - 1), value <= min)}
      <Text style={{ ...fontMono(600), fontSize: 24, color: T.text, minWidth: 28, textAlign: 'center' }}>{value}</Text>
      {btn('+', () => set(value + 1), value >= max)}
    </View>
  );
}

// ── 6-digit code ─────────────────────────────────────────────
// One visual for every code in the app: the booking door code, the huddle
// group code and (as an input) the phone sign-in code.
const CODE_SIZES = {
  sm: { w: 26, h: 34, f: 17, r: 7, gap: 5 },
  md: { w: 40, h: 52, f: 26, r: 9, gap: 6 },
  lg: { w: 42, h: 58, f: 32, r: 10, gap: 6 },
};
// Code cells are fixed boxes; let digits grow a little with Dynamic Type, not overflow.
const CODE_MAX_SCALE = 1.3;

export function CodeDisplay({
  code, size = 'md', label, style,
}: {
  code: string;
  size?: keyof typeof CODE_SIZES;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const T = useTheme();
  const s = CODE_SIZES[size];
  const chars = (code || '').replace(/\s/g, '').split('');
  return (
    <View style={[{ alignItems: size === 'sm' ? 'flex-start' : 'center', gap: 10 }, style]}>
      {label ? <Label>{label}</Label> : null}
      <View
        style={{ flexDirection: 'row', gap: s.gap }}
        accessible
        accessibilityLabel={`${label ?? 'Code'} ${chars.join(' ')}`}
      >
        {chars.map((ch, i) => (
          <View
            key={i}
            style={{
              minWidth: s.w, minHeight: s.h, borderRadius: s.r, backgroundColor: T.fill,
              borderWidth: 1, borderColor: T.line, alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Text maxFontSizeMultiplier={CODE_MAX_SCALE} style={{ ...fontMono(600), fontSize: s.f, color: T.text }}>{ch}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function CodeInput({
  value, onChange, length = 6, autoFocus, onComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  autoFocus?: boolean;
  onComplete?: (v: string) => void;
}) {
  const T = useTheme();
  const [focused, setFocused] = useState(!!autoFocus);
  const caret = useBlink(focused, 0);
  return (
    <View style={{ alignSelf: 'stretch' }}>
      <View
        style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {Array.from({ length }).map((_, i) => {
          const ch = value[i];
          const current = focused && (i === value.length || (value.length === length && i === length - 1));
          return (
            <View
              key={i}
              style={{
                flex: 1, maxWidth: 52, minHeight: 62, borderRadius: 10, backgroundColor: T.fill,
                borderWidth: 1.5, borderColor: current ? T.accent : 'transparent',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              {ch ? (
                <Text maxFontSizeMultiplier={CODE_MAX_SCALE} style={{ ...fontMono(600), fontSize: 28, color: T.text }}>{ch}</Text>
              ) : current ? (
                <Animated.View style={{ width: 2, height: 26, borderRadius: 1, backgroundColor: T.accent, opacity: caret }} />
              ) : null}
            </View>
          );
        })}
      </View>
      {/* The real input sits invisibly over the cells so taps, paste and SMS autofill all work. */}
      <TextInput
        value={value}
        onChangeText={(t) => {
          const next = t.replace(/\D/g, '').slice(0, length);
          onChange(next);
          if (next.length === length) onComplete?.(next);
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        autoFocus={autoFocus}
        caretHidden
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={`Verification code, ${length} digits`}
        accessibilityValue={{ text: value ? value.split('').join(' ') : 'Empty' }}
        style={[FILL, { opacity: 0.011, color: 'transparent', fontSize: 1 }]}
      />
    </View>
  );
}

// ── text field ───────────────────────────────────────────────
export const Field = forwardRef<TextInput, TextInputProps & { prefix?: string; containerStyle?: StyleProp<ViewStyle> }>(
  function Field({ prefix, style, containerStyle, onFocus, onBlur, ...rest }, ref) {
    const T = useTheme();
    const [focused, setFocused] = useState(false);
    return (
      <View
        style={[{
          flexDirection: 'row', alignItems: 'center', minHeight: 52, borderRadius: 10, backgroundColor: T.fill,
          paddingHorizontal: 14, borderWidth: 1, borderColor: focused ? T.accent : 'transparent',
        }, containerStyle]}
      >
        {prefix ? (
          <Text accessibilityElementsHidden importantForAccessibility="no" style={{ ...fontUI(400, 17), fontSize: 17, color: T.muted, marginRight: 6 }}>
            {prefix}
          </Text>
        ) : null}
        <TextInput
          ref={ref}
          placeholderTextColor={T.faint}
          accessibilityLabel={typeof rest.placeholder === 'string' ? rest.placeholder : undefined}
          {...rest}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          style={[
            { flex: 1, alignSelf: 'stretch', paddingVertical: 12, ...fontUI(400), fontSize: 17, letterSpacing: -0.19, color: T.text },
            Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
            style,
          ]}
        />
      </View>
    );
  },
);

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
          <View key={i} style={{ width: cell, height: cell, borderRadius: 1, backgroundColor: on ? '#0A0A0A' : 'transparent' }} />
        ))}
      </View>
    </View>
  );
}

// ── map pin ──────────────────────────────────────────────────
export function Pin({
  active, onPress, label, accessibilityLabel,
}: {
  active?: boolean;
  onPress?: () => void;
  label: string;
  accessibilityLabel?: string;
}) {
  const T = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: !!active }}
      style={{ alignItems: 'center' }}
    >
      {active && (
        <View style={{ position: 'absolute', top: -8, width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: T.accent, opacity: 0.55 }} />
      )}
      <View
        style={{
          backgroundColor: T.accent, height: active ? 30 : 26, paddingHorizontal: 11, borderRadius: 999,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Text maxFontSizeMultiplier={1} style={{ ...fontMono(600, 13), fontSize: 13, color: T.accentInk }}>{label}</Text>
      </View>
      <View style={{ marginTop: -1 }}>
        <PinTriangle color={T.accent} />
      </View>
    </Pressable>
  );
}

// ── location (header sub-line) ───────────────────────────────
export function LocPill({ label = 'All Sydney', onPress }: { label?: string; onPress?: () => void }) {
  const T = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={`Showing drops in ${label}`}
      accessibilityHint="Changes the area"
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', opacity: pressed ? 0.6 : 1 })}
    >
      <Text style={{ ...fontUI(400), fontSize: 17, letterSpacing: -0.19, color: T.muted }}>{label}</Text>
      <View style={{ transform: [{ rotate: '90deg' }], marginTop: 1 }}>
        <ChevronRight size={6} color={T.muted} />
      </View>
    </Pressable>
  );
}

// ── avatar (initials on glass) ───────────────────────────────
export function Avatar({ size = 34, initials = '' }: { size?: number; initials?: string }) {
  const T = useTheme();
  return (
    <Glass radius={size / 2} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Text maxFontSizeMultiplier={1} style={{ ...fontUI(600), fontSize: size * 0.38, color: T.text }}>{initials}</Text>
    </Glass>
  );
}

// ── empty state ──────────────────────────────────────────────
export function EmptyState({
  title, body, action, mark = true, style,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
  mark?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const T = useTheme();
  return (
    <View style={[{ alignItems: 'center', paddingHorizontal: 36, gap: 16 }, style]}>
      {mark && <Radar size={56} decorative />}
      <Text accessibilityRole="header" style={{ ...fontUI(600), fontSize: 21, letterSpacing: -0.3, color: T.text, textAlign: 'center' }}>{title}</Text>
      {body ? (
        <Text style={{ ...fontUI(400), fontSize: 17, lineHeight: 25, letterSpacing: -0.19, color: T.muted, textAlign: 'center', maxWidth: 320, marginTop: -8 }}>
          {body}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: 6 }}>{action}</View> : null}
    </View>
  );
}

// ── bottom sheet ─────────────────────────────────────────────
/**
 * Sheet content: header, scrolling body and pinned footer.
 *
 * `native` — the route is presented as an iOS formSheet, which already
 * provides the scrim, grabber, detents and swipe-to-dismiss. Render only the
 * content and let it fill the sheet.
 *
 * Otherwise (web, Android, or inside a <Modal>) this draws its own scrim,
 * grabber and rise animation.
 */
export function SheetFrame({
  onClose, title, subtitle, leading, action, footer, children, maxHeight = '88%', scroll = true, bodyStyle, native = false,
}: {
  onClose: () => void;
  title?: string;
  subtitle?: string;
  leading?: React.ReactNode;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  maxHeight?: DimensionValue;
  scroll?: boolean;
  bodyStyle?: StyleProp<ViewStyle>;
  native?: boolean;
}) {
  const T = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const rise = useRef(new Animated.Value(native ? 1 : 0)).current;
  useEffect(() => {
    if (native) return;
    Animated.timing(rise, { toValue: 1, duration: reduceMotion ? 160 : 300, easing: EASE, useNativeDriver: NATIVE_DRIVER }).start();
  }, [rise, native, reduceMotion]);
  const bottomPad = insets.bottom > 0 ? insets.bottom + 6 : 24;

  const header = (title || action || leading) && (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: native ? 22 : 12, paddingBottom: 14 }}>
      {leading}
      <View style={{ flex: 1, minWidth: 0 }}>
        {title ? (
          <Text accessibilityRole="header" numberOfLines={2} style={{ ...fontUI(600), fontSize: 22, letterSpacing: -0.48, color: T.text }}>{title}</Text>
        ) : null}
        {subtitle ? (
          <Text numberOfLines={2} style={{ ...fontUI(400, 13), fontSize: 13, color: T.muted, marginTop: 2 }}>{subtitle}</Text>
        ) : null}
      </View>
      {action}
      {/* Swipe-to-dismiss is a gesture; VoiceOver users still need a button. */}
      {native && !action && !footer ? (
        <TextBtn onPress={onClose} color={T.accent} weight={500} style={{ paddingHorizontal: 4 }}>Done</TextBtn>
      ) : null}
    </View>
  );

  const body = scroll ? (
    <ScrollView
      style={native ? { flex: 1 } : { flexShrink: 1 }}
      contentContainerStyle={[{ paddingBottom: footer ? 12 : bottomPad }, bodyStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ paddingBottom: footer ? 0 : bottomPad }, native ? { flex: 1 } : null, bodyStyle]}>{children}</View>
  );

  const footerView = footer ? (
    <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: bottomPad, borderTopWidth: 0.5, borderTopColor: T.line, gap: 10 }}>
      {footer}
    </View>
  ) : null;

  if (native) {
    // react-native-screens sizes a formSheet's ScrollView to the current detent
    // only when the sheet has at most two direct subviews: an optional header,
    // then the ScrollView (RNSScreenContentWrapper.mm). Anything more — a pinned
    // footer, or layout-only wrappers that Fabric flattens into loose children —
    // breaks that, and the bottom of the sheet lays out off-screen at smaller
    // detents. iOS has no pinned sheet footer (native-stack's
    // unstable_sheetFooter is Android-only), so the footer scrolls with the
    // content. The sheet background comes from the route's contentStyle, and on
    // iPad the formSheet is already a centred, form-width card.
    return (
      <>
        {header ? <View collapsable={false}>{header}</View> : null}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: bottomPad }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={bodyStyle}>{children}</View>
          {footer ? <View style={{ paddingHorizontal: 16, paddingTop: 20, gap: 10 }}>{footer}</View> : null}
        </ScrollView>
      </>
    );
  }

  return (
    <View style={{ flex: 1, justifyContent: 'flex-end' }} accessibilityViewIsModal>
      <Animated.View style={[FILL, { backgroundColor: 'rgba(0,0,0,0.42)', opacity: rise }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        style={[
          {
            width: '100%', maxWidth: READABLE_WIDTH, alignSelf: 'center',
            maxHeight, backgroundColor: T.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden',
            transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [reduceMotion ? 0 : 480, 0] }) }],
            opacity: reduceMotion ? rise : 1,
          },
          T.floatShadow,
        ]}
      >
        <View style={{ alignItems: 'center', paddingTop: 9 }}>
          <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: T.line2 }} />
        </View>
        {header}
        {body}
        {footerView}
      </Animated.View>
    </View>
  );
}

// ── grouped list ─────────────────────────────────────────────
export function Group({
  label, footer, children, style, inset = 48,
}: {
  label?: string;
  footer?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  inset?: number;
}) {
  const T = useTheme();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[{ marginTop: 32 }, style]}>
      {label ? <Label style={{ marginHorizontal: 16, marginBottom: 7 }}><Text accessibilityRole="header">{label}</Text></Label> : null}
      <View style={{ backgroundColor: T.surface, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: T.line }}>
        {items.map((c, i) => (
          <View key={i}>
            {c}
            {i < items.length - 1 && <View style={{ height: 0.5, backgroundColor: T.line, marginLeft: inset }} />}
          </View>
        ))}
      </View>
      {footer ? <Label style={{ marginHorizontal: 16, marginTop: 7, lineHeight: 18 }}>{footer}</Label> : null}
    </View>
  );
}

export function Row({
  icon, label, sublabel, value, trailing, onPress, destructive, accent, disabled, chevron, selected,
}: {
  icon?: React.ReactNode;
  label: React.ReactNode;
  sublabel?: string;
  value?: string | number | null;
  trailing?: React.ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  accent?: boolean;
  disabled?: boolean;
  chevron?: boolean;
  /** For pick-one lists: announced as selected. */
  selected?: boolean;
}) {
  const T = useTheme();
  const tap = !!onPress;
  const showChevron = chevron ?? (tap && !trailing);
  const body = (pressed: boolean) => (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: sublabel ? 10 : 7, paddingHorizontal: 16,
        minHeight: 44, backgroundColor: pressed ? T.fill : 'transparent', opacity: disabled ? 0.45 : 1,
      }}
    >
      {icon ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 18, alignItems: 'center' }}>
          {icon}
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof label === 'string' ? (
          <Text
            numberOfLines={2}
            style={{ ...fontUI(400), fontSize: 17, letterSpacing: -0.19, color: destructive || accent ? T.accent : T.text }}
          >
            {label}
          </Text>
        ) : (
          label
        )}
        {sublabel ? (
          <Text numberOfLines={2} style={{ ...fontUI(400, 13), fontSize: 13, color: T.muted, marginTop: 2 }}>{sublabel}</Text>
        ) : null}
      </View>
      {value != null && value !== '' ? (
        <Text numberOfLines={1} style={{ ...fontUI(400), fontSize: 17, letterSpacing: -0.19, color: T.muted, maxWidth: '50%' }}>
          {value}
        </Text>
      ) : null}
      {trailing}
      {showChevron ? <ChevronRight size={8} color={T.faint} /> : null}
    </View>
  );
  if (!tap) return body(false);
  const a11yLabel = typeof label === 'string'
    ? [label, value != null && value !== '' ? String(value) : null, sublabel ?? null].filter(Boolean).join(', ')
    : undefined;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityState={{ disabled: !!disabled, selected: selected }}
    >
      {({ pressed }) => body(pressed)}
    </Pressable>
  );
}

export { useState };
