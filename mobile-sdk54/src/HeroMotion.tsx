// HeroMotion.tsx — entry hero: tilted columns of activity emblems drifting past.
// Each emblem is drawn from the radar's vocabulary (concentric rings, one core,
// flat white on ink or Impulse Red). Honours Reduce Motion by holding still.
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleProp, Text, TextStyle, View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import { IMPULSE_RED, fontUI, useApp } from './theme';
import { EASE, Scrim } from './components';

const NATIVE_DRIVER = Platform.OS !== 'web';
const S = 3.4; // stroke weight on the 100 grid
const GAP = 10;

// ── emblems ──────────────────────────────────────────────────
const GLYPHS: Record<string, (c: string) => React.ReactNode> = {
  bowling: (c) => (
    <>
      {[-13, 0, 13].map((x) => (
        <Path key={x} d={`M${50 + x} 26c4 0 5 5 4 9s-2 6-2 10h-4c0-4-1-6-2-10s-2-9 4-9z`} fill={c} />
      ))}
      <Circle cx={50} cy={70} r={11} fill="none" stroke={c} strokeWidth={S} />
      <Circle cx={50} cy={70} r={2.6} fill={c} />
    </>
  ),
  karaoke: (c) => (
    <>
      <Rect x={43} y={24} width={14} height={26} rx={7} fill="none" stroke={c} strokeWidth={S} />
      <Path d="M50 50v13M42 70h16" stroke={c} strokeWidth={S} strokeLinecap="round" />
      <Circle cx={50} cy={37} r={22} fill="none" stroke={c} strokeWidth={S - 1.2} opacity={0.45} />
      <Circle cx={50} cy={37} r={33} fill="none" stroke={c} strokeWidth={S - 1.2} opacity={0.2} />
    </>
  ),
  pool: (c) => (
    <>
      <Circle cx={50} cy={34} r={9} fill="none" stroke={c} strokeWidth={S} />
      <Circle cx={38} cy={54} r={9} fill="none" stroke={c} strokeWidth={S} />
      <Circle cx={62} cy={54} r={9} fill="none" stroke={c} strokeWidth={S} />
      <Circle cx={50} cy={74} r={6.5} fill={c} />
    </>
  ),
  escape: (c) => (
    <>
      <Circle cx={50} cy={50} r={30} fill="none" stroke={c} strokeWidth={S - 1.2} strokeDasharray="24 14" strokeLinecap="round" />
      <Circle cx={50} cy={43} r={9} fill="none" stroke={c} strokeWidth={S} />
      <Path d="M46 52l-3 14h14l-3-14" fill="none" stroke={c} strokeWidth={S} strokeLinejoin="round" />
    </>
  ),
  golf: (c) => (
    <>
      <Path d="M38 70V24" stroke={c} strokeWidth={S} strokeLinecap="round" />
      <Path d="M38 27h24l-7 8 7 8H38z" fill={c} />
      <Ellipse cx={52} cy={72} rx={17} ry={5.5} fill="none" stroke={c} strokeWidth={S - 1} />
      <Circle cx={52} cy={72} r={4} fill={c} />
    </>
  ),
  comedy: (c) => (
    <>
      <Circle cx={50} cy={30} r={10} fill="none" stroke={c} strokeWidth={S} />
      <Path d="M50 40v10M36 74c0-8 6-14 14-14s14 6 14 14" stroke={c} strokeWidth={S} strokeLinecap="round" fill="none" />
      <Path d="M70 22c5 5 5 13 0 18" stroke={c} strokeWidth={S - 1.2} strokeLinecap="round" fill="none" opacity={0.6} />
      <Path d="M30 22c-5 5-5 13 0 18" stroke={c} strokeWidth={S - 1.2} strokeLinecap="round" fill="none" opacity={0.6} />
    </>
  ),
  music: (c) => (
    <>
      {[0, 1, 2].map((i) => (
        <Circle key={i} cx={50} cy={50} r={14 + i * 12} fill="none" stroke={c} strokeWidth={S - i * 0.7} opacity={1 - i * 0.3} />
      ))}
      <Circle cx={50} cy={50} r={5} fill={c} />
    </>
  ),
  darts: (c) => (
    <>
      <Circle cx={50} cy={50} r={30} fill="none" stroke={c} strokeWidth={S - 1.6} />
      <Circle cx={50} cy={50} r={18} fill="none" stroke={c} strokeWidth={S} />
      <Circle cx={50} cy={50} r={6} fill={c} />
      <Path d="M50 50l26-20" stroke={c} strokeWidth={S} strokeLinecap="round" />
    </>
  ),
};

type Tile = [label: string, glyph: keyof typeof GLYPHS, red: boolean];
const COLS: { dir: 'up' | 'down'; dur: number; tiles: Tile[] }[] = [
  { dir: 'up', dur: 46, tiles: [['Bowling', 'bowling', true], ['Karaoke', 'karaoke', false], ['Pool', 'pool', false], ['Escape rooms', 'escape', true]] },
  { dir: 'down', dur: 56, tiles: [['Mini golf', 'golf', false], ['Comedy', 'comedy', true], ['Live music', 'music', false], ['Darts', 'darts', false]] },
  { dir: 'up', dur: 50, tiles: [['Bowling', 'bowling', false], ['Live music', 'music', true], ['Karaoke', 'karaoke', false], ['Mini golf', 'golf', false]] },
];

