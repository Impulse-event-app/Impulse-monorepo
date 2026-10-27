// Opening hours: the week the venue form edits, and the "Mon: 11am–10pm, ..."
// string it is stored as on the venue.

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type Day = typeof DAYS[number];

export interface DayHours {
  open: boolean;
  from: string; // "HH:MM" 24-h
  to: string;
}

export type WeekHours = Record<Day, DayHours>;

export const DEFAULT_WEEK: WeekHours = {
  Mon: { open: true, from: "11:00", to: "22:00" },
  Tue: { open: true, from: "11:00", to: "22:00" },
  Wed: { open: true, from: "11:00", to: "22:00" },
  Thu: { open: true, from: "11:00", to: "22:00" },
  Fri: { open: true, from: "11:00", to: "23:00" },
  Sat: { open: true, from: "10:00", to: "23:00" },
  Sun: { open: false, from: "10:00", to: "21:00" },
};

export function serializeHours(w: WeekHours): string {
  const lines: string[] = [];
  DAYS.forEach((d) => {
    const h = w[d];
    if (!h.open) { lines.push(`${d}: Closed`); return; }
    lines.push(`${d}: ${fmt12(h.from)}–${fmt12(h.to)}`);
  });
  return lines.join(", ");
}

function fmt12(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${mStr}${suffix}`;
}

/** Inverse of serializeHours, plus the "Every day 4pm–midnight" shorthand the
 *  seeded venues use. A day that doesn't parse keeps its default; `unread` is
 *  set when nothing in a stored string was recognised, so the form can say so
 *  instead of quietly offering defaults that would overwrite the real hours. */
export function parseHours(s: string | null | undefined): { week: WeekHours; unread: boolean } {
  const week: WeekHours = structuredClone(DEFAULT_WEEK);
  if (!s?.trim()) return { week, unread: false };
  let matched = false;
  for (const part of s.split(",")) {
    const m = part.trim().match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Every day|Daily):?\s*(.+)$/);
    if (!m) continue;
    const days: readonly Day[] = m[1] === "Every day" || m[1] === "Daily" ? DAYS : [m[1] as Day];
    const range = m[2].trim();
    const closed = /^closed$/i.test(range);
    const [from, to] = range.split(/[–-]/).map((t) => to24(t));
    if (!closed && !(from && to)) continue;
    for (const d of days) {
      week[d] = closed || !from || !to ? { ...week[d], open: false } : { open: true, from, to };
    }
    matched = true;
  }
  return { week, unread: !matched };
}

export function to24(t: string): string | null {
  const s = t.trim().toLowerCase();
  if (s === "midnight") return "00:00";
  if (s === "noon" || s === "midday") return "12:00";
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (!m) return null;
  let h = parseInt(m[1], 10) % 12;
  if (m[3] === "pm") h += 12;
  return `${String(h).padStart(2, "0")}:${m[2] ?? "00"}`;
}
