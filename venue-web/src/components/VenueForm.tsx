"use client";

import React, { useState } from "react";
import { venueApi, type PlaceLookup, type Venue, type VenueCreate } from "@/lib/api";
import { PHOTO_BUCKET, extOf, uploadPublic } from "@/lib/storage";
import { FONT_DISPLAY, numeric, card, fieldLabel, fieldInput, btnPrimary, btnGhost, requiredMark, switchTrack, switchKnob } from "@/lib/ui";
import { DAYS, parseHours, serializeHours, type Day, type DayHours, type WeekHours } from "@/lib/hours";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_PHOTOS = 8;                    // mirrors MAX_PHOTOS in backend/routers/venues.py

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
    // Venues from before the gallery only have the one photo.
    image_urls: v?.image_urls?.length ? v.image_urls : v?.image_url ? [v.image_url] : [],
    google_place_id: v?.google_place_id ?? undefined,
    lat: v?.lat ?? undefined,
    lng: v?.lng ?? undefined,
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
  // Google lookup: idle, searching, a match to confirm, applied, or nothing found.
  const [lookup, setLookup] = useState<
    | { state: "idle" | "searching" | "missing" }
    | { state: "found" | "applied"; place: PlaceLookup }
  >({ state: "idle" });
  const photos = form.image_urls ?? [];

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

  async function handlePhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setError(null);

    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) { setError(`You can add up to ${MAX_PHOTOS} photos. Remove one to add another.`); return; }
    const bad = files.find((f) => !f.type.startsWith("image/"));
    if (bad) { setError(`"${bad.name}" isn't an image. Choose JPG or PNG files.`); return; }
    const big = files.find((f) => f.size > MAX_PHOTO_BYTES);
    if (big) { setError(`"${big.name}" is over 5 MB.`); return; }

    setUploading(true);
    try {
      for (const file of files.slice(0, room)) {
        const url = await uploadPublic(PHOTO_BUCKET, file, extOf(file, "jpg"), file.type);
        setForm((f) => ({ ...f, image_urls: [...(f.image_urls ?? []), url] }));
      }
      if (files.length > room) setError(`Added ${room}. You can have up to ${MAX_PHOTOS} photos.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to upload photo.");
    } finally {
      setUploading(false);
    }
  }

  function removePhoto(url: string) {
    setForm((f) => ({ ...f, image_urls: (f.image_urls ?? []).filter((u) => u !== url) }));
  }

  function makeCover(url: string) {
    setForm((f) => ({ ...f, image_urls: [url, ...(f.image_urls ?? []).filter((u) => u !== url)] }));
  }

  async function findOnGoogle() {
    setError(null);
    setLookup({ state: "searching" });
    try {
      const place = await venueApi.lookup({ name: form.name, address: form.address, suburb: form.suburb });
      setLookup(place.found ? { state: "found", place } : { state: "missing" });
    } catch (err: unknown) {
      setLookup({ state: "idle" });
      setError(err instanceof Error ? err.message : "Couldn't reach Google just now.");
    }
  }

  /** Fill the form from the matched place. Hours replace the week shown; phone
   *  and website only fill boxes that are still empty. */
  function applyPlace(place: PlaceLookup) {
    if (place.opening_hours) {
      const { week: fromGoogle, unread } = parseHours(place.opening_hours);
      if (!unread) setWeek(fromGoogle);
    }
    setForm((f) => ({
      ...f,
      phone: f.phone?.trim() ? f.phone : place.phone ?? "",
      website: f.website?.trim() ? f.website : place.website ?? "",
      lat: place.lat ?? f.lat,
      lng: place.lng ?? f.lng,
      google_place_id: place.place_id ?? f.google_place_id,
    }));
    setLookup({ state: "applied", place });
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
        image_urls: photos,
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

      {/* Photos */}
      <div style={{ marginBottom: 34 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <div style={{ ...fieldLabel, letterSpacing: ".12em", margin: 0 }}>Photos</div>
          <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
            Guests swipe through these in the app. The first is your cover. {photos.length}/{MAX_PHOTOS}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
          {photos.map((url, i) => (
            <div key={url} style={{ position: "relative", aspectRatio: "4 / 3", borderRadius: 14, overflow: "hidden", border: `1px solid ${i === 0 ? "var(--accent)" : "var(--line)"}` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={i === 0 ? "Cover photo" : `Photo ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              {i === 0 && <span style={{ ...photoChip, left: 8, top: 8, background: "var(--accent)", color: "var(--accent-ink)" }}>Cover</span>}
              <div style={{ position: "absolute", right: 8, bottom: 8, display: "flex", gap: 6 }}>
                {i > 0 && <button type="button" onClick={() => makeCover(url)} style={photoBtn}>Make cover</button>}
                <button type="button" onClick={() => removePhoto(url)} aria-label={`Remove photo ${i + 1}`} style={photoBtn}>Remove</button>
              </div>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <label style={{ aspectRatio: photos.length ? "4 / 3" : undefined, height: photos.length ? undefined : 220, gridColumn: photos.length ? undefined : "1 / -1", borderRadius: 14, border: "1.5px dashed var(--line2)", background: "repeating-linear-gradient(135deg, var(--surface), var(--surface) 12px, var(--surface2) 12px, var(--surface2) 24px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, cursor: uploading ? "wait" : "pointer", textAlign: "center", padding: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--accent-soft)", display: "grid", placeItems: "center", color: "var(--accent)", fontSize: 20 }}>↑</div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{uploading ? "Uploading…" : photos.length ? "Add photos" : "Drop photos or click to upload"}</div>
              <div style={{ ...numeric, fontSize: 11, color: "var(--faint)" }}>JPG / PNG · max 5MB each</div>
              <input type="file" accept="image/*" multiple onChange={handlePhotos} disabled={uploading} style={{ display: "none" }} />
            </label>
          )}
        </div>
      </div>

      {/* The basics */}
      <div style={{ ...card, padding: 28, marginBottom: 24 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 17, marginBottom: 22 }}>The basics</div>
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
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 17, marginBottom: 22 }}>Location &amp; contact</div>
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

        {/* Google Maps: prefill hours, phone and website from the venue's listing */}
        <div style={{ marginTop: 22, paddingTop: 20, borderTop: "1px solid var(--line)" }}>
          {lookup.state === "found" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 600 }}>Is this you? {lookup.place.name}</div>
                <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 3 }}>
                  {lookup.place.address}
                  {lookup.place.opening_hours ? " · opening hours listed" : " · no opening hours listed"}
                </div>
              </div>
              <button type="button" onClick={() => setLookup({ state: "missing" })} style={btnGhost}>Not my venue</button>
              <button type="button" onClick={() => applyPlace(lookup.place)} style={btnPrimary}>Use these details</button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 220, fontSize: 13, lineHeight: 1.5, color: "var(--muted)" }}>
                {lookup.state === "applied"
                  ? lookup.place.opening_hours
                    ? `Filled from Google Maps (${lookup.place.name}). Check your opening hours below and change anything that's off.`
                    : `Linked to ${lookup.place.name} on Google Maps. It has no opening hours listed, so set them below.`
                  : lookup.state === "missing"
                    ? "We couldn't match your venue on Google Maps. Check the name and address, or set your hours below."
                    : form.google_place_id
                      ? "Linked to your Google Maps listing. Search again if your hours have changed."
                      : "Save time: we can fill in your opening hours, phone and website from your Google Maps listing."}
                {lookup.state === "applied" && lookup.place.has_popular_times && (
                  <span style={{ display: "block", marginTop: 4 }}>Google&apos;s busy times for your venue will start off your deal planner.</span>
                )}
              </div>
              <button
                type="button"
                onClick={findOnGoogle}
                disabled={lookup.state === "searching" || !form.name?.trim() || !form.address?.trim()}
                title={!form.name?.trim() || !form.address?.trim() ? "Enter your venue name and street address first" : undefined}
                style={{ ...btnGhost, opacity: !form.name?.trim() || !form.address?.trim() ? 0.5 : 1 }}
              >
                {lookup.state === "searching" ? "Searching Google…" : lookup.state === "idle" && !form.google_place_id ? "Fill from Google" : "Search Google again"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Opening hours */}
      <div style={{ ...card, padding: 28, marginBottom: 24 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 17, marginBottom: 6 }}>Opening hours</div>
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
                    <span style={{ ...numeric, fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--faint)" }}>Closed</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Accessibility */}
      <div style={{ ...card, padding: 28, marginBottom: 32 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 17, marginBottom: 6 }}>Accessibility features</div>
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
                <span style={{ width: 18, height: 18, borderRadius: 6, flexShrink: 0, display: "grid", placeItems: "center", border: `1px solid ${on ? "var(--accent)" : "var(--line2)"}`, background: on ? "var(--accent)" : "transparent", color: "var(--accent-ink)", fontSize: 12, fontWeight: 600 }}>{on ? "✓" : ""}</span>
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

const photoChip: React.CSSProperties = {
  position: "absolute", padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, letterSpacing: ".04em",
};

const photoBtn: React.CSSProperties = {
  borderRadius: 7, padding: "5px 9px", fontSize: 11.5, fontWeight: 600, background: "rgba(0,0,0,0.62)", color: "#fff", border: "none", cursor: "pointer",
};

const errStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--accent)", margin: "8px 0 0" };

const timeInput: React.CSSProperties = {
  width: 130,
  padding: "9px 12px",
  borderRadius: 9,
  border: "1px solid var(--line2)",
  background: "var(--sunken)",
  color: "var(--text)",
  fontSize: 13,
  ...numeric,
};
