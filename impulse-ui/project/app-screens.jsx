// app-screens.jsx — Impulse app screens
const { useT, DROPS, CATEGORIES, money, pct, fmtCountdown, useCountdown, applyFilters, activeFilterCount } = window;
const { FONT_UI, FONT_DISPLAY, FONT_MONO, Logo, PulseMark, Btn, Chip, Placeholder,
  PriceBlock, MetaLine, RatingDot, CountdownPill, DropCardEditorial, DropCardCompact,
  Stepper, FauxQR, Pin } = window;

const TOP = 54; // status-bar clearance
const BOTTOM = 104; // tab-bar clearance

function Avatar({ size = 36 }) {
  const T = useT();
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: T.surface2, border: `1px solid ${T.line}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 14, color: T.text }}>JL</div>
  );
}

function LocPill() {
  const T = useT();
  return (
    <button style={{ display: "inline-flex", alignItems: "center", gap: 6, background: T.chipBg, border: "none", borderRadius: 999, padding: "7px 13px", cursor: "pointer", fontFamily: FONT_UI, fontWeight: 500, fontSize: 14, color: T.text }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2.4"><path d="M12 21c4.5-4.2 7-7.6 7-11a7 7 0 10-14 0c0 3.4 2.5 6.8 7 11z" /><circle cx="12" cy="10" r="2.4" fill={T.accent} stroke="none" /></svg>
      Sydney · CBD
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke={T.muted} strokeWidth="1.8" strokeLinecap="round"><path d="M2 4l4 4 4-4" /></svg>
    </button>
  );
}

function SectionHead({ title, count }) {
  const T = useT();
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 9, margin: "26px 4px 13px" }}>
      <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 19, color: T.text, letterSpacing: "-0.02em" }}>{title}</span>
      <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: T.faint }}>{count}</span>
    </div>
  );
}

// quick-filter button with active-count badge
function FilterButton({ count, onClick }) {
  const T = useT();
  return (
    <button onClick={onClick} style={{
      position: "relative", flex: "0 0 auto", height: 36, padding: "0 15px 0 13px", borderRadius: 999, cursor: "pointer",
      border: "none", background: count ? T.accent : T.chipBg, color: count ? T.accentInk : T.text,
      fontFamily: FONT_UI, fontWeight: 600, fontSize: 14.5, letterSpacing: "-0.01em",
      display: "inline-flex", alignItems: "center", gap: 7, transition: "background .14s, color .14s",
    }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 5h18M6 12h12M10 19h4" /></svg>
      Filters{count ? ` · ${count}` : ""}
    </button>
  );
}

// ── Tonight feed ─────────────────────────────────────────────
function TonightScreen({ layout, filters, onSetFilters, onOpenFilters, onOpen }) {
  const T = useT();
  const quickCat = (c) => {
    if (c === "All") onSetFilters({ ...filters, cats: [] });
    else onSetFilters({ ...filters, cats: filters.cats.includes(c) && filters.cats.length === 1 ? [] : [c] });
  };
  const isChipOn = (c) => c === "All" ? filters.cats.length === 0 : filters.cats.includes(c);
  const filtered = applyFilters(DROPS, filters);
  const now = filtered.filter((d) => d.status === "now");
  const later = filtered.filter((d) => d.status === "later");
  const activeCount = activeFilterCount(filters);
  const Card = layout === "compact" ? DropCardCompact : DropCardEditorial;
  const gap = layout === "compact" ? 11 : 16;

  const Section = ({ title, list }) =>
    list.length ? (
      <>
        <SectionHead title={title} count={`${list.length} ${list.length === 1 ? "drop" : "drops"}`} />
        <div style={{ display: "flex", flexDirection: "column", gap }}>
          {list.map((d) => <Card key={d.id} d={d} onClick={() => onOpen(d.id)} />)}
        </div>
      </>
    ) : null;

  return (
    <div style={{ height: "100%", overflowY: "auto", background: T.bg }}>
      <div style={{ paddingTop: TOP }}>
        <div style={{ padding: "0 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <PulseMark size={28} radius={8} />
            <Logo size={20} />
          </div>
          <Avatar />
        </div>
        <div style={{ padding: "0 18px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 18 }}>
          <h1 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 33, color: T.text, letterSpacing: "-0.03em" }}>What's on?</h1>
          <LocPill />
        </div>
      </div>

      {/* filter rail */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "16px 18px 4px", scrollbarWidth: "none" }}>
        <FilterButton count={activeCount} onClick={onOpenFilters} />
        <div style={{ width: 1, flex: "0 0 1px", background: T.line, margin: "6px 2px" }} />
        {CATEGORIES.map((c) => <Chip key={c} active={isChipOn(c)} onClick={() => quickCat(c)}>{c}</Chip>)}
      </div>

      <div style={{ padding: `0 18px ${BOTTOM}px` }}>
        <Section title="On now" list={now} />
        <Section title="Later tonight" list={later} />
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", marginTop: 64, padding: "0 40px" }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 19, color: T.text, letterSpacing: "-0.02em" }}>Nothing matches yet</div>
            <div style={{ fontFamily: FONT_UI, fontSize: 14.5, color: T.muted, marginTop: 6, lineHeight: 1.45 }}>Try widening your filters — drop a suburb or nudge the price up.</div>
            <button onClick={() => onSetFilters(window.DEFAULT_FILTERS)} style={{ marginTop: 16, background: "none", border: "none", cursor: "pointer", fontFamily: FONT_UI, fontWeight: 600, fontSize: 15, color: T.accent }}>Clear filters</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Map ──────────────────────────────────────────────────────
const PIN_POS = { pins: [38, 30], lockup: [70, 22], sidepocket: [22, 58], puttlane: [55, 44], echoroom: [48, 64], frontroom: [78, 52], frequency: [30, 78], bullseye: [62, 70] };

function MapScreen({ filters, onOpenFilters, onOpen }) {
  const T = useT();
  const [sel, setSel] = React.useState(null);
  const selDrop = DROPS.find((d) => d.id === sel);
  const matchIds = new Set(applyFilters(DROPS, filters).map((d) => d.id));
  const activeCount = activeFilterCount(filters);
  return (
    <div style={{ height: "100%", position: "relative", overflow: "hidden", background: T.mapBg }}>
      {/* faux map: grid + blocks */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: `linear-gradient(${T.mapLine} 1px, transparent 1px), linear-gradient(90deg, ${T.mapLine} 1px, transparent 1px)`, backgroundSize: "46px 46px" }} />
      <div style={{ position: "absolute", left: "8%", top: "12%", width: "34%", height: "22%", background: T.mapBlock, borderRadius: 8 }} />
      <div style={{ position: "absolute", left: "58%", top: "30%", width: "30%", height: "30%", background: T.mapBlock, borderRadius: 8 }} />
      <div style={{ position: "absolute", left: "15%", top: "62%", width: "40%", height: "26%", background: T.mapBlock, borderRadius: 8 }} />
      {/* a couple of "roads" */}
      <div style={{ position: "absolute", left: 0, right: 0, top: "47%", height: 6, background: T.mapLine }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, left: "46%", width: 6, background: T.mapLine }} />
      <span style={{ position: "absolute", right: 12, bottom: BOTTOM + 4, fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: T.phText }}>map placeholder</span>

      {/* pins */}
      {DROPS.map((d) => {
        const [x, y] = PIN_POS[d.id] || [50, 50];
        const match = matchIds.has(d.id);
        return (
          <div key={d.id} style={{ position: "absolute", left: `${x}%`, top: `${y}%`, transform: "translate(-50%,-100%)", zIndex: sel === d.id ? 5 : match ? 2 : 1, opacity: match ? 1 : 0.32, filter: match ? "none" : "grayscale(1)", transition: "opacity .2s, filter .2s", pointerEvents: match ? "auto" : "none" }}>
            <Pin active={sel === d.id} label={money(d.now)} onClick={() => setSel(d.id)} />
          </div>
        );
      })}

      {/* top search + filter row */}
      <div style={{ position: "absolute", top: TOP, left: 18, right: 18, zIndex: 8, display: "flex", gap: 9 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 9, background: T.surface, borderRadius: 14, padding: "12px 15px", boxShadow: T.shadow }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" strokeLinecap="round" /></svg>
          <span style={{ fontFamily: FONT_UI, fontSize: 15, color: T.muted }}>Search Sydney</span>
        </div>
        <button onClick={onOpenFilters} style={{
          flex: "0 0 auto", width: 48, borderRadius: 14, cursor: "pointer", border: "none", position: "relative",
          background: activeCount ? T.accent : T.surface, color: activeCount ? T.accentInk : T.text, boxShadow: T.shadow,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 5h18M6 12h12M10 19h4" /></svg>
        </button>
      </div>

      {/* selected mini card */}
      {selDrop && (
        <div style={{ position: "absolute", left: 14, right: 14, bottom: BOTTOM, zIndex: 9, animation: "imp-pop .22s cubic-bezier(.2,.8,.2,1)" }}>
          <DropCardCompact d={selDrop} onClick={() => onOpen(selDrop.id)} />
        </div>
      )}
    </div>
  );
}

// ── My Plans ─────────────────────────────────────────────────
function PlansScreen({ plans, onTonight, onOpenPlan }) {
  const T = useT();
  return (
    <div style={{ height: "100%", overflowY: "auto", background: T.bg }}>
      <div style={{ paddingTop: TOP, padding: `${TOP}px 18px 0` }}>
        <h1 style={{ margin: "0 0 4px", fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 33, color: T.text, letterSpacing: "-0.03em" }}>Plans</h1>
      </div>
      {plans.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "62%", textAlign: "center", padding: "0 40px", gap: 14 }}>
          <div style={{ opacity: 0.5 }}><PulseMark size={56} radius={15} /></div>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 21, color: T.text, letterSpacing: "-0.02em" }}>No plans yet</div>
          <div style={{ fontFamily: FONT_UI, fontSize: 15, color: T.muted, lineHeight: 1.45 }}>When you claim a slot it shows up here, code and all.</div>
          <div style={{ marginTop: 8 }}><Btn onClick={onTonight}>Find something tonight</Btn></div>
        </div>
      ) : (
        <div style={{ padding: `18px 18px ${BOTTOM}px`, display: "flex", flexDirection: "column", gap: 13 }}>
          {plans.map((p) => (
            <div key={p.code} onClick={() => onOpenPlan(p)} style={{ background: T.surface, borderRadius: 18, padding: 16, boxShadow: T.shadow, cursor: "pointer", display: "flex", gap: 14, alignItems: "center" }}>
              <div style={{ flex: "0 0 auto" }}><FauxQR code={p.code} size={72} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 16.5, color: T.text, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0 }}>{p.venue}</div>
                  <span style={{ flex: "0 0 auto", fontFamily: FONT_UI, fontWeight: 600, fontSize: 11.5, color: T.accent, background: T.accentSoft, padding: "4px 9px", borderRadius: 999 }}>Claimed</span>
                </div>
                <div style={{ fontFamily: FONT_UI, fontSize: 13.5, color: T.muted, marginTop: 3 }}>{p.cat} · {p.party} {p.party === 1 ? "person" : "people"}</div>
                <div style={{ fontFamily: FONT_MONO, fontSize: 13, color: T.text, marginTop: 8, letterSpacing: "0.04em" }}>{p.code}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── back / close header for pushed screens ───────────────────
function PushHead({ onBack, dark, floating }) {
  const T = useT();
  const bg = floating ? "rgba(15,14,13,0.5)" : T.chipBg;
  const ink = floating ? "#fff" : T.text;
  return (
    <button onClick={onBack} style={{ position: "absolute", top: TOP, left: 16, zIndex: 10, width: 40, height: 40, borderRadius: 999, border: "none", cursor: "pointer", background: bg, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width="11" height="18" viewBox="0 0 12 20" fill="none"><path d="M10 2L2 10l8 8" stroke={ink} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
  );
}

// ── Drop detail ──────────────────────────────────────────────
function DetailScreen({ d, onBack, onClaim }) {
  const T = useT();
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 40, background: T.bg, display: "flex", flexDirection: "column", animation: "imp-slide .26s cubic-bezier(.2,.8,.2,1)" }}>
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ position: "relative" }}>
          <Placeholder label={d.cat + " · venue photo"} style={{ height: 300 }} />
          <PushHead onBack={onBack} floating />
          <div style={{ position: "absolute", top: TOP, right: 16, display: "flex", gap: 7 }}>
            {d.target && <span><CountdownPill d={d} /></span>}
          </div>
        </div>
        <div style={{ padding: "20px 20px 140px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <h1 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 28, color: T.text, letterSpacing: "-0.03em" }}>{d.venue}</h1>
              <MetaLine d={d} style={{ marginTop: 5, fontSize: 14.5 }} />
            </div>
            <RatingDot d={d} />
          </div>

          <div style={{ marginTop: 20, padding: "16px 18px", background: T.surface, borderRadius: 18, boxShadow: T.shadow }}>
            <PriceBlock d={d} big />
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.line}`, fontFamily: FONT_UI, fontSize: 14, color: T.muted, display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: d.status === "now" ? T.accent : T.faint }} />
              {d.window}
            </div>
          </div>

          <p style={{ marginTop: 22, fontFamily: FONT_UI, fontSize: 16, lineHeight: 1.55, color: T.text }}>{d.blurb}</p>

          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 1, background: T.line, borderRadius: 16, overflow: "hidden" }}>
            {[["What you get", d.gets], ["Where", d.addr]].map(([k, v]) => (
              <div key={k} style={{ background: T.surface, padding: "14px 16px", display: "flex", justifyContent: "space-between", gap: 16 }}>
                <span style={{ fontFamily: FONT_UI, fontSize: 14, color: T.muted, flex: "0 0 auto" }}>{k}</span>
                <span style={{ fontFamily: FONT_UI, fontSize: 14.5, color: T.text, textAlign: "right" }}>{v}</span>
              </div>
            ))}
          </div>

          <Placeholder label="map" style={{ height: 120, borderRadius: 16, marginTop: 14 }} />
        </div>
      </div>

      {/* sticky claim bar */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "14px 20px 30px", background: T.bg, borderTop: `0.5px solid ${T.line}`, display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ flex: "0 0 auto" }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 22, color: T.text }}>{money(d.now)}<span style={{ fontSize: 12, color: T.muted, fontWeight: 500 }}>{d.unit}</span></div>
          <div style={{ fontFamily: FONT_UI, fontSize: 12, color: T.faint, textDecoration: "line-through" }}>usually {money(d.usual)}</div>
        </div>
        <Btn full onClick={() => onClaim(d)} style={{ flex: 1 }}>Claim slot</Btn>
      </div>
    </div>
  );
}

