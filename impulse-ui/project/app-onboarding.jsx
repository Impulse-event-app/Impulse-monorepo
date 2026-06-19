// app-onboarding.jsx — Impulse first-run flow (swipeable carousel)
const { useT, CATEGORIES } = window;
const { FONT_UI, FONT_DISPLAY, FONT_MONO, Logo, PulseMark, Btn, Chip, Placeholder } = window;

const OB_TOP = 56;     // status-bar clearance
const OB_BOTTOM = 36;  // home-indicator clearance

const SUBURBS = ["Sydney CBD", "Surry Hills", "Newtown", "Bondi", "Marrickville", "Enmore", "Darlinghurst", "Redfern", "Chippendale", "Glebe", "Paddington", "Manly"];
const ACTIVITIES = CATEGORIES.filter((c) => c !== "All");

// ── shared panel shell: scrollable body + sticky footer ──────
function Panel({ children, footer }) {
  const T = useT();
  return (
    <div style={{ width: "100%", height: "100%", flex: "0 0 100%", display: "flex", flexDirection: "column", position: "relative" }}>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>{children}</div>
      {footer && (
        <div style={{ padding: `12px 22px ${OB_BOTTOM}px`, display: "flex", flexDirection: "column", gap: 10, flex: "0 0 auto" }}>
          {footer}
        </div>
      )}
    </div>
  );
}

function Lede({ kicker, title, body }) {
  const T = useT();
  return (
    <div style={{ padding: "0 24px" }}>
      {kicker && <div style={{ fontFamily: FONT_MONO, fontSize: 11.5, letterSpacing: "0.12em", textTransform: "uppercase", color: T.accent, marginBottom: 14 }}>{kicker}</div>}
      <h1 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 32, lineHeight: 1.08, letterSpacing: "-0.03em", color: T.text }}>{title}</h1>
      {body && <p style={{ margin: "14px 0 0", fontFamily: FONT_UI, fontSize: 16.5, lineHeight: 1.5, color: T.muted, maxWidth: 330 }}>{body}</p>}
    </div>
  );
}

// big iconographic glyph for permission cards (simple shapes only)
function GlyphPin() {
  const T = useT();
  return (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.6" strokeLinejoin="round">
      <path d="M12 21.5c5-4.6 7.5-8.3 7.5-12A7.5 7.5 0 1 0 4.5 9.5c0 3.7 2.5 7.4 7.5 12z" />
      <circle cx="12" cy="9.5" r="2.6" fill={T.accent} stroke="none" />
    </svg>
  );
}
function GlyphBell() {
  const T = useT();
  return (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 10a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
      <circle cx="18" cy="6" r="2.4" fill={T.accent} stroke="none" />
    </svg>
  );
}
function GlyphAge() {
  const T = useT();
  return (
    <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 46, letterSpacing: "-0.04em", color: T.accent, lineHeight: 1 }}>18<span style={{ fontSize: 28 }}>+</span></div>
  );
}

function PermIcon({ children }) {
  const T = useT();
  return (
    <div style={{ width: 116, height: 116, borderRadius: 30, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 30 }}>
      {children}
    </div>
  );
}

