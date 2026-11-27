"use client";

// The deal screen (design D): the timeline over the venue's night, the offer
// form under it, and a live preview of the guest's card. It creates deals and
// edits them: pass editDeal (a one-off) or editSchedule (a weekly deal).

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlignLeft, ArrowLeft, ArrowRight, Check, ChevronDown, Clock, DollarSign, Eye, Film, Infinity as InfinityIcon, Minus, Plus, Tag, Ticket, TrendingUp, Users, X, type LucideIcon } from "lucide-react";
import {
  MAX_GROUP_SIZE,
  UNLIMITED_SPOTS,
  dealApi,
  merchantApi,
  scheduleApi,
  venueApi,
  ApiError,
  type Deal,
  type DealCreate,
  type DealUpdate,
  type DealSchedule,
  type DealScheduleInput,
  type PaymentsStatus,
  type PriceDrop,
  type Venue,
  type VenueReel,
} from "@/lib/api";
import { DAYS, parseHours, type WeekHours } from "@/lib/hours";
import { autoDealTitle, formatCurrency } from "@/lib/utils";
import { DealVideoPicker, type DealVideo } from "@/components/DealVideoPicker";
import { numeric, switchKnob, switchTrack } from "@/lib/ui";
import { PriceDropsEditor, priceDropsProblem } from "@/components/PriceDropsEditor";
import { CATEGORIES } from "@/lib/categories";


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
// Custom session lengths, in minutes.
const MIN_SESSION = 15;
const MAX_SESSION = 8 * 60;

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

const todayIso = () => new Date().toLocaleDateString("en-CA");

/** One day to pick: "Tonight", "Wed 28", or with its month when it's further out. */
function dayOption(iso: string): DayOption {
  const d = new Date(`${iso}T12:00:00`);
  const tonight = iso === todayIso();
  const ahead = (d.getTime() - Date.now()) / 86_400_000;
  const tab = tonight
    ? "Tonight"
    : ahead > -1 && ahead < 7
      ? `${d.toLocaleDateString("en-AU", { weekday: "short" })} ${d.getDate()}`
      : d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
  return { iso, tab, long: tonight ? "Tonight" : d.toLocaleDateString("en-AU", { weekday: "long" }), weekday: (d.getDay() + 6) % 7 };
}

/** A week of days from `from` days ahead: 0 starts tonight. */
function nextSevenDays(from = 0): DayOption[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + from + i);
    return dayOption(d.toLocaleDateString("en-CA"));
  });
}

/** The first `weekday` (0 = Monday) on or after `fromIso`. */
function nextOn(fromIso: string, weekday: number): DayOption {
  const d = new Date(`${fromIso}T12:00:00`);
  d.setDate(d.getDate() + ((weekday - weekdayOf(fromIso) + 7) % 7));
  return dayOption(d.toLocaleDateString("en-CA"));
}

/** The days a composer offers. A weekly deal being edited gets each weekday
 *  once, from tomorrow (changes apply from its next run); a one-off keeps its
 *  own date even when that's outside this week. */
function daysFor(editDeal?: Deal, editSchedule?: DealSchedule): DayOption[] {
  if (editSchedule) return nextSevenDays(1);
  const week = nextSevenDays();
  const own = editDeal?.deal_date;
  if (!own || week.some((d) => d.iso === own)) return week;
  return [...week, dayOption(own)].sort((a, b) => a.iso.localeCompare(b.iso));
}

/** A saved deal's slots → the window and session length that make them. */
function windowFromSlots(slots: string[]): { win: { start: number; end: number } | null; length: "0" | "30" | "60" | "120" | "custom"; custom: string } {
  const mins = slots.map(slotMinutes).filter((m): m is number => m !== null).sort((a, b) => a - b);
  if (!mins.length) return { win: null, length: "0", custom: "90" };
  const gaps = mins.slice(1).map((m, i) => m - mins[i]);
  const step = gaps.length && gaps.every((g) => g === gaps[0]) ? gaps[0] : STEP;
  const length = step === STEP ? "0" : step === 60 ? "60" : step === 120 ? "120" : "custom";
  return { win: { start: mins[0], end: Math.min(mins[mins.length - 1] + step, MIDNIGHT) }, length, custom: String(step) };
}

/** "2026-10-26" → 0 (Monday), matching the backend's weekday numbering. */
function weekdayOf(iso: string): number {
  return (new Date(`${iso}T12:00:00`).getDay() + 6) % 7;
}

