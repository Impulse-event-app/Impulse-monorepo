"use client";

// The new-deal screen (design D): the timeline over the venue's night on the
// left, the offer form under it, and a live preview of the guest's card on the
// right. Editing an existing deal still goes through DealForm.

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Clock, Eye, Infinity as InfinityIcon, Minus, Plus, TrendingUp, X } from "lucide-react";
import {
  MAX_GROUP_SIZE,
  UNLIMITED_SPOTS,
  bookingApi,
  dealApi,
  merchantApi,
  scheduleApi,
  venueApi,
  type Booking,
  type Deal,
  type DealCreate,
  type DealSchedule,
  type DealScheduleInput,
  type MerchantCompliance,
  type Venue,
} from "@/lib/api";
import { DAYS, parseHours, type WeekHours } from "@/lib/hours";
import { formatCurrency } from "@/lib/utils";
import { numeric, switchKnob, switchTrack } from "@/lib/ui";

const CATEGORIES = [
  "Bar", "Restaurant", "Cafe", "Bowling", "Mini Golf",
  "Escape Room", "Arcade", "Pool / Billiards", "Karaoke", "Other",
];

const DISCOUNTS = [20, 30, 40, 50];

// Demo values, set by hand: how many more guests a venue can expect on the day
// for a given discount, counting the new customers the app brings in on top of
// the venue's regulars (20% off → +12%, 50% → +30%). They keep rising so a deeper
// discount visibly pays off. Replace with fill data from real deals later.
const UPLIFT: [number, number][] = [[0, 0], [10, 5], [20, 12], [30, 18], [40, 24], [50, 30], [60, 37], [70, 44], [100, 60]];

/** % more guests for a discount, interpolating between the demo values. */
function upliftFor(discount: number): number {
  const d = clamp(discount, 0, 100);
  for (let i = 1; i < UPLIFT.length; i++) {
    const [d1, u1] = UPLIFT[i];
    if (d <= d1) {
      const [d0, u0] = UPLIFT[i - 1];
      return Math.round(u0 + ((d - d0) / (d1 - d0)) * (u1 - u0));
    }
  }
  return UPLIFT[UPLIFT.length - 1][1];
}

// "pp" is the only per-head price; anything else is one price for the whole
// group (booking_flow.py).
const UNITS = [
  { value: "pp", label: "per person" },
  { value: "/group", label: "per group" },
] as const;

const STEP = 30;            // the grid the window snaps to, in minutes
const MIDNIGHT = 24 * 60;   // a deal's slots all fall on its own date, so the window stops here
const FALLBACK = { start: 16 * 60, end: MIDNIGHT };
const QUIET_LENGTH = 120;
const MIN_HISTORY = 10;     // people booked before we suggest a quiet stretch

// A soft spring with a little overshoot, for things that slide into place.
const SPRING = "cubic-bezier(.34,1.36,.64,1)";
// The pill sits this far inside its groove on every side; the rows above use
// the same inset so hours, bars and the pill all line up.
const INSET = 7;

// ── Time helpers ─────────────────────────────────────────────────────────────

