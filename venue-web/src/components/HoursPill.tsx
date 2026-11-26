"use client";

// One day's opening hours as a pill on a 5am → 5am track: drag an edge to move
// open or close, drag the middle to shift both. Snaps to half hours. Closing
// after midnight is just the right-hand part of the track.

import React, { useRef, useState } from "react";
import { numeric } from "@/lib/ui";

const START = 5 * 60;          // the track starts at 5am…
const END = START + 24 * 60;   // …and ends at 5am the next morning
const STEP = 30;
const MIN_OPEN = 60;
const LABELS = [6, 9, 12, 15, 18, 21, 24, 27]; // hours on the track, 24+ = after midnight

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const snap = (m: number) => Math.round(m / STEP) * STEP;

/** "HH:MM" → minutes on the track (a close before the open is the next morning). */
function toTrack(hhmm: string, after?: number): number {
  const [h, m] = hhmm.split(":").map(Number);
  let mins = h * 60 + m;
  if (mins < START) mins += 24 * 60;
  if (after !== undefined && mins <= after) mins += 24 * 60;
  return clamp(mins, START, END);
}

const toHHMM = (m: number) => {
  const t = ((m % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

/** 1320 → "10pm", 1290 → "9:30pm", 1440 → "12am". */
function label(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const mins = m % 60;
  return `${h % 12 || 12}${mins ? `:${String(mins).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}

const pctOf = (m: number) => ((m - START) / (END - START)) * 100;

/** The hour labels for a column of HoursPills, drawn once above them. */
export function HoursScale() {
  return (
    <div aria-hidden style={{ position: "relative", height: 16 }}>
      {LABELS.map((h) => (
        <span key={h} style={{ ...numeric, position: "absolute", left: `${pctOf(h * 60)}%`, transform: "translateX(-50%)", fontSize: 11, color: "var(--faint)", whiteSpace: "nowrap" }}>
          {label(h * 60)}
        </span>
      ))}
    </div>
  );
}

interface Props {
  from: string;
  to: string;
  onChange: (next: { from: string; to: string }) => void;
  day: string;
}

export function HoursPill({ from, to, onChange, day }: Props) {
  const open = toTrack(from);
  const close = toTrack(to, open);
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: "start" | "end" | "move"; grab: number; open: number; close: number } | null>(null);
  const [active, setActive] = useState<"start" | "end" | "move" | null>(null);

  const pct = pctOf;
  const minuteAt = (x: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    return START + clamp((x - r.left) / r.width, 0, 1) * (END - START);
  };
  const set = (o: number, c: number) => onChange({ from: toHHMM(o), to: toHHMM(c) });

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const handle = (e.target as HTMLElement).closest<HTMLElement>("[data-edge]")?.dataset.edge as "start" | "end" | undefined;
    const m = minuteAt(e.clientX);
    let mode: "start" | "end" | "move";
    if (handle) mode = handle;
    else if (m > open && m < close) mode = "move";
    else mode = Math.abs(m - open) < Math.abs(m - close) ? "start" : "end"; // a tap on the track pulls the nearer edge
    drag.current = { mode, grab: m, open, close };
    setActive(mode);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    if (!handle && mode !== "move") onPointerMove(e);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const m = minuteAt(e.clientX);
    if (d.mode === "start") set(clamp(snap(m), START, d.close - MIN_OPEN), d.close);
    else if (d.mode === "end") set(d.open, clamp(snap(m), d.open + MIN_OPEN, END));
    else {
      const len = d.close - d.open;
      const o = clamp(snap(d.open + m - d.grab), START, END - len);
      set(o, o + len);
    }
  }

  function endDrag() {
    drag.current = null;
    setActive(null);
  }

  function onKey(edge: "start" | "end", e: React.KeyboardEvent) {
    const delta = e.key === "ArrowLeft" ? -STEP : e.key === "ArrowRight" ? STEP : 0;
    if (!delta) return;
    e.preventDefault();
    if (edge === "start") set(clamp(open + delta, START, close - MIN_OPEN), close);
    else set(open, clamp(close + delta, open + MIN_OPEN, END));
  }

  const hours = (close - open) / 60;
  const handle = (edge: "start" | "end"): React.CSSProperties => ({
    position: "absolute", top: 0, bottom: 0, [edge === "start" ? "left" : "right"]: 0, width: 18,
    display: "grid", placeItems: "center", cursor: "ew-resize", outline: "none", touchAction: "none",
  });

  return (
    <div style={{ minWidth: 0 }}>
      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{ position: "relative", height: 40, borderRadius: 999, background: "var(--sunken)", border: "1px solid var(--line2)", cursor: "pointer", touchAction: "none", userSelect: "none" }}
      >
        {/* Midnight */}
        <span aria-hidden style={{ position: "absolute", left: `${pct(24 * 60)}%`, top: 8, bottom: 8, width: 1, background: "var(--line2)" }} />
        <div
          style={{
            position: "absolute", top: 3, bottom: 3, left: `calc(${pct(open)}% + 1px)`, width: `calc(${pct(close) - pct(open)}% - 2px)`,
            borderRadius: 999, background: "var(--accent)", color: "#fff", cursor: active === "move" ? "grabbing" : "grab",
            boxShadow: active ? "0 6px 18px color-mix(in oklab, var(--accent) 40%, transparent)" : "none",
            transition: active ? "box-shadow .15s ease" : "left .18s ease, width .18s ease, box-shadow .15s ease",
            display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
          }}
        >
          <span style={{ ...numeric, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", padding: "0 20px", pointerEvents: "none" }}>
            {label(open)} – {label(close)}
            <span style={{ opacity: 0.75, fontWeight: 500 }}> · {Number.isInteger(hours) ? hours : hours.toFixed(1)}h</span>
          </span>
          {(["start", "end"] as const).map((edge) => (
            <span
              key={edge}
              data-edge={edge}
              role="slider"
              tabIndex={0}
              aria-label={`${day} ${edge === "start" ? "opens" : "closes"}`}
              aria-valuetext={label(edge === "start" ? open : close)}
              aria-valuemin={START}
              aria-valuemax={END}
              aria-valuenow={edge === "start" ? open : close}
              onKeyDown={(e) => onKey(edge, e)}
              style={handle(edge)}
            >
              <span style={{ width: 3, height: 16, borderRadius: 2, background: "rgba(255,255,255,.85)" }} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