// ── Claim (party size + time) ────────────────────────────────
function ClaimScreen({ d, onBack, onConfirm }) {
  const T = useT();
  const [party, setParty] = React.useState(2);
  const times = d.status === "now"
    ? ["Now", "7:30pm", "8:30pm"]
    : ["7:00pm", "8:00pm", "9:00pm"];
  const [time, setTime] = React.useState(times[0]);
  const perPerson = d.unit === "pp";
  const total = perPerson ? d.now * party : d.now;
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 45, background: T.bg, display: "flex", flexDirection: "column", animation: "imp-slide .26s cubic-bezier(.2,.8,.2,1)" }}>
      <PushHead onBack={onBack} />
      <div style={{ flex: 1, overflowY: "auto", padding: `${TOP + 52}px 22px 140px` }}>
        <h1 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 28, color: T.text, letterSpacing: "-0.03em" }}>Claim your slot</h1>
        <div style={{ fontFamily: FONT_UI, fontSize: 15, color: T.muted, marginTop: 6 }}>{d.venue} · {d.suburb}</div>

        <div style={{ marginTop: 30 }}>
          <div style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 17, color: T.text }}>How many?</div>
          <div style={{ fontFamily: FONT_UI, fontSize: 13.5, color: T.faint, marginTop: 2, marginBottom: 16 }}>{d.gets}</div>
          <Stepper value={party} onChange={setParty} />
        </div>

        <div style={{ marginTop: 34 }}>
          <div style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 17, color: T.text, marginBottom: 14 }}>Pick a time</div>
          <div style={{ display: "flex", gap: 9 }}>
            {times.map((t) => <Chip key={t} active={time === t} onClick={() => setTime(t)}>{t}</Chip>)}
          </div>
        </div>

        <div style={{ marginTop: 36, padding: "16px 18px", background: T.surface, borderRadius: 18, boxShadow: T.shadow }}>
          {[["Tonight's price", `${money(d.now)}${d.unit}`], [perPerson ? `${party} × people` : "Slot", perPerson ? `× ${party}` : "1"]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, whiteSpace: "nowrap", fontFamily: FONT_UI, fontSize: 14.5, color: T.muted, marginBottom: 10 }}>
              <span>{k}</span><span style={{ color: T.text }}>{v}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingTop: 12, borderTop: `1px solid ${T.line}` }}>
            <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 16, color: T.text }}>Total</span>
            <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 26, color: T.text }}>{money(total)}</span>
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "14px 22px 30px", background: T.bg, borderTop: `0.5px solid ${T.line}` }}>
        <Btn full onClick={() => onConfirm({ d, party, time, total })}>Confirm &amp; claim</Btn>
      </div>
    </div>
  );
}

