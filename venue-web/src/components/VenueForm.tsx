"use client";

import React, { useState } from "react";
import type { Venue, VenueCreate } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { FONT_DISPLAY, FONT_MONO, card, fieldLabel, fieldInput, btnPrimary, requiredMark, switchTrack, switchKnob } from "@/lib/ui";

const PHOTO_BUCKET = "venue-photos";
const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB

const CATEGORIES = [
  "Bar", "Restaurant", "Cafe", "Bowling", "Mini Golf",
  "Escape Room", "Arcade", "Pool / Billiards", "Karaoke", "Other",
];

// Shared accessibility taxonomy — mirrors the user-side "access needs" list in
// the mobile app so venue features can later be matched against user needs.
const ACCESSIBILITY_FEATURES = [
  "Wheelchair access",
  "Step-free entry",
  "Accessible bathroom",
  "Hearing assistance",
  "Vision assistance",
  "Low-sensory / quiet space",
  "Service animal friendly",
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
type Day = typeof DAYS[number];

interface DayHours {
  open: boolean;
  from: string; // "HH:MM" 24-h
  to: string;
}

type WeekHours = Record<Day, DayHours>;

const DEFAULT_WEEK: WeekHours = {
  Mon: { open: true, from: "11:00", to: "22:00" },
  Tue: { open: true, from: "11:00", to: "22:00" },
  Wed: { open: true, from: "11:00", to: "22:00" },
  Thu: { open: true, from: "11:00", to: "22:00" },
  Fri: { open: true, from: "11:00", to: "23:00" },
  Sat: { open: true, from: "10:00", to: "23:00" },
  Sun: { open: false, from: "10:00", to: "21:00" },
};

function serializeHours(w: WeekHours): string {
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
function parseHours(s: string | null | undefined): { week: WeekHours; unread: boolean } {
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

function to24(t: string): string | null {
  const s = t.trim().toLowerCase();
  if (s === "midnight") return "00:00";
  if (s === "noon" || s === "midday") return "12:00";
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (!m) return null;
  let h = parseInt(m[1], 10) % 12;
  if (m[3] === "pm") h += 12;
  return `${String(h).padStart(2, "0")}:${m[2] ?? "00"}`;
}

function toForm(v?: Venue): VenueCreate {
  return {
    name: v?.name ?? "",
    category: v?.category ?? CATEGORIES[0],
    description: v?.description ?? "",
    address: v?.address ?? "",
    suburb: v?.suburb ?? "",
    phone: v?.phone ?? "",
    email: v?.email ?? "",
    website: v?.website ?? "",
    opening_hours: v?.opening_hours ?? "",
    image_url: v?.image_url ?? "",
    accessibility_features: v?.accessibility_features ?? [],
  };
}

interface FieldErrors {
  name?: string;
  address?: string;
  suburb?: string;
  phone?: string;
  email?: string;
}

function validateFields(form: VenueCreate): FieldErrors {
  const errs: FieldErrors = {};
  if (!form.name?.trim()) errs.name = "Venue name is required";
  if (form.address) {
    if (!/^\d+\s+\S/.test(form.address.trim())) errs.address = "Include a street number, e.g. 123 Main St";
  } else {
    errs.address = "Address is required";
  }
  if (!form.suburb?.trim()) errs.suburb = "Suburb is required";
  if (form.phone) {
    const digits = form.phone.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) errs.phone = "Enter a valid phone number";
  }
  if (form.email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = "Enter a valid email address";
  }
  return errs;
}

interface VenueFormProps {
  /** Existing venue to edit. Omit to start a blank form (onboarding). */
  initial?: Venue;
  submitLabel: string;
  savingLabel: string;
  /** Throw to show the error above the form. */
  onSubmit: (payload: VenueCreate) => Promise<void>;
}

/** The venue details form — used to create a venue at onboarding and to edit it afterwards. */
export function VenueForm({ initial, submitLabel, savingLabel, onSubmit }: VenueFormProps) {
  const [form, setForm] = useState<VenueCreate>(() => toForm(initial));
  const [parsedHours] = useState(() => parseHours(initial?.opening_hours));
  const [week, setWeek] = useState<WeekHours>(parsedHours.week);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep a category that predates the current list selectable rather than
  // silently showing (and saving) the first option instead.
  const categories = CATEGORIES.includes(form.category) ? CATEGORIES : [form.category, ...CATEGORIES];

  function setField<K extends keyof VenueCreate>(key: K, value: VenueCreate[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((e) => ({ ...e, [key]: undefined }));
  }

  function setDay(day: Day, patch: Partial<DayHours>) {
    setWeek((w) => ({ ...w, [day]: { ...w[day], ...patch } }));
  }

  function toggleFeature(feature: string) {
    setForm((f) => {
      const current = f.accessibility_features ?? [];
      const next = current.includes(feature) ? current.filter((x) => x !== feature) : [...current, feature];
      return { ...f, accessibility_features: next };
    });
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);

    if (!file.type.startsWith("image/")) { setError("Please choose an image file (JPG or PNG)."); return; }
    if (file.size > MAX_PHOTO_BYTES) { setError("Image must be under 5 MB."); return; }

    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) throw new Error("You must be signed in to upload a photo.");

      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
      if (upErr) throw upErr;

      const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
      setField("image_url", data.publicUrl);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to upload photo.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const errs = validateFields(form);
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }

    setSaving(true);
    try {
      await onSubmit({
        ...form,
        opening_hours: serializeHours(week),
        image_url: form.image_url?.trim() || undefined,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save venue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <p style={{ ...fieldLabel, marginBottom: 36 }}><span style={requiredMark}>*</span> Required</p>

      {error && (
        <p style={{ borderRadius: 12, padding: "12px 16px", marginBottom: 24, fontSize: 13, background: "var(--accent-soft)", color: "var(--accent)" }}>{error}</p>
      )}

      {/* Hero photo */}
      <div style={{ marginBottom: 34 }}>
        <div style={{ ...fieldLabel, letterSpacing: ".12em", marginBottom: 12 }}>Hero photo</div>
        {form.image_url ? (
          <div style={{ position: "relative", height: 220, borderRadius: 18, overflow: "hidden", border: "1px solid var(--line)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={form.image_url} alt="Venue hero" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <button
              type="button"
              onClick={() => setField("image_url", "")}
              style={{ position: "absolute", right: 12, top: 12, borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", cursor: "pointer" }}
            >
              Remove
            </button>
          </div>
        ) : (
          <label style={{ position: "relative", height: 220, borderRadius: 18, border: "1.5px dashed var(--line2)", background: "repeating-linear-gradient(135deg, var(--surface), var(--surface) 12px, var(--surface2) 12px, var(--surface2) 24px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, cursor: "pointer" }}>
            <div style={{ width: 46, height: 46, borderRadius: "50%", background: "var(--accent-soft)", display: "grid", placeItems: "center", color: "var(--accent)", fontSize: 22 }}>↑</div>
            <div style={{ fontWeight: 600 }}>{uploading ? "Uploading…" : "Drop a photo or click to upload"}</div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: "var(--faint)" }}>JPG / PNG · max 5MB</div>
            <input type="file" accept="image/*" onChange={handlePhotoChange} disabled={uploading} style={{ display: "none" }} />
          </label>
        )}
      </div>

      {/* The basics */}
      <div style={{ ...card, padding: 28, marginBottom: 24 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 17, marginBottom: 22 }}>The basics</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={fieldLabel}>Venue name<span style={requiredMark}>*</span></label>
            <input value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="e.g. The Lantern Room" style={{ ...fieldInput, borderColor: fieldErrors.name ? "var(--accent)" : "var(--line2)" }} />
            {fieldErrors.name && <p style={errStyle}>{fieldErrors.name}</p>}
          </div>
          <div>
            <label style={fieldLabel}>Category<span style={requiredMark}>*</span></label>
            <select value={form.category} onChange={(e) => setField("category", e.target.value)} style={fieldInput}>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={fieldLabel}>Phone <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
            <input type="tel" value={form.phone} onChange={(e) => setField("phone", e.target.value)} placeholder="e.g. (02) 9331 0042" style={{ ...fieldInput, borderColor: fieldErrors.phone ? "var(--accent)" : "var(--line2)" }} />
            {fieldErrors.phone && <p style={errStyle}>{fieldErrors.phone}</p>}
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={fieldLabel}>Description <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
            <textarea rows={3} value={form.description} onChange={(e) => setField("description", e.target.value)} placeholder="e.g. Rooftop cocktail bar with harbour views and a late licence." style={fieldInput} />
          </div>
        </div>
      </div>

      {/* Location & contact */}
      <div style={{ ...card, padding: 28, marginBottom: 24 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 17, marginBottom: 22 }}>Location &amp; contact</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 18 }}>
          <div>
            <label style={fieldLabel}>Street address<span style={requiredMark}>*</span></label>
            <input value={form.address} onChange={(e) => setField("address", e.target.value)} placeholder="e.g. 112 Crown Street" style={{ ...fieldInput, borderColor: fieldErrors.address ? "var(--accent)" : "var(--line2)" }} />
            {fieldErrors.address && <p style={errStyle}>{fieldErrors.address}</p>}
          </div>
          <div>
            <label style={fieldLabel}>Suburb<span style={requiredMark}>*</span></label>
            <input value={form.suburb} onChange={(e) => setField("suburb", e.target.value)} placeholder="e.g. Surry Hills" style={{ ...fieldInput, borderColor: fieldErrors.suburb ? "var(--accent)" : "var(--line2)" }} />
            {fieldErrors.suburb && <p style={errStyle}>{fieldErrors.suburb}</p>}
          </div>
          <div>
            <label style={fieldLabel}>Email <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
            <input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} placeholder="e.g. hello@venue.com.au" style={{ ...fieldInput, borderColor: fieldErrors.email ? "var(--accent)" : "var(--line2)" }} />
            {fieldErrors.email && <p style={errStyle}>{fieldErrors.email}</p>}
          </div>
          <div>
            <label style={fieldLabel}>Website <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
            <input type="url" value={form.website} onChange={(e) => setField("website", e.target.value)} placeholder="e.g. myvenue.com.au" style={fieldInput} />
          </div>
        </div>
      </div>

      {/* Opening hours */}
      <div style={{ ...card, padding: 28, marginBottom: 24 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 17, marginBottom: 6 }}>Opening hours</div>
        <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 20 }}>Toggle a day off to mark it closed.</div>
        {parsedHours.unread && (
          <p role="alert" style={{ borderRadius: 10, padding: "10px 14px", margin: "0 0 16px", fontSize: 13, lineHeight: 1.5, background: "var(--accent-soft)", color: "var(--accent)" }}>
            We couldn&apos;t read your saved hours (&ldquo;{initial?.opening_hours}&rdquo;), so these are placeholders.
            Set each day before you save — saving replaces the old hours.
          </p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {DAYS.map((day) => {
            const h = week[day];
            return (
              <div key={day} style={{ display: "grid", gridTemplateColumns: "150px 1fr", alignItems: "center", gap: 16, padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
                <button type="button" onClick={() => setDay(day, { open: !h.open })} style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", color: "var(--text)", textAlign: "left", padding: 0 }}>
                  <span style={switchTrack(h.open, true)}><span style={switchKnob(h.open, true)} /></span>
                  <span style={{ fontWeight: 600, width: 44 }}>{day}</span>
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {h.open ? (
                    <>
                      <input type="time" value={h.from} onChange={(e) => setDay(day, { from: e.target.value })} style={timeInput} />
                      <span style={{ color: "var(--faint)", fontSize: 13 }}>to</span>
                      <input type="time" value={h.to} onChange={(e) => setDay(day, { to: e.target.value })} style={timeInput} />
                    </>
                  ) : (
                    <span style={{ fontFamily: FONT_MONO, fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--faint)" }}>Closed</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Accessibility */}
      <div style={{ ...card, padding: 28, marginBottom: 32 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 17, marginBottom: 6 }}>Accessibility features</div>
        <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 20 }}>Guests filter on these to match their access needs. Select all that apply.</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
          {ACCESSIBILITY_FEATURES.map((feature) => {
            const on = (form.accessibility_features ?? []).includes(feature);
            return (
              <button
                key={feature}
                type="button"
                onClick={() => toggleFeature(feature)}
                style={{ display: "flex", alignItems: "center", gap: 11, padding: "14px 16px", borderRadius: 12, cursor: "pointer", textAlign: "left", fontSize: 14, border: `1px solid ${on ? "var(--accent)" : "var(--line2)"}`, background: on ? "var(--accent-soft)" : "var(--surface)", color: "var(--text)" }}
              >
                <span style={{ width: 18, height: 18, borderRadius: 6, flexShrink: 0, display: "grid", placeItems: "center", border: `1px solid ${on ? "var(--accent)" : "var(--line2)"}`, background: on ? "var(--accent)" : "transparent", color: "var(--accent-ink)", fontSize: 12, fontWeight: 700 }}>{on ? "✓" : ""}</span>
                <span style={{ fontWeight: 500 }}>{feature}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="submit" disabled={saving || uploading} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1, cursor: saving ? "not-allowed" : "pointer" }}>
          {saving ? savingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}

const errStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--accent)", margin: "8px 0 0" };

const timeInput: React.CSSProperties = {
  width: 130,
  padding: "9px 12px",
  borderRadius: 9,
  border: "1px solid var(--line2)",
  background: "var(--sunken)",
  color: "var(--text)",
  fontSize: 13,
  fontFamily: FONT_MONO,
};
