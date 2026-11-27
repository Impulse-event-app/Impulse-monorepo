"use client";

// Full-price booking: what guests can book at the venue's usual price when no
// deal is on (backend/routers/standard_offers.py). The app shows it on the
// venue's card only while the venue has no deal running; a start each hour of
// the day's opening hours, so there are no times to set here.

import React, { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, Clock, Minus, Plus, Ticket } from "lucide-react";
import { standardOfferApi, type StandardOffer, type Venue } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { btnPrimary, card, fieldInput, fieldLabel, numeric, switchKnob, switchTrack } from "@/lib/ui";

const UNITS = [
  { value: "pp", label: "per person" },
  { value: "/group", label: "per group" },
];

/** ["5:00 PM", …, "8:00 PM"] → "5pm – 8pm starts". */
function startsLabel(slots: string[]): string {
  const short = (s: string) => s.replace(":00", "").replace(" ", "").toLowerCase();
  if (!slots.length) return "";
  if (slots.length === 1) return `one start at ${short(slots[0])}`;
  return `starts every hour, ${short(slots[0])} – ${short(slots[slots.length - 1])}`;
}

interface Draft {
  title: string;
  unit: string;
  price: string;
  group: number;
  spots: number;
  active: boolean;
}

const fromOffer = (o: StandardOffer | null | undefined): Draft => ({
  title: o && !o.auto_title ? o.title : "",
  unit: o?.unit ?? "pp",
  price: o ? String(o.original_price) : "",
  group: o?.max_group_size ?? 6,
  spots: o?.total_spots ?? 20,
  active: o?.is_active ?? true,
});

