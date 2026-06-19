// app-ui.jsx — Impulse app shared UI atoms
// Exports (window): Logo, PulseMark, Btn, Chip, Placeholder, PriceBlock,
//   MetaLine, RatingDot, CountdownPill, DropCardEditorial, DropCardCompact,
//   TabBar, Stepper, FauxQR, Pin, Sheet
const { useT, money, pct, useCountdown, fmtCountdown, hexA } = window;

const FONT_UI = "'Archivo', system-ui, sans-serif";
const FONT_DISPLAY = "'Space Grotesk', system-ui, sans-serif";
const FONT_MONO = "'Space Mono', ui-monospace, monospace";

// ── impulse wordmark (clean, coral dot) ──────────────────────
function Logo({ size = 22, color }) {
  const T = useT();
  const ink = color || T.text;
  return (
    <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: size, letterSpacing: "-0.02em", color: ink, lineHeight: 1, display: "inline-flex", alignItems: "baseline" }}>
      impulse
      <span style={{ width: size * 0.15, height: size * 0.15, borderRadius: "50%", background: T.accent, marginLeft: size * 0.04, display: "inline-block" }} />
    </span>
  );
}

// pulse-rings icon mark (the chosen app icon), proportional
function PulseMark({ size = 30, radius }) {
  const T = useT();
  const r = radius != null ? radius : size * 0.26;
  const ring = (d, col, bw) => (
    <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: d * size, height: d * size, borderRadius: "50%", border: `${Math.max(1, size * bw)}px solid ${col}` }} />
  );
  return (
    <div style={{ width: size, height: size, borderRadius: r, background: "#0F0E0D", position: "relative", overflow: "hidden", flex: "0 0 auto" }}>
      {ring(0.82, hexA(T.accent, 0.22), 0.02)}
      {ring(0.6, hexA(T.accent, 0.45), 0.024)}
      <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 0.34 * size, height: 0.34 * size, borderRadius: "50%", background: T.accent }} />
    </div>
  );
}

// ── button ───────────────────────────────────────────────────
function Btn({ children, onClick, variant = "primary", full, style = {}, disabled }) {
  const T = useT();
  const [press, setPress] = React.useState(false);
  const base = {
    primary: { background: T.accent, color: T.accentInk, border: "none" },
    secondary: { background: "transparent", color: T.text, border: `1.5px solid ${T.line2}` },
    ghost: { background: T.chipBg, color: T.text, border: "none" },
  }[variant];
  return (
    <button
      onClick={onClick} disabled={disabled}
      onPointerDown={() => setPress(true)} onPointerUp={() => setPress(false)} onPointerLeave={() => setPress(false)}
      style={{
        ...base, width: full ? "100%" : undefined, height: 54, borderRadius: 16,
        fontFamily: FONT_UI, fontWeight: 600, fontSize: 17, letterSpacing: "-0.01em",
        cursor: "pointer", transition: "transform .12s ease, opacity .12s",
        transform: press ? "scale(0.975)" : "scale(1)", opacity: disabled ? 0.4 : 1,
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
        whiteSpace: "nowrap", padding: "0 18px",
        ...style,
      }}>
      {children}
    </button>
  );
}

// ── filter chip ──────────────────────────────────────────────
function Chip({ children, active, onClick, small }) {
  const T = useT();
  return (
    <button onClick={onClick} style={{
      flex: "0 0 auto", height: small ? 30 : 36, padding: small ? "0 13px" : "0 16px", borderRadius: 999,
      border: "none", cursor: "pointer", fontFamily: FONT_UI, fontWeight: 500,
      fontSize: small ? 13 : 14.5, letterSpacing: "-0.01em", transition: "background .15s,color .15s",
      background: active ? T.chipOn : T.chipBg, color: active ? T.chipOnInk : T.chipText,
      whiteSpace: "nowrap",
    }}>{children}</button>
  );
}