/** [0..4] → "Every weekday", [5, 6] → "Every weekend", else "Every Mon and Thu". */
function weekdaysPhrase(ws: number[]): string {
  const key = [...ws].sort((a, b) => a - b).join();
  if (key === "0,1,2,3,4") return "Every weekday";
  if (key === "5,6") return "Every weekend";
  if (ws.length === 7) return "Every day";
  return `Every ${joinAnd([...ws].sort((a, b) => a - b).map((w) => DAYS[w]))}`;
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

export function NewDealComposer({ venue, onAnother, editDeal, editSchedule }: {
  venue: Venue;
  onAnother?: () => void;
  /** Editing a one-off deal. */
  editDeal?: Deal;
  /** Editing a weekly deal. */
  editSchedule?: DealSchedule;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const editing = editDeal ?? editSchedule ?? null;
  const [days] = useState(() => daysFor(editDeal, editSchedule));
  const [initialWindow] = useState(() => windowFromSlots(editing?.slots ?? []));

  const hours = (() => {
    if (!venue.opening_hours?.trim()) return null;
    const { week, unread } = parseHours(venue.opening_hours);
    return unread ? null : week;
  })();

  // Tonight is only offered while there's an hour of it left.
  const earliestTonight = Math.ceil(nowMinutes() / STEP) * STEP;
  const tonightOpen = earliestTonight <= dayRange(hours, weekdayOf(todayIso())).end - 60;

  // The days this deal runs, as indexes into `days`. One day is a one-off deal;
  // several, or "every week", are saved as one schedule covering them all.
  const [picked, setPicked] = useState<number[]>(() => {
    if (editSchedule) {
      const on = days.flatMap((d, i) => (editSchedule.weekdays.includes(d.weekday) ? [i] : []));
      return on.length ? on : [0];
    }
    if (editDeal) return [Math.max(0, days.findIndex((d) => d.iso === editDeal.deal_date))];
    return [tonightOpen ? 0 : 1];
  });
  // Every week: weekdays from a start date (and maybe to an end), like a
  // calendar, not this week's dated days. A weekly deal being edited opens here.
  const [repeat, setRepeat] = useState(!!editSchedule);
  const [weekly, setWeekly] = useState<number[]>(editSchedule?.weekdays ?? []);
  const [startsOn, setStartsOn] = useState(() => {
    const saved = editSchedule?.starts_on;
    return saved && saved > todayIso() ? saved : todayIso();
  });
  const [endsOn, setEndsOn] = useState(editSchedule?.ends_on ?? "");
  const chosen = repeat
    ? [...weekly].sort((a, b) => a - b).map((w) => nextOn(startsOn, w)).sort((a, b) => a.iso.localeCompare(b.iso))
    : picked.map((i) => days[i]);
  const day = chosen[0];
  const pickedWeekdays = [...new Set(chosen.map((c) => c.weekday))].sort((a, b) => a - b);
  // Weekly deals aren't held to tonight's clock: a slot already gone tonight
  // just starts next week.
  const tonightPicked = !repeat && chosen.some((c) => c.iso === todayIso());
  const closedOn = hours ? chosen.filter((c) => !hours[DAYS[c.weekday]].open) : [];
  // One window for every picked day, so the timeline spans the hours they all share.
  const range = (() => {
    const spans = chosen.map((c) => dayRange(hours, c.weekday));
    const start = Math.max(...spans.map((r) => r.start));
    const end = Math.min(...spans.map((r) => r.end));
    return end - start >= 60 ? { start, end } : FALLBACK;
  })();
  // An edit keeps whatever window the deal had, even if part of it has passed.
  const minStart = tonightPicked && !editing ? clamp(earliestTonight, range.start, range.end - STEP) : range.start;


  // Longest a group can stay. With a limit, sessions run back to back, each that
  // long. With none, groups arrive at any half hour in the window and stay as
  // long as they like; only the number of spots limits the deal.
  const [lengthChoice, setLengthChoice] = useState<"0" | "30" | "60" | "120" | "custom">(initialWindow.length);
  const [customLength, setCustomLength] = useState(initialWindow.custom); // minutes, as typed
  const customMinutes = Math.round(Number(customLength));
  const customValid = Number.isFinite(customMinutes) && customMinutes >= MIN_SESSION && customMinutes <= MAX_SESSION;
  // An unfinished custom value falls back to no limit until it's valid.
  const sessionLength = lengthChoice === "custom" ? (customValid ? customMinutes : 0) : Number(lengthChoice);
  const [win, setWin] = useState<{ start: number; end: number } | null>(initialWindow.win);
  // The window mid-drag, in unsnapped minutes, so the pill tracks the pointer.
  const [ghost, setGhost] = useState<{ start: number; end: number } | null>(null);

  const [title, setTitle] = useState(editing && !editing.auto_title ? editing.title : "");
  const [category, setCategory] = useState(editing?.category || venue.category || CATEGORIES[0]);
  const [discount, setDiscount] = useState(editing ? Number(editing.discount_pct) : 50);
  const [otherDiscount, setOtherDiscount] = useState(!!editing && !DISCOUNTS.includes(Number(editing.discount_pct)));
  const [otherText, setOtherText] = useState(editing ? String(Number(editing.discount_pct)) : "");
  // Early-bird pricing: the steps after the opening discount, per time slot.
  const [drops, setDrops] = useState<PriceDrop[]>(editing?.price_drops ?? []);
  const [price, setPrice] = useState(editing ? Number(editing.original_price).toFixed(2) : "");
  const [unit, setUnit] = useState<string>(editing?.unit ?? "pp");
  const [spots, setSpots] = useState(editing && editing.total_spots < UNLIMITED_SPOTS ? editing.total_spots : 20);
  const [groupMax, setGroupMax] = useState(editing && editing.max_group_size < MAX_GROUP_SIZE ? editing.max_group_size : 6);
  const [spotsUnlimited, setSpotsUnlimited] = useState(!!editing && editing.total_spots >= UNLIMITED_SPOTS);
  const [groupUnlimited, setGroupUnlimited] = useState(!!editing && editing.max_group_size >= MAX_GROUP_SIZE);
  const [description, setDescription] = useState(editing?.description ?? "");
  const [live, setLive] = useState(editing ? editing.is_active : true);
  // The Discover video for this deal: none, one of the venue's, or a fresh
  // upload. undefined: an edit still showing the deal's saved video.
  const [videoChoice, setVideoChoice] = useState<DealVideo | null | undefined>(editing ? undefined : null);
  const { data: venueReels = [] } = useQuery<VenueReel[]>({
    queryKey: ["venue-reels", venue.id],
    queryFn: () => venueApi.reels(venue.id),
    enabled: !!editing?.reel_id,
  });
  const savedReel = editing?.reel_id ? venueReels.find((r) => r.id === editing.reel_id) : undefined;
  const video: DealVideo | null = videoChoice !== undefined ? videoChoice : savedReel ? { reel: savedReel } : null;
  const setVideo = (v: DealVideo | null) => setVideoChoice(v);
  const [videoBusy, setVideoBusy] = useState(false);
  // Ask the Impulse media team to shoot a video for the venue's deals. One
  // per venue: once asked for, the option isn't offered again.
  const [wantShoot, setWantShoot] = useState(false);
  const canAskForShoot = !venue.video_shoot_requested_at;
  // Which photo the guest card shows, so the venue can click through the slideshow.
  const [photoIndex, setPhotoIndex] = useState(0);
  const photos = venue.image_urls?.length ? venue.image_urls : venue.image_url ? [venue.image_url] : [];
  const coverPhoto = photos[photoIndex % Math.max(1, photos.length)] ?? null;

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Set once the deal is saved: whether it went live or stayed a draft.
  // shoot: how the video-shoot request went, if they ticked it.
  const [published, setPublished] = useState<{ live: boolean; shoot?: "sent" | "failed" } | null>(null);

  // ── Data ──
  const { data: deals = [] } = useQuery<Deal[]>({
    queryKey: ["deals", venue.id],
    queryFn: () => venueApi.deals(venue.id),
  });
  const { data: schedules = [] } = useQuery<DealSchedule[]>({
    queryKey: ["schedules", venue.id],
    queryFn: () => scheduleApi.list(venue.id),
  });
  const { data: compliance } = useQuery<PaymentsStatus>({
    queryKey: ["merchant-status", venue.id],
    queryFn: () => merchantApi.status(venue.id),
  });
  // Every booking that went ahead across the venue's deals, as when and how many — one request.
  const { data: history = [] } = useQuery({
    queryKey: ["booked-slots", venue.id],
    queryFn: async () =>
      (await venueApi.bookedSlots(venue.id)).map((s) => ({
        dealDate: s.deal_date,
        slot_time: s.slot_time ?? "",
        num_people: s.num_people,
        created_at: s.created_at,
      })),
  });

  // A typical day: average guests per half-hour, from past days on the same
  // weekday when there are a few of them, otherwise from every day.
  const cells = Math.max(1, Math.round((range.end - range.start) / STEP));
  const sameWeekday = history.filter((b) => b.dealDate && pickedWeekdays.includes(weekdayOf(b.dealDate)));
  const byWeekday = new Set(sameWeekday.map((b) => b.dealDate)).size >= 3;
  const pool = byWeekday ? sameWeekday : history;
  const poolDays = Math.max(1, new Set(pool.map((b) => b.dealDate ?? b.created_at.slice(0, 10))).size);
  const booked = pool.reduce((a, b) => a + b.num_people, 0);
  const bookedBusy = (() => {
    const counts = new Array(cells).fill(0) as number[];
    for (const b of pool) {
      const m = slotMinutes(b.slot_time);
      if (m === null || m < range.start || m >= range.end) continue;
      counts[Math.floor((m - range.start) / STEP)] += b.num_people;
    }
    return counts.map((c) => c / poolDays);
  })();

  // Until the venue has bookings of its own, Google's Popular Times for its
  // place stand in: how busy each hour usually is, 0–100 relative to the
  // venue's peak, averaged over the picked weekdays.
  const googleBusy = (() => {
    const pt = venue.popular_times;
    if (!pt) return null;
    const perDay = pickedWeekdays.map((w) => pt[DAYS[w]]).filter((d): d is number[] => Array.isArray(d) && d.length === 24);
    if (!perDay.length) return null;
    const cellsOut = Array.from({ length: cells }, (_, i) => {
      const hour = Math.floor((range.start + i * STEP) / 60) % 24;
      return perDay.reduce((a, d) => a + d[hour], 0) / perDay.length;
    });
    return cellsOut.some((v) => v > 0) ? cellsOut : null;
  })();
  const fromGoogle = booked < MIN_HISTORY && googleBusy !== null;
  const busy = fromGoogle ? googleBusy : bookedBusy;

  // The two hours with the fewest people, from bookings or Google's busy times.
  const quietest = (() => {
    if (booked < MIN_HISTORY && !fromGoogle) return null;
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
  if (sessionLength) {
    for (let t = span.start; t + sessionLength <= span.end; t += sessionLength) slots.push(t);
    if (slots.length === 0) slots.push(span.start); // window shorter than one session
  } else {
    for (let t = span.start; t < span.end; t += 30) slots.push(t);
  }

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
      // The deal being edited isn't "something else on": leave it (and what its schedule made) out.
      for (const d of deals) {
        if (d.id === editDeal?.id || (editSchedule && d.schedule_id === editSchedule.id)) continue;
        if (d.is_active && d.deal_date === c.iso) add(`${c.iso}-${d.id}`, tag + d.title, d.slots);
      }
      for (const s of schedules) {
        if (s.id === editSchedule?.id) continue;
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
  // Other deals running at the same time as this one's window.
  const clashes = liveDeals.filter((l) => l.start < shown.end && l.end > shown.start);

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

  function toggleWeekday(w: number) {
    // Always at least one day.
    setWeekly((ws) => (ws.includes(w) ? (ws.length > 1 ? ws.filter((x) => x !== w) : ws) : [...ws, w]));
    setWin(null);
  }

  /** Every week ⇄ just these days, carrying the picked weekdays across. */
  function switchRepeat(on: boolean) {
    if (on === repeat) return;
    if (on) {
      setWeekly(pickedWeekdays.length ? pickedWeekdays : [weekdayOf(todayIso())]);
    } else {
      const back = days.flatMap((d, i) => (weekly.includes(d.weekday) ? [i] : []));
      if (back.length) setPicked(back);
    }
    setRepeat(on);
  }

  // The repeat menu, Google Calendar style: presets over the weekday chips.
  const weeklyAnchor = (repeat ? weekly : pickedWeekdays)[0] ?? weekdayOf(todayIso());
  const sameDays = (a: number[], b: number[]) => a.length === b.length && b.every((x) => a.includes(x));
  const repeatValue: RepeatChoice = !repeat
    ? "once"
    : sameDays(weekly, [weeklyAnchor]) ? "day"
    : sameDays(weekly, [0, 1, 2, 3, 4]) ? "weekdays"
    : sameDays(weekly, [5, 6]) ? "weekends"
    : "custom";

  function chooseRepeat(v: RepeatChoice) {
    if (v === "once") return switchRepeat(false);
    if (!repeat) switchRepeat(true);
    if (v === "day") setWeekly([weeklyAnchor]);
    else if (v === "weekdays") setWeekly([0, 1, 2, 3, 4]);
    else if (v === "weekends") setWeekly([5, 6]);
    setWin(null);
  }

  function toggleDay(i: number) {
    // A one-off deal being edited stays one day: picking another moves it.
    if (editDeal) {
      setPicked([i]);
      setWin(null);
      return;
    }
    // Always at least one day: unticking the last one does nothing.
    setPicked((p) => (p.includes(i) ? (p.length > 1 ? p.filter((x) => x !== i) : p) : [...p, i].sort((x, y) => x - y)));
    setWin(null);
  }

  // ── Money ──
  const usual = parseFloat(price);
  const guestPays = !isNaN(usual) ? Math.max(0, usual * (1 - discount / 100)) : null;
  const unitLabel = UNITS.find((u) => u.value === unit)?.label ?? "per person";

  // Stripe hasn't cleared the venue yet: the backend saves any deal as a draft.
  const verifying = !!compliance && !compliance.can_publish_deals;
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

  // Left blank, the backend names the deal "<venue> · <price>"; shown the same way here.
  const shownTitle = title.trim() || autoDealTitle(venue.name, guestPays, unit);

  function problem(): string | null {
    if (videoBusy) return "Wait for the video to finish uploading.";
    if (guestPays === null || usual <= 0) return "Enter the usual price.";
    if (!(discount > 0 && discount < 100)) return "Set a discount between 1% and 99%.";
    const dropProblem = drops.length ? priceDropsProblem(discount, drops, spotsUnlimited ? null : spots) : null;
    if (dropProblem) return dropProblem;
    if (!editing && tonightPicked && span.start < Math.ceil(nowMinutes() / STEP) * STEP) {
      return "That window has already started tonight. Move it later, or untick Tonight.";
    }
    return null;
  }

  function openPreview() {
    const p = problem();
    setError(p);
    if (!p) setPreviewOpen(true);
  }

  // The deal is already saved by now, so a failed request must not read as a
  // failed publish: it's reported on the success screen instead.
  async function askForShoot(ref: { deal_id?: string; schedule_id?: string }): Promise<"sent" | "failed" | undefined> {
    if (!wantShoot || !canAskForShoot) return undefined;
    try {
      await venueApi.requestVideoShoot(venue.id, ref);
      // Refresh the venue so the next deal no longer offers it.
      qc.invalidateQueries({ queryKey: ["my-venues"] });
      return "sent";
    } catch (err) {
      // 409: already asked for (another tab, say), so the request is in.
      if (err instanceof ApiError && err.status === 409) {
        qc.invalidateQueries({ queryKey: ["my-venues"] });
        return "sent";
      }
      return "failed";
    }
  }

  async function publish() {
    const p = problem();
    setError(p);
    if (p) return;

    const common = {
      title: title.trim() || undefined,
      reel_id: video?.reel.id ?? null,
      category,
      description: description.trim() || undefined,
      unit,
      original_price: Math.round(usual * 100) / 100,
      discount_pct: discount,
      price_drops: drops.length ? drops : null,
      slots: slots.map(slotString),
      max_group_size: groupUnlimited ? MAX_GROUP_SIZE : groupMax,
      total_spots: spotsUnlimited ? UNLIMITED_SPOTS : spots,
      is_active: goesLive,
    };

    setSaving(true);
    try {
      if (editing) {
        // "" puts an unnamed deal back on its automatic "<venue> · <price>" title.
        const changes = { ...common, title: title.trim(), description: description.trim(), price_drops: drops.length ? drops : [] };
        if (editSchedule) {
          await scheduleApi.update(editSchedule.id, {
            ...changes,
            weekdays: pickedWeekdays,
            starts_on: repeat ? startsOn : day.iso,
            ends_on: repeat ? endsOn || null : chosen[chosen.length - 1].iso,
          } satisfies DealScheduleInput);
          await askForShoot({ schedule_id: editSchedule.id });
        } else if (editDeal) {
          await dealApi.update(editDeal.id, { ...changes, deal_date: day.iso } satisfies DealUpdate);
          await askForShoot({ deal_id: editDeal.id });
        }
        qc.invalidateQueries({ queryKey: ["deals", venue.id] });
        qc.invalidateQueries({ queryKey: ["schedules", venue.id] });
        qc.invalidateQueries({ queryKey: [editSchedule ? "schedule" : "deal", editing.id] });
        router.push("/dashboard/deals");
        return;
      }
      if (repeat || chosen.length > 1) {
        // One deal across several days: a schedule from the first picked day,
        // ending on the last one unless it repeats every week.
        const created = await scheduleApi.create({
          ...common,
          weekdays: pickedWeekdays,
          starts_on: repeat ? startsOn : day.iso,
          ends_on: repeat ? endsOn || null : chosen[chosen.length - 1].iso,
          venue_id: venue.id,
        } satisfies DealScheduleInput & { venue_id: string });
        setPublished({ live: created.is_active, shoot: await askForShoot({ schedule_id: created.id }) });
      } else {
        // The backend keeps it a draft until Stripe has verified the venue.
        const created = await dealApi.create({ ...common, venue_id: venue.id, deal_date: day.iso } satisfies DealCreate);
        setPublished({ live: created.is_active, shoot: await askForShoot({ deal_id: created.id }) });
      }
      setPreviewOpen(false);
      setSaving(false);
      qc.invalidateQueries({ queryKey: ["deals", venue.id] });
      qc.invalidateQueries({ queryKey: ["schedules", venue.id] });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Couldn't save the deal.");
      setSaving(false);
    }
  }

  // ── Render ──
  // "Tonight, Wed 28 and Fri 30" or "Every Wed and Fri, from 28 Oct".
  const daysSummary = repeat
    ? `${weekdaysPhrase(pickedWeekdays)}, from ${shortDate(startsOn)}${endsOn ? ` to ${shortDate(endsOn)}` : ""}`
    : joinAnd(chosen.map((c) => c.tab));
  const whenLabel = `${daysSummary} · ${rangeLabel(span.start, span.end)}`;
  // The headline of the When row: "Thursday 26 Nov", "Tonight", or the weekly summary.
  const whenSummary = repeat || chosen.length > 1
    ? daysSummary
    : day.iso === todayIso()
      ? "Tonight"
      : new Date(`${day.iso}T12:00:00`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short" });
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
  // Google's numbers are relative busyness, not guests, so the deal's lift is
  // drawn as that much busier in each hour the window covers.
  const extraAt = (i: number) => (!lit[i] ? 0 : fromGoogle ? (busy[i] * upliftPct) / 100 : extraPerCell);
  const showProjection = fromGoogle ? upliftPct > 0 && lit.some(Boolean) : projected > 0;
  const chartMax = Math.max(1, ...busy.map((n, i) => n + extraAt(i)));
  const typicalLabel = !byWeekday
    ? "Typical day"
    : pickedWeekdays.length === 1 ? `Typical ${WEEKDAY_LONG[pickedWeekdays[0]]}` : `Typical ${joinAnd(pickedWeekdays.map((w) => DAYS[w]))}`;
  const hourMarks: number[] = [];
  for (let h = Math.ceil(range.start / 60) * 60; h < range.end; h += 60) hourMarks.push(h);
  // Interior hours only (the ends are the groove's edges); every other hour when they'd crowd.
  const hourPx = trackWidth / Math.max(1, (range.end - range.start) / 60);
  const rulerMarks = hourMarks.filter((h, i) => h > range.start && (hourPx >= 46 || i % 2 === 0));

  // The guest's card: in the preview, and again on the success screen with a status badge.
  const guestCard = (badge?: "live" | "draft") => (
      <div style={{ ...cardStyle, borderRadius: 20, overflow: "hidden", padding: 0 }}>
        <div style={{ position: "relative", height: video ? 300 : 196, background: coverPhoto || video ? "#000" : "var(--surface2)" }}>
          {video ? (
            <video key={video.reel.id} src={video.reel.video_url} poster={video.reel.poster_url ?? undefined} autoPlay muted loop playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          ) : coverPhoto && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverPhoto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          )}
          {!video && photos.length > 1 && (
            <button
              type="button"
              aria-label={`Photo ${photoIndex % photos.length + 1} of ${photos.length}. Show the next one`}
              onClick={() => setPhotoIndex((i) => i + 1)}
              style={{ position: "absolute", inset: 0, background: "none", border: 0, cursor: "pointer" }}
            >
              <span style={{ position: "absolute", left: 0, right: 0, top: 12, display: "flex", justifyContent: "center", gap: 5 }}>
                {photos.map((p, i) => (
                  <span key={p} style={{ width: 6, height: 6, borderRadius: "50%", background: i === photoIndex % photos.length ? "#FFFFFF" : "rgba(255,255,255,.45)" }} />
                ))}
              </span>
            </button>
          )}
          <span style={{ position: "absolute", left: 16, bottom: 14, padding: "4px 9px", borderRadius: 6, background: "var(--accent)", color: "#FFFFFF", fontSize: 12, fontWeight: 600, letterSpacing: ".1em" }}>
            {drops.length ? `UP TO ${discount}% OFF` : `${discount}% OFF`}
          </span>
          {badge ? (
            <span style={{ position: "absolute", right: 14, bottom: 13, display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 9px", borderRadius: 999, background: "rgba(0,0,0,.55)", fontSize: 12.5, fontWeight: 600, color: badge === "live" ? "var(--good)" : "var(--muted)" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
              {badge === "live" ? "Live" : "Draft"}
            </span>
          ) : !coverPhoto && !video && (
            <span style={{ position: "absolute", right: 16, bottom: 14, fontSize: 12.5, color: "var(--muted)" }}>Venue photos</span>
          )}
        </div>
        <div style={{ padding: "20px 22px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.015em", color: "var(--text)" }}>
              {shownTitle}
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
  );

  if (published) {
    const tonightOnly = tonightPicked && chosen.length === 1 && !repeat;
    const from = shortTime(span.start);
    const when = repeat
      ? `every ${joinAnd(pickedWeekdays.map((w) => DAYS[w]))} from ${from}, starting ${shortDate(startsOn)}`
      : tonightOnly
        ? `tonight from ${from}`
        : `on ${joinAnd(chosen.map((c) => (c.tab === "Tonight" ? "tonight" : c.tab)))} from ${from}`;
    const steps: [string, string][] = [
      ["Guests book in the app", " — alone or as a group."],
      ["They show a 6-digit code", " at the door."],
      ["You redeem it", " to charge their card."],
    ];
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <header style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", gap: 16, padding: "20px 40px", background: "var(--surface)" }}>
          <button type="button" aria-label="Back to deals" onClick={() => router.push("/dashboard/deals")} style={squareBtn}>
            <ArrowLeft size={16} strokeWidth={2} aria-hidden />
          </button>
          <div>
            <div style={eyebrowStyle}>Deals</div>
            <h1 style={{ margin: "2px 0 0", fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>{published.live ? "Deal published" : "Draft saved"}</h1>
          </div>
        </header>

        <div className="nd-success" style={{ flex: 1, display: "grid", gridTemplateColumns: "minmax(0, 1fr) 420px", gap: 64, alignItems: "center", width: "100%", maxWidth: 1180, margin: "0 auto", padding: "56px 40px", boxSizing: "border-box", animation: "fade-up .5s ease both" }}>
          <div>
            <div style={{ width: 70, height: 70, borderRadius: "50%", display: "grid", placeItems: "center", marginBottom: 28, background: published.live ? "color-mix(in oklab, var(--good) 16%, transparent)" : "var(--surface3)", color: published.live ? "var(--good)" : "var(--muted)" }}>
              <Check size={30} strokeWidth={2.25} aria-hidden />
            </div>
            <h2 style={{ margin: "0 0 12px", fontSize: 40, lineHeight: 1.12, fontWeight: 600, letterSpacing: "-0.03em" }}>
              {shownTitle}<br />{published.live ? "is live." : "is saved as a draft."}
            </h2>
            <p style={{ margin: "0 0 28px", maxWidth: 520, fontSize: 16, lineHeight: 1.6, color: "var(--muted)" }}>
              {published.live
                ? `Guests can book ${when}. New bookings land on your dashboard as they happen.`
                : verifying
                  ? "It goes live as soon as Stripe verifies your payments. You'll find it under Deals."
                  : "Guests can't see it yet. Switch it on from Deals when you're ready."}
            </p>
            {published.shoot && (
              <p role="status" style={{ margin: "-12px 0 28px", maxWidth: 520, fontSize: 15, lineHeight: 1.6, color: published.shoot === "sent" ? "var(--text)" : "var(--accent-text)" }}>
                {published.shoot === "sent"
                  ? "Video shoot requested. The Impulse media team will be in touch to set up a time."
                  : <>We couldn&apos;t send your video shoot request. Email <a href="mailto:rahul@impulseapp.au" style={{ color: "inherit" }}>rahul@impulseapp.au</a> and we&apos;ll set it up.</>}
              </p>
            )}

            <ol style={{ listStyle: "none", margin: "0 0 30px", padding: 0, maxWidth: 620, ...cardStyle, overflow: "hidden" }}>
              {steps.map(([lead, rest], i) => (
                <li key={lead} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", borderTop: i ? "1px solid var(--line)" : "none", fontSize: 15, color: "var(--muted)" }}>
                  <span style={{ width: 26, height: 26, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--accent-soft)", color: "var(--accent-text)", fontSize: 13, fontWeight: 600, ...numeric }}>{i + 1}</span>
                  <span><b style={{ color: "var(--text)", fontWeight: 600 }}>{lead}</b>{rest}</span>
                </li>
              ))}
            </ol>

            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <button type="button" onClick={() => router.push("/dashboard/deals")} style={headerPrimary}>Back to deals</button>
              <button type="button" onClick={() => router.push("/dashboard/redeem")} style={{ ...headerGhost, display: "inline-flex", alignItems: "center", gap: 9 }}>
                <Ticket size={17} strokeWidth={1.75} aria-hidden />
                Redeem a code
              </button>
              {onAnother && (
                <button type="button" onClick={onAnother} style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 46, padding: "0 14px", border: 0, background: "none", color: "var(--muted)", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
                  <Plus size={16} strokeWidth={2} aria-hidden />
                  Another deal
                </button>
              )}
            </div>
          </div>

          <div style={{ boxShadow: "0 24px 60px rgba(0,0,0,.35)", borderRadius: 20 }}>
            {guestCard(published.live ? "live" : "draft")}
          </div>
        </div>

        <style>{`
          @media (max-width: 1000px) {
            .nd-success { grid-template-columns: 1fr !important; gap: 36px !important; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "20px 40px", background: "var(--surface)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button type="button" aria-label="Back to deals" onClick={() => router.push("/dashboard/deals")} style={squareBtn}>
            <ArrowLeft size={16} strokeWidth={2} aria-hidden />
          </button>
          <div>
            <div style={eyebrowStyle}>Deals</div>
            <h1 style={{ margin: "2px 0 0", fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>
              {editSchedule ? "Edit weekly deal" : editDeal ? "Edit deal" : "New deal"}
            </h1>
          </div>
        </div>
      </header>

      <div style={{ width: "100%", maxWidth: 1040, margin: "0 auto", padding: "30px 40px 60px", boxSizing: "border-box" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 22, minWidth: 0 }}>
          {/* 1. Name: what the deal is called and what guests get. Not clipped, and
              above step 2, so the category list can open over it. */}
          <section style={{ ...cardStyle, padding: 0, position: "relative", zIndex: 2 }}>
            <div style={{ padding: "26px 28px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Title first and large, like a calendar event: blank keeps the automatic name. */}
              <div style={{ paddingLeft: 46 }}>
                <input
                  className="nd-title"
                  aria-label="Deal name"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Add title"
                  style={{ width: "100%", boxSizing: "border-box", border: 0, borderBottom: "2px solid var(--line)", background: "transparent", color: "var(--text)", fontSize: 26, fontWeight: 500, letterSpacing: "-0.015em", padding: "4px 0 10px", outline: "none", transition: "border-color .2s ease" }}
                />
                <div style={{ marginTop: 8, fontSize: 13, color: "var(--faint)" }}>
                  {title.trim() ? "Guests see this name on the deal card." : <>Left blank, guests see <span style={{ color: "var(--muted)" }}>{shownTitle}</span>.</>}
                </div>
              </div>

              <IconRow icon={AlignLeft} label="Description">
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add description, e.g. bar seating only"
                  style={{ ...inputStyle, height: "auto", minHeight: 50, padding: "13px 16px", lineHeight: 1.5, resize: "vertical", font: "inherit", fontSize: 16 }}
                />
              </IconRow>

              <IconRow icon={Tag} label="Category">
                <CategoryField value={category} onChange={setCategory} options={CATEGORIES} />
              </IconRow>
            </div>
          </section>

          {/* 2. When and how much: the days and times, the price, the spots */}
          <section style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "24px 28px 4px" }}>
              <SectionHeader
                icon={Clock}
                title="When"
                sub={<><span style={{ color: "var(--text)", fontWeight: 500 }}>{whenSummary}</span> · {rangeLabel(span.start, span.end)}</>}
              />
              <div style={{ paddingLeft: 48, marginTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  {!editDeal && (
                    <label style={selectShell}>
                      <span style={srOnly}>Repeat</span>
                      <select value={repeatValue} onChange={(e) => chooseRepeat(e.target.value as RepeatChoice)} style={selectInput}>
                        <option value="once">Does not repeat</option>
                        <option value="day">Weekly on {WEEKDAY_LONG[weeklyAnchor]}</option>
                        <option value="weekdays">Every weekday (Mon–Fri)</option>
                        <option value="weekends">Weekends (Sat and Sun)</option>
                        <option value="custom">Custom days…</option>
                      </select>
                      <ChevronDown size={15} strokeWidth={2} aria-hidden style={{ color: "var(--muted)", pointerEvents: "none" }} />
                    </label>
                  )}
                  {repeat && (
                    <>
                      <label style={dateField}>
                        Starts
                        <input type="date" value={startsOn} min={editSchedule ? undefined : todayIso()} onChange={(e) => e.target.value && setStartsOn(e.target.value)} style={dateInput} />
                      </label>
                      <label style={dateField}>
                        Ends
                        <input type="date" value={endsOn} min={startsOn} onChange={(e) => setEndsOn(e.target.value)} style={{ ...dateInput, color: endsOn ? "var(--text)" : "var(--faint)" }} />
                        {endsOn
                          ? <button type="button" onClick={() => setEndsOn("")} aria-label="No end date" style={{ border: 0, background: "none", color: "var(--faint)", cursor: "pointer", padding: 0, display: "grid" }}><X size={14} strokeWidth={2} aria-hidden /></button>
                          : <span style={{ fontSize: 12.5, color: "var(--faint)" }}>never</span>}
                      </label>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Day tabs */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "2px 28px 0 76px", flexWrap: "wrap" }}>
              {repeat ? (
                <div role="group" aria-label="Weekdays this deal runs" style={{ display: "flex", alignItems: "center", gap: 6, height: 60, overflowX: "auto" }}>
                  {WEEKDAY_LONG.map((name, w) => {
                    const on = weekly.includes(w);
                    return (
                      <button
                        key={name}
                        type="button"
                        aria-pressed={on}
                        aria-label={`${name}s`}
                        onClick={() => toggleWeekday(w)}
                        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 38, minWidth: 62, padding: "0 12px", borderRadius: 10, border: 0, background: on ? "var(--accent-soft)" : "var(--sunken)", color: on ? "var(--accent-text)" : "var(--muted)", fontSize: 15, fontWeight: on ? 600 : 500, cursor: "pointer", whiteSpace: "nowrap", transition: "background-color .2s ease, border-color .2s ease, color .2s ease" }}
                      >
                        {on && <Check size={15} strokeWidth={2.5} aria-hidden />}
                        {DAYS[w]}
                      </button>
                    );
                  })}
                </div>
              ) : (
              <div role="group" aria-label="Days this deal runs" style={{ display: "flex", alignItems: "center", gap: 6, height: 60, overflowX: "auto" }}>
                {days.map((d, i) => {
                  const on = picked.includes(i);
                  const disabled = d.iso === todayIso() && !tonightOpen && !picked.includes(i);
                  return (
                    <button
                      key={d.iso}
                      type="button"
                      aria-pressed={on}
                      disabled={disabled}
                      title={disabled ? "Tonight's hours have passed" : undefined}
                      onClick={() => toggleDay(i)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 38, padding: on ? "0 14px 0 11px" : "0 14px", borderRadius: 10, border: 0, background: on ? "var(--accent-soft)" : "var(--sunken)", color: on ? "var(--accent-text)" : "var(--muted)", fontSize: 15, fontWeight: on ? 600 : 500, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1, whiteSpace: "nowrap", transition: "background-color .2s ease, border-color .2s ease, color .2s ease" }}
                    >
                      {on && <Check size={15} strokeWidth={2.5} aria-hidden />}
                      {d.tab}
                    </button>
                  );
                })}
              </div>
              )}

            </div>

            <div style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}>What time can guests book?</h3>
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
                    {fromGoogle
                      ? "How busy you usually are · Google Maps"
                      : booked ? `Guests booked, avg of ${poolDays} past day${poolDays === 1 ? "" : "s"}` : "No bookings yet to compare against"}
                  </span>
                  {showProjection && (
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
                  aria-label={`${typicalLabel}: ${fromGoogle ? "how busy the venue usually is, from Google Maps," : "average guests"} by start time${upliftPct ? `, with about ${upliftPct}% more guests at ${discount}% off` : ""}`}
                  style={{ height: 112, margin: `0 ${INSET}px`, display: "grid", gridTemplateColumns: `repeat(${cells}, minmax(0, 1fr))`, gap: 4, alignItems: "end" }}
                >
                  {busy.map((n, i) => {
                    const t = range.start + i * STEP;
                    const extra = extraAt(i);
                    const amount = fromGoogle ? `usually ${Math.round(n)}% as busy as your peak` : `${n.toFixed(1)} guests`;
                    return (
                      <div
                        key={i}
                        title={`${shortTime(t)} · ${amount} on a ${typicalLabel.toLowerCase()}${extra ? ` · busier with this deal (estimate)` : ""}`}
                        style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}
                      >
                        <span className="nd-anim" style={{ height: `${(extra / chartMax) * 100}%`, borderRadius: "4px 4px 0 0", background: projectedFill, transition: `height .5s ${SPRING}` }} />
                        <span className="nd-anim" style={{ height: `${(n / chartMax) * 100}%`, minHeight: 4, borderRadius: extra ? 0 : "4px 4px 0 0", background: lit[i] ? "var(--accent)" : "var(--surface3)", transition: `background-color .3s ease, height .5s ${SPRING}` }} />
                      </div>
                    );
                  })}
                </div>

                <span style={rowLabel}>
                  Live deals
                  {liveDeals.length > 0 && (
                    <span style={{ display: "block", marginTop: 3, fontSize: 12, fontWeight: 500, color: clashes.length ? "var(--accent-text)" : "var(--faint)" }}>
                      {clashes.length ? `${clashes.length} overlap${clashes.length === 1 ? "s" : ""}` : "No clashes"}
                    </span>
                  )}
                </span>
                <div style={{ position: "relative", height: 10 + laneCount * 22, borderRadius: 10, background: "var(--sunken)", overflow: "hidden" }}>
                  {liveDeals.length === 0 && (
                    <span style={{ position: "absolute", left: 14, top: 7, fontSize: 12, color: "var(--faint)" }}>Nothing else on {daysPhrase}</span>
                  )}
                  <div style={{ position: "absolute", inset: `0 ${INSET}px` }}>
                    {/* This deal's window, carried up from the track so clashes line up with it */}
                    {liveDeals.length > 0 && (
                      <div aria-hidden style={{ position: "absolute", top: 0, bottom: 0, left: `${pct(shown.start)}%`, width: `${pct(shown.end) - pct(shown.start)}%`, background: "color-mix(in oklab, var(--accent) 10%, transparent)", transition: dragging ? "none" : "left .2s ease, width .2s ease" }} />
                    )}
                    {liveDeals.map((l) => {
                      const left = clamp(pct(l.start), 0, 100);
                      const right = clamp(pct(l.end), 0, 100);
                      const width = Math.max(right - left, 1.5);
                      // The stretch of this bar inside the window, as a share of the bar.
                      const from = Math.max(l.start, shown.start);
                      const to = Math.min(l.end, shown.end);
                      const overlaps = to > from;
                      return (
                        <div
                          key={l.id}
                          title={`${l.title} · ${rangeLabel(l.start, l.end)}${overlaps ? ` · overlaps ${rangeLabel(from, to)}` : ""}`}
                          style={{
                            position: "absolute", left: `${left}%`, width: `${width}%`, top: 5 + l.lane * 22, height: 17, boxSizing: "border-box",
                            borderRadius: 5, overflow: "hidden", background: "color-mix(in oklab, var(--info) 20%, transparent)",
                            display: "flex", alignItems: "center", padding: "0 8px",
                          }}
                        >
                          {overlaps && (
                            <span
                              aria-hidden
                              style={{
                                position: "absolute", top: 0, bottom: 0,
                                left: `${((from - l.start) / (l.end - l.start)) * 100}%`, width: `${((to - from) / (l.end - l.start)) * 100}%`,
                                background: "repeating-linear-gradient(135deg, color-mix(in oklab, var(--accent) 55%, transparent) 0 4px, color-mix(in oklab, var(--accent) 22%, transparent) 4px 8px)",
                                transition: dragging ? "none" : "left .2s ease, width .2s ease",
                              }}
                            />
                          )}
                          <span style={{ position: "relative", fontSize: 11.5, fontWeight: 600, color: "var(--info)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                            {l.title}
                          </span>
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
                  style={{ position: "relative", height: 48 + INSET * 2, borderRadius: 16, background: "var(--sunken)", boxShadow: "inset 0 1px 2px rgba(0,0,0,.25)", cursor: dragging ? "grabbing" : "crosshair", touchAction: "none", userSelect: "none" }}
                >
                  {/* The groove's inner edge, inset so the pill's curve matches the track's */}
                  <div ref={trackRef} style={{ position: "absolute", inset: INSET - 1 }}>
                  {/* Hour lines, so the pill's length reads against the clock */}
                  {hourMarks.filter((h) => h > range.start).map((h) => (
                    <span key={h} aria-hidden style={{ position: "absolute", left: `${pct(h)}%`, top: 10, bottom: 10, width: 1, background: "var(--line)", pointerEvents: "none" }} />
                  ))}
                  {minStart > range.start && (
                    <div title="Already passed" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct(minStart)}%`, borderRadius: "16px 0 0 16px", background: "color-mix(in oklab, var(--line) 60%, transparent)", pointerEvents: "none" }} />
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

              <div style={{ display: "flex", alignItems: "center", gap: 14, paddingTop: 8, fontSize: 14, color: "var(--muted)", flexWrap: "wrap" }}>
                <span>Max session length</span>
                <Segmented
                  label="Max session length"
                  value={lengthChoice}
                  onChange={(v) => setLengthChoice(v as typeof lengthChoice)}
                  options={[
                    { value: "0", label: "No limit" },
                    { value: "30", label: "30 min" },
                    { value: "60", label: "1 hr" },
                    { value: "120", label: "2 hr" },
                    { value: "custom", label: "Custom" },
                  ]}
                />
                {lengthChoice === "custom" && (
                  <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      value={customLength}
                      inputMode="numeric"
                      aria-label="Session length in minutes"
                      aria-invalid={!customValid}
                      onChange={(e) => setCustomLength(e.target.value.replace(/\D/g, "").slice(0, 3))}
                      style={{ width: 64, height: 32, boxSizing: "border-box", padding: "0 10px", borderRadius: 8, border: `1px solid ${customValid ? "transparent" : "var(--accent)"}`, background: "var(--sunken)", color: "var(--text)", fontSize: 14, ...numeric }}
                    />
                    <span>min</span>
                    {!customValid && <span style={{ color: "var(--accent-text)", fontSize: 13 }}>{MIN_SESSION} to {MAX_SESSION} min</span>}
                  </label>
                )}
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

            </div>
          </section>

          {/* Price: the usual price, the discount, and early-bird steps */}
          <section style={{ ...cardStyle, padding: "24px 28px 28px" }}>
            <SectionHeader icon={DollarSign} title="Price" sub="What guests usually pay, and how much you take off." />
            <div className="nd-pair" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 22 }}>
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

              <div style={{ gridColumn: "1 / -1", padding: "16px 18px", borderRadius: 12, background: "var(--surface2)" }}>
                <PriceDropsEditor opening={discount} drops={drops} onChange={setDrops} usual={isNaN(usual) ? null : usual} capacity={spotsUnlimited ? null : spots} />
              </div>

            </div>
          </section>

          {/* Spots: how many can book, and the biggest group */}
          <section style={{ ...cardStyle, padding: "24px 28px 28px" }}>
            <SectionHeader icon={Users} title="Spots" sub="How many people can book across all times, and the biggest single group." />
            <div className="nd-pair" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 22 }}>
              <StepperCard title="Total spots" sub="Across all times" value={spots} min={1} max={500}
                onChange={(n) => { setSpots(n); setGroupMax((g) => Math.min(g, n)); }}
                unlimited={spotsUnlimited} onUnlimited={setSpotsUnlimited} />
              <StepperCard title="Max group size" sub="Per booking" value={groupMax} min={1}
                max={Math.min(MAX_GROUP_SIZE, spotsUnlimited ? MAX_GROUP_SIZE : spots)} onChange={setGroupMax}
                unlimited={groupUnlimited} onUnlimited={setGroupUnlimited} unlimitedHint={`Up to ${MAX_GROUP_SIZE}, the app's limit`} />
            </div>
          </section>

          {/* 3. Video */}
          <section style={{ ...cardStyle, padding: "24px 28px 28px" }}>
            <div style={{ marginBottom: 20 }}>
              <SectionHeader icon={Film} title="Video" sub="Optional. A short upright clip for the app's Discover feed, with a Book button for this deal." />
            </div>
            <DealVideoPicker venueId={venue.id} value={video} onChange={setVideo} onBusy={setVideoBusy} hideHeading />
            {canAskForShoot && <label style={{ display: "flex", alignItems: "flex-start", gap: 12, marginTop: 18, padding: "14px 16px", borderRadius: 12, border: `1px solid ${wantShoot ? "var(--accent)" : "transparent"}`, background: wantShoot ? "var(--accent-soft)" : "var(--surface2)", cursor: "pointer" }}>
              <input type="checkbox" checked={wantShoot} onChange={(e) => setWantShoot(e.target.checked)} style={{ width: 18, height: 18, margin: "2px 0 0", flexShrink: 0, accentColor: "var(--accent)", cursor: "pointer" }} />
              <span>
                <span style={{ display: "block", fontSize: 15, fontWeight: 600, color: "var(--text)" }}>Get a complimentary video shot by the Impulse media team for your deals</span>
                <span style={{ display: "block", marginTop: 3, fontSize: 13, color: "var(--muted)" }}>We&apos;ll be in touch after you publish to set up a time.</span>
              </span>
            </label>}
          </section>

          {/* The last step of the form: see the guest's card, then publish from there. */}
          {error && !previewOpen && <p role="alert" style={alertStyle("var(--accent-soft)", "var(--accent-text)")}>{error}</p>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
            <button type="button" onClick={() => router.push("/dashboard/deals")} style={headerGhost}>Cancel</button>
            <button type="button" onClick={openPreview} style={headerPrimary}>
              <Eye size={16} strokeWidth={2} aria-hidden />
              {editing ? "Preview & save" : <>Preview &amp; publish</>}
              <ArrowRight size={16} strokeWidth={2} aria-hidden />
            </button>
          </div>
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
          {guestCard()}

          <div style={{ ...cardStyle, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Live as soon as you publish</div>
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
                {verifying ? "Saves as a draft until Stripe verifies your payments" : "Turn off to save as a draft"}
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
              {saving ? "Saving…" : editing ? "Save changes" : goesLive ? "Publish deal" : "Save draft"}
              {!saving && <ArrowRight size={16} strokeWidth={2} aria-hidden />}
            </button>
          </div>
        </div>
      </aside>

      <style>{`
        .nd-title:focus { border-bottom-color: var(--accent) !important; }
        .nd-title::placeholder { color: var(--faint); }
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
    <div role="radiogroup" aria-label={label} style={{ position: "relative", display: "grid", gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`, padding: 4, borderRadius: 12, background: "var(--sunken)", flexShrink: 0 }}>
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
            style={{ position: "relative", height: tall ? 40 : 30, padding: "0 14px", borderRadius: 9, border: 0, background: "transparent", color: on ? "var(--text)" : "var(--muted)", fontSize: 14, fontWeight: on ? 600 : 400, cursor: "pointer", whiteSpace: "nowrap", transition: "color .25s ease" }}
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
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 12, background: "var(--surface2)" }}>
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
          style={{ ...stepBtn(false), background: unlimited ? "var(--accent-soft)" : "var(--sunken)", color: unlimited ? "var(--accent-text)" : "var(--muted)", transition: "background-color .2s ease, color .2s ease, border-color .2s ease" }}
        >
          <InfinityIcon size={18} strokeWidth={2} aria-hidden />
        </button>
      )}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const srOnly: React.CSSProperties = { position: "absolute", width: 1, height: 1, overflow: "hidden", clipPath: "inset(50%)", whiteSpace: "nowrap" };

/** The head of a section card: a tinted icon tile, its name, and one line on what it's for. */
function SectionHeader({ icon: Icon, title, sub }: { icon: LucideIcon; title: string; sub: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <span aria-hidden style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 10, display: "grid", placeItems: "center", background: "var(--surface3)", color: "var(--muted)" }}>
        <Icon size={17} strokeWidth={1.75} />
      </span>
      <div style={{ minWidth: 0 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}>{title}</h2>
        <p style={{ margin: "2px 0 0", fontSize: 13.5, color: "var(--muted)", lineHeight: 1.45 }}>{sub}</p>
      </div>
    </div>
  );
}

/** A calendar-style row: an icon in the gutter, the field beside it. */
function IconRow({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} style={{ display: "grid", gridTemplateColumns: "28px minmax(0, 1fr)", columnGap: 18, alignItems: "start" }}>
      <span aria-hidden title={label} style={{ display: "grid", placeItems: "center", height: 44, color: "var(--muted)" }}>
        <Icon size={20} strokeWidth={1.8} />
      </span>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

const dateField: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 8, height: 34, padding: "0 10px", borderRadius: 9,
  border: 0, background: "var(--sunken)", fontSize: 13, color: "var(--muted)",
};

const dateInput: React.CSSProperties = {
  border: 0, background: "transparent", color: "var(--text)", font: "inherit", fontSize: 13, padding: 0,
};

type RepeatChoice = "once" | "day" | "weekdays" | "weekends" | "custom";

const selectShell: React.CSSProperties = {
  position: "relative", display: "inline-flex", alignItems: "center", gap: 8, height: 36, padding: "0 12px", borderRadius: 9,
  background: "var(--sunken)", cursor: "pointer",
};

const selectInput: React.CSSProperties = {
  appearance: "none", border: 0, background: "transparent", color: "var(--text)", font: "inherit", fontSize: 14, fontWeight: 500,
  padding: 0, paddingRight: 2, cursor: "pointer", outline: "none",
};

const cardStyle: React.CSSProperties = { background: "var(--surface)", borderRadius: 16 };

const eyebrowStyle: React.CSSProperties = { fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 500 };

const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 600, marginBottom: 10 };

const inputStyle: React.CSSProperties = {
  width: "100%", height: 50, boxSizing: "border-box", padding: "0 16px", borderRadius: 10,
  border: "1px solid transparent", background: "var(--sunken)", color: "var(--text)", fontSize: 17,
};

function discountBtn(on: boolean): React.CSSProperties {
  return {
    position: "relative", height: 50, boxSizing: "border-box", borderRadius: 10, cursor: "pointer", fontSize: 16, fontWeight: 600,
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
    border: 0,
    background: on ? "var(--accent-soft)" : "var(--sunken)",
    color: on ? "var(--accent-text)" : "var(--muted)",
    ...numeric,
  };
}

function stepBtn(disabled: boolean): React.CSSProperties {
  return {
    width: 40, height: 40, borderRadius: 10, border: 0, background: "var(--sunken)",
    color: "var(--text)", display: "grid", placeItems: "center", flexShrink: 0,
    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.35 : 1,
  };
}

const squareBtn: React.CSSProperties = {
  width: 40, height: 40, boxSizing: "border-box", borderRadius: 10, border: 0,
  background: "var(--surface2)", color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
};

const headerGhost: React.CSSProperties = {
  height: 46, padding: "0 20px", borderRadius: 10, border: 0, background: "var(--surface2)",
  color: "var(--text)", fontSize: 15, fontWeight: 600, cursor: "pointer",
};

const headerPrimary: React.CSSProperties = {
  height: 46, padding: "0 20px", borderRadius: 10, border: 0, background: "var(--accent)", color: "#FFFFFF",
  fontSize: 15, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 10,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.16), 0 6px 18px var(--accent-soft)",
};

// The window: one flat accent pill.
const glassPill: React.CSSProperties = {
  position: "absolute", top: 0, bottom: 0, borderRadius: 11, overflow: "hidden",
  display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px", boxSizing: "border-box",
  background: "var(--accent)",
};

// The neutral glass chip that slides behind the selected tab or option.
const glassChip: React.CSSProperties = {
  borderRadius: 9,
  background: "var(--surface3)",
  boxShadow: "0 1px 2px rgba(0,0,0,.18)",
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

// Projected guests: a paler accent, so it reads as "not yet real".
const projectedFill = "color-mix(in oklab, var(--accent) 35%, transparent)";

const rowLabel: React.CSSProperties = { fontSize: 14, color: "var(--muted)" };

function alertStyle(background: string, color: string): React.CSSProperties {
  return { margin: 0, borderRadius: 12, padding: "12px 16px", fontSize: 13.5, lineHeight: 1.5, background, color };
}