export function StandardOfferCard({ venue }: { venue: Venue }) {
  const qc = useQueryClient();
  const key = ["standard-offer", venue.id];
  const { data: offer, isLoading } = useQuery({ queryKey: key, queryFn: () => standardOfferApi.get(venue.id) });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(fromOffer(null));
  const [error, setError] = useState<string | null>(null);

  const startEditing = () => { setDraft(fromOffer(offer)); setEditing(true); };

  const done = (o: StandardOffer | null) => {
    qc.setQueryData(key, o);
    qc.invalidateQueries({ queryKey: ["deals", venue.id] });
    setEditing(false);
    setError(null);
  };
  const save = useMutation({
    mutationFn: (d: Draft) => standardOfferApi.save(venue.id, {
      title: d.title.trim() || undefined, unit: d.unit, original_price: Number(d.price),
      max_group_size: d.group, total_spots: d.spots, is_active: d.active, reel_id: offer?.reel_id ?? null,
    }),
    onSuccess: done,
    onError: (e) => setError(e instanceof Error ? e.message : "Couldn't save. Try again."),
  });
  const remove = useMutation({
    mutationFn: () => standardOfferApi.remove(venue.id),
    onSuccess: () => done(null),
    onError: (e) => setError(e instanceof Error ? e.message : "Couldn't remove it. Try again."),
  });
  const toggle = useMutation({
    mutationFn: (o: StandardOffer) => standardOfferApi.save(venue.id, {
      title: o.auto_title ? undefined : o.title, description: o.description ?? undefined, unit: o.unit ?? undefined,
      original_price: o.original_price, max_group_size: o.max_group_size, total_spots: o.total_spots,
      reel_id: o.reel_id, is_active: !o.is_active,
    }),
    onSuccess: done,
  });

  const price = Number(draft.price);
  const priceOk = draft.price.trim() !== "" && Number.isFinite(price) && price > 0;
  const unitLabel = UNITS.find((u) => u.value === (editing ? draft.unit : offer?.unit))?.label ?? "per person";

  if (isLoading) return <div style={{ ...card, borderRadius: 16, height: 96, marginBottom: 30, animation: "pm-glow 1.4s ease-in-out infinite" }} />;

  return (
    <section style={{ ...card, borderRadius: 16, padding: "20px 22px", marginBottom: 30 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <span aria-hidden style={{ width: 36, height: 36, borderRadius: 10, display: "grid", placeItems: "center", background: "var(--surface3, var(--sunken))", color: "var(--muted)", flexShrink: 0 }}>
          <Ticket size={18} strokeWidth={1.9} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Full-price booking</h2>
            {offer && !editing && (
              <span style={{ ...numeric, fontSize: 11, padding: "3px 8px", borderRadius: 999, background: offer.is_active ? "var(--accent-soft)" : "var(--sunken)", color: offer.is_active ? "var(--accent)" : "var(--faint)" }}>
                {offer.is_active ? "On" : "Paused"}
              </span>
            )}
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5 }}>
            Guests can book you at your usual price on days you don&apos;t have a deal on. Your deals always show first.
          </p>

          {/* Summary */}
          {offer && !editing && (
            <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 16, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{offer.title}</div>
                <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 3 }}>
                  <span style={numeric}>{formatCurrency(offer.original_price)}</span> {unitLabel} · up to {offer.max_group_size} per booking · {offer.total_spots} spots a day
                </div>
                <Today offer={offer} />
              </div>
              <button onClick={() => toggle.mutate(offer)} disabled={toggle.isPending} aria-pressed={offer.is_active}
                title={offer.is_active ? "Pause full-price booking" : "Turn full-price booking on"} style={switchTrack(offer.is_active)}>
                <span style={switchKnob(offer.is_active)} />
              </button>
              <button onClick={startEditing} style={ghost}>Edit</button>
            </div>
          )}

          {!offer && !editing && (
            <button onClick={startEditing} style={{ ...btnPrimary, marginTop: 16, padding: "10px 16px", borderRadius: 10, fontSize: 14 }}>
              Set up full-price booking
            </button>
          )}

          {/* Form */}
          {editing && (
            <form
              onSubmit={(e) => { e.preventDefault(); if (priceOk) save.mutate(draft); }}
              style={{ marginTop: 18, display: "grid", gap: 18 }}
            >
              <label>
                <span style={fieldLabel}>What guests book</span>
                <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={120}
                  placeholder={`e.g. One lane for an hour (blank: "${venue.name} · ${priceOk ? formatCurrency(price) : "$…"}")`}
                  style={fieldInput} />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16 }}>
                <label>
                  <span style={fieldLabel}>Usual price</span>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", ...numeric }}>$</span>
                    <input inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value.replace(/[^\d.]/g, "") })}
                      placeholder="40" style={{ ...fieldInput, paddingLeft: 28, ...numeric }} aria-invalid={!priceOk} />
                  </div>
                </label>
                <div>
                  <span style={fieldLabel}>Charged</span>
                  <div role="radiogroup" aria-label="Pricing unit" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: 4, borderRadius: 11, background: "var(--sunken)" }}>
                    {UNITS.map((u) => {
                      const on = draft.unit === u.value;
                      return (
                        <button key={u.value} type="button" role="radio" aria-checked={on} onClick={() => setDraft({ ...draft, unit: u.value })}
                          style={{ height: 38, border: 0, borderRadius: 8, background: on ? "var(--surface)" : "transparent", boxShadow: on ? "0 1px 3px rgba(0,0,0,.12)" : "none", color: on ? "var(--text)" : "var(--muted)", fontSize: 14, fontWeight: on ? 600 : 400, cursor: "pointer" }}>
                          {u.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16 }}>
                <Stepper label="Most people per booking" value={draft.group} min={1} max={20} onChange={(n) => setDraft({ ...draft, group: n })} />
                <Stepper label="Spots a day" value={draft.spots} min={1} max={500} onChange={(n) => setDraft({ ...draft, spots: n })} />
              </div>

              {offer && <Today offer={offer} />}
              {!offer && (
                <div style={{ display: "flex", gap: 8, fontSize: 13, color: "var(--muted)", lineHeight: 1.45 }}>
                  <Clock size={15} strokeWidth={1.9} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
                  <span>Guests can pick a start each hour you&apos;re open, from your <Link href="/dashboard/venue" style={{ color: "var(--accent)" }}>opening hours</Link>.</span>
                </div>
              )}

              {error && <div role="alert" style={{ fontSize: 13, color: "var(--bad)" }}>{error}</div>}

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button type="submit" disabled={!priceOk || save.isPending}
                  style={{ ...btnPrimary, padding: "10px 16px", borderRadius: 10, fontSize: 14, opacity: priceOk ? 1 : 0.5, cursor: priceOk ? "pointer" : "not-allowed", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Check size={15} strokeWidth={2.2} aria-hidden /> {save.isPending ? "Saving…" : offer ? "Save changes" : "Turn on"}
                </button>
                <button type="button" onClick={() => { setEditing(false); setError(null); }} style={ghost}>Cancel</button>
                {offer && (
                  <button type="button" disabled={remove.isPending}
                    onClick={() => { if (confirm("Stop full-price booking? Bookings already made stay.")) remove.mutate(); }}
                    style={{ ...ghost, marginLeft: "auto", color: "var(--bad)" }}>
                    Remove
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

/** Today's starts, or why there are none. */
function Today({ offer }: { offer: StandardOffer }) {
  let tone: "ok" | "warn" = "ok";
  let text: React.ReactNode;
  if (!offer.payments_ready) {
    tone = "warn";
    text = <>Guests can&apos;t book until <Link href="/dashboard/payments-setup" style={{ color: "inherit", textDecoration: "underline" }}>payments are set up</Link>.</>;
  } else if (!offer.hours_set) {
    tone = "warn";
    text = <>Add your <Link href="/dashboard/venue" style={{ color: "inherit", textDecoration: "underline" }}>opening hours</Link> so guests can pick a time.</>;
  } else if (!offer.slots_today.length) {
    text = "Closed today, so nothing to book.";
  } else {
    text = `Today: ${startsLabel(offer.slots_today)}, from your opening hours.`;
  }
  const Icon = tone === "warn" ? AlertCircle : Clock;
  return (
    <div style={{ display: "flex", gap: 7, marginTop: 8, fontSize: 12.5, lineHeight: 1.45, color: tone === "warn" ? "var(--bad)" : "var(--faint)" }}>
      <Icon size={14} strokeWidth={1.9} style={{ flexShrink: 0, marginTop: 1.5 }} aria-hidden />
      <span>{text}</span>
    </div>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  const set = (n: number) => onChange(Math.min(max, Math.max(min, Number.isFinite(n) ? n : min)));
  const btn: React.CSSProperties = { width: 38, height: 38, borderRadius: 9, border: 0, background: "var(--surface)", color: "var(--text)", display: "grid", placeItems: "center", cursor: "pointer" };
  return (
    <div>
      <span style={fieldLabel}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: 4, borderRadius: 11, background: "var(--sunken)" }}>
        <button type="button" aria-label={`Fewer: ${label}`} onClick={() => set(value - 1)} disabled={value <= min} style={{ ...btn, opacity: value <= min ? 0.4 : 1 }}>
          <Minus size={15} aria-hidden />
        </button>
        <input aria-label={label} inputMode="numeric" value={value} onChange={(e) => set(parseInt(e.target.value.replace(/\D/g, ""), 10))}
          style={{ ...numeric, flex: 1, minWidth: 0, border: 0, background: "transparent", textAlign: "center", fontSize: 15, fontWeight: 600, color: "var(--text)", outline: "none" }} />
        <button type="button" aria-label={`More: ${label}`} onClick={() => set(value + 1)} disabled={value >= max} style={{ ...btn, opacity: value >= max ? 0.4 : 1 }}>
          <Plus size={15} aria-hidden />
        </button>
      </div>
    </div>
  );
}

const ghost: React.CSSProperties = {
  padding: "9px 14px", borderRadius: 10, border: 0, background: "var(--sunken)", color: "var(--text)", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
};