// ── step 0: brand splash (two tones) ─────────────────────────
function HeroSplash({ tone, onStart, onSignin }) {
  const T = useT();
  const editorial = tone === "Editorial";
  return (
    <Panel footer={
      <>
        <Btn full onClick={onStart}>Get started</Btn>
        <button onClick={onSignin} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: FONT_UI, fontSize: 15, color: T.muted, padding: "6px 0" }}>
          I already have an account
        </button>
      </>
    }>
      {editorial ? (
        <div style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <Placeholder label="hero · night out in sydney" style={{ position: "absolute", inset: 0 }} />
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to top, ${T.bg} 8%, ${T.bg}cc 30%, transparent 68%)` }} />
          <div style={{ position: "relative", padding: "0 24px 8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 18 }}>
              <PulseMark size={30} radius={8} /><Logo size={21} />
            </div>
            <h1 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 34, lineHeight: 1.05, letterSpacing: "-0.03em", color: T.text }}>
              The good stuff,<br />sorted by price.
            </h1>
            <p style={{ margin: "14px 0 0", fontFamily: FONT_UI, fontSize: 16.5, lineHeight: 1.5, color: T.muted, maxWidth: 320 }}>
              Real-time drops on bowling, karaoke, escape rooms and more — across Sydney, tonight.
            </p>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: `${OB_TOP + 8}px 24px 8px` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <PulseMark size={28} radius={8} /><Logo size={20} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
            <div style={{ position: "relative", width: 150, height: 150, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{ position: "absolute", width: 150, height: 150, borderRadius: "50%", border: `1.5px solid ${T.accent}`, opacity: 0, animation: `imp-ring 2.6s cubic-bezier(.2,.6,.3,1) ${i * 0.86}s infinite` }} />
              ))}
              <span style={{ width: 56, height: 56, borderRadius: "50%", background: T.accent }} />
            </div>
          </div>
          <div>
            <h1 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 52, lineHeight: 0.98, letterSpacing: "-0.04em", color: T.text }}>
              Plans,<br />on impulse.
            </h1>
            <p style={{ margin: "16px 0 0", fontFamily: FONT_UI, fontSize: 16.5, lineHeight: 1.45, color: T.muted, maxWidth: 300 }}>
              Last-minute things to do in Sydney, with the price already worked out.
            </p>
          </div>
        </div>
      )}
    </Panel>
  );
}

// ── step 1: sign in ──────────────────────────────────────────
function SocialBtn({ kind, onClick }) {
  const T = useT();
  const apple = kind === "apple";
  return (
    <button onClick={onClick} style={{
      width: "100%", height: 54, borderRadius: 16, cursor: "pointer", border: "none",
      background: apple ? (T.dark ? "#fff" : "#000") : T.surface,
      color: apple ? (T.dark ? "#000" : "#fff") : T.text,
      boxShadow: apple ? "none" : `inset 0 0 0 1.5px ${T.line2}`,
      fontFamily: FONT_UI, fontWeight: 600, fontSize: 16.5, whiteSpace: "nowrap",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
    }}>
      {apple ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 12.7c-.03-2.4 1.96-3.55 2.05-3.6-1.12-1.64-2.86-1.86-3.48-1.89-1.48-.15-2.89.87-3.64.87-.75 0-1.91-.85-3.14-.83-1.62.03-3.11.94-3.94 2.39-1.68 2.92-.43 7.24 1.2 9.61.8 1.16 1.75 2.46 3 2.41 1.21-.05 1.66-.78 3.12-.78 1.46 0 1.87.78 3.14.76 1.3-.02 2.12-1.18 2.91-2.35.92-1.35 1.3-2.66 1.32-2.73-.03-.01-2.53-.97-2.56-3.85zM14.7 5.6c.66-.8 1.11-1.92.99-3.03-.95.04-2.1.63-2.79 1.43-.61.71-1.15 1.84-1 2.92 1.06.08 2.14-.54 2.8-1.32z"/></svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.5 12.2c0-.7-.06-1.4-.18-2.05H12v3.9h5.9a5 5 0 0 1-2.18 3.3v2.74h3.52c2.06-1.9 3.26-4.7 3.26-7.89z"/><path fill="#34A853" d="M12 23c2.94 0 5.4-.97 7.2-2.64l-3.52-2.73c-.98.66-2.23 1.05-3.68 1.05-2.83 0-5.23-1.91-6.09-4.48H2.27v2.82A10.99 10.99 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.91 14.2a6.6 6.6 0 0 1 0-4.2V7.18H2.27a11 11 0 0 0 0 9.84l3.64-2.82z"/><path fill="#EA4335" d="M12 5.5c1.6 0 3.03.55 4.16 1.62l3.12-3.12A10.98 10.98 0 0 0 12 1 10.99 10.99 0 0 0 2.27 7.18l3.64 2.82C6.77 7.42 9.17 5.5 12 5.5z"/></svg>
      )}
      Continue with {apple ? "Apple" : "Google"}
    </button>
  );
}

function SignInStep({ onContinue }) {
  const T = useT();
  return (
    <Panel footer={
      <p style={{ margin: 0, fontFamily: FONT_UI, fontSize: 12, lineHeight: 1.45, color: T.faint, textAlign: "center" }}>
        By continuing you agree to our <span style={{ color: T.muted }}>Terms</span> and <span style={{ color: T.muted }}>Privacy Policy</span>.
      </p>
    }>
      <div style={{ paddingTop: OB_TOP + 14 }}>
        <Lede kicker="Welcome in" title="Get in." body="One tap and you're set. We'll only ever use your number to hold your slots." />
      </div>
      <div style={{ padding: "34px 24px 0", display: "flex", flexDirection: "column", gap: 11 }}>
        <SocialBtn kind="apple" onClick={onContinue} />
        <SocialBtn kind="google" onClick={onContinue} />
        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "8px 0" }}>
          <div style={{ flex: 1, height: 1, background: T.line }} />
          <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: T.faint, letterSpacing: "0.06em" }}>OR</span>
          <div style={{ flex: 1, height: 1, background: T.line }} />
        </div>
        <Btn full variant="secondary" onClick={onContinue}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="3" /><path d="M11 18.5h2" strokeLinecap="round" /></svg>
          Continue with phone
        </Btn>
      </div>
    </Panel>
  );
}

// ── permission steps ─────────────────────────────────────────
function PermissionStep({ glyph, kicker, title, body, allowLabel, onAllow, onSkip, extra }) {
  const T = useT();
  return (
    <Panel footer={
      <>
        <Btn full onClick={onAllow}>{allowLabel}</Btn>
        <button onClick={onSkip} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: FONT_UI, fontSize: 15, color: T.muted, padding: "6px 0" }}>Not now</button>
      </>
    }>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start", padding: "0 24px" }}>
        <PermIcon>{glyph}</PermIcon>
        <div style={{ fontFamily: FONT_MONO, fontSize: 11.5, letterSpacing: "0.12em", textTransform: "uppercase", color: T.accent, marginBottom: 12 }}>{kicker}</div>
        <h1 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 30, lineHeight: 1.1, letterSpacing: "-0.03em", color: T.text }}>{title}</h1>
        <p style={{ margin: "13px 0 0", fontFamily: FONT_UI, fontSize: 16.5, lineHeight: 1.5, color: T.muted, maxWidth: 320 }}>{body}</p>
        {extra}
      </div>
    </Panel>
  );
}

// ── 18+ step ─────────────────────────────────────────────────
function AgeStep({ onYes, onNo, declined }) {
  const T = useT();
  return (
    <Panel footer={
      <>
        <Btn full onClick={onYes}>Yes, I'm 18 or over</Btn>
        <button onClick={onNo} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: FONT_UI, fontSize: 15, color: T.muted, padding: "6px 0" }}>I'm under 18</button>
      </>
    }>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start", padding: "0 24px" }}>
        <PermIcon><GlyphAge /></PermIcon>
        <div style={{ fontFamily: FONT_MONO, fontSize: 11.5, letterSpacing: "0.12em", textTransform: "uppercase", color: T.accent, marginBottom: 12 }}>Quick one</div>
        <h1 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 30, lineHeight: 1.1, letterSpacing: "-0.03em", color: T.text }}>Are you 18 or over?</h1>
        <p style={{ margin: "13px 0 0", fontFamily: FONT_UI, fontSize: 16.5, lineHeight: 1.5, color: T.muted, maxWidth: 320 }}>
          Some venues serve alcohol, so we check once. We'll still show you the all-ages stuff either way.
        </p>
        {declined && (
          <div style={{ marginTop: 18, padding: "12px 14px", background: T.accentSoft, borderRadius: 12, fontFamily: FONT_UI, fontSize: 14, color: T.text, maxWidth: 320 }}>
            No worries — we'll hide 18+ venues and show you everything else.
          </div>
        )}
      </div>
    </Panel>
  );
}

// ── suburb step ──────────────────────────────────────────────
function SuburbStep({ value, onPick, onContinue }) {
  const T = useT();
  return (
    <Panel footer={<Btn full onClick={onContinue} disabled={!value}>{value ? `Set to ${value}` : "Pick your suburb"}</Btn>}>
      <div style={{ paddingTop: OB_TOP + 14 }}>
        <Lede kicker="Home base" title="Where do you call home?" body="We'll sort drops by what's closest. Change it any time." />
      </div>
      <div style={{ padding: "20px 22px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, background: T.surface, borderRadius: 14, padding: "12px 15px", marginBottom: 16, boxShadow: T.shadow }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" strokeLinecap="round" /></svg>
          <span style={{ fontFamily: FONT_UI, fontSize: 15, color: T.faint, whiteSpace: "nowrap" }}>Search Sydney suburbs</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
          {SUBURBS.map((s) => <Chip key={s} active={value === s} onClick={() => onPick(s)}>{s}</Chip>)}
        </div>
      </div>
    </Panel>
  );
}

// ── activities step ──────────────────────────────────────────
function ActivitiesStep({ selected, onToggle, onDone }) {
  const T = useT();
  const n = selected.length;
  return (
    <Panel footer={
      <>
        <Btn full onClick={onDone} disabled={n === 0}>{n === 0 ? "Pick a few" : `Done — ${n} picked`}</Btn>
        <button onClick={onDone} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: FONT_UI, fontSize: 15, color: T.muted, padding: "6px 0" }}>Skip — show me everything</button>
      </>
    }>
      <div style={{ paddingTop: OB_TOP + 14 }}>
        <Lede kicker="Last bit" title="What are you into?" body="We'll bump these to the top. You can change it later." />
      </div>
      <div style={{ padding: "22px 22px 0", display: "flex", flexWrap: "wrap", gap: 10 }}>
        {ACTIVITIES.map((a) => {
          const on = selected.includes(a);
          return (
            <button key={a} onClick={() => onToggle(a)} style={{
              padding: "11px 16px", borderRadius: 14, cursor: "pointer", border: "none",
              fontFamily: FONT_UI, fontWeight: 500, fontSize: 15.5, letterSpacing: "-0.01em",
              background: on ? T.accent : T.chipBg, color: on ? T.accentInk : T.text, whiteSpace: "nowrap",
              display: "inline-flex", alignItems: "center", gap: 8, transition: "background .15s, color .15s, transform .1s",
            }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: on ? T.accentInk : T.faint }} />
              {a}
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

// ── flow controller (swipeable track + dots) ─────────────────
function Onboarding({ tone, onComplete }) {
  const T = useT();
  const [step, setStep] = React.useState(0);
  const [drag, setDrag] = React.useState(0);
  const [w, setW] = React.useState(402);
  const wrapRef = React.useRef(null);
  const dragState = React.useRef({ active: false, x0: 0, moved: false });

  React.useLayoutEffect(() => {
    const measure = () => { if (wrapRef.current) setW(wrapRef.current.clientWidth); };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const [suburb, setSuburb] = React.useState(null);
  const [acts, setActs] = React.useState([]);
  const [ageDeclined, setAgeDeclined] = React.useState(false);

  const STEPS = ["hero", "signin", "location", "notifications", "age", "suburb", "activities"];
  const n = STEPS.length;
  const go = (i) => setStep(Math.max(0, Math.min(n - 1, i)));
  const next = () => go(step + 1);

  // swipe handlers (only horizontal intent; clicks pass through)
  const onDown = (e) => { dragState.current = { active: true, x0: e.clientX, moved: false }; };
  const onMove = (e) => {
    const s = dragState.current; if (!s.active) return;
    const dx = e.clientX - s.x0;
    if (Math.abs(dx) > 6) s.moved = true;
    // resist at edges
    let d = dx;
    if ((step === 0 && dx > 0) || (step === n - 1 && dx < 0)) d = dx * 0.32;
    setDrag(d);
  };
  const onUp = () => {
    const s = dragState.current; if (!s.active) return;
    s.active = false;
    if (drag < -64) go(step + 1);
    else if (drag > 64) go(step - 1);
    setDrag(0);
  };

  const toggleAct = (a) => setActs((p) => p.includes(a) ? p.filter((x) => x !== a) : [...p, a]);

  const panels = [
    <HeroSplash key="hero" tone={tone} onStart={next} onSignin={next} />,
    <SignInStep key="signin" onContinue={next} />,
    <PermissionStep key="loc" glyph={<GlyphPin />} kicker="Find your area"
      title="What's on near you" body="Impulse uses your location to surface drops within a few suburbs — never in the background, only while you're looking."
      allowLabel="Allow location" onAllow={next} onSkip={next} />,
    <PermissionStep key="notif" glyph={<GlyphBell />} kicker="Stay in the loop"
      title="Get the drop" body="A nudge when something good opens up near you tonight. No daily blast, no noise — just the ones worth leaving the house for."
      allowLabel="Turn on notifications" onAllow={next} onSkip={next} />,
    <AgeStep key="age" declined={ageDeclined} onYes={next} onNo={() => { setAgeDeclined(true); setTimeout(next, 650); }} />,
    <SuburbStep key="suburb" value={suburb} onPick={setSuburb} onContinue={next} />,
    <ActivitiesStep key="acts" selected={acts} onToggle={toggleAct} onDone={() => onComplete({ suburb, acts })} />,
  ];

  return (
    <div style={{ position: "absolute", inset: 0, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* progress dots + skip */}
      <div style={{ position: "absolute", top: OB_TOP - 4, left: 0, right: 0, zIndex: 20, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 22px", pointerEvents: "none" }}>
        <div style={{ display: "flex", gap: 6, pointerEvents: "auto" }}>
          {STEPS.map((_, i) => (
            <button key={i} onClick={() => go(i)} style={{
              width: i === step ? 22 : 7, height: 7, borderRadius: 4, border: "none", padding: 0, cursor: "pointer",
              background: i === step ? T.accent : T.line2, transition: "width .25s, background .25s",
            }} />
          ))}
        </div>
        <button onClick={onComplete} style={{ pointerEvents: "auto", background: "none", border: "none", cursor: "pointer", fontFamily: FONT_UI, fontWeight: 500, fontSize: 14, color: T.faint }}>
          {step === n - 1 ? "" : "Skip"}
        </button>
      </div>

      {/* swipeable track */}
      <div ref={wrapRef} style={{ flex: 1, overflow: "hidden" }}>
        <div
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
          style={{ display: "flex", height: "100%", width: w * n, touchAction: "pan-y",
            transform: `translateX(${-step * w + drag}px)`,
            transition: dragState.current.active ? "none" : "transform .34s cubic-bezier(.25,.8,.3,1)",
          }}>
          {panels.map((p, i) => (
            <div key={i} style={{ flex: `0 0 ${w}px`, width: w, height: "100%" }}>{p}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Onboarding });
