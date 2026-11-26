"use client";

// Early-bird pricing: the first bookings in each time slot get the deal's
// discount, later ones a smaller one (backend/price_drops.py). Shared by the
// new-deal composer and the edit form. Each slot counts its own bookings, and
// a booking counts once whatever its group size.
//
// The backend stores steps as cumulative counts ({after: 10} = from the 11th
// booking). Venues think in group sizes ("the next 5"), so the editor works in
// tiers: every tier but the last has a size; the last runs to the end.

import React from "react";
import { Plus, X } from "lucide-react";
import type { PriceDrop } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { numeric, switchKnob, switchTrack } from "@/lib/ui";

export const MAX_PRICE_DROPS = 5;

/** A run of bookings at one discount. size is null for the last tier. */
interface Tier {
  size: number | null;
  pct: number;
}

function toTiers(opening: number, drops: PriceDrop[]): Tier[] {
  const tiers: Tier[] = [{ size: null, pct: opening }];
  let counted = 0;
  for (const d of drops) {
    tiers[tiers.length - 1].size = d.after - counted;
    counted = d.after;
    tiers.push({ size: null, pct: d.discount_pct });
  }
  return tiers;
}

function toDrops(tiers: Tier[]): PriceDrop[] {
  const drops: PriceDrop[] = [];
  let counted = 0;
  for (let i = 1; i < tiers.length; i++) {
    counted += tiers[i - 1].size ?? NaN;
    drops.push({ after: counted, discount_pct: tiers[i].pct });
  }
  return drops;
}

/** The same rules the backend applies, worded for the venue. capacity is the
 *  deal's total spots (null: unlimited): every group has to start inside it. */
export function priceDropsProblem(opening: number, drops: PriceDrop[], capacity: number | null = null): string | null {
  const tiers = toTiers(opening, drops);
  for (let i = 0; i < tiers.length - 1; i++) {
    const size = tiers[i].size;
    if (size === null || !Number.isInteger(size) || size < 1) return "Each early-bird group needs at least 1 booking.";
  }
  for (let i = 1; i < tiers.length; i++) {
    if (!Number.isFinite(tiers[i].pct)) return "Set a discount for every group.";
    if (tiers[i].pct >= tiers[i - 1].pct) return "Each group should get less off than the one before it.";
  }
  const sized = drops.length ? drops[drops.length - 1].after : 0;
  if (capacity !== null && drops.length && sized >= capacity) {
    return `These groups add up to ${sized} bookings, but the deal has ${capacity} spot${capacity === 1 ? "" : "s"}. Make the groups smaller or add spots.`;
  }
  return null;
}

/** "50% → 40% → 30%": a deal's early-bird ladder, for lists. */
export function priceDropsLadder(opening: number, drops: PriceDrop[] | null | undefined): string | null {
  if (!drops?.length) return null;
  return [opening, ...drops.map((d) => d.discount_pct)].map((p) => `${p}%`).join(" → ");
}

interface Props {
  /** The deal's discount: what the first bookings get. */
  opening: number;
  drops: PriceDrop[];
  onChange: (drops: PriceDrop[]) => void;
  /** The usual price, to show what each group pays. */
  usual: number | null;
  /** Total spots, null when unlimited: the groups have to fit inside it. */
  capacity: number | null;
}