// ── Confirmation ─────────────────────────────────────────────
function ConfirmScreen({ claim, onPlans, onDone }) {
  const T = useT();
  const { d, party, time, code } = claim;
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 50, background: T.bg, display: "flex", flexDirection: "column", animation: "imp-rise .3s cubic-bezier(.2,.8,.2,1)" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: `${TOP + 30}px 24px 150px`, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <div style={{ animation: "imp-pop .4s cubic-bezier(.2,.9,.3,1.4)" }}><PulseMark size={64} radius={17} /></div>
        <h1 style={{ margin: "20px 0 0", fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 32, color: T.text, letterSpacing: "-0.03em" }}>You're on.</h1>
        <div style={{ fontFamily: FONT_UI, fontSize: 16, color: T.muted, marginTop: 8, lineHeight: 1.45 }}>
          {d.venue} · {time} · {party} {party === 1 ? "person" : "people"}
        </div>

        <div style={{ marginTop: 28, padding: 22, background: T.surface, borderRadius: 24, boxShadow: T.shadow, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <FauxQR code={code} size={168} />
          <div style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 22, color: T.text, letterSpacing: "0.12em" }}>{code}</div>
          <div style={{ fontFamily: FONT_UI, fontSize: 13.5, color: T.faint, maxWidth: 230, lineHeight: 1.45 }}>Show this at the door at {d.venue}. Your slot's held for 20 minutes.</div>
        </div>
      </div>

      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "14px 22px 30px", background: T.bg, borderTop: `0.5px solid ${T.line}`, display: "flex", flexDirection: "column", gap: 10 }}>
        <Btn full onClick={onPlans}>View in plans</Btn>
        <Btn full variant="ghost" onClick={onDone}>Back to tonight</Btn>
      </div>
    </div>
  );
}

Object.assign(window, { TonightScreen, MapScreen, PlansScreen, DetailScreen, ClaimScreen, ConfirmScreen });
