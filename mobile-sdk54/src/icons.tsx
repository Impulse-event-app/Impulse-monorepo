// icons.tsx — Impulse: SVG icons ported from the design handoff.
import React from 'react';
import Svg, { Circle, Path, Rect, G } from 'react-native-svg';

type IconProps = { size?: number; color?: string };

// ── tab bar icons ────────────────────────────────────────────
export function TabTonight({ color = '#000', on = false }: IconProps & { on?: boolean }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} fill="none" stroke={color} strokeWidth={1.8} opacity={on ? 0.5 : 0.9} />
      <Circle cx={12} cy={12} r={3.6} fill={color} />
    </Svg>
  );
}
export function TabMap({ color = '#000', on = false }: IconProps & { on?: boolean }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round">
      <Path d="M12 21c4.5-4.2 7-7.6 7-11a7 7 0 10-14 0c0 3.4 2.5 6.8 7 11z" />
      <Circle cx={12} cy={10} r={2.4} fill={on ? color : 'none'} />
    </Svg>
  );
}
export function TabPlans({ color = '#000' }: IconProps) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 4h11l3 3v13H5z" />
      <Path d="M9 11h7M9 15h5" />
    </Svg>
  );
}
export function TabYou({ color = '#000', on = false }: IconProps & { on?: boolean }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={8} r={3.6} fill={on ? color : 'none'} />
      <Path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
    </Svg>
  );
}

// ── chrome ───────────────────────────────────────────────────
export function ChevronRight({ size = 8, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size * 1.75} viewBox="0 0 8 14">
      <Path d="M1 1l6 6-6 6" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
export function ChevronBack({ size = 11, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size * 1.64} viewBox="0 0 12 20" fill="none">
      <Path d="M10 2L2 10l8 8" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
export function ChevronDown({ size = 11, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round">
      <Path d="M2 4l4 4 4-4" />
    </Svg>
  );
}
export function Filter({ size = 15, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round">
      <Path d="M3 5h18M6 12h12M10 19h4" />
    </Svg>
  );
}
export function Search({ size = 17, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Circle cx={11} cy={11} r={7} />
      <Path d="M21 21l-4-4" strokeLinecap="round" />
    </Svg>
  );
}
export function LocationPin({ size = 13, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4}>
      <Path d="M12 21c4.5-4.2 7-7.6 7-11a7 7 0 10-14 0c0 3.4 2.5 6.8 7 11z" />
      <Circle cx={12} cy={10} r={2.4} fill={color} stroke="none" />
    </Svg>
  );
}

// ── profile row icons (16px, stroke = accent) ────────────────
export const RowIcons = {
  pin: (c: string) => (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinejoin="round">
      <Path d="M12 21c4.5-4.2 7-7.6 7-11a7 7 0 10-14 0c0 3.4 2.5 6.8 7 11z" />
      <Circle cx={12} cy={10} r={2.2} fill={c} stroke="none" />
    </Svg>
  ),
  star: (c: string) => (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2}>
      <Circle cx={12} cy={12} r={3} fill={c} stroke="none" />
      <Circle cx={12} cy={12} r={8} />
    </Svg>
  ),
  people: (c: string) => (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={9} cy={8} r={3} />
      <Path d="M3 20c0-3 2.7-5 6-5s6 2 6 5" />
      <Path d="M16 5.5a3 3 0 010 5.4M17 15c2.5.4 4 2.3 4 5" />
    </Svg>
  ),
  bell: (c: string) => (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 10a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6z" />
      <Path d="M10 20a2 2 0 004 0" />
    </Svg>
  ),
  clock: (c: string) => (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round">
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M12 8v4.5l3 2" />
    </Svg>
  ),
  mail: (c: string) => (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinejoin="round">
      <Rect x={3} y={5.5} width={18} height={13} rx={2.5} />
      <Path d="M4 7l8 5.5L20 7" />
    </Svg>
  ),
  moon: (c: string) => (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinejoin="round">
      <Path d="M20 14.5A8 8 0 019.5 4 7 7 0 1020 14.5z" />
    </Svg>
  ),
  card: (c: string) => (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinejoin="round">
      <Rect x={3} y={6} width={18} height={12} rx={2.5} />
      <Path d="M3 10h18" />
    </Svg>
  ),
  help: (c: string) => (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round">
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M9.5 9.5a2.5 2.5 0 014.3 1.7c0 1.7-2.3 1.8-2.3 3.3" />
      <Circle cx={11.5} cy={17.5} r={0.6} fill={c} stroke="none" />
    </Svg>
  ),
  doc: (c: string) => (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 3h8l4 4v14H6z" />
      <Path d="M9 11h6M9 15h4" />
    </Svg>
  ),
  shield: (c: string) => (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinejoin="round">
      <Path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
    </Svg>
  ),
};