// ── striped image placeholder ────────────────────────────────
function Placeholder({ label = "venue photo", style = {}, radius = 0 }) {
  const T = useT();
  return (
    <div style={{
      position: "relative", background: T.ph, overflow: "hidden", borderRadius: radius,
      backgroundImage: `repeating-linear-gradient(135deg, ${T.phLine} 0 1px, transparent 1px 11px)`,
      ...style,
    }}>
      <span style={{ position: "absolute", left: 12, bottom: 10, fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: T.phText }}>
        {label}
      </span>
    </div>
  );
}

// ── price block (now + usually struck + −pct chip) ───────────
function PriceBlock({ d, big }) {
  const T = useT();
  const p = pct(d.now, d.usual);
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: big ? 10 : 8, flexWrap: "wrap" }}>
      <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: big ? 34 : 22, color: T.text, letterSpacing: "-0.02em" }}>
        {money(d.now)}<span style={{ fontSize: big ? 16 : 12, fontWeight: 500, color: T.muted, marginLeft: 2 }}>{d.unit}</span>
      </span>
      <span style={{ fontFamily: FONT_UI, fontSize: big ? 15 : 13, color: T.faint, textDecoration: "line-through" }}>
        usually {money(d.usual)}
      </span>
      <span style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: big ? 13 : 11, color: T.accent, background: T.accentSoft, padding: "3px 7px", borderRadius: 6, letterSpacing: "0.02em" }}>
        −{p}%
      </span>
    </div>
  );
}

// ── meta line: cat · suburb · km ─────────────────────────────
function MetaLine({ d, style = {} }) {
  const T = useT();
  return (
    <div style={{ fontFamily: FONT_UI, fontSize: 13.5, color: T.muted, letterSpacing: "-0.01em", ...style }}>
      {d.cat} · {d.suburb} · {d.km} km
    </div>
  );
}

function RatingDot({ d }) {
  const T = useT();
  return (
    <span style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: T.muted, display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.accent }} />{d.rating}
    </span>
  );
}

// ── countdown pill (live, only on hot drops) ─────────────────
function CountdownPill({ d, plain }) {
  const T = useT();
  const ms = useCountdown(d.target);
  if (!d.target) return null;
  return (
    <span style={{
      fontFamily: FONT_MONO, fontWeight: 700, fontSize: plain ? 13 : 11.5, letterSpacing: "0.02em",
      color: plain ? T.accent : T.accentInk, background: plain ? "transparent" : T.accent,
      padding: plain ? 0 : "4px 8px", borderRadius: 7, display: "inline-flex", alignItems: "center", gap: 5,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: plain ? T.accent : T.accentInk, animation: "imp-blink 1.4s steps(1) infinite" }} />
      ends in {fmtCountdown(ms)}
    </span>
  );
}

