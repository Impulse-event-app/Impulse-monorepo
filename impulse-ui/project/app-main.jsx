// app-main.jsx — Impulse app: router, theme, tweaks, device mount
const { tokens, ThemeCtx, DROPS, DEFAULT_FILTERS } = window;
const { TonightScreen, MapScreen, PlansScreen, DetailScreen, ClaimScreen, ConfirmScreen, TabBar, Onboarding, FiltersSheet, ProfileScreen } = window;
const { IOSDevice } = window;
const { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle, TweakColor, TweakButton } = window;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "dark": true,
  "accent": "#FF5A4D",
  "intro": "Minimal",
  "home": "Editorial"
}/*EDITMODE-END*/;

const genCode = () => "IMP-" + Math.floor(1000 + Math.random() * 9000);

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const T = tokens(t.dark, t.accent);

  const [onboarded, setOnboarded] = React.useState(false);
  const [tab, setTab] = React.useState("tonight");
  const [detailId, setDetailId] = React.useState(null);
  const [claimDrop, setClaimDrop] = React.useState(null);
  const [confirm, setConfirm] = React.useState(null);
  const [plans, setPlans] = React.useState([]);
  const [filters, setFilters] = React.useState(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [profile, setProfile] = React.useState({ name: "Jordan Lee", phone: "+61 4XX XXX 891", suburb: "Surry Hills", acts: ["Bowling", "Karaoke", "Live music"], party: 2 });

  const detail = DROPS.find((d) => d.id === detailId) || null;

  const openDrop = (id) => setDetailId(id);
  const doConfirm = ({ d, party, time, total }) => {
    const code = genCode();
    const plan = { code, d, venue: d.venue, cat: d.cat, party, time, total };
    setPlans((p) => [plan, ...p]);
    setConfirm(plan);
  };
  const goPlans = () => { setConfirm(null); setClaimDrop(null); setDetailId(null); setTab("plans"); };
  const goTonight = () => { setConfirm(null); setClaimDrop(null); setDetailId(null); setTab("tonight"); };
  const completeOnboarding = (data) => {
    if (data && (data.suburb || (data.acts && data.acts.length)))
      setProfile((p) => ({ ...p, suburb: data.suburb || p.suburb, acts: data.acts && data.acts.length ? data.acts : p.acts }));
    setOnboarded(true);
  };
  const signOut = () => { setTab("tonight"); setDetailId(null); setClaimDrop(null); setConfirm(null); setFilters(DEFAULT_FILTERS); setOnboarded(false); };

  const screen = tab === "tonight"
    ? <TonightScreen layout={t.home === "Compact" ? "compact" : "editorial"} filters={filters} onSetFilters={setFilters} onOpenFilters={() => setFiltersOpen(true)} onOpen={openDrop} />
    : tab === "map"
      ? <MapScreen filters={filters} onOpenFilters={() => setFiltersOpen(true)} onOpen={openDrop} />
      : tab === "plans"
        ? <PlansScreen plans={plans} onTonight={() => setTab("tonight")} onOpenPlan={(p) => setConfirm(p)} />
        : <ProfileScreen profile={profile} setProfile={setProfile} plansCount={plans.length} dark={t.dark} onToggleDark={(v) => setTweak("dark", v)} onSignOut={signOut} />;

  return (
    <ThemeCtx.Provider value={T}>
      <div style={{
        minHeight: "100vh", width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
        background: "radial-gradient(120% 100% at 50% 0%, #211d1a 0%, #131110 60%, #0b0a09 100%)",
        padding: 24, boxSizing: "border-box", fontFamily: "'Archivo', system-ui, sans-serif",
      }}>
        <IOSDevice dark={t.dark}>
          <div style={{ position: "relative", height: "100%", overflow: "hidden", background: T.bg }}>
            {onboarded ? (
              <>
                {screen}
                <TabBar tab={tab} onTab={(id) => { setDetailId(null); setTab(id); }} />
                {detail && (
                  <DetailScreen d={detail} onBack={() => setDetailId(null)} onClaim={(d) => setClaimDrop(d)} />
                )}
                {claimDrop && (
                  <ClaimScreen d={claimDrop} onBack={() => setClaimDrop(null)} onConfirm={doConfirm} />
                )}
                {confirm && (
                  <ConfirmScreen claim={confirm} onPlans={goPlans} onDone={goTonight} />
                )}
                {filtersOpen && (
                  <FiltersSheet initial={filters} onClose={() => setFiltersOpen(false)}
                    onApply={(f) => { setFilters(f); setFiltersOpen(false); }} />
                )}
              </>
            ) : (
              <Onboarding key={t.intro} tone={t.intro} onComplete={completeOnboarding} />
            )}
          </div>
        </IOSDevice>

        <TweaksPanel>
          <TweakSection label="Theme" />
          <TweakToggle label="Nocturnal (dark)" value={t.dark} onChange={(v) => setTweak("dark", v)} />
          <TweakColor label="Accent" value={t.accent}
            options={["#FF5A4D", "#FF7A1A", "#D6149A"]}
            onChange={(v) => setTweak("accent", v)} />
          <TweakSection label="Onboarding" />
          <TweakRadio label="Intro tone" value={t.intro} options={["Minimal", "Editorial"]}
            onChange={(v) => { setTweak("intro", v); setOnboarded(false); }} />
          <TweakButton label="Replay onboarding" onClick={() => setOnboarded(false)} />
          <TweakSection label="Home feed" />
          <TweakRadio label="Layout" value={t.home} options={["Editorial", "Compact"]}
            onChange={(v) => setTweak("home", v)} />
        </TweaksPanel>
      </div>
    </ThemeCtx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
