"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import type { DealCreate, DealUpdate, Deal, DealSchedule, DealScheduleInput } from "@/lib/api";
import { FONT_DISPLAY, card, fieldLabel, fieldInput, btnPrimary, btnGhost, switchTrack, switchKnob } from "@/lib/ui";

const CATEGORIES = [
  "Bar",
  "Restaurant",
  "Cafe",
  "Bowling",
  "Mini Golf",
  "Escape Room",
  "Arcade",
  "Pool / Billiards",
  "Karaoke",
  "Other",
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; // index = backend weekday (0 = Monday)

export type DealSubmission =
  | { kind: "deal"; data: DealCreate | DealUpdate }
  | { kind: "schedule"; data: DealScheduleInput };

interface DealFormProps {
  venueId: string;
  /** Editing a single deal. */
  initial?: Deal;
  /** Editing a weekly schedule. */
  initialSchedule?: DealSchedule;
  onSubmit: (submission: DealSubmission) => Promise<void>;
  submitLabel: string;
}

const sectionTitle: React.CSSProperties = { fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, marginBottom: 20 };

/** "2026-11-03" for today in the browser's time zone (venues are in Sydney). */
function todayIso() {
  return new Date().toLocaleDateString("en-CA");
}

function segment(on: boolean): React.CSSProperties {
  return {
    flex: 1, padding: "10px 14px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600,
    background: on ? "var(--surface)" : "transparent", color: on ? "var(--text)" : "var(--muted)",
    boxShadow: on ? "0 1px 3px rgba(0,0,0,.12)" : "none",
  };
}

function dayChip(on: boolean): React.CSSProperties {
  return {
    padding: "9px 0", width: 52, borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 600,
    border: `1px solid ${on ? "transparent" : "var(--line)"}`,
    background: on ? "var(--accent)" : "transparent", color: on ? "var(--accent-ink)" : "var(--muted)",
  };
}

export function DealForm({ venueId, initial: initialDeal, initialSchedule, onSubmit, submitLabel }: DealFormProps) {
  const router = useRouter();
  const initial = initialDeal ?? initialSchedule;
  // A new deal can be either; an existing one keeps the kind it was made as.
  const [kind, setKind] = useState<"deal" | "schedule">(initialSchedule ? "schedule" : "deal");
  const kindLocked = !!initial;

  const [title, setTitle] = useState(initial?.title ?? "");
  const [category, setCategory] = useState(initial?.category ?? CATEGORIES[0]);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "pp");
  const [originalPrice, setOriginalPrice] = useState(initial?.original_price?.toString() ?? "");
  const [discountPct, setDiscountPct] = useState(initial?.discount_pct?.toString() ?? "");
  const [dealDate, setDealDate] = useState(initialDeal?.deal_date ?? "");
  const legacyDate = initialDeal && !initialDeal.deal_date ? initialDeal.date : null;
  const [weekdays, setWeekdays] = useState<number[]>(initialSchedule?.weekdays ?? []);
  const [startsOn, setStartsOn] = useState(initialSchedule?.starts_on ?? "");
  const [endsOn, setEndsOn] = useState(initialSchedule?.ends_on ?? "");
  const [slots, setSlots] = useState<string[]>(initial?.slots ?? []);
  const [slotInput, setSlotInput] = useState("");
  const [maxGroupSize, setMaxGroupSize] = useState(initial?.max_group_size?.toString() ?? "6");
  const [totalSpots, setTotalSpots] = useState(initial?.total_spots?.toString() ?? "");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const origNum = parseFloat(originalPrice);
  const discNum = parseFloat(discountPct);
  const computedPrice = !isNaN(origNum) && !isNaN(discNum) ? Math.max(0, origNum * (1 - discNum / 100)) : null;

  function addSlot() {
    const s = slotInput.trim();
    if (s && !slots.includes(s)) setSlots([...slots, s]);
    setSlotInput("");
  }

  function removeSlot(s: string) {
    setSlots(slots.filter((x) => x !== s));
  }

  function toggleDay(d: number) {
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // A slot still sitting in the box counts: people forget to press Enter.
    const allSlots = slotInput.trim() && !slots.includes(slotInput.trim()) ? [...slots, slotInput.trim()] : slots;
    if (allSlots.length === 0) {
      setError("Add at least one time slot");
      return;
    }
    if (kind === "schedule" && weekdays.length === 0) {
      setError("Pick at least one day of the week");
      return;
    }
    if (kind === "deal" && !dealDate && !legacyDate) {
      setError("Pick the date this deal runs");
      return;
    }
    setSaving(true);
    try {
      const common = {
        title,
        category,
        description: description || undefined,
        unit: unit || undefined,
        original_price: parseFloat(originalPrice),
        discount_pct: parseFloat(discountPct),
        slots: allSlots,
        max_group_size: parseInt(maxGroupSize),
        total_spots: parseInt(totalSpots),
        is_active: isActive,
      };
      if (kind === "schedule") {
        await onSubmit({
          kind,
          data: { ...common, weekdays, starts_on: startsOn || null, ends_on: endsOn || null } satisfies DealScheduleInput,
        });
      } else {
        // An older deal with a free-text date keeps it until a real date is picked.
        const when = dealDate ? { deal_date: dealDate } : {};
        const payload: DealCreate | DealUpdate = initialDeal
          ? ({ ...common, ...when } satisfies DealUpdate)
          : ({ venue_id: venueId, ...common, ...when } satisfies DealCreate);
        await onSubmit({ kind, data: payload });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <p style={{ borderRadius: 12, padding: "12px 16px", marginBottom: 20, fontSize: 13, background: "var(--accent-soft)", color: "var(--accent)" }}>{error}</p>
      )}

      {/* Basics */}
      <div style={{ ...card, padding: 28, marginBottom: 22 }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 18 }}>
          <div>
            <label style={fieldLabel}>Title</label>
            <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Two-for-one cocktails" style={fieldInput} />
          </div>
          <div>
            <label style={fieldLabel}>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={fieldInput}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={fieldLabel}>Description</label>
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Two signature cocktails for the price of one." style={fieldInput} />
          </div>
        </div>
      </div>

      {/* When it runs */}
      <div style={{ ...card, padding: 28, marginBottom: 22 }}>
        <div style={sectionTitle}>When it runs</div>
        {!kindLocked && (
          <div role="radiogroup" aria-label="How often" style={{ display: "flex", gap: 4, padding: 4, borderRadius: 12, background: "var(--sunken)", marginBottom: 20 }}>
            <button type="button" role="radio" aria-checked={kind === "deal"} onClick={() => setKind("deal")} style={segment(kind === "deal")}>One date</button>
            <button type="button" role="radio" aria-checked={kind === "schedule"} onClick={() => setKind("schedule")} style={segment(kind === "schedule")}>Every week</button>
          </div>
        )}
        {kind === "deal" ? (
          <div>
            <label style={fieldLabel}>Date</label>
            <input
              type="date"
              required={!legacyDate}
              min={initialDeal ? undefined : todayIso()}
              value={dealDate}
              onChange={(e) => setDealDate(e.target.value)}
              style={fieldInput}
            />
            {legacyDate && !dealDate && (
              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 8 }}>Currently “{legacyDate}”. Pick a date to replace it.</div>
            )}
          </div>
        ) : (
          <>
            <label style={fieldLabel}>Days</label>
            <div role="group" aria-label="Days of the week" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
              {WEEKDAYS.map((name, i) => (
                <button key={name} type="button" aria-pressed={weekdays.includes(i)} onClick={() => toggleDay(i)} style={dayChip(weekdays.includes(i))}>
                  {name}
                </button>
              ))}
            </div>
            <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 18 }}>
              A fresh deal goes live on each of these days, with all its spots.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
              <div>
                <label style={fieldLabel}>Starts (optional)</label>
                <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} style={fieldInput} />
              </div>
              <div>
                <label style={fieldLabel}>Ends (optional)</label>
                <input type="date" min={startsOn || undefined} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} style={fieldInput} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Pricing */}
      <div style={{ ...card, padding: 28, marginBottom: 22 }}>
        <div style={sectionTitle}>Pricing</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 18, alignItems: "end" }}>
          <div>
            <label style={fieldLabel}>Original price ($)</label>
            <input required type="number" min="0" step="0.01" value={originalPrice} onChange={(e) => setOriginalPrice(e.target.value)} placeholder="36" style={fieldInput} />
          </div>
          <div>
            <label style={fieldLabel}>Discount (%)</label>
            <input required type="number" min="0" max="100" step="0.1" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} placeholder="50" style={fieldInput} />
          </div>
          <div>
            <label style={fieldLabel}>Unit</label>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="pp" style={fieldInput} />
          </div>
          <div style={{ padding: "6px 4px" }}>
            <div style={{ ...fieldLabel, marginBottom: 6 }}>Deal price</div>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 30, color: "var(--accent)", lineHeight: 1 }}>
              {computedPrice !== null ? formatCurrency(computedPrice) : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Time slots */}
      <div style={{ ...card, padding: 28, marginBottom: 22 }}>
        <div style={{ ...sectionTitle, marginBottom: 6 }}>Time slots</div>
        <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>Type a slot and press Enter to add.</div>
        {slots.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {slots.map((s) => (
              <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 999, background: "var(--accent-soft)", color: "var(--accent)", fontFamily: "var(--font-mono-sg)", fontSize: 13 }}>
                {s}
                <button type="button" onClick={() => removeSlot(s)} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
              </span>
            ))}
          </div>
        )}
        <input
          value={slotInput}
          onChange={(e) => setSlotInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSlot(); } }}
          placeholder="e.g. 6:30pm"
          style={fieldInput}
        />
      </div>

      {/* Capacity */}
      <div style={{ ...card, padding: 28, marginBottom: 22 }}>
        <div style={sectionTitle}>Capacity</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          <div>
            <label style={fieldLabel}>{kind === "schedule" ? "Spots each day" : "Total spots"}</label>
            <input required type="number" min="1" value={totalSpots} onChange={(e) => setTotalSpots(e.target.value)} placeholder="20" style={fieldInput} />
          </div>
          <div>
            <label style={fieldLabel}>Max group size</label>
            <input type="number" min="1" value={maxGroupSize} onChange={(e) => setMaxGroupSize(e.target.value)} placeholder="6" style={fieldInput} />
          </div>
        </div>
      </div>

      {/* Active toggle */}
      <div style={{ ...card, padding: "22px 28px", marginBottom: 26, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{kind === "schedule" ? "Schedule on" : "Deal active"}</div>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            {kind === "schedule" ? "Turn off to pause the weekly deal." : "Visible to guests immediately."}
          </div>
        </div>
        <button type="button" onClick={() => setIsActive((v) => !v)} style={switchTrack(isActive)} aria-pressed={isActive}>
          <span style={switchKnob(isActive)} />
        </button>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
        <button type="button" onClick={() => router.back()} style={btnGhost}>Cancel</button>
        <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1, cursor: saving ? "not-allowed" : "pointer" }}>
          {saving ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