export function PriceDropsEditor({ opening, drops, onChange, usual, capacity }: Props) {
  const on = drops.length > 0;
  const tiers = toTiers(opening, drops);
  const last = tiers.length - 1;
  const problem = on ? priceDropsProblem(opening, drops, capacity) : null;
  // Spots the sized groups leave for the last one; null with unlimited spots.
  const sized = drops.length ? drops[drops.length - 1].after : 0;
  const remaining = capacity === null ? null : capacity - (Number.isFinite(sized) ? sized : 0);
  // A new step takes up to 5 from the last group and still leaves it at least 1.
  const room = remaining === null ? 5 : Math.min(5, remaining - 1);
  const canStart = capacity === null || capacity >= 2;

  const update = (next: Tier[]) => onChange(toDrops(next));
  const setTier = (i: number, patch: Partial<Tier>) => update(tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const lower = (pct: number) => Math.max(0, Math.round(pct - 10));
  const addGroup = () =>
    // The old last group gets a size; a new, smaller discount runs after it.
    update([...tiers.slice(0, last), { ...tiers[last], size: room }, { size: null, pct: lower(tiers[last].pct) }]);
  const removeGroup = (i: number) => {
    if (tiers.length <= 2) return onChange([]);
    const next = tiers.filter((_, j) => j !== i);
    next[next.length - 1] = { ...next[next.length - 1], size: null };
    update(next);
  };
  const price = (pct: number) =>
    usual !== null && usual > 0 && Number.isFinite(pct) ? formatCurrency(usual * (1 - pct / 100)) : null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Early-bird pricing</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 3, lineHeight: 1.45 }}>
            The first bookings in each time slot get your best discount. Later ones get a little less.
          </div>
        </div>
        <button
          type="button"
          aria-pressed={on}
          aria-label="Early-bird pricing"
          disabled={!on && !canStart}
          title={!on && !canStart ? "Needs at least 2 spots" : undefined}
          onClick={() => onChange(on ? [] : toDrops([{ size: capacity === null ? 5 : Math.min(5, capacity - 1), pct: opening }, { size: null, pct: lower(opening) }]))}
          style={{ ...switchTrack(on), opacity: !on && !canStart ? 0.4 : 1, cursor: !on && !canStart ? "not-allowed" : "pointer" }}
        >
          <span style={switchKnob(on)} />
        </button>
      </div>

      {on && (
        <div style={{ marginTop: 18 }}>
          <div style={{ borderRadius: 12, background: "var(--sunken)", padding: "6px 0" }}>
          {tiers.map((t, i) => {
            const first = i === 0;
            const fade = 1 - (i / Math.max(1, last)) * 0.6;
            return (
              <div
                key={i}
                style={{
                  display: "grid", gridTemplateColumns: "14px minmax(0, 1fr) auto 68px 28px", alignItems: "center", columnGap: 14,
                  minHeight: 54, padding: "4px 10px 4px 18px",
                }}
              >
                {/* The rail: a dot per step, joined by a line, fading as the discount drops. */}
                <span aria-hidden style={{ position: "relative", alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {!first && <span style={{ position: "absolute", left: 6, top: -4, height: "calc(50% + 4px)", width: 2, background: "var(--line2)" }} />}
                  {i !== last && <span style={{ position: "absolute", left: 6, bottom: -4, height: "calc(50% + 4px)", width: 2, background: "var(--line2)" }} />}
                  <span style={{
                    position: "relative", width: 12, height: 12, borderRadius: 999,
                    background: first ? "var(--accent)" : "var(--surface)",
                    border: first ? "none" : "2px solid var(--accent)", opacity: fade,
                    boxShadow: first ? "0 0 0 4px var(--accent-soft)" : "none",
                  }} />
                </span>

                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 14.5, color: first ? "var(--text)" : "var(--muted)" }}>
                  {i === last ? (
                    <>
                      Everyone after that
                      {remaining !== null && remaining > 0 && (
                        <span style={{ fontSize: 13, color: "var(--faint)" }}>· last {remaining} spot{remaining === 1 ? "" : "s"}</span>
                      )}
                    </>
                  ) : (
                    <>
                      {first ? "First" : "Next"}
                      <NumberField label={`${first ? "First" : "Next"} how many bookings`} value={t.size ?? NaN} maxLength={3}
                        onChange={(n) => setTier(i, { size: n })} />
                      {t.size === 1 ? "booking" : "bookings"}
                    </>
                  )}
                </span>

                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14.5 }}>
                  {first ? (
                    <span title="Set by the discount above" style={{ ...numeric, fontWeight: 700, fontSize: 15, color: "var(--accent-text, var(--accent))", padding: "0 10px" }}>{opening}%</span>
                  ) : (
                    <NumberField label="Discount percent" value={t.pct} maxLength={2} suffix="%" onChange={(n) => setTier(i, { pct: n })} />
                  )}
                  <span style={{ color: "var(--muted)" }}>off</span>
                </span>

                <span style={{ ...numeric, fontSize: 14.5, fontWeight: first ? 600 : 400, textAlign: "right", color: first ? "var(--text)" : "var(--muted)" }}>
                  {price(t.pct) ?? ""}
                </span>

                {first ? (
                  <span />
                ) : (
                  <button type="button" onClick={() => removeGroup(i)} aria-label="Remove this step"
                    style={{ width: 28, height: 28, borderRadius: 8, display: "grid", placeItems: "center", border: "none", background: "transparent", color: "var(--faint)", cursor: "pointer" }}>
                    <X size={15} strokeWidth={2} aria-hidden />
                  </button>
                )}
              </div>
            );
          })}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginTop: 12 }}>
            <span role={problem ? "alert" : undefined} style={{ fontSize: 13, lineHeight: 1.45, color: problem ? "var(--bad)" : "var(--faint)" }}>
              {problem ?? `Each time slot counts its own bookings, and a group counts as one.${capacity !== null ? ` Groups share the deal's ${capacity} spots.` : ""}`}
            </span>
            {drops.length < MAX_PRICE_DROPS && (
              <button type="button" onClick={addGroup} disabled={room < 1}
                title={room < 1 ? "No spots left for another step. Add spots first." : undefined}
                style={{
                  flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 9,
                  border: 0, background: "var(--sunken)", color: "var(--text)", fontSize: 13, fontWeight: 600,
                  cursor: room < 1 ? "not-allowed" : "pointer", opacity: room < 1 ? 0.45 : 1,
                }}>
                <Plus size={14} strokeWidth={2.2} aria-hidden /> Add a step
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NumberField({ label, value, maxLength, suffix, onChange }: {
  label: string;
  value: number;
  maxLength: number;
  suffix?: string;
  onChange: (n: number) => void;
}) {
  return (
    <label
      style={{
        position: "relative", display: "inline-flex", alignItems: "center", gap: 1, height: 34, padding: "0 10px", borderRadius: 8,
        background: "var(--surface2)",
      }}
    >
      <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{label}</span>
      <input
        inputMode="numeric"
        value={Number.isFinite(value) ? String(value) : ""}
        onChange={(e) => onChange(parseInt(e.target.value.replace(/\D/g, "").slice(0, maxLength), 10))}
        style={{
          ...numeric, width: `${maxLength === 2 ? 2.2 : 3}ch`, border: 0, padding: 0, background: "transparent",
          color: "var(--text)", fontSize: 15, fontWeight: 600, textAlign: "center", outline: "none",
        }}
      />
      {suffix && <span style={{ ...numeric, color: "var(--muted)", fontSize: 14 }}>{suffix}</span>}
    </label>
  );
}
