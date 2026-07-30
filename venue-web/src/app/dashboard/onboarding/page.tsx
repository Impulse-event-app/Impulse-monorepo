"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { venueApi, type VenueCreate } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useVenue } from "@/providers/VenueProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { FONT_DISPLAY, FONT_MONO, card, fieldLabel, fieldInput, btnPrimary, switchTrack, switchKnob } from "@/lib/ui";

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

export default function VenueOnboardingPage() {
  const { venue, loading, error: venueLoadError, refetch, setVenue } = useVenue();
  const router = useRouter();
  const { theme, toggle } = useTheme();

  const [form, setForm] = useState<VenueCreate>({
    name: "",
    category: CATEGORIES[0],
    description: "",
    address: "",
    suburb: "",
    phone: "",
    email: "",
    website: "",
    opening_hours: "",
    image_url: "",
    accessibility_features: [],
  });

  const [week, setWeek] = useState<WeekHours>(DEFAULT_WEEK);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && venue) router.replace("/dashboard");
  }, [loading, venue, router]);

  if (!loading && venue) return null;

  // If the venue lookup failed (backend down / token rejected) we can't be sure
  // the user is venue-less — block the create form so we don't spawn a duplicate.
  if (venueLoadError) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "70vh", padding: 24 }}>
        <div style={{ ...card, borderRadius: 18, padding: 32, maxWidth: 460, textAlign: "center" }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 20, marginBottom: 8 }}>
            Can&apos;t confirm your venue
          </div>
          <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.6, margin: "0 0 20px" }}>
            We couldn&apos;t reach the server to check whether you already have a venue. To avoid
            creating a duplicate, we&apos;ve paused setup — retry once you&apos;re back online.
            <span style={{ display: "block", marginTop: 8, fontFamily: FONT_MONO, fontSize: 11, color: "var(--faint)" }}>
              {venueLoadError.status ? `Error ${venueLoadError.status}` : "Network error"} · {venueLoadError.message}
            </span>
          </p>
          <button onClick={refetch} style={{ ...btnPrimary, padding: "12px 22px" }}>Try again</button>
        </div>
      </div>
    );
  }

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
      const payload: VenueCreate = {
        ...form,
        opening_hours: serializeHours(week),
        image_url: form.image_url?.trim() || undefined,
      };
      const created = await venueApi.create(payload);
      setVenue(created);
      router.replace("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create venue");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={{ display: "grid", placeItems: "center", height: "60vh", color: "var(--faint)", fontSize: 14 }}>Loading…</div>;
  }

  return (
    <>
      {/* Theme toggle */}
      <button
        onClick={toggle}
        style={{ position: "fixed", top: 18, right: 18, zIndex: 20, display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 13px", borderRadius: 999, border: "1px solid var(--line2)", background: "var(--surface)", color: "var(--text)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
      >
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--accent)", boxShadow: "0 0 10px var(--accent)" }} />
        {theme === "dark" ? "Dark" : "Light"}
      </button>

      <div style={{ maxWidth: 840, margin: "0 auto", padding: "44px 32px 80px" }}>
        <div style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 12 }}>Step 1 of 1 · Set up your venue</div>
        <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 38, letterSpacing: "-.02em", margin: "0 0 8px" }}>Tell us about your venue</h1>
        <p style={{ color: "var(--muted)", fontSize: 15, margin: "0 0 36px", maxWidth: 560 }}>This is what guests see when your deals surface. You can edit any of it later.</p>

        <form onSubmit={handleSubmit}>
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
                <label style={fieldLabel}>Venue name</label>
                <input value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="The Lantern Room" style={{ ...fieldInput, borderColor: fieldErrors.name ? "var(--accent)" : "var(--line2)" }} />
                {fieldErrors.name && <p style={errStyle}>{fieldErrors.name}</p>}
              </div>
              <div>
                <label style={fieldLabel}>Category</label>
                <select value={form.category} onChange={(e) => setField("category", e.target.value)} style={fieldInput}>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={fieldLabel}>Phone</label>
                <input type="tel" value={form.phone} onChange={(e) => setField("phone", e.target.value)} placeholder="(02) 9331 0042" style={{ ...fieldInput, borderColor: fieldErrors.phone ? "var(--accent)" : "var(--line2)" }} />
                {fieldErrors.phone && <p style={errStyle}>{fieldErrors.phone}</p>}
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={fieldLabel}>Description</label>
                <textarea rows={3} value={form.description} onChange={(e) => setField("description", e.target.value)} placeholder="Tell guests what makes your venue special." style={fieldInput} />
              </div>
            </div>
          </div>

          {/* Location & contact */}
          <div style={{ ...card, padding: 28, marginBottom: 24 }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 17, marginBottom: 22 }}>Location &amp; contact</div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 18 }}>
              <div>
                <label style={fieldLabel}>Street address</label>
                <input value={form.address} onChange={(e) => setField("address", e.target.value)} placeholder="112 Crown Street" style={{ ...fieldInput, borderColor: fieldErrors.address ? "var(--accent)" : "var(--line2)" }} />
                {fieldErrors.address && <p style={errStyle}>{fieldErrors.address}</p>}
              </div>
              <div>
                <label style={fieldLabel}>Suburb</label>
                <input value={form.suburb} onChange={(e) => setField("suburb", e.target.value)} placeholder="Surry Hills" style={{ ...fieldInput, borderColor: fieldErrors.suburb ? "var(--accent)" : "var(--line2)" }} />
                {fieldErrors.suburb && <p style={errStyle}>{fieldErrors.suburb}</p>}
              </div>
              <div>
                <label style={fieldLabel}>Email</label>
                <input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} placeholder="hello@venue.com.au" style={{ ...fieldInput, borderColor: fieldErrors.email ? "var(--accent)" : "var(--line2)" }} />
                {fieldErrors.email && <p style={errStyle}>{fieldErrors.email}</p>}
              </div>
              <div>
                <label style={fieldLabel}>Website</label>
                <input type="url" value={form.website} onChange={(e) => setField("website", e.target.value)} placeholder="myvenue.com.au" style={fieldInput} />
              </div>
            </div>
          </div>

          {/* Opening hours */}
          <div style={{ ...card, padding: 28, marginBottom: 24 }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 17, marginBottom: 6 }}>Opening hours</div>
            <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 20 }}>Toggle a day off to mark it closed.</div>
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
            <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1, cursor: saving ? "not-allowed" : "pointer" }}>
              {saving ? "Creating venue…" : "Create venue →"}
            </button>
          </div>
        </form>
      </div>
    </>
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