// ── onboarding glyphs (big, 64px) ────────────────────────────
export function GlyphPin({ color = '#FF5A4D' }: IconProps) {
  return (
    <Svg width={64} height={64} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round">
      <Path d="M12 21.5c5-4.6 7.5-8.3 7.5-12A7.5 7.5 0 1 0 4.5 9.5c0 3.7 2.5 7.4 7.5 12z" />
      <Circle cx={12} cy={9.5} r={2.6} fill={color} stroke="none" />
    </Svg>
  );
}
export function GlyphBell({ color = '#FF5A4D' }: IconProps) {
  return (
    <Svg width={64} height={64} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 10a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" />
      <Path d="M10 20a2 2 0 0 0 4 0" />
      <Circle cx={18} cy={6} r={2.4} fill={color} stroke="none" />
    </Svg>
  );
}

// ── social logos ─────────────────────────────────────────────
export function AppleLogo({ size = 18, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M17.05 12.7c-.03-2.4 1.96-3.55 2.05-3.6-1.12-1.64-2.86-1.86-3.48-1.89-1.48-.15-2.89.87-3.64.87-.75 0-1.91-.85-3.14-.83-1.62.03-3.11.94-3.94 2.39-1.68 2.92-.43 7.24 1.2 9.61.8 1.16 1.75 2.46 3 2.41 1.21-.05 1.66-.78 3.12-.78 1.46 0 1.87.78 3.14.76 1.3-.02 2.12-1.18 2.91-2.35.92-1.35 1.3-2.66 1.32-2.73-.03-.01-2.53-.97-2.56-3.85zM14.7 5.6c.66-.8 1.11-1.92.99-3.03-.95.04-2.1.63-2.79 1.43-.61.71-1.15 1.84-1 2.92 1.06.08 2.14-.54 2.8-1.32z" />
    </Svg>
  );
}
export function GoogleLogo({ size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path fill="#4285F4" d="M22.5 12.2c0-.7-.06-1.4-.18-2.05H12v3.9h5.9a5 5 0 0 1-2.18 3.3v2.74h3.52c2.06-1.9 3.26-4.7 3.26-7.89z" />
      <Path fill="#34A853" d="M12 23c2.94 0 5.4-.97 7.2-2.64l-3.52-2.73c-.98.66-2.23 1.05-3.68 1.05-2.83 0-5.23-1.91-6.09-4.48H2.27v2.82A10.99 10.99 0 0 0 12 23z" />
      <Path fill="#FBBC05" d="M5.91 14.2a6.6 6.6 0 0 1 0-4.2V7.18H2.27a11 11 0 0 0 0 9.84l3.64-2.82z" />
      <Path fill="#EA4335" d="M12 5.5c1.6 0 3.03.55 4.16 1.62l3.12-3.12A10.98 10.98 0 0 0 12 1 10.99 10.99 0 0 0 2.27 7.18l3.64 2.82C6.77 7.42 9.17 5.5 12 5.5z" />
    </Svg>
  );
}
export function PhoneGlyph({ size = 17, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round">
      <Rect x={6} y={2.5} width={12} height={19} rx={3} />
      <Path d="M11 18.5h2" strokeLinecap="round" />
    </Svg>
  );
}

export function MailGlyph({ size = 17, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round">
      <Rect x={2} y={4} width={20} height={16} rx={3} />
      <Path d="M2 7l10 7 10-7" strokeLinecap="round" />
    </Svg>
  );
}

// ── map pin marker triangle (filled, used by Pin) ────────────
export function PinTriangle({ color = '#FF5A4D' }: IconProps) {
  return (
    <Svg width={10} height={7} viewBox="0 0 10 7">
      <Path d="M0 0h10L5 7z" fill={color} />
    </Svg>
  );
}

export { Svg, Path, Circle, Rect, G };