// ── editorial drop card (image-led, one per row) ─────────────
function DropCardEditorial({ d, onClick }) {
  const T = useT();
  const [press, setPress] = React.useState(false);
  return (
    <div onClick={onClick}
      onPointerDown={() => setPress(true)} onPointerUp={() => setPress(false)} onPointerLeave={() => setPress(false)}
      style={{
        background: T.surface, borderRadius: 22, overflow: "hidden", cursor: "pointer",
        boxShadow: T.shadow, transition: "transform .14s ease", transform: press ? "scale(0.985)" : "scale(1)",
      }}>
      <div style={{ position: "relative" }}>
        <Placeholder label={d.cat + " · venue photo"} style={{ height: 168 }} />
        <div style={{ position: "absolute", top: 12, left: 12, display: "flex", gap: 7 }}>
          <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 12.5, color: "#0F0E0D", background: "rgba(244,241,234,0.92)", padding: "5px 10px", borderRadius: 999 }}>{d.cat}</span>
          {d.target && <span style={{ display: "inline-flex" }}><CountdownPill d={d} /></span>}
        </div>
      </div>
      <div style={{ padding: "14px 16px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 20, color: T.text, letterSpacing: "-0.02em" }}>{d.venue}</div>
          <RatingDot d={d} />
        </div>
        <MetaLine d={d} style={{ marginTop: 3, marginBottom: 12 }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <PriceBlock d={d} />
        </div>
        <div style={{ marginTop: 11, fontFamily: FONT_UI, fontSize: 12.5, color: T.faint, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: d.status === "now" ? T.accent : T.faint }} />
          {d.window}
        </div>
      </div>
    </div>
  );
}

// ── compact drop row (dense list) ────────────────────────────
function DropCardCompact({ d, onClick }) {
  const T = useT();
  const [press, setPress] = React.useState(false);
  return (
    <div onClick={onClick}
      onPointerDown={() => setPress(true)} onPointerUp={() => setPress(false)} onPointerLeave={() => setPress(false)}
      style={{
        background: T.surface, borderRadius: 16, overflow: "hidden", cursor: "pointer", display: "flex",
        boxShadow: T.shadow, transition: "transform .14s ease", transform: press ? "scale(0.99)" : "scale(1)",
      }}>
      <Placeholder label={d.cat} style={{ width: 92, flex: "0 0 92px" }} />
      <div style={{ padding: "11px 13px", flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 16.5, color: T.text, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.venue}</div>
          <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 17, color: T.text, flex: "0 0 auto" }}>{money(d.now)}<span style={{ fontSize: 10.5, color: T.muted, fontWeight: 500 }}>{d.unit}</span></span>
        </div>
        <MetaLine d={d} style={{ fontSize: 12.5, marginTop: 2 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <span style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 10.5, color: T.accent, background: T.accentSoft, padding: "2px 6px", borderRadius: 5 }}>−{pct(d.now, d.usual)}%</span>
          {d.target
            ? <CountdownPill d={d} plain />
            : <span style={{ fontFamily: FONT_UI, fontSize: 12, color: T.faint, whiteSpace: "nowrap" }}>{d.window.replace("On now · ", "").replace(" tonight", "")}</span>}
        </div>
      </div>
    </div>
  );
}

