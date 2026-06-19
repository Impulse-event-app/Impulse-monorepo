// app-filters.jsx — Impulse filters bottom-sheet
const { useT, CATEGORIES, AREAS, DEFAULT_FILTERS, applyFilters, money } = window;
const { FONT_UI, FONT_DISPLAY, FONT_MONO, Btn } = window;

const ACTS = CATEGORIES.filter((c) => c !== "All");

// ── a small labelled section ─────────────────────────────────
function FRow({ label, hint, children }) {
  const T = useT();
  return (
    <div style={{ padding: "20px 22px", borderBottom: `1px solid ${T.line}` }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
        <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 16.5, color: T.text }}>{label}</span>
        {hint && <span style={{ fontFamily: FONT_UI, fontSize: 13.5, color: T.faint }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

// pill toggle used for multi-selects + segmented choices
function FPill({ children, on, onClick, dot }) {
  const T = useT();
  return (
    <button onClick={onClick} style={{
      height: 40, padding: "0 16px", borderRadius: 12, cursor: "pointer", border: "none",
      fontFamily: FONT_UI, fontWeight: 500, fontSize: 14.5, letterSpacing: "-0.01em", whiteSpace: "nowrap",
      background: on ? T.accent : T.chipBg, color: on ? T.accentInk : T.text,
      display: "inline-flex", alignItems: "center", gap: 8, transition: "background .14s, color .14s",
    }}>
      {dot && <span style={{ width: 7, height: 7, borderRadius: "50%", background: on ? T.accentInk : T.faint }} />}
      {children}
    </button>
  );
}

// segmented control (When)
function Segmented({ value, options, onChange }) {
  const T = useT();
  return (
    <div style={{ display: "flex", background: T.chipBg, borderRadius: 13, padding: 4, gap: 4 }}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button key={o.id} onClick={() => onChange(o.id)} style={{
            flex: 1, height: 40, borderRadius: 10, border: "none", cursor: "pointer",
            fontFamily: FONT_UI, fontWeight: on ? 600 : 500, fontSize: 14.5,
            background: on ? T.surface : "transparent", color: on ? T.text : T.muted,
            boxShadow: on ? T.shadow : "none", transition: "background .14s, color .14s",
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

// party-size stepper, compact inline
function PartyInline({ value, onChange }) {
  const T = useT();
  const btn = (label, fn, dis) => (
    <button onClick={fn} disabled={dis} style={{
      width: 40, height: 40, borderRadius: 11, border: `1.5px solid ${T.line2}`, background: "transparent",
      color: dis ? T.faint : T.text, fontSize: 22, cursor: dis ? "default" : "pointer",
      display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, opacity: dis ? 0.45 : 1,
    }}>{label}</button>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontFamily: FONT_UI, fontSize: 15, color: T.muted }}>{value === 1 ? "Just me" : `${value} people`}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {btn("−", () => onChange(Math.max(1, value - 1)), value <= 1)}
        <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 20, color: T.text, minWidth: 20, textAlign: "center" }}>{value}</span>
        {btn("+", () => onChange(Math.min(10, value + 1)), value >= 10)}
      </div>
    </div>
  );
}

// price ceiling slider (native range, themed)
function PriceSlider({ value, onChange }) {
  const T = useT();
  const max = 40;
  const fillPct = ((value - 10) / (max - 10)) * 100;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <span style={{ fontFamily: FONT_UI, fontSize: 15, color: T.muted }}>Up to</span>
        <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 20, color: T.text }}>
          {value >= max ? "Any price" : `${money(value)}`}
        </span>
      </div>
      <input type="range" min={10} max={max} step={1} value={value}
        onChange={(e) => onChange(+e.target.value)}
        style={{
          width: "100%", height: 6, borderRadius: 6, appearance: "none", WebkitAppearance: "none", cursor: "pointer",
          background: `linear-gradient(to right, ${T.accent} ${fillPct}%, ${T.chipBg} ${fillPct}%)`,
          outline: "none",
        }} />
    </div>
  );
}