function HeroTile({ label, glyph, red, w }: { label: string; glyph: keyof typeof GLYPHS; red: boolean; w: number }) {
  const { T } = useApp();
  const ink = red ? '#FFFFFF' : T.text;
  return (
    <View
      style={{
        width: w, height: (w * 4) / 3, borderRadius: 12, padding: 10, gap: 11,
        backgroundColor: red ? IMPULSE_RED : T.dark ? T.surface2 : T.surface,
        borderWidth: red ? 0 : 1, borderColor: T.line2,
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Svg width={w * 0.54} height={w * 0.54} viewBox="0 0 100 100">
        {GLYPHS[glyph](ink)}
      </Svg>
      <Text numberOfLines={1} style={{ ...fontUI(500), fontSize: 12, color: ink, opacity: red ? 0.95 : 0.88, textAlign: 'center' }}>
        {label}
      </Text>
    </View>
  );
}

function HeroColumn({ col, index, w, still }: { col: (typeof COLS)[number]; index: number; w: number; still: boolean }) {
  const loop = col.tiles.length * ((w * 4) / 3 + GAP);
  const v = useRef(new Animated.Value((index * 7) / col.dur)).current;
  useEffect(() => {
    if (still) return;
    // Re-run a single timing from its completion callback rather than
    // Animated.loop, which doesn't restart reliably on react-native-web.
    let alive = true;
    const run = (from: number) => {
      if (!alive) return;
      v.setValue(from);
      Animated.timing(v, { toValue: 1, duration: col.dur * 1000 * (1 - from), easing: Easing.linear, useNativeDriver: NATIVE_DRIVER })
        .start(({ finished }) => { if (finished && alive) run(0); });
    };
    run(((index * 7) % col.dur) / col.dur);
    return () => { alive = false; v.stopAnimation(); };
  }, [still, col.dur, index, v]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: col.dir === 'up' ? [0, -loop] : [-loop, 0] });
  return (
    <View style={{ width: w, overflow: 'hidden' }}>
      <Animated.View style={{ gap: GAP, transform: [{ translateY }] }}>
        {[...col.tiles, ...col.tiles].map(([label, glyph, red], n) => (
          <HeroTile key={n} label={label} glyph={glyph} red={red} w={w} />
        ))}
      </Animated.View>
    </View>
  );
}

// Scrim over the columns, top → bottom: solid at the very top, see-through
// through the middle, then solid again under the copy. [offset, bg opacity]
const HERO_SCRIM: [number, number][] = [[0, 1], [0.08, 0.28], [0.38, 0.3], [0.58, 0.9], [0.75, 1], [1, 1]];

/** Drifting emblem columns with a scrim; `children` sit on the solid lower third. */
export function HeroMotion({ children }: { children: React.ReactNode }) {
  const { T } = useApp();
  const [w, setW] = useState(0);
  const [still, setStill] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setStill).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setStill);
    return () => sub.remove();
  }, []);
  const colW = w > 0 ? (w + 28 - GAP * 2) / 3 : 0;
  return (
    <View style={{ flex: 1, overflow: 'hidden' }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {colW > 0 && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute', top: 96, left: -14, right: -14, bottom: -60, flexDirection: 'row', gap: GAP,
            transform: [{ rotate: '-4deg' }, { scale: 1.06 }],
          }}
        >
          {COLS.map((col, i) => <HeroColumn key={i} col={col} index={i} w={colW} still={still} />)}
        </View>
      )}
      <Scrim stops={HERO_SCRIM} />
      <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end' }}>
        {children}
      </View>
    </View>
  );
}

const HERO_WORDS = ['bowling', 'karaoke', 'mini golf', 'escape rooms', 'live music', 'darts'];

/** The rotating red word under "Tonight, it's". Holds on one word under Reduce Motion. */
export function HeroWord({ style }: { style?: StyleProp<TextStyle> }) {
  const { T } = useApp();
  const [i, setI] = useState(0);
  const [still, setStill] = useState(false);
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setStill).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setStill);
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (still) { v.setValue(1); return; }
    const id = setInterval(() => {
      Animated.timing(v, { toValue: 0, duration: 220, easing: EASE, useNativeDriver: NATIVE_DRIVER }).start(() => {
        setI((n) => (n + 1) % HERO_WORDS.length);
        Animated.timing(v, { toValue: 1, duration: 380, easing: EASE, useNativeDriver: NATIVE_DRIVER }).start();
      });
    }, 2100);
    return () => clearInterval(id);
  }, [v, still]);
  return (
    // Not a live region: a word announced every two seconds would drown out VoiceOver.
    <Animated.Text
      style={[
        style,
        { color: T.accent, opacity: v, transform: still ? [] : [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] },
      ]}
    >
      {HERO_WORDS[i]}.
    </Animated.Text>
  );
}