/** Minutes since midnight → "9:00 PM", the slot shape bookings parse. */
function slotString(m: number): string {
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** "9:00 PM" / "9pm" / "9:30pm" → minutes, or null. */
function slotMinutes(slot: string): number | null {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*([AaPp])[Mm]$/.exec(slot.trim());
  if (!m) return null;
  const h = Number(m[1]) % 12 + (m[3].toLowerCase() === "p" ? 12 : 0);
  return h * 60 + Number(m[2] ?? 0);
}

/** 1260 → "9pm", 1290 → "9:30pm", 1440 → "12am". */
function shortTime(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const mins = m % 60;
  const suffix = h < 12 ? "am" : "pm";
  return `${h % 12 || 12}${mins ? `:${String(mins).padStart(2, "0")}` : ""}${suffix}`;
}

/** 1260 → "9:00pm", the slot pills on the guest card. */
function pillTime(m: number): string {
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${String(m % 60).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}

/** (1260, 1380) → "9–11pm"; (690, 780) → "11:30am–1pm". */
function rangeLabel(a: number, b: number): string {
  const from = shortTime(a);
  const to = shortTime(b);
  const sameHalf = from.slice(-2) === to.slice(-2) && b < MIDNIGHT;
  return `${sameHalf ? from.slice(0, -2) : from}–${to}`;
}

/** 30 → "30 min", 60 → "1 hr", 150 → "2.5 hrs". */
function durationLabel(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = mins / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} hr${h === 1 ? "" : "s"}`;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

// ── Days ─────────────────────────────────────────────────────────────────────

interface DayOption {
  iso: string;        // "2026-10-28"
  tab: string;        // "Tonight" / "Wed 28"
  long: string;       // "Tonight" / "Wednesday"
  weekday: number;    // 0 = Monday, matching the backend
}

function nextSevenDays(): DayOption[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      iso: d.toLocaleDateString("en-CA"),
      tab: i === 0 ? "Tonight" : `${d.toLocaleDateString("en-AU", { weekday: "short" })} ${d.getDate()}`,
      long: i === 0 ? "Tonight" : d.toLocaleDateString("en-AU", { weekday: "long" }),
      weekday: (d.getDay() + 6) % 7,
    };
  });
}

/** "2026-10-26" → 0 (Monday), matching the backend's weekday numbering. */
function weekdayOf(iso: string): number {
  return (new Date(`${iso}T12:00:00`).getDay() + 6) % 7;
}

/** ["Wed", "Thu", "Fri"] → "Wed, Thu and Fri". */
function joinAnd(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "2026-10-28" → "28 Oct". */
function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

const WEEKDAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** The span the timeline draws for a day: the venue's hours, cut at midnight. */
function dayRange(week: WeekHours | null, weekday: number) {
  if (!week) return { ...FALLBACK, closed: false };
  const h = week[DAYS[weekday]];
  if (!h.open) return { ...FALLBACK, closed: true };
  const [fh, fm] = h.from.split(":").map(Number);
  const [th, tm] = h.to.split(":").map(Number);
  const start = fh * 60 + fm;
  let end = th * 60 + tm;
  if (end <= start) end = MIDNIGHT;     // closes at or after midnight
  return { start: Math.floor(start / 60) * 60, end: Math.min(Math.ceil(end / 60) * 60, MIDNIGHT), closed: false };
}

// ── Component ────────────────────────────────────────────────────────────────

export function NewDealComposer({ venue }: { venue: Venue }) {
  const router = useRouter();
  const [days] = useState(nextSevenDays);

  const hours = (() => {
    if (!venue.opening_hours?.trim()) return null;
    const { week, unread } = parseHours(venue.opening_hours);
    return unread ? null : week;
  })();

  // Tonight is only offered while there's an hour of it left.
  const earliestTonight = Math.ceil(nowMinutes() / STEP) * STEP;
  const tonightOpen = earliestTonight <= dayRange(hours, days[0].weekday).end - 60;

  // The days this deal runs, as indexes into `days`. One day is a one-off deal;
  // several, or "every week", are saved as one schedule covering them all.
  const [picked, setPicked] = useState<number[]>([tonightOpen ? 0 : 1]);
  const chosen = picked.map((i) => days[i]);
  const day = chosen[0];
  const pickedWeekdays = [...new Set(chosen.map((c) => c.weekday))].sort((a, b) => a - b);
  const tonightPicked = picked.includes(0);
  const closedOn = hours ? chosen.filter((c) => !hours[DAYS[c.weekday]].open) : [];
  // One window for every picked day, so the timeline spans the hours they all share.
  const range = (() => {
    const spans = chosen.map((c) => dayRange(hours, c.weekday));
    const start = Math.max(...spans.map((r) => r.start));
    const end = Math.min(...spans.map((r) => r.end));
    return end - start >= 60 ? { start, end } : FALLBACK;
  })();
  const minStart = tonightPicked ? clamp(earliestTonight, range.start, range.end - STEP) : range.start;

  const [repeat, setRepeat] = useState(false);

  const [spacing, setSpacing] = useState<30 | 60>(30);
  const [win, setWin] = useState<{ start: number; end: number } | null>(null);
  // The window mid-drag, in unsnapped minutes, so the pill tracks the pointer.
  const [ghost, setGhost] = useState<{ start: number; end: number } | null>(null);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(venue.category || CATEGORIES[0]);
  const [discount, setDiscount] = useState(50);
  const [otherDiscount, setOtherDiscount] = useState(false);
  const [otherText, setOtherText] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState<string>("pp");
  const [spots, setSpots] = useState(20);
  const [groupMax, setGroupMax] = useState(6);
  const [spotsUnlimited, setSpotsUnlimited] = useState(false);
  const [groupUnlimited, setGroupUnlimited] = useState(false);
  const [description, setDescription] = useState("");
  const [live, setLive] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Data ──
  const { data: deals = [] } = useQuery<Deal[]>({
    queryKey: ["deals", venue.id],
    queryFn: () => venueApi.deals(venue.id),
  });
  const { data: schedules = [] } = useQuery<DealSchedule[]>({
    queryKey: ["schedules", venue.id],
    queryFn: () => scheduleApi.list(venue.id),
  });
  const { data: compliance } = useQuery<MerchantCompliance>({
    queryKey: ["merchant-status", venue.id],
    queryFn: () => merchantApi.status(venue.id),
  });
  // Every booking that went ahead, across the venue's deals. There's no
  // per-venue endpoint, so this is one request per deal, as on the dashboard.
  const { data: history = [] } = useQuery<(Booking & { dealDate: string | null })[]>({
    queryKey: ["booking-history-by-date", venue.id, deals.map((d) => d.id).join(",")],
    queryFn: async () => {
      const lists = await Promise.all(deals.map((d) =>
        bookingApi.listForDeal(d.id)
          .then((bs) => bs.map((b) => ({ ...b, dealDate: d.deal_date })))
          .catch(() => []),
      ));
      return lists.flat().filter((b) => b.status === "confirmed" || b.status === "redeemed");
    },
    enabled: deals.length > 0,
  });

  // A typical day: average guests per half-hour, from past days on the same
  // weekday when there are a few of them, otherwise from every day.
  const cells = Math.max(1, Math.round((range.end - range.start) / STEP));
  const sameWeekday = history.filter((b) => b.dealDate && pickedWeekdays.includes(weekdayOf(b.dealDate)));
  const byWeekday = new Set(sameWeekday.map((b) => b.dealDate)).size >= 3;
  const pool = byWeekday ? sameWeekday : history;
  const poolDays = Math.max(1, new Set(pool.map((b) => b.dealDate ?? b.created_at.slice(0, 10))).size);
  const booked = pool.reduce((a, b) => a + b.num_people, 0);
  const busy = (() => {
    const counts = new Array(cells).fill(0) as number[];
    for (const b of pool) {
      const m = slotMinutes(b.slot_time);
      if (m === null || m < range.start || m >= range.end) continue;
      counts[Math.floor((m - range.start) / STEP)] += b.num_people;
    }
    return counts.map((c) => c / poolDays);
  })();

  // The two hours with the fewest people booked, if there's history to go on.
  const quietest = (() => {
    if (booked < MIN_HISTORY) return null;
    const len = Math.min(QUIET_LENGTH, range.end - minStart);
    let best: { start: number; end: number; total: number } | null = null;
    for (let s = minStart; s + len <= range.end; s += STEP) {
      const from = (s - range.start) / STEP;
      const total = busy.slice(from, from + len / STEP).reduce((a, b) => a + b, 0);
      if (!best || total < best.total) best = { start: s, end: s + len, total };
    }
    return best;
  })();

  // The window shown: what the venue painted, else the quiet stretch, else
  // the last couple of hours before close.
  const fallbackStart = clamp(range.end - 180, minStart, range.end - STEP);
  const settled = win ?? (quietest
    ? { start: quietest.start, end: quietest.end }
    : { start: fallbackStart, end: Math.min(fallbackStart + 120, range.end) });

  // Onto the half-hour grid, inside the bookable part of the day.
  const snapSpan = (g: { start: number; end: number }) => {
    const start = clamp(Math.round(g.start / STEP) * STEP, minStart, range.end - STEP);
    return { start, end: clamp(Math.round(g.end / STEP) * STEP, start + STEP, range.end) };
  };
  // `span` is the committed window: slots, preview and highlights only change on
  // release. `dragSpan` is the snapped window mid-drag, for the pill's own label and
  // edge times; `shown` is where the pill sits, following the pointer.
  const span = settled;
  const dragSpan = ghost ? snapSpan(ghost) : settled;
  const shown = ghost ?? span;
  const dragging = ghost !== null;

  const slots: number[] = [];
  for (let t = span.start; t < span.end; t += spacing) slots.push(t);

  // What else is on that day: dated deals plus weekly schedules not yet turned into one.
  const liveDeals = (() => {
    const items: { id: string; title: string; start: number; end: number }[] = [];
    const add = (id: string, t: string, slotList: string[]) => {
      const mins = slotList.map(slotMinutes).filter((m): m is number => m !== null);
      if (mins.length === 0) return;
      items.push({ id, title: t, start: Math.min(...mins), end: Math.min(Math.max(...mins) + STEP, MIDNIGHT) });
    };
    for (const c of chosen) {
      // With several days picked, say which day each one is on.
      const tag = chosen.length > 1 ? `${c.tab} · ` : "";
      for (const d of deals) if (d.is_active && d.deal_date === c.iso) add(`${c.iso}-${d.id}`, tag + d.title, d.slots);
      for (const s of schedules) {
        if (!s.is_active || !s.weekdays.includes(c.weekday)) continue;
        if ((s.starts_on && s.starts_on > c.iso) || (s.ends_on && s.ends_on < c.iso)) continue;
        if (deals.some((d) => d.schedule_id === s.id && d.deal_date === c.iso)) continue;
        add(`${c.iso}-s-${s.id}`, tag + s.title, s.slots);
      }
    }
    // Overlapping deals each get their own lane.
    const lanes: number[] = [];
    return items
      .sort((a, b) => a.start - b.start)
      .map((it) => {
        let lane = lanes.findIndex((end) => end <= it.start);
        if (lane === -1) { lane = lanes.length; lanes.push(it.end); } else lanes[lane] = it.end;
        return { ...it, lane };
      });
  })();
  const laneCount = Math.max(1, ...liveDeals.map((l) => l.lane + 1));

  // ── Window dragging ──
  // While dragging, the pill follows the pointer freely; on release it springs
  // onto the nearest half hour.
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: "start" | "end" | "move" | "new"; anchor: number } | null>(null);
  // The latest pointer position, read on release: a quick flick can end before
  // React has rendered the last move, so state alone would snap back.
  const latest = useRef<{ start: number; end: number } | null>(null);

  function moveGhost(next: { start: number; end: number }) {
    latest.current = next;
    setGhost(next);
  }

  const pct = (m: number) => ((m - range.start) / (range.end - range.start)) * 100;

  const [trackWidth, setTrackWidth] = useState(0);
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setTrackWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pillWidth = ((pct(shown.end) - pct(shown.start)) / 100) * trackWidth;

  function minuteAt(clientX: number): number {
    const r = trackRef.current!.getBoundingClientRect();
    return range.start + clamp((clientX - r.left) / r.width, 0, 1) * (range.end - range.start);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const m = minuteAt(e.clientX);
    const handle = (e.target as HTMLElement).closest<HTMLElement>("[data-handle]")?.dataset.handle;
    if (handle === "start" || handle === "end") {
      drag.current = { mode: handle, anchor: 0 };
      moveGhost(span);
    } else if (m > span.start && m < span.end) {
      drag.current = { mode: "move", anchor: m - span.start };
      moveGhost(span);
    } else {
      const a = clamp(Math.round(m / STEP) * STEP, minStart, range.end - STEP);
      drag.current = { mode: "new", anchor: a };
      moveGhost({ start: a, end: a + STEP });
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const g = latest.current;
    if (!d || !g) return;
    const m = minuteAt(e.clientX);
    if (d.mode === "start") return moveGhost({ start: clamp(m, minStart, g.end - STEP), end: g.end });
    if (d.mode === "end") return moveGhost({ start: g.start, end: clamp(m, g.start + STEP, range.end) });
    if (d.mode === "move") {
      const len = g.end - g.start;
      const s = clamp(m - d.anchor, minStart, range.end - len);
      return moveGhost({ start: s, end: s + len });
    }
    const b = clamp(m, minStart, range.end);
    if (b >= d.anchor + STEP) return moveGhost({ start: d.anchor, end: b });
    if (b < d.anchor) return moveGhost({ start: b, end: d.anchor + STEP });
    moveGhost({ start: d.anchor, end: d.anchor + STEP });
  }

  function endDrag() {
    if (!drag.current) return;
    drag.current = null;
    if (latest.current) setWin(snapSpan(latest.current));
    latest.current = null;
    setGhost(null);
  }

  function onHandleKey(edge: "start" | "end", e: React.KeyboardEvent) {
    const delta = e.key === "ArrowLeft" ? -STEP : e.key === "ArrowRight" ? STEP : 0;
    if (!delta) return;
    e.preventDefault();
    const { start, end } = span;
    setWin(edge === "start"
      ? { start: clamp(start + delta, minStart, end - STEP), end }
      : { start, end: clamp(end + delta, start + STEP, range.end) });
  }

  function toggleDay(i: number) {
    // Always at least one day: unticking the last one does nothing.
    setPicked((p) => (p.includes(i) ? (p.length > 1 ? p.filter((x) => x !== i) : p) : [...p, i].sort((x, y) => x - y)));
    setWin(null);
  }

  // ── Money ──
  const usual = parseFloat(price);
  const guestPays = !isNaN(usual) ? Math.max(0, usual * (1 - discount / 100)) : null;
  const unitLabel = UNITS.find((u) => u.value === unit)?.label ?? "per person";

  // Pinch hasn't cleared the venue yet: the backend saves any deal as a draft.
  const verifying = !!compliance?.pinch_merchant_id && compliance.merchant_status !== "active";
  const goesLive = live && !verifying;

  // ── Preview + submit ──
  // Publishing happens from the preview, so the venue sees the guest card first.
  const [previewOpen, setPreviewOpen] = useState(false);
  useEffect(() => {
    if (!previewOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPreviewOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [previewOpen]);

  function problem(): string | null {
    if (!title.trim()) return "Give the deal a title.";
    if (guestPays === null || usual <= 0) return "Enter the usual price.";
    if (!(discount > 0 && discount < 100)) return "Set a discount between 1% and 99%.";
    if (tonightPicked && span.start < Math.ceil(nowMinutes() / STEP) * STEP) {
      return "That window has already started tonight. Move it later, or untick Tonight.";
    }
    return null;
  }

  function openPreview() {
    const p = problem();
    setError(p);
    if (p) {
      document.querySelector(".app-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setPreviewOpen(true);
  }

  async function publish() {
    const p = problem();
    setError(p);
    if (p) return;

    const common = {
      title: title.trim(),
      category,
      description: description.trim() || undefined,
      unit,
      original_price: Math.round(usual * 100) / 100,
      discount_pct: discount,
      slots: slots.map(slotString),
      max_group_size: groupUnlimited ? MAX_GROUP_SIZE : groupMax,
      total_spots: spotsUnlimited ? UNLIMITED_SPOTS : spots,
      is_active: goesLive,
    };

    setSaving(true);
    try {
      if (repeat || chosen.length > 1) {
        // One deal across several days: a schedule from the first picked day,
        // ending on the last one unless it repeats every week.
        await scheduleApi.create({
          ...common,
          weekdays: pickedWeekdays,
          starts_on: day.iso,
          ends_on: repeat ? null : chosen[chosen.length - 1].iso,
          venue_id: venue.id,
        } satisfies DealScheduleInput & { venue_id: string });
      } else {
        await dealApi.create({ ...common, venue_id: venue.id, deal_date: day.iso } satisfies DealCreate);
      }
      router.replace("/dashboard/deals");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Couldn't save the deal.");
      setSaving(false);
    }
  }

  // ── Render ──
  // "Tonight, Wed 28 and Fri 30" or "Every Wed and Fri, from 28 Oct".
  const daysSummary = repeat
    ? `Every ${joinAnd(pickedWeekdays.map((w) => DAYS[w]))}, from ${shortDate(day.iso)}`
    : joinAnd(chosen.map((c) => c.tab));
  const whenLabel = `${daysSummary} · ${rangeLabel(span.start, span.end)}`;
  const daysPhrase = chosen.length > 1 || repeat ? "these days" : tonightPicked ? "tonight" : day.long;
  const isQuietest = !!quietest && quietest.start === span.start && quietest.end === span.end;
  // The projection: the discount's uplift (demo values above) applied to a
  // typical day's guests, capped at the deal's spots and spread evenly over the
  // half-hours the pill covers. It follows the pill live.
  const lit = busy.map((_, i) => {
    const mid = range.start + i * STEP + STEP / 2;
    return mid > shown.start && mid < shown.end;
  });
  const upliftPct = upliftFor(discount);
  const dailyGuests = busy.reduce((a, b) => a + b, 0);
  const projected = Math.min(spotsUnlimited ? Infinity : spots, Math.round((dailyGuests * upliftPct) / 100));
  const extraPerCell = projected / Math.max(1, lit.filter(Boolean).length);
  const chartMax = Math.max(1, ...busy.map((n, i) => n + (lit[i] ? extraPerCell : 0)));
  const typicalLabel = !byWeekday
    ? "Typical day"
    : pickedWeekdays.length === 1 ? `Typical ${WEEKDAY_LONG[pickedWeekdays[0]]}` : `Typical ${joinAnd(pickedWeekdays.map((w) => DAYS[w]))}`;
  const hourMarks: number[] = [];
  for (let h = Math.ceil(range.start / 60) * 60; h < range.end; h += 60) hourMarks.push(h);
  // Interior hours only (the ends are the groove's edges); every other hour when they'd crowd.
  const hourPx = trackWidth / Math.max(1, (range.end - range.start) / 60);
  const rulerMarks = hourMarks.filter((h, i) => h > range.start && (hourPx >= 46 || i % 2 === 0));

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "20px 40px", borderBottom: "1px solid var(--line)", background: "var(--surface)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button type="button" aria-label="Back to deals" onClick={() => router.push("/dashboard/deals")} style={squareBtn}>
            <ArrowLeft size={16} strokeWidth={2} aria-hidden />
          </button>
          <div>
            <div style={eyebrowStyle}>Deals</div>
            <h1 style={{ margin: "2px 0 0", fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>New deal</h1>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button type="button" onClick={() => router.push("/dashboard/deals")} style={headerGhost}>Cancel</button>
          <button type="button" onClick={openPreview} style={headerPrimary}>
            <Eye size={16} strokeWidth={2} aria-hidden />
            Preview
          </button>
        </div>
      </header>

      <div style={{ width: "100%", maxWidth: 1040, margin: "0 auto", padding: "30px 40px 60px", boxSizing: "border-box" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 22, minWidth: 0 }}>
          {error && <p role="alert" style={alertStyle("var(--accent-soft)", "var(--accent-text)")}>{error}</p>}

          <section style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
            {/* What's the offer: first, so the rest of the card is about this deal */}
            <div style={{ padding: "24px 24px 26px", borderBottom: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 22 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>What&apos;s the offer?</h2>
            <label style={{ display: "block" }}>
              <span style={labelStyle}>Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Two-for-one cocktails" style={inputStyle} />
            </label>

            <label style={{ display: "block" }}>
              <span style={labelStyle}>
                Description <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>(optional)</span>
              </span>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Anything guests should know — e.g. bar seating only"
                style={{ ...inputStyle, height: "auto", minHeight: 50, padding: "13px 16px", lineHeight: 1.5, resize: "vertical", font: "inherit", fontSize: 17 }}
              />
            </label>

            <div>
              <div style={labelStyle}>
                Category <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>· defaults to your venue</span>
              </div>
              <CategoryField value={category} onChange={setCategory} options={CATEGORIES} />
            </div>
            </div>

            {/* Day tabs */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "0 12px", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
              <div role="group" aria-label="Days this deal runs" style={{ display: "flex", alignItems: "center", gap: 6, height: 60, overflowX: "auto" }}>
                {days.map((d, i) => {
                  const on = picked.includes(i);
                  const disabled = i === 0 && !tonightOpen;
                  return (
                    <button
                      key={d.iso}
                      type="button"
                      aria-pressed={on}
                      disabled={disabled}
                      title={disabled ? "Tonight's hours have passed" : undefined}
                      onClick={() => toggleDay(i)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 38, padding: on ? "0 14px 0 11px" : "0 14px", borderRadius: 999, border: `1px solid ${on ? "var(--accent)" : "var(--line2)"}`, background: on ? "var(--accent-soft)" : "transparent", color: on ? "var(--accent-text)" : "var(--muted)", fontSize: 15, fontWeight: on ? 600 : 500, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1, whiteSpace: "nowrap", transition: "background-color .2s ease, border-color .2s ease, color .2s ease" }}
                    >
                      {on && <Check size={15} strokeWidth={2.5} aria-hidden />}
                      {d.tab}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", alignItems: "center", height: 60 }}>
                <Segmented
                  label="How often"
                  value={repeat ? "weekly" : "once"}
                  onChange={(v) => setRepeat(v === "weekly")}
                  options={[{ value: "once", label: "Just these days" }, { value: "weekly", label: "Every week" }]}
                />
              </div>
            </div>

            {/* What's picked, in words, so several days read as one deal */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "12px 24px", borderBottom: "1px solid var(--line)", fontSize: 14, color: "var(--muted)" }}>
              <span>Runs</span>
              <b style={{ color: "var(--text)", fontWeight: 600 }}>{daysSummary}</b>
              {(chosen.length > 1 || repeat) && (
                <span style={{ fontSize: 12.5, padding: "3px 9px", borderRadius: 999, background: "var(--surface3)", color: "var(--muted)" }}>
                  One deal · {repeat ? `${pickedWeekdays.length} day${pickedWeekdays.length === 1 ? "" : "s"} a week` : `${chosen.length} days`}
                </span>
              )}
              <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--faint)" }}>Tap days to add or remove them</span>
            </div>

            <div style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>When can guests book?</h2>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  {!hours
                    ? "Add opening hours in Venue details to fit your night"
                    : closedOn.length
                      ? `Usually closed on ${joinAnd(closedOn.map((c) => `${WEEKDAY_LONG[c.weekday]}s`))}`
                      : `Open ${shortTime(range.start)} – ${shortTime(range.end)}${chosen.length > 1 ? " on all of them" : ""}`}
                  {" · drag on the bottom row"}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", rowGap: 12, columnGap: 16, alignItems: "center" }}>
                <span />
                <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", margin: `0 ${INSET}px -4px`, fontSize: 12.5, color: "var(--muted)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--accent)" }} />
                    {booked ? `Guests booked, avg of ${poolDays} past day${poolDays === 1 ? "" : "s"}` : "No bookings yet to compare against"}
                  </span>
                  {projected > 0 && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: projectedFill }} />
                      With this deal (estimate)
                    </span>
                  )}
                  {upliftPct > 0 && (
                    <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "baseline", gap: 8, color: "var(--muted)" }}>
                      <b className="nd-anim" style={{ color: "var(--accent-text)", fontWeight: 600, fontSize: 22, letterSpacing: "-0.02em", ...numeric }}>+{upliftPct}%</b>
                      <span style={{ color: "var(--text)" }}>guests at {discount}% off</span>
                    </span>
                  )}
                </div>

                <span style={{ ...rowLabel, color: "var(--text)", fontWeight: 600 }}>{typicalLabel}</span>
                <div
                  role="img"
                  aria-label={`${typicalLabel}: average guests by start time${upliftPct ? `, with about ${upliftPct}% more guests at ${discount}% off` : ""}`}
                  style={{ height: 112, margin: `0 ${INSET}px`, display: "grid", gridTemplateColumns: `repeat(${cells}, minmax(0, 1fr))`, gap: 4, alignItems: "end" }}
                >
                  {busy.map((n, i) => {
                    const t = range.start + i * STEP;
                    const extra = lit[i] ? extraPerCell : 0;
                    return (
                      <div
                        key={i}
                        title={`${shortTime(t)} · ${n.toFixed(1)} guests on a ${typicalLabel.toLowerCase()}${extra ? ` · busier with this deal (estimate)` : ""}`}
                        style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}
                      >
                        <span className="nd-anim" style={{ height: `${(extra / chartMax) * 100}%`, borderRadius: "4px 4px 0 0", background: projectedFill, transition: `height .5s ${SPRING}` }} />
                        <span className="nd-anim" style={{ height: `${(n / chartMax) * 100}%`, minHeight: 4, borderRadius: extra ? 0 : "4px 4px 0 0", background: lit[i] ? "var(--accent)" : "var(--surface3)", transition: `background-color .3s ease, height .5s ${SPRING}` }} />
                      </div>
                    );
                  })}
                </div>

                <span style={rowLabel}>Live deals</span>
                <div style={{ position: "relative", height: 36 + (laneCount - 1) * 32, borderRadius: 18, background: "var(--sunken)" }}>
                  {liveDeals.length === 0 && (
                    <span style={{ position: "absolute", left: 16, top: 10, fontSize: 12, color: "var(--faint)" }}>Nothing else on {daysPhrase}</span>
                  )}
                  <div style={{ position: "absolute", inset: `0 ${INSET}px` }}>
                  {liveDeals.map((l) => {
                    const left = clamp(pct(l.start), 0, 100);
                    const right = clamp(pct(l.end), 0, 100);
                    return (
                      <div
                        key={l.id}
                        title={`${l.title} · ${rangeLabel(l.start, l.end)}`}
                        style={{ position: "absolute", left: `${left}%`, width: `${Math.max(right - left, 2)}%`, top: 3 + l.lane * 32, height: 30, boxSizing: "border-box", borderRadius: 999, background: "color-mix(in oklab, var(--info) 22%, transparent)", border: "1px solid color-mix(in oklab, var(--info) 45%, transparent)", display: "flex", alignItems: "center", padding: "0 12px", fontSize: 13, fontWeight: 600, color: "var(--info)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}
                      >
                        {l.title}
                      </div>
                    );
                  })}
                  </div>
                </div>

                {/* The ruler for the track below: one label per hour line, lit inside the window */}
                <span />
                <div aria-hidden style={{ position: "relative", height: 14, margin: `2px ${INSET}px -4px`, fontSize: 12, ...numeric }}>
                  {rulerMarks.map((h) => {
                    const inside = h >= span.start && h <= span.end;
                    return (
                      <span key={h} style={{ position: "absolute", left: `${pct(h)}%`, transform: "translateX(-50%)", whiteSpace: "nowrap", color: inside ? "var(--text)" : "var(--faint)", fontWeight: inside ? 600 : 400, transition: "color .25s ease" }}>
                        {shortTime(h)}
                      </span>
                    );
                  })}
                </div>

                <span style={{ fontSize: 14, fontWeight: 600 }}>This deal</span>
                <div
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  style={{ position: "relative", height: 48 + INSET * 2, borderRadius: 999, background: "var(--sunken)", border: "1px solid var(--line)", boxShadow: "inset 0 1px 3px rgba(0,0,0,.35)", cursor: dragging ? "grabbing" : "crosshair", touchAction: "none", userSelect: "none" }}
                >
                  {/* The groove's inner edge, inset so the pill's curve matches the track's */}
                  <div ref={trackRef} style={{ position: "absolute", inset: INSET - 1 }}>
                  {/* Hour lines, so the pill's length reads against the clock */}
                  {hourMarks.filter((h) => h > range.start).map((h) => (
                    <span key={h} aria-hidden style={{ position: "absolute", left: `${pct(h)}%`, top: 10, bottom: 10, width: 1, background: "var(--line)", pointerEvents: "none" }} />
                  ))}
                  {minStart > range.start && (
                    <div title="Already passed" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct(minStart)}%`, borderRadius: "999px 0 0 999px", background: "repeating-linear-gradient(135deg, transparent, transparent 6px, var(--line) 6px, var(--line) 7px)", pointerEvents: "none" }} />
                  )}

                  <div
                    className="nd-anim"
                    style={{
                      ...glassPill,
                      left: `${pct(shown.start)}%`,
                      width: `${pct(shown.end) - pct(shown.start)}%`,
                      cursor: dragging ? "grabbing" : "grab",
                      transform: dragging ? "scale(1.02)" : "none",
                      transition: dragging
                        ? "transform .2s ease"
                        : `left .5s ${SPRING}, width .5s ${SPRING}, transform .3s ease`,
                    }}
                  >
                    {pillWidth >= 190 ? (
                      <span style={pillText}>{rangeLabel(dragSpan.start, dragSpan.end)}<span style={{ opacity: 0.75, fontWeight: 500 }}> · {durationLabel(dragSpan.end - dragSpan.start)}</span></span>
                    ) : pillWidth >= 84 ? (
                      <span style={pillText}>{durationLabel(dragSpan.end - dragSpan.start)}</span>
                    ) : null}
                    <button type="button" data-handle="start" className="nd-grip" aria-label={`Window starts ${shortTime(span.start)}`} onKeyDown={(e) => onHandleKey("start", e)} style={{ ...gripBtn, left: 0 }}>
                      <span style={gripBar} />
                    </button>
                    <button type="button" data-handle="end" className="nd-grip" aria-label={`Window ends ${shortTime(span.end)}`} onKeyDown={(e) => onHandleKey("end", e)} style={{ ...gripBtn, right: 0 }}>
                      <span style={gripBar} />
                    </button>
                  </div>

                  {/* Times float over the edges while dragging */}
                  {dragging && (["start", "end"] as const).map((edge) => (
                    <span key={edge} aria-hidden style={{ ...glassChip, position: "absolute", top: -40, left: `${pct(shown[edge])}%`, transform: "translateX(-50%)", padding: "4px 9px", fontSize: 12.5, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", pointerEvents: "none", zIndex: 5, ...numeric }}>
                      {shortTime(dragSpan[edge])}
                    </span>
                  ))}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 14, paddingTop: 16, borderTop: "1px solid var(--line)", fontSize: 14, color: "var(--muted)", flexWrap: "wrap" }}>
                <span>Start times every</span>
                <Segmented
                  label="Interval"
                  value={String(spacing)}
                  onChange={(v) => setSpacing(Number(v) as 30 | 60)}
                  options={[{ value: "30", label: "30 min" }, { value: "60", label: "60 min" }]}
                />
                {quietest && (
                  isQuietest ? (
                    <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, color: "var(--accent-text)", fontWeight: 500 }}>
                      <TrendingUp size={15} strokeWidth={1.75} aria-hidden />
                      Your quietest stretch {daysPhrase === "tonight" ? "tonight" : `on ${daysPhrase}`}
                    </span>
                  ) : (
                    <button type="button" onClick={() => setWin({ start: quietest.start, end: quietest.end })} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, background: "none", border: 0, padding: 0, color: "var(--accent-text)", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
                      <TrendingUp size={15} strokeWidth={1.75} aria-hidden />
                      Use your quietest stretch, {rangeLabel(quietest.start, quietest.end)}
                    </button>
                  )
                )}
              </div>

              {/* Price and discount sit under the slider so the projection above moves as you choose */}
              <div style={{ paddingTop: 20, borderTop: "1px solid var(--line)" }}>
            <div className="nd-pair" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              <div>
                <div style={labelStyle}>Usual price</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <label style={{ ...inputStyle, display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                    <span style={{ color: "var(--muted)" }}>$</span>
                    <span style={srOnly}>Usual price</span>
                    <input
                      value={price}
                      inputMode="decimal"
                      onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))}
                      onBlur={() => !isNaN(usual) && setPrice(usual.toFixed(2))}
                      placeholder="36.00"
                      style={{ flex: 1, minWidth: 0, border: 0, background: "transparent", color: "var(--text)", font: "inherit", padding: 0, ...numeric }}
                    />
                  </label>
                  <Segmented label="Pricing unit" tall value={unit} onChange={setUnit} options={UNITS.map((u) => ({ value: u.value, label: u.label }))} />
                </div>
              </div>

              <div>
                <div style={labelStyle}>Discount</div>
                <div role="radiogroup" aria-label="Discount" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8 }}>
                  {DISCOUNTS.map((d) => {
                    const on = !otherDiscount && discount === d;
                    return (
                      <button key={d} type="button" role="radio" aria-checked={on} onClick={() => { setOtherDiscount(false); setDiscount(d); }} style={discountBtn(on)}>
                        {d}%
                      </button>
                    );
                  })}
                  {otherDiscount ? (
                    <label style={{ ...discountBtn(true), flexDirection: "row", gap: 2, padding: "0 8px" }}>
                      <span style={srOnly}>Discount percent</span>
                      <input
                        autoFocus
                        value={otherText}
                        inputMode="numeric"
                        placeholder="25"
                        onChange={(e) => {
                          const text = e.target.value.replace(/\D/g, "").slice(0, 2);
                          setOtherText(text);
                          setDiscount(parseInt(text, 10) || 0);
                        }}
                        style={{ width: "2.4ch", border: 0, background: "transparent", color: "inherit", font: "inherit", textAlign: "right", padding: 0, ...numeric }}
                      />
                      %
                    </label>
                  ) : (
                    <button type="button" role="radio" aria-checked={false} onClick={() => { setOtherDiscount(true); setOtherText(""); setDiscount(0); }} style={discountBtn(false)}>
                      Other
                    </button>
                  )}
                </div>
              </div>

              <StepperCard title="Total spots" sub="Across all times" value={spots} min={1} max={500}
                onChange={(n) => { setSpots(n); setGroupMax((g) => Math.min(g, n)); }}
                unlimited={spotsUnlimited} onUnlimited={setSpotsUnlimited} />
              <StepperCard title="Max group size" sub="Per booking" value={groupMax} min={1}
                max={Math.min(MAX_GROUP_SIZE, spotsUnlimited ? MAX_GROUP_SIZE : spots)} onChange={setGroupMax}
                unlimited={groupUnlimited} onUnlimited={setGroupUnlimited} unlimitedHint={`Up to ${MAX_GROUP_SIZE}, the app's limit`} />
            </div>
              </div>
            </div>
          </section>
        </div>

      </div>

      {/* ── Preview: what guests see, and where publishing happens ── */}
      <div
        aria-hidden
        onClick={() => setPreviewOpen(false)}
        style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,.5)", opacity: previewOpen ? 1 : 0, pointerEvents: previewOpen ? "auto" : "none", transition: "opacity .3s ease" }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Preview of what guests see"
        className="nd-anim"
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 41, width: "min(480px, 100vw)", display: "flex", flexDirection: "column",
          background: "var(--bg)", borderLeft: "1px solid var(--line)", boxShadow: "-24px 0 60px rgba(0,0,0,.35)",
          transform: previewOpen ? "none" : "translateX(100%)", visibility: previewOpen ? "visible" : "hidden",
          transition: `transform .45s cubic-bezier(.32,.72,0,1), visibility 0s linear ${previewOpen ? "0s" : ".45s"}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid var(--line)", background: "var(--surface)" }}>
          <div>
            <div style={eyebrowStyle}>Preview</div>
            <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>What guests see in the app</div>
          </div>
          <button type="button" aria-label="Close preview" onClick={() => setPreviewOpen(false)} style={squareBtn}>
            <X size={16} strokeWidth={2} aria-hidden />
          </button>
        </div>

        <div className="app-scroll" style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ ...cardStyle, borderRadius: 20, overflow: "hidden", padding: 0 }}>
            <div style={{ position: "relative", height: 196, background: venue.image_url ? undefined : "repeating-linear-gradient(135deg, var(--surface2), var(--surface2) 22px, var(--surface3) 22px, var(--surface3) 44px)" }}>
              {venue.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={venue.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              )}
              <span style={{ position: "absolute", left: 16, bottom: 14, padding: "4px 9px", borderRadius: 6, background: "var(--accent)", color: "#FFFFFF", fontSize: 12, fontWeight: 600, letterSpacing: ".1em" }}>
                {discount}% OFF
              </span>
              {!venue.image_url && (
                <span style={{ position: "absolute", right: 16, bottom: 14, fontSize: 12.5, color: "var(--muted)" }}>Venue hero photo</span>
              )}
            </div>
            <div style={{ padding: "20px 22px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.015em", color: title.trim() ? "var(--text)" : "var(--faint)" }}>
                  {title.trim() || "Your deal title"}
                </div>
                <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 3 }}>
                  {[venue.name, venue.suburb, category].filter(Boolean).join(" · ")}
                </div>
              </div>
              {description.trim() && (
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--text)" }}>{description.trim()}</p>
              )}
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--accent-text)", ...numeric }}>
                  {guestPays !== null ? formatCurrency(guestPays) : "$—"}
                </span>
                {guestPays !== null && (
                  <span style={{ fontSize: 14, color: "var(--muted)", textDecoration: "line-through", ...numeric }}>{formatCurrency(usual)}</span>
                )}
                <span style={{ fontSize: 14, color: "var(--muted)" }}>{unitLabel}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--muted)" }}>
                <Clock size={15} strokeWidth={1.75} aria-hidden />
                {whenLabel}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {slots.map((t) => (
                  <span key={t} style={{ padding: "6px 11px", borderRadius: 999, border: "1px solid var(--line2)", fontSize: 13.5, fontWeight: 600, ...numeric }}>{pillTime(t)}</span>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 12, marginTop: 4, borderTop: "1px solid var(--line)", fontSize: 13.5, color: "var(--muted)" }}>
                <span>{spotsUnlimited ? "Plenty of spots" : `${spots} spots left`}</span>
                <span>{groupUnlimited ? "Any group size" : `Groups up to ${groupMax}`}</span>
              </div>
            </div>
          </div>

          <div style={{ ...cardStyle, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Live as soon as you publish</div>
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
                {verifying ? "Saves as a draft until Pinch approves your payments" : "Turn off to save as a draft"}
              </div>
            </div>
            <button type="button" aria-pressed={goesLive} aria-label="Live as soon as you publish" disabled={verifying} onClick={() => setLive((v) => !v)} style={{ ...switchTrack(goesLive), opacity: verifying ? 0.5 : 1, cursor: verifying ? "not-allowed" : "pointer" }}>
              <span style={switchKnob(goesLive)} />
            </button>
          </div>

        </div>

        <div style={{ padding: "16px 24px 20px", borderTop: "1px solid var(--line)", background: "var(--surface)", display: "flex", flexDirection: "column", gap: 12 }}>
          {error && previewOpen && <p role="alert" style={alertStyle("var(--accent-soft)", "var(--accent-text)")}>{error}</p>}
          <div style={{ display: "flex", gap: 12 }}>
            <button type="button" onClick={() => setPreviewOpen(false)} style={{ ...headerGhost, flex: 1 }}>Keep editing</button>
            <button type="button" onClick={publish} disabled={saving} style={{ ...headerPrimary, flex: 1.4, justifyContent: "center", opacity: saving ? 0.6 : 1, cursor: saving ? "not-allowed" : "pointer" }}>
              {saving ? "Saving…" : goesLive ? "Publish deal" : "Save draft"}
              {!saving && <ArrowRight size={16} strokeWidth={2} aria-hidden />}
            </button>
          </div>
        </div>
      </aside>

      <style>{`
        .nd-grip:hover > span, .nd-grip:focus-visible > span { height: 28px !important; }
        .nd-grip:focus-visible { outline: 2px solid #FFFFFF; outline-offset: -4px; border-radius: 999px; }
        @media (prefers-reduced-motion: reduce) {
          .nd-anim { transition: none !important; }
        }
        .nd-scroll { scrollbar-width: thin; scrollbar-color: var(--line2) transparent; }
        .nd-scroll::-webkit-scrollbar { width: 10px; }
        .nd-scroll::-webkit-scrollbar-track { background: transparent; }
        .nd-scroll::-webkit-scrollbar-thumb { background: var(--line2); border-radius: 999px; border: 3px solid transparent; background-clip: padding-box; }
        .nd-scroll::-webkit-scrollbar-thumb:hover { background-color: var(--faint); }
        @media (max-width: 760px) {
          .nd-pair { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

// ── Controls ─────────────────────────────────────────────────────────────────

function Segmented({
  label, value, options, onChange, tall = false,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  tall?: boolean;
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div role="radiogroup" aria-label={label} style={{ position: "relative", display: "grid", gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`, padding: 4, borderRadius: 999, background: "var(--sunken)", border: "1px solid var(--line2)", flexShrink: 0 }}>
      <span
        aria-hidden
        className="nd-anim"
        style={{ ...glassChip, position: "absolute", top: 4, bottom: 4, left: 4, width: `calc((100% - 8px) / ${options.length})`, transform: `translateX(${index * 100}%)`, transition: `transform .45s ${SPRING}` }}
      />
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            style={{ position: "relative", height: tall ? 40 : 30, padding: "0 14px", borderRadius: 999, border: 0, background: "transparent", color: on ? "var(--text)" : "var(--muted)", fontSize: 14, fontWeight: on ? 600 : 400, cursor: "pointer", whiteSpace: "nowrap", transition: "color .25s ease" }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Type any category, or pick one of the standard ones from the list. */
function CategoryField({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Typing filters the list; just opening it shows everything.
  const [query, setQuery] = useState<string | null>(null);
  const shown = query === null ? options : options.filter((o) => o.toLowerCase().includes(query.trim().toLowerCase()));
  const custom = query !== null && query.trim() !== "" && !options.some((o) => o.toLowerCase() === query.trim().toLowerCase());
  const items = custom ? [...shown, query!.trim()] : shown;

  function choose(v: string) {
    onChange(v);
    setQuery(null);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setActive((i) => (items.length ? (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && items[active]) choose(items[active]);
      else setOpen(true);
    } else if (e.key === "Escape") {
      setQuery(null);
      setOpen(false);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <input
        role="combobox"
        aria-label="Category"
        aria-expanded={open}
        aria-controls="nd-category-list"
        aria-autocomplete="list"
        aria-activedescendant={open && items[active] ? `nd-category-${active}` : undefined}
        value={query ?? value}
        placeholder="Bar"
        onFocus={() => { setOpen(true); setActive(Math.max(0, options.indexOf(value))); }}
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setActive(0); setOpen(true); }}
        onBlur={() => { setQuery(null); setOpen(false); if (!value.trim()) onChange(options[0]); }}
        onKeyDown={onKeyDown}
        style={{ ...inputStyle, paddingRight: 44 }}
      />
      <ChevronDown size={18} strokeWidth={2} aria-hidden style={{ position: "absolute", right: 16, top: 16, color: "var(--muted)", pointerEvents: "none", transform: open ? "rotate(180deg)" : "none", transition: "transform .2s ease" }} />
      {open && items.length > 0 && (
        <div
          id="nd-category-list"
          role="listbox"
          className="nd-scroll"
          // Keep focus in the input so a click registers before blur closes the list.
          onMouseDown={(e) => e.preventDefault()}
          style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 20, maxHeight: 280, overflowY: "auto", padding: 6, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--line2)", boxShadow: "0 16px 40px rgba(0,0,0,.35)" }}
        >
          {items.map((o, i) => {
            const isCustom = custom && i === items.length - 1;
            const selected = o === value && !isCustom;
            return (
              <div
                key={`${o}-${i}`}
                id={`nd-category-${i}`}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, cursor: "pointer", fontSize: 15, background: i === active ? "var(--surface3)" : "transparent", color: selected ? "var(--accent-text)" : "var(--text)" }}
              >
                <span style={{ flex: 1 }}>{isCustom ? <>Use &ldquo;{o}&rdquo;</> : o}</span>
                {selected && <Check size={16} strokeWidth={2} aria-hidden />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StepperCard({
  title, sub, value, min, max, onChange, unlimited = false, onUnlimited, unlimitedHint,
}: {
  title: string;
  sub: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  unlimited?: boolean;
  onUnlimited?: (on: boolean) => void;
  /** Shown under the title while unlimited, e.g. a platform cap. */
  unlimitedHint?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 12, border: "1px solid var(--line2)" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{unlimited && unlimitedHint ? unlimitedHint : sub}</div>
      </div>
      {unlimited ? (
        <span style={{ fontSize: 17, fontWeight: 600, color: "var(--accent-text)", padding: "0 6px" }}>Unlimited</span>
      ) : (
        <>
          <button type="button" aria-label={`Decrease ${title.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(clamp(value - 1, min, max))} style={stepBtn(value <= min)}>
            <Minus size={16} strokeWidth={2} aria-hidden />
          </button>
          <input
            aria-label={title}
            value={value}
            inputMode="numeric"
            onChange={(e) => {
              const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
              if (!isNaN(n)) onChange(clamp(n, min, max));
            }}
            style={{ width: "3ch", border: 0, background: "transparent", color: "var(--text)", font: "inherit", fontSize: 20, fontWeight: 600, textAlign: "center", padding: 0, ...numeric }}
          />
          <button type="button" aria-label={`Increase ${title.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(clamp(value + 1, min, max))} style={stepBtn(value >= max)}>
            <Plus size={16} strokeWidth={2} aria-hidden />
          </button>
        </>
      )}
      {onUnlimited && (
        <button
          type="button"
          aria-pressed={unlimited}
          aria-label={`Unlimited ${title.toLowerCase()}`}
          title={unlimited ? "Set a limit" : "No limit"}
          onClick={() => onUnlimited(!unlimited)}
          style={{ ...stepBtn(false), borderColor: unlimited ? "var(--accent)" : "var(--line2)", background: unlimited ? "var(--accent-soft)" : "transparent", color: unlimited ? "var(--accent-text)" : "var(--muted)", transition: "background-color .2s ease, color .2s ease, border-color .2s ease" }}
        >
          <InfinityIcon size={18} strokeWidth={2} aria-hidden />
        </button>
      )}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const srOnly: React.CSSProperties = { position: "absolute", width: 1, height: 1, overflow: "hidden", clipPath: "inset(50%)", whiteSpace: "nowrap" };

const cardStyle: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16 };

const eyebrowStyle: React.CSSProperties = { fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 500 };

const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 600, marginBottom: 10 };

const inputStyle: React.CSSProperties = {
  width: "100%", height: 50, boxSizing: "border-box", padding: "0 16px", borderRadius: 10,
  border: "1px solid var(--line2)", background: "var(--sunken)", color: "var(--text)", fontSize: 17,
};

function discountBtn(on: boolean): React.CSSProperties {
  return {
    position: "relative", height: 50, boxSizing: "border-box", borderRadius: 10, cursor: "pointer", fontSize: 16, fontWeight: 600,
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
    border: `1px solid ${on ? "var(--accent)" : "var(--line2)"}`,
    background: on ? "var(--accent-soft)" : "transparent",
    color: on ? "var(--accent-text)" : "var(--muted)",
    ...numeric,
  };
}

function stepBtn(disabled: boolean): React.CSSProperties {
  return {
    width: 40, height: 40, borderRadius: 10, border: "1px solid var(--line2)", background: "transparent",
    color: "var(--text)", display: "grid", placeItems: "center", flexShrink: 0,
    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.35 : 1,
  };
}

const squareBtn: React.CSSProperties = {
  width: 40, height: 40, boxSizing: "border-box", borderRadius: 10, border: "1px solid var(--line2)",
  background: "transparent", color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
};

const headerGhost: React.CSSProperties = {
  height: 46, padding: "0 20px", borderRadius: 10, border: "1px solid var(--line2)", background: "transparent",
  color: "var(--text)", fontSize: 15, fontWeight: 600, cursor: "pointer",
};

const headerPrimary: React.CSSProperties = {
  height: 46, padding: "0 20px", borderRadius: 10, border: 0, background: "var(--accent)", color: "#FFFFFF",
  fontSize: 15, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 10,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.16), 0 6px 18px var(--accent-soft)",
};

// The window: one flat accent pill.
const glassPill: React.CSSProperties = {
  position: "absolute", top: 0, bottom: 0, borderRadius: 999, overflow: "hidden",
  display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px", boxSizing: "border-box",
  background: "var(--accent)",
};

// The neutral glass chip that slides behind the selected tab or option.
const glassChip: React.CSSProperties = {
  borderRadius: 999,
  background: "linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.02)), var(--surface3)",
  backdropFilter: "blur(10px) saturate(160%)", WebkitBackdropFilter: "blur(10px) saturate(160%)",
  border: "1px solid var(--line2)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.12), 0 4px 12px rgba(0,0,0,.18)",
};

const pillText: React.CSSProperties = {
  position: "relative", fontSize: 13.5, fontWeight: 600, color: "#FFFFFF", whiteSpace: "nowrap",
  textShadow: "0 1px 1px rgba(0,0,0,.18)", fontVariantNumeric: "tabular-nums",
};

const gripBtn: React.CSSProperties = {
  position: "absolute", top: 0, bottom: 0, width: 22, border: 0, padding: 0, background: "transparent",
  display: "grid", placeItems: "center", cursor: "ew-resize",
};

const gripBar: React.CSSProperties = {
  width: 4, height: 20, borderRadius: 4, background: "rgba(255,255,255,.92)",
  boxShadow: "0 1px 2px rgba(0,0,0,.25)", transition: "height .2s ease",
};

// Projected guests: the accent, striped, so it reads as "not yet real".
const projectedFill =
  "repeating-linear-gradient(135deg, color-mix(in oklab, var(--accent) 60%, transparent) 0 3px, color-mix(in oklab, var(--accent) 22%, transparent) 3px 6px)";

const rowLabel: React.CSSProperties = { fontSize: 14, color: "var(--muted)" };

function alertStyle(background: string, color: string): React.CSSProperties {
  return { margin: 0, borderRadius: 12, padding: "12px 16px", fontSize: 13.5, lineHeight: 1.5, background, color };
}