const SORTS = [
  { id: "closest", label: "Closest" },
  { id: "price", label: "Lowest price" },
  { id: "rating", label: "Top rated" },
];

// ── the sheet ────────────────────────────────────────────────
function FiltersSheet({ initial, onApply, onClose }) {
  const T = useT();
  const [f, setF] = React.useState(initial);
  const set = (patch) => setF((p) => ({ ...p, ...patch }));
  const toggle = (key, val) => setF((p) => ({ ...p, [key]: p[key].includes(val) ? p[key].filter((x) => x !== val) : [...p[key], val] }));

  const count = applyFilters(window.DROPS, f).length;
  const isDefault = JSON.stringify(f) === JSON.stringify(DEFAULT_FILTERS);

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 60, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      {/* scrim */}
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", animation: "imp-fade .2s ease" }} />

      {/* sheet body */}
      <div style={{
        position: "relative", background: T.bg, borderRadius: "26px 26px 0 0", maxHeight: "86%",
        display: "flex", flexDirection: "column", animation: "imp-rise .3s cubic-bezier(.2,.8,.2,1)",
        boxShadow: "0 -18px 50px rgba(0,0,0,0.4)",
      }}>
        {/* grabber + header */}
        <div style={{ flex: "0 0 auto" }}>
          <div style={{ width: 38, height: 5, borderRadius: 3, background: T.line2, margin: "10px auto 0" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 22px 14px" }}>
            <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 22, color: T.text, letterSpacing: "-0.02em" }}>Filters</span>
            <button onClick={() => setF(DEFAULT_FILTERS)} disabled={isDefault} style={{
              background: "none", border: "none", cursor: isDefault ? "default" : "pointer",
              fontFamily: FONT_UI, fontWeight: 500, fontSize: 15, color: isDefault ? T.faint : T.accent, opacity: isDefault ? 0.5 : 1, padding: 0,
            }}>Clear all</button>
          </div>
        </div>

        {/* scroll area */}
        <div style={{ overflowY: "auto", flex: 1, borderTop: `1px solid ${T.line}` }}>
          <FRow label="What" hint={f.cats.length ? `${f.cats.length} selected` : "Anything"}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
              {ACTS.map((a) => <FPill key={a} dot on={f.cats.includes(a)} onClick={() => toggle("cats", a)}>{a}</FPill>)}
            </div>
          </FRow>

          <FRow label="When">
            <Segmented value={f.when} onChange={(v) => set({ when: v })}
              options={[{ id: "all", label: "Anytime" }, { id: "now", label: "On now" }, { id: "later", label: "Later tonight" }]} />
          </FRow>

          <FRow label="Where" hint={f.areas.length ? `${f.areas.length} areas` : "All of Sydney"}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
              {AREAS.map((s) => <FPill key={s} on={f.areas.includes(s)} onClick={() => toggle("areas", s)}>{s}</FPill>)}
            </div>
          </FRow>

          <FRow label="Party size">
            <PartyInline value={f.party} onChange={(v) => set({ party: v })} />
          </FRow>

          <FRow label="Price">
            <PriceSlider value={f.maxPrice} onChange={(v) => set({ maxPrice: v })} />
          </FRow>

          <FRow label="Sort by">
            <div style={{ display: "flex", gap: 9 }}>
              {SORTS.map((s) => <FPill key={s.id} on={f.sort === s.id} onClick={() => set({ sort: s.id })}>{s.label}</FPill>)}
            </div>
          </FRow>
        </div>

        {/* sticky apply */}
        <div style={{ flex: "0 0 auto", padding: "14px 22px 30px", borderTop: `0.5px solid ${T.line}`, background: T.bg }}>
          <Btn full onClick={() => onApply(f)} disabled={count === 0}>
            {count === 0 ? "No drops match" : `Show ${count} ${count === 1 ? "drop" : "drops"}`}
          </Btn>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { FiltersSheet });