// ── bottom tab bar ───────────────────────────────────────────
function TabBar({ tab, onTab }) {
  const T = useT();
  const tabs = [
    { id: "tonight", label: "What's on" },
    { id: "map", label: "Map" },
    { id: "plans", label: "Plans" },
    { id: "profile", label: "You" },
  ];
  const icon = (id, on) => {
    const c = on ? T.accent : T.faint;
    if (id === "tonight") // pulse dot + ring
      return (<svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke={c} strokeWidth="1.8" opacity={on ? 0.5 : 0.9} /><circle cx="12" cy="12" r="3.6" fill={c} /></svg>);
    if (id === "map")
      return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinejoin="round"><path d="M12 21c4.5-4.2 7-7.6 7-11a7 7 0 10-14 0c0 3.4 2.5 6.8 7 11z" /><circle cx="12" cy="10" r="2.4" fill={on ? c : "none"} /></svg>);
    if (id === "plans")
      return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h11l3 3v13H5z" /><path d="M9 11h7M9 15h5" /></svg>);
    return (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.6" fill={on ? c : "none"} /><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" /></svg>);
  };
  return (
    <div style={{
      position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 30,
      paddingBottom: 26, paddingTop: 9, background: T.dark
        ? "linear-gradient(to top, rgba(15,14,13,0.97) 60%, rgba(15,14,13,0))"
        : "linear-gradient(to top, rgba(246,243,237,0.97) 60%, rgba(246,243,237,0))",
      backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
      borderTop: `0.5px solid ${T.line}`,
      display: "flex", justifyContent: "space-around", alignItems: "center",
    }}>
      {tabs.map((t) => {
        const on = tab === t.id;
        return (
          <button key={t.id} onClick={() => onTab(t.id)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "2px 14px" }}>
            {icon(t.id, on)}
            <span style={{ fontFamily: FONT_UI, fontWeight: on ? 600 : 500, fontSize: 11, color: on ? T.accent : T.faint, letterSpacing: "-0.01em" }}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── iOS-style switch ─────────────────────────────────────────
function Switch({ on, onChange }) {
  const T = useT();
  return (
    <button onClick={() => onChange(!on)} style={{
      width: 50, height: 30, borderRadius: 999, border: "none", cursor: "pointer", padding: 2,
      background: on ? T.accent : T.line2, transition: "background .2s", flex: "0 0 auto",
      display: "flex", justifyContent: on ? "flex-end" : "flex-start", alignItems: "center",
    }}>
      <span style={{ width: 26, height: 26, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.3)", transition: "all .2s" }} />
    </button>
  );
}

// ── party-size stepper ───────────────────────────────────────
function Stepper({ value, onChange, min = 1, max = 8 }) {
  const T = useT();
  const btn = (label, fn, dis) => (
    <button onClick={fn} disabled={dis} style={{
      width: 46, height: 46, borderRadius: 13, border: `1.5px solid ${T.line2}`, background: "transparent",
      color: dis ? T.faint : T.text, fontSize: 24, fontFamily: FONT_UI, cursor: dis ? "default" : "pointer",
      display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, opacity: dis ? 0.5 : 1,
    }}>{label}</button>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      {btn("−", () => onChange(Math.max(min, value - 1)), value <= min)}
      <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 26, color: T.text, minWidth: 28, textAlign: "center" }}>{value}</span>
      {btn("+", () => onChange(Math.min(max, value + 1)), value >= max)}
    </div>
  );
}

// ── faux QR (deterministic module grid) ──────────────────────
function FauxQR({ code, size = 132 }) {
  const T = useT();
  const N = 13;
  // deterministic fill from code hash
  let h = 0; for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
  const rng = (i) => { const x = Math.sin(h + i * 12.9898) * 43758.5453; return x - Math.floor(x); };
  const isFinder = (r, c) => (r < 3 && c < 3) || (r < 3 && c >= N - 3) || (r >= N - 3 && c < 3);
  const cells = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const finder = isFinder(r, c);
    const on = finder ? ((r === 0 || r === 2 || r === N - 1 || r === N - 3 || c === 0 || c === 2 || c === N - 1 || c === N - 3) ? true : (r === 1 && c === 1) || (r === 1 && c === N - 2) || (r === N - 2 && c === 1)) : rng(r * N + c) > 0.5;
    cells.push(on);
  }
  return (
    <div style={{ width: size, height: size, background: "#fff", borderRadius: 14, padding: 12, boxSizing: "border-box" }}>
      <div style={{ width: "100%", height: "100%", display: "grid", gridTemplateColumns: `repeat(${N},1fr)`, gridTemplateRows: `repeat(${N},1fr)`, gap: 1.5 }}>
        {cells.map((on, i) => <div key={i} style={{ background: on ? "#0F0E0D" : "transparent", borderRadius: 1 }} />)}
      </div>
    </div>
  );
}

// ── map pin (pulse motif) ────────────────────────────────────
function Pin({ active, onClick, label }) {
  const T = useT();
  return (
    <button onClick={onClick} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
      {active && <div style={{ position: "absolute", top: -7, width: 38, height: 38, borderRadius: "50%", border: `2px solid ${T.accent}`, opacity: 0.5 }} />}
      <div style={{
        background: T.accent, color: T.accentInk, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 12,
        height: active ? 30 : 26, padding: "0 10px", borderRadius: 999, display: "flex", alignItems: "center",
        boxShadow: "0 3px 10px rgba(0,0,0,0.35)", transition: "all .15s", whiteSpace: "nowrap",
      }}>{label}</div>
      <div style={{ width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: `7px solid ${T.accent}`, marginTop: -1 }} />
    </button>
  );
}

// ── bottom sheet / pushed screen wrapper ─────────────────────
function Sheet({ children, onClose, title }) {
  const T = useT();
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 40, background: T.bg, display: "flex", flexDirection: "column", animation: "imp-slide .26s cubic-bezier(.2,.8,.2,1)" }}>
      {children}
    </div>
  );
}

Object.assign(window, { FONT_UI, FONT_DISPLAY, FONT_MONO, Logo, PulseMark, Btn, Chip, Placeholder, PriceBlock, MetaLine, RatingDot, CountdownPill, DropCardEditorial, DropCardCompact, TabBar, Switch, Stepper, FauxQR, Pin, Sheet });
