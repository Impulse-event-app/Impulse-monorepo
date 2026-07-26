// Shared style primitives for the venue portal — ported from the tokens and
// helpers in "Impulse Venue Redesign.dc.html". Kept as React.CSSProperties so
// they compose naturally with the app's existing inline-style idiom.

import type { CSSProperties } from "react";

export const FONT_DISPLAY = "var(--font-display)";
export const FONT_MONO = "var(--font-mono-sg)";
export const FONT_BODY = "var(--font-body)";

/** Standard card surface (18px radius). */
export const card: CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: 18,
};

/** Uppercase mono field label. */
export const fieldLabel: CSSProperties = {
  display: "block",
  fontFamily: FONT_MONO,
  fontSize: 11,
  letterSpacing: ".1em",
  textTransform: "uppercase",
  color: "var(--faint)",
  marginBottom: 9,
};

/** Sunken text input / select / textarea. */
export const fieldInput: CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 11,
  border: "1px solid var(--line2)",
  background: "var(--sunken)",
  color: "var(--text)",
  fontSize: 14.5,
  fontFamily: FONT_BODY,
};

/** Small mono eyebrow (accent-coloured section kicker). */
export const eyebrow: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: 11,
  letterSpacing: ".14em",
  textTransform: "uppercase",
  color: "var(--faint)",
};

/** Primary accent button. */
export const btnPrimary: CSSProperties = {
  padding: "14px 26px",
  borderRadius: 12,
  border: "none",
  background: "var(--accent)",
  color: "var(--accent-ink)",
  fontFamily: FONT_DISPLAY,
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  boxShadow: "0 10px 30px var(--accent-soft)",
};

/** Secondary / ghost button. */
export const btnGhost: CSSProperties = {
  padding: "14px 22px",
  borderRadius: 12,
  border: "1px solid var(--line2)",
  background: "var(--surface)",
  color: "var(--text)",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
};

/** 32px square icon button. */
export const iconBtn: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  border: "1px solid var(--line2)",
  background: "var(--surface)",
  color: "var(--muted)",
  cursor: "pointer",
  fontSize: 13,
  display: "grid",
  placeItems: "center",
};

export const iconBtnDanger: CSSProperties = {
  ...iconBtn,
  border: "1px solid color-mix(in oklab, var(--bad) 35%, var(--line2))",
  color: "var(--bad)",
};

/** Pill toggle track. `sm` = the 36×20 compact variant. */
export function switchTrack(on: boolean, sm = false): CSSProperties {
  const w = sm ? 36 : 42;
  const h = sm ? 20 : 24;
  return {
    position: "relative",
    width: w,
    height: h,
    borderRadius: 999,
    border: "none",
    cursor: "pointer",
    background: on ? "var(--accent)" : "var(--line2)",
    transition: "background .18s",
    padding: 0,
    flexShrink: 0,
  };
}

export function switchKnob(on: boolean, sm = false): CSSProperties {
  const h = sm ? 20 : 24;
  const k = h - 6;
  const off = on ? (sm ? 16 : 18) : 0;
  return {
    position: "absolute",
    top: 3,
    left: 3,
    width: k,
    height: k,
    borderRadius: "50%",
    background: "#fff",
    transform: `translateX(${off}px)`,
    transition: "transform .18s",
    boxShadow: "0 1px 3px rgba(0,0,0,.3)",
  };
}

/** Status badge tones (fg / bg / border / dot). */
export type Tone = "soft" | "solid" | "neutral" | "danger" | "good" | "info";

const TONE_MAP: Record<Tone, [string, string, string, string]> = {
  soft: ["var(--accent)", "var(--accent-soft)", "color-mix(in oklab, var(--accent) 30%, transparent)", "var(--accent)"],
  solid: ["var(--accent-ink)", "var(--accent)", "transparent", "var(--accent-ink)"],
  neutral: ["var(--muted)", "var(--surface2)", "var(--line2)", "var(--faint)"],
  danger: ["var(--bad)", "color-mix(in oklab, var(--bad) 12%, transparent)", "color-mix(in oklab, var(--bad) 30%, transparent)", "var(--bad)"],
  good: ["var(--good)", "color-mix(in oklab, var(--good) 12%, transparent)", "color-mix(in oklab, var(--good) 30%, transparent)", "var(--good)"],
  info: ["var(--info)", "color-mix(in oklab, var(--info) 12%, transparent)", "color-mix(in oklab, var(--info) 30%, transparent)", "var(--info)"],
};

export function toneBadge(tone: Tone): { badge: CSSProperties; dot: CSSProperties } {
  const [fg, bg, bd, dot] = TONE_MAP[tone];
  return {
    badge: {
      display: "inline-flex",
      alignItems: "center",
      gap: 7,
      padding: "5px 11px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 600,
      textTransform: "capitalize",
      color: fg,
      background: bg,
      border: `1px solid ${bd}`,
    },
    dot: { width: 6, height: 6, borderRadius: "50%", background: dot },
  };
}
