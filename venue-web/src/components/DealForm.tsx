"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { DealCreate, DealUpdate, Deal } from "@/lib/api";

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

interface DealFormProps {
  venueId: string;
  initial?: Deal;
  onSubmit: (data: DealCreate | DealUpdate) => Promise<void>;
  submitLabel: string;
}

export function DealForm({
  venueId,
  initial,
  onSubmit,
  submitLabel,
}: DealFormProps) {
  const router = useRouter();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [category, setCategory] = useState(initial?.category ?? CATEGORIES[0]);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "pp");
  const [originalPrice, setOriginalPrice] = useState(
    initial?.original_price?.toString() ?? ""
  );
  const [discountPct, setDiscountPct] = useState(
    initial?.discount_pct?.toString() ?? ""
  );
  const [date, setDate] = useState(initial?.date ?? "");
  const [slots, setSlots] = useState<string[]>(initial?.slots ?? []);
  const [slotInput, setSlotInput] = useState("");
  const [maxGroupSize, setMaxGroupSize] = useState(
    initial?.max_group_size?.toString() ?? "6"
  );
  const [totalSpots, setTotalSpots] = useState(
    initial?.total_spots?.toString() ?? ""
  );
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const origNum = parseFloat(originalPrice);
  const discNum = parseFloat(discountPct);
  const computedPrice =
    !isNaN(origNum) && !isNaN(discNum)
      ? origNum * (1 - discNum / 100)
      : null;

  function addSlot() {
    const s = slotInput.trim();
    if (s && !slots.includes(s)) setSlots([...slots, s]);
    setSlotInput("");
  }

  function removeSlot(s: string) {
    setSlots(slots.filter((x) => x !== s));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (slots.length === 0) {
      setError("Add at least one time slot");
      return;
    }
    setSaving(true);
    try {
      const payload: DealCreate | DealUpdate = initial
        ? ({
            title,
            category,
            description: description || undefined,
            unit: unit || undefined,
            original_price: parseFloat(originalPrice),
            discount_pct: parseFloat(discountPct),
            date,
            slots,
            max_group_size: parseInt(maxGroupSize),
            total_spots: parseInt(totalSpots),
            is_active: isActive,
          } satisfies DealUpdate)
        : ({
            venue_id: venueId,
            title,
            category,
            description: description || undefined,
            unit: unit || undefined,
            original_price: parseFloat(originalPrice),
            discount_pct: parseFloat(discountPct),
            date,
            slots,
            max_group_size: parseInt(maxGroupSize),
            total_spots: parseInt(totalSpots),
            is_active: isActive,
          } satisfies DealCreate);
      await onSubmit(payload);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <p className="rounded-lg px-4 py-3 text-sm" style={{background:'rgba(255,90,77,0.12)', color:'var(--accent)'}}>
          {error}
        </p>
      )}

      {/* Basic info */}
      <section className="rounded-2xl p-6 space-y-4" style={{background:'var(--surface)', border:'1px solid var(--line)'}}>
        <h2 className="font-semibold" style={{color:'var(--text)'}}>Basic info</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Title *" className="col-span-2">
            <input required value={title} onChange={(e) => setTitle(e.target.value)}
              className={inputCls} style={inputStyle} placeholder="Friday Night Lanes" />
          </Field>
          <Field label="Category *">
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className={inputCls} style={inputStyle}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Date *">
            <input required value={date} onChange={(e) => setDate(e.target.value)}
              className={inputCls} style={inputStyle} placeholder="Monday 30 June 2026" />
          </Field>
          <Field label="Description" className="col-span-2">
            <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
              className={inputCls} style={inputStyle} placeholder="Optional description" />
          </Field>
        </div>
      </section>

      {/* Pricing */}
      <section className="rounded-2xl p-6 space-y-4" style={{background:'var(--surface)', border:'1px solid var(--line)'}}>
        <h2 className="font-semibold" style={{color:'var(--text)'}}>Pricing</h2>
        <div className="grid grid-cols-3 gap-4 items-end">
          <Field label="Original price (AUD) *">
            <input required type="number" min="0" step="0.01" value={originalPrice}
              onChange={(e) => setOriginalPrice(e.target.value)}
              className={inputCls} style={inputStyle} placeholder="50.00" />
          </Field>
          <Field label="Discount % *">
            <input required type="number" min="0" max="100" step="0.1" value={discountPct}
              onChange={(e) => setDiscountPct(e.target.value)}
              className={inputCls} style={inputStyle} placeholder="20" />
          </Field>
          <Field label="Unit (e.g. pp, /lane)">
            <input value={unit} onChange={(e) => setUnit(e.target.value)}
              className={inputCls} style={inputStyle} placeholder="pp" />
          </Field>
        </div>
        {computedPrice !== null && (
          <p className="text-sm" style={{color:'var(--muted)'}}>
            Deal price:{" "}
            <span className="font-semibold" style={{color:'var(--accent)'}}>
              {formatCurrency(computedPrice)}
            </span>
            {unit && <span> {unit}</span>}
          </p>
        )}
      </section>

      {/* Slots */}
      <section className="rounded-2xl p-6 space-y-4" style={{background:'var(--surface)', border:'1px solid var(--line)'}}>
        <h2 className="font-semibold" style={{color:'var(--text)'}}>Time slots</h2>
        <div className="flex gap-2">
          <input
            value={slotInput}
            onChange={(e) => setSlotInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSlot(); } }}
            className={`${inputCls} flex-1`} style={inputStyle}
            placeholder="5:00 PM — press Enter to add"
          />
          <button type="button" onClick={addSlot}
            className="rounded-lg px-3 py-2 text-sm font-medium transition-opacity hover:opacity-80"
            style={{background:'var(--chip-bg)', color:'var(--muted)'}}>
            Add
          </button>
        </div>
        {slots.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {slots.map((s) => (
              <span key={s} className="flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium"
                style={{background:'var(--accent-soft)', color:'var(--accent)'}}>
                {s}
                <button type="button" onClick={() => removeSlot(s)} className="hover:opacity-70">
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Capacity */}
      <section className="rounded-2xl p-6 space-y-4" style={{background:'var(--surface)', border:'1px solid var(--line)'}}>
        <h2 className="font-semibold" style={{color:'var(--text)'}}>Capacity</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Total spots *">
            <input required type="number" min="1" value={totalSpots}
              onChange={(e) => setTotalSpots(e.target.value)}
              className={inputCls} style={inputStyle} placeholder="10" />
          </Field>
          <Field label="Max group size">
            <input type="number" min="1" value={maxGroupSize}
              onChange={(e) => setMaxGroupSize(e.target.value)}
              className={inputCls} style={inputStyle} placeholder="6" />
          </Field>
        </div>
        <label className="flex items-center gap-3 text-sm font-medium cursor-pointer" style={{color:'var(--muted)'}}>
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded" style={{accentColor:'var(--accent)'}} />
          Publish immediately (active)
        </label>
      </section>

      <div className="flex gap-3">
        <button type="submit" disabled={saving}
          className="rounded-lg px-5 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-50"
          style={{background:'var(--accent)', color:'var(--accent-ink)'}}>
          {saving ? "Saving…" : submitLabel}
        </button>
        <button type="button" onClick={() => router.back()}
          className="rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-surface2"
          style={{background:'var(--surface)', color:'var(--muted)', border:'1px solid var(--line2)'}}>
          Cancel
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "w-full rounded-lg px-3 py-2 text-sm placeholder:opacity-40 focus:outline-none focus:ring-1";
const inputStyle = {
  background: "var(--ph)",
  border: "1px solid var(--line2)",
  color: "var(--text)",
} as React.CSSProperties;

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <label className="block text-sm font-medium" style={{color:'var(--muted)'}}>{label}</label>
      {children}
    </div>
  );
}
