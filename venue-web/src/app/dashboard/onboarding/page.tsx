"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { venueApi, type VenueCreate } from "@/lib/api";
import { useVenue } from "@/providers/VenueProvider";

const CATEGORIES = [
  "Bar", "Restaurant", "Cafe", "Bowling", "Mini Golf",
  "Escape Room", "Arcade", "Pool / Billiards", "Karaoke", "Other",
];

// ── Opening hours types ───────────────────────────────────────────────────────

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
type Day = typeof DAYS[number];

interface DayHours {
  open: boolean;
  from: string; // "HH:MM" 24-h
  to: string;
}

type WeekHours = Record<Day, DayHours>;

const DEFAULT_WEEK: WeekHours = {
  Mon: { open: true,  from: "11:00", to: "22:00" },
  Tue: { open: true,  from: "11:00", to: "22:00" },
  Wed: { open: true,  from: "11:00", to: "22:00" },
  Thu: { open: true,  from: "11:00", to: "22:00" },
  Fri: { open: true,  from: "11:00", to: "23:00" },
  Sat: { open: true,  from: "10:00", to: "23:00" },
  Sun: { open: false, from: "10:00", to: "21:00" },
};

/** Serialise the week schedule to a readable string for the backend. */
function serializeHours(w: WeekHours): string {
  // Group consecutive identical open days
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

// ── Field errors ──────────────────────────────────────────────────────────────

interface FieldErrors {
  name?: string;
  address?: string;
  suburb?: string;
  phone?: string;
  email?: string;
}

function validateFields(form: VenueCreate): FieldErrors {
  const errs: FieldErrors = {};

  if (!form.name?.trim()) {
    errs.name = "Venue name is required";
  }

  // Address: must look like "<number> <street>" e.g. "123 Main St"
  if (form.address) {
    if (!/^\d+\s+\S/.test(form.address.trim())) {
      errs.address = "Include a street number, e.g. 123 Main St";
    }
  } else {
    errs.address = "Address is required";
  }

  if (!form.suburb?.trim()) {
    errs.suburb = "Suburb is required";
  }

  // Phone: optional but if provided must be a plausible AU number
  if (form.phone) {
    const digits = form.phone.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) {
      errs.phone = "Enter a valid phone number";
    }
  }

  // Email: optional but if provided must look valid
  if (form.email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errs.email = "Enter a valid email address";
    }
  }

  return errs;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VenueOnboardingPage() {
  const { venue, loading, setVenue } = useVenue();
  const router = useRouter();

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
  });

  const [week, setWeek] = useState<WeekHours>(DEFAULT_WEEK);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && venue) {
    router.replace("/dashboard");
    return null;
  }

  function setField<K extends keyof VenueCreate>(key: K, value: VenueCreate[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    // Clear error for this field on change
    setFieldErrors((e) => ({ ...e, [key]: undefined }));
  }

  function setDay(day: Day, patch: Partial<DayHours>) {
    setWeek((w) => ({ ...w, [day]: { ...w[day], ...patch } }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const errs = validateFields(form);
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    setSaving(true);
    try {
      const payload: VenueCreate = {
        ...form,
        opening_hours: serializeHours(week),
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
    return (
      <div className="flex h-full items-center justify-center text-sm" style={{ color: "var(--faint)" }}>
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg py-10">
      <h1 className="text-2xl font-bold" style={{ color: "var(--text)" }}>Create your venue</h1>
      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
        Set up your venue profile to start publishing deals.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">

        {error && (
          <p className="rounded-lg px-4 py-3 text-sm" style={{ background: "rgba(255,90,77,0.12)", color: "var(--accent)" }}>
            {error}
          </p>
        )}

        {/* ── Section: Identity ── */}
        <Section title="Identity">
          <Field label="Venue name *" error={fieldErrors.name}>
            <input required value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              className={inputCls} style={inputStyle(!!fieldErrors.name)}
              placeholder="The Grand Hotel" />
          </Field>

          <Field label="Category *">
            <select value={form.category}
              onChange={(e) => setField("category", e.target.value)}
              className={inputCls} style={inputStyle()}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>

          <Field label="Description">
            <textarea rows={3} value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              className={inputCls} style={inputStyle()}
              placeholder="Tell customers what makes your venue special" />
          </Field>
        </Section>

        {/* ── Section: Location ── */}
        <Section title="Location">
          <Field label="Street address *" error={fieldErrors.address}
            hint="Include street number e.g. 123 Main St">
            <input value={form.address}
              onChange={(e) => setField("address", e.target.value)}
              className={inputCls} style={inputStyle(!!fieldErrors.address)}
              placeholder="123 Main St" />
          </Field>

          <Field label="Suburb *" error={fieldErrors.suburb}>
            <input value={form.suburb}
              onChange={(e) => setField("suburb", e.target.value)}
              className={inputCls} style={inputStyle(!!fieldErrors.suburb)}
              placeholder="Fitzroy" />
          </Field>
        </Section>

        {/* ── Section: Contact ── */}
        <Section title="Contact">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Phone" error={fieldErrors.phone}>
              <input type="tel" value={form.phone}
                onChange={(e) => setField("phone", e.target.value)}
                className={inputCls} style={inputStyle(!!fieldErrors.phone)}
                placeholder="03 9000 0000" />
            </Field>
            <Field label="Email" error={fieldErrors.email}>
              <input type="email" value={form.email}
                onChange={(e) => setField("email", e.target.value)}
                className={inputCls} style={inputStyle(!!fieldErrors.email)}
                placeholder="hello@venue.com" />
            </Field>
          </div>
          <Field label="Website">
            <input type="url" value={form.website}
              onChange={(e) => setField("website", e.target.value)}
              className={inputCls} style={inputStyle()}
              placeholder="https://myvenue.com.au" />
          </Field>
        </Section>

        {/* ── Section: Opening hours ── */}
        <Section title="Opening hours">
          <div className="space-y-2">
            {DAYS.map((day) => (
              <DayRow key={day} day={day} hours={week[day]} onChange={(p) => setDay(day, p)} />
            ))}
          </div>
          <p className="mt-2 text-xs" style={{ color: "var(--faint)" }}>
            Preview: <span style={{ color: "var(--muted)" }}>{serializeHours(week).slice(0, 80)}…</span>
          </p>
        </Section>

        <button type="submit" disabled={saving}
          className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-50"
          style={{ background: "var(--accent)", color: "var(--accent-ink)" }}>
          {saving ? "Creating venue…" : "Create venue"}
        </button>
      </form>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5 space-y-4"
      style={{ background: "var(--surface)", border: "1px solid var(--line)" }}>
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--faint)" }}>{title}</p>
      {children}
    </div>
  );
}

function Field({
  label, error, hint, children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium" style={{ color: "var(--muted)" }}>{label}</label>
      {children}
      {hint && !error && <p className="text-xs" style={{ color: "var(--faint)" }}>{hint}</p>}
      {error && <p className="text-xs font-medium" style={{ color: "var(--accent)" }}>{error}</p>}
    </div>
  );
}

function DayRow({ day, hours, onChange }: {
  day: Day;
  hours: DayHours;
  onChange: (p: Partial<DayHours>) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      {/* Toggle */}
      <button
        type="button"
        onClick={() => onChange({ open: !hours.open })}
        className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
        style={{ background: hours.open ? "var(--accent)" : "var(--ph)" }}
      >
        <span
          className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform"
          style={{ transform: hours.open ? "translateX(1rem)" : "translateX(0.125rem)" }}
        />
      </button>

      {/* Day label */}
      <span className="w-8 text-sm font-semibold shrink-0"
        style={{ color: hours.open ? "var(--text)" : "var(--faint)" }}>
        {day}
      </span>

      {hours.open ? (
        <div className="flex flex-1 items-center gap-2">
          <input
            type="time"
            value={hours.from}
            onChange={(e) => onChange({ from: e.target.value })}
            className="flex-1 rounded-lg px-2 py-1 text-sm focus:outline-none"
            style={{ background: "var(--ph)", border: "1px solid var(--line2)", color: "var(--text)" }}
          />
          <span className="text-xs" style={{ color: "var(--faint)" }}>to</span>
          <input
            type="time"
            value={hours.to}
            onChange={(e) => onChange({ to: e.target.value })}
            className="flex-1 rounded-lg px-2 py-1 text-sm focus:outline-none"
            style={{ background: "var(--ph)", border: "1px solid var(--line2)", color: "var(--text)" }}
          />
        </div>
      ) : (
        <span className="flex-1 text-sm" style={{ color: "var(--faint)" }}>Closed</span>
      )}
    </div>
  );
}

const inputCls = "w-full rounded-lg px-3 py-2 text-sm placeholder:opacity-40 focus:outline-none transition-colors";

function inputStyle(hasError = false): React.CSSProperties {
  return {
    background: "var(--ph)",
    border: `1px solid ${hasError ? "var(--accent)" : "var(--line2)"}`,
    color: "var(--text)",
  };
}
