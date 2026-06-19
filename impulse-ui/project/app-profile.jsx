// app-profile.jsx — Impulse profile + settings
const { useT } = window;
const { FONT_UI, FONT_DISPLAY, FONT_MONO, PulseMark, Switch, Btn } = window;

const PTOP = 54, PBOTTOM = 104;

// ── grouped settings list ────────────────────────────────────
function Group({ label, children }) {
  const T = useT();
  return (
    <div style={{ marginTop: 26 }}>
      {label && <div style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: T.faint, margin: "0 6px 10px" }}>{label}</div>}
      <div style={{ background: T.surface, borderRadius: 18, overflow: "hidden", boxShadow: T.shadow }}>
        {React.Children.toArray(children).filter(Boolean).map((c, i, arr) => (
          <div key={i}>
            {c}
            {i < arr.length - 1 && <div style={{ height: 1, background: T.line, marginLeft: 54 }} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function RowIcon({ children }) {
  const T = useT();
  return (
    <span style={{ width: 30, height: 30, borderRadius: 9, background: T.accentSoft, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>
      {children}
    </span>
  );
}

function Row({ icon, label, value, trailing, onClick, last }) {
  const T = useT();
  const [press, setPress] = React.useState(false);
  const tappable = !!onClick;
  return (
    <div
      onClick={onClick}
      onPointerDown={() => tappable && setPress(true)} onPointerUp={() => setPress(false)} onPointerLeave={() => setPress(false)}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", minHeight: 30,
        cursor: tappable ? "pointer" : "default", background: press ? T.chipBg : "transparent", transition: "background .12s",
      }}>
      {icon && <RowIcon>{icon}</RowIcon>}
      <span style={{ fontFamily: FONT_UI, fontSize: 16, color: T.text, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      {value != null && <span style={{ fontFamily: FONT_UI, fontSize: 15.5, color: T.muted, whiteSpace: "nowrap", flex: "0 0 auto" }}>{value}</span>}
      {trailing}
      {tappable && !trailing && (
        <svg width="8" height="14" viewBox="0 0 8 14" fill="none" style={{ flex: "0 0 auto" }}><path d="M1 1l6 6-6 6" stroke={T.faint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      )}
    </div>
  );
}

const ic = {
  pin: (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round"><path d="M12 21c4.5-4.2 7-7.6 7-11a7 7 0 10-14 0c0 3.4 2.5 6.8 7 11z" /><circle cx="12" cy="10" r="2.2" fill={c} stroke="none" /></svg>,
  star: (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2"><circle cx="12" cy="12" r="3" fill={c} stroke="none" /><circle cx="12" cy="12" r="8" /></svg>,
  people: (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3 2.7-5 6-5s6 2 6 5" /><path d="M16 5.5a3 3 0 010 5.4M17 15c2.5.4 4 2.3 4 5" /></svg>,
  bell: (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 10a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6z" /><path d="M10 20a2 2 0 004 0" /></svg>,
  clock: (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 8v4.5l3 2" /></svg>,
  mail: (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round"><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M4 7l8 5.5L20 7" /></svg>,
  moon: (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round"><path d="M20 14.5A8 8 0 019.5 4 7 7 0 1020 14.5z" /></svg>,
  card: (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round"><rect x="3" y="6" width="18" height="12" rx="2.5" /><path d="M3 10h18" /></svg>,
  help: (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="8.5" /><path d="M9.5 9.5a2.5 2.5 0 014.3 1.7c0 1.7-2.3 1.8-2.3 3.3" /><circle cx="11.5" cy="17.5" r=".6" fill={c} stroke="none" /></svg>,
  doc: (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h8l4 4v14H6z" /><path d="M9 11h6M9 15h4" /></svg>,
  shield: (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /></svg>,
};

function StatTile({ big, label }) {
  const T = useT();
  return (
    <div style={{ flex: 1, background: T.surface, borderRadius: 16, padding: "15px 16px", boxShadow: T.shadow }}>
      <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 24, color: T.text, letterSpacing: "-0.02em", lineHeight: 1 }}>{big}</div>
      <div style={{ fontFamily: FONT_UI, fontSize: 13, color: T.muted, marginTop: 6 }}>{label}</div>
    </div>
  );
}

function ProfileScreen({ profile, setProfile, plansCount, dark, onToggleDark, onSignOut }) {
  const T = useT();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(profile.name);
  const [notif, setNotif] = React.useState({ near: true, reminders: true, weekly: false });
  const setN = (k, v) => setNotif((p) => ({ ...p, [k]: v }));

  const acts = profile.acts || [];
  const actLabel = acts.length === 0 ? "Everything" : acts.length === 1 ? acts[0] : `${acts[0]} +${acts.length - 1}`;

  const saveName = () => { const v = draft.trim(); if (v) setProfile((p) => ({ ...p, name: v })); setEditing(false); };

  return (
    <div style={{ height: "100%", overflowY: "auto", background: T.bg }}>
      <div style={{ padding: `${PTOP}px 18px ${PBOTTOM}px` }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 33, color: T.text, letterSpacing: "-0.03em" }}>You</h1>
          <button onClick={() => { setDraft(profile.name); setEditing((e) => !e); }} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: FONT_UI, fontWeight: 600, fontSize: 15, color: T.accent }}>
            {editing ? "Done" : "Edit"}
          </button>
        </div>

        {/* identity card */}
        <div style={{ display: "flex", alignItems: "center", gap: 15, marginTop: 18 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: T.accentSoft, border: `1.5px solid ${T.accent}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 24, color: T.accent, flex: "0 0 auto" }}>
            {profile.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            {editing ? (
              <input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={saveName}
                onKeyDown={(e) => e.key === "Enter" && saveName()} autoFocus
                style={{ width: "100%", fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 22, letterSpacing: "-0.02em", color: T.text, background: "transparent", border: "none", borderBottom: `2px solid ${T.accent}`, outline: "none", padding: "0 0 3px" }} />
            ) : (
              <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 22, color: T.text, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{profile.name}</div>
            )}
            <div style={{ fontFamily: FONT_UI, fontSize: 14.5, color: T.muted, marginTop: 3 }}>{profile.phone}</div>
          </div>
        </div>

        {/* stats */}
        <div style={{ display: "flex", gap: 11, marginTop: 20 }}>
          <StatTile big={plansCount} label={plansCount === 1 ? "Plan claimed" : "Plans claimed"} />
          <StatTile big={profile.suburb || "Sydney"} label="Home base" />
        </div>

        {/* going out */}
        <Group label="Going out">
          <Row icon={ic.pin(T.accent)} label="Home suburb" value={profile.suburb || "Set suburb"} onClick={() => {}} />
          <Row icon={ic.star(T.accent)} label="Favourites" value={actLabel} onClick={() => {}} />
          <Row icon={ic.people(T.accent)} label="Usual party size" value={`${profile.party} ${profile.party === 1 ? "person" : "people"}`} onClick={() => {}} />
        </Group>

        {/* notifications */}
        <Group label="Notifications">
          <Row icon={ic.bell(T.accent)} label="Drops near me" trailing={<Switch on={notif.near} onChange={(v) => setN("near", v)} />} />
          <Row icon={ic.clock(T.accent)} label="Slot reminders" trailing={<Switch on={notif.reminders} onChange={(v) => setN("reminders", v)} />} />
          <Row icon={ic.mail(T.accent)} label="Weekly what's-on" trailing={<Switch on={notif.weekly} onChange={(v) => setN("weekly", v)} />} />
        </Group>

        {/* appearance + payment */}
        <Group label="App">
          <Row icon={ic.moon(T.accent)} label="Nocturnal theme" trailing={<Switch on={dark} onChange={onToggleDark} />} />
          <Row icon={ic.card(T.accent)} label="Payment" value="•••• 4242" onClick={() => {}} />
        </Group>

        {/* support */}
        <Group label="Support">
          <Row icon={ic.help(T.accent)} label="Help & support" onClick={() => {}} />
          <Row icon={ic.doc(T.accent)} label="Terms of service" onClick={() => {}} />
          <Row icon={ic.shield(T.accent)} label="Privacy" onClick={() => {}} />
        </Group>

        {/* sign out */}
        <div style={{ marginTop: 22 }}>
          <button onClick={onSignOut} style={{ width: "100%", height: 52, borderRadius: 16, border: "none", cursor: "pointer", background: T.chipBg, color: T.text, fontFamily: FONT_UI, fontWeight: 600, fontSize: 16 }}>
            Sign out
          </button>
        </div>

        <div style={{ textAlign: "center", marginTop: 22, fontFamily: FONT_MONO, fontSize: 11, color: T.faint, letterSpacing: "0.04em" }}>
          impulse · v1.0.0 · made in sydney
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ProfileScreen });
