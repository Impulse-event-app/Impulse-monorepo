// Post-login onboarding. This route is only ever reached with a live session
// (app/index.tsx and app/(user)/sign-in.tsx route unauthenticated users to
// /sign-in), so it's a plain forward-only flow that always starts at step 0 —
// no sign-in panel, no scroll-resume, none of the state that a web OAuth reload
// used to wipe. A guard below redirects anyone who lands here without a session
// (or who's already onboarded) just in case.
import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ACCESSIBILITY_OPTIONS, CATEGORIES, SYDNEY_SUBURBS } from '../../src/data';
import { fontDisplay, fontMono, fontUI, useApp } from '../../src/theme';
import { Btn } from '../../src/components';
import { GlyphBell, GlyphPin, Search } from '../../src/icons';
import { isOnboarded, markOnboarded, syncUserProfile } from '../../src/auth';
import { requestLocationAccess, requestNotificationAccess, syncPushToken } from '../../src/permissions';
import { supabase } from '../../src/supabase';
import { Lede, Panel, usePanelWidth } from '../../src/onboardingUI';
import { useWallet, WalletPanel } from '../../src/wallet';

const SUBURBS = ['Sydney CBD', 'Surry Hills', 'Newtown', 'Bondi', 'Marrickville', 'Enmore', 'Darlinghurst', 'Redfern', 'Chippendale', 'Glebe', 'Paddington', 'Manly'];
const ACTIVITIES = CATEGORIES.filter((c) => c !== 'All');
const STEPS = 7; // location, notifications, age, suburb, accessibility, activities, card

function PermIcon({ children }: { children: React.ReactNode }) {
  const { T } = useApp();
  return (
    <View style={{ width: 116, height: 116, borderRadius: 30, backgroundColor: T.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 30 }}>
      {children}
    </View>
  );
}

export default function Onboarding() {
  const { T, setProfile } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const W = usePanelWidth();
  const [page, setPage] = useState(0);
  const [suburb, setSuburb] = useState<string | null>(null);
  const [acts, setActs] = useState<string[]>([]);
  const [access, setAccess] = useState<string[]>([]);
  const [ageDeclined, setAgeDeclined] = useState(false);
  const [ageBracket, setAgeBracket] = useState<number | null>(null);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [permBusy, setPermBusy] = useState(false);
  const [query, setQuery] = useState('');
  // Gate rendering until the session guard resolves, so we never flash the
  // onboarding steps at someone who's about to be redirected away.
  const [ready, setReady] = useState(false);
  const wallet = useWallet();
  const hasSavedCard = !!wallet.cards?.length;

  // Guard: this flow is for signed-in, not-yet-onboarded users only.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/(user)/sign-in'); return; }
      if (isOnboarded(session)) { router.replace('/(user)/home'); return; }
      setReady(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goTo = (i: number) => {
    const p = Math.max(0, Math.min(STEPS - 1, i));
    scrollRef.current?.scrollTo({ x: p * W, animated: true });
    setPage(p);
  };
  const next = () => goTo(page + 1);

  // Re-anchor on viewport change (mobile web: keyboard, URL bar, rotation).
  // Pages resize with the window, so a stale scroll offset would leave the
  // current step half off-screen — and scrollEnabled={false} means the user
  // can't swipe back onto it.
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: page * W, animated: false });
  }, [W, page]);

  // Ask the OS for location; if we can reverse-geocode a suburb, prefill the
  // home-base step so the user just confirms it.
  const allowLocation = async () => {
    setPermBusy(true);
    try {
      const { suburb: found } = await requestLocationAccess();
      if (found && SYDNEY_SUBURBS.includes(found)) setSuburb(found);
    } finally {
      setPermBusy(false);
      next();
    }
  };

  const allowNotifications = async () => {
    setPermBusy(true);
    try {
      const granted = await requestNotificationAccess();
      setNotifEnabled(granted);
      if (granted) syncPushToken().catch(() => {});   // register device for pushes
    } finally {
      setPermBusy(false);
      next();
    }
  };

  const complete = async () => {
    if (suburb || acts.length) {
      setProfile((p) => ({ ...p, suburb: suburb || p.suburb, acts: acts.length ? acts : p.acts }));
    }
    // Fire-and-forget profile sync to public.users
    syncUserProfile({
      suburb: suburb ?? undefined,
      acts,
      accessibility_needs: access,
      notifications_enabled: notifEnabled,
      age_bracket: ageBracket ?? undefined,
    }).catch(console.warn);
    // Record that onboarding is done so we never route them back here.
    await markOnboarded();
    router.replace('/(user)/home');
  };

  const toggleAct = (a: string) => setActs((p) => (p.includes(a) ? p.filter((x) => x !== a) : [...p, a]));
  const toggleAccess = (a: string) => setAccess((p) => (p.includes(a) ? p.filter((x) => x !== a) : [...p, a]));

  const skipLink = (label: string, onPress: () => void) => (
    <Pressable onPress={onPress} style={{ paddingVertical: 6, alignItems: 'center' }}>
      <Text style={{ fontFamily: fontUI(400), fontSize: 15, color: T.muted }}>{label}</Text>
    </Pressable>
  );

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: T.bg }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      {/* Progress dots — one per step, read-only (no tap-to-jump) so no step
          can be skipped from the header. */}
      <View style={{ position: 'absolute', top: insets.top + 6, left: 0, right: 0, zIndex: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[...Array(STEPS)].map((_, i) => {
            const active = i === page;
            return (
              <View key={i} style={{ width: active ? 22 : 7, height: 7, borderRadius: 4, backgroundColor: active ? T.accent : T.line2 }} />
            );
          })}
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        {/* 0 — location */}
        <Panel
          footer={
            <>
              <Btn full onPress={allowLocation} disabled={permBusy}>
                {permBusy ? 'Asking…' : 'Allow location'}
              </Btn>
              {skipLink('Not now', next)}
            </>
          }
        >
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
            <PermIcon><GlyphPin color={T.accent} /></PermIcon>
            <Text style={{ fontFamily: fontMono(400), fontSize: 11.5, letterSpacing: 1.4, textTransform: 'uppercase', color: T.accent, marginBottom: 12 }}>Find your area</Text>
            <Text style={{ fontFamily: fontDisplay(700), fontSize: 30, lineHeight: 33, letterSpacing: -0.9, color: T.text }}>What's on near you</Text>
            <Text style={{ marginTop: 13, fontFamily: fontUI(400), fontSize: 16.5, lineHeight: 25, color: T.muted, maxWidth: 320 }}>
              Impulse uses your location to surface drops within a few suburbs — never in the background, only while you're looking.
            </Text>
          </View>
        </Panel>

        {/* 1 — notifications */}
        <Panel
          footer={
            <>
              <Btn full onPress={allowNotifications} disabled={permBusy}>
                {permBusy ? 'Asking…' : 'Turn on notifications'}
              </Btn>
              {skipLink('Not now', next)}
            </>
          }
        >
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
            <PermIcon><GlyphBell color={T.accent} /></PermIcon>
            <Text style={{ fontFamily: fontMono(400), fontSize: 11.5, letterSpacing: 1.4, textTransform: 'uppercase', color: T.accent, marginBottom: 12 }}>Stay in the loop</Text>
            <Text style={{ fontFamily: fontDisplay(700), fontSize: 30, lineHeight: 33, letterSpacing: -0.9, color: T.text }}>Get the drop</Text>
            <Text style={{ marginTop: 13, fontFamily: fontUI(400), fontSize: 16.5, lineHeight: 25, color: T.muted, maxWidth: 320 }}>
              A nudge when something good opens up near you tonight. No daily blast, no noise — just the ones worth leaving the house for.
            </Text>
          </View>
        </Panel>

        {/* 2 — age */}
        <Panel
          footer={
            <>
              <Btn full onPress={() => { setAgeBracket(18); next(); }}>Yes, I'm 18 or over</Btn>
              {skipLink("I'm under 18", () => {
                setAgeDeclined(true);
                setAgeBracket(null);
                setTimeout(next, 650);
              })}
            </>
          }
        >
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
            <PermIcon>
              <Text style={{ fontFamily: fontDisplay(700), fontSize: 46, letterSpacing: -1.8, color: T.accent }}>
                18<Text style={{ fontSize: 28 }}>+</Text>
              </Text>
            </PermIcon>
            <Text style={{ fontFamily: fontMono(400), fontSize: 11.5, letterSpacing: 1.4, textTransform: 'uppercase', color: T.accent, marginBottom: 12 }}>Quick one</Text>
            <Text style={{ fontFamily: fontDisplay(700), fontSize: 30, lineHeight: 33, letterSpacing: -0.9, color: T.text }}>Are you 18 or over?</Text>
            <Text style={{ marginTop: 13, fontFamily: fontUI(400), fontSize: 16.5, lineHeight: 25, color: T.muted, maxWidth: 320 }}>
              Some venues serve alcohol, so we check once. We'll still show you the all-ages stuff either way.
            </Text>
            {ageDeclined && (
              <View style={{ marginTop: 18, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: T.accentSoft, borderRadius: 12, maxWidth: 320 }}>
                <Text style={{ fontFamily: fontUI(400), fontSize: 14, color: T.text }}>No worries — we'll hide 18+ venues and show you everything else.</Text>
              </View>
            )}
          </View>
        </Panel>

        {/* 3 — suburb */}
        <Panel
          top={insets.top + 24}
          footer={<Btn full onPress={next} disabled={!suburb}>{suburb ? `Set to ${suburb}` : 'Pick your suburb'}</Btn>}
        >
          <Lede kicker="Home base" title="Where do you call home?" body="We'll sort drops by what's closest. Change it any time." />
          <View style={{ paddingHorizontal: 22, paddingTop: 20 }}>
            <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: T.surface, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 12, marginBottom: 16 }, T.shadow]}>
              <Search size={17} color={T.muted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search Sydney suburbs"
                placeholderTextColor={T.faint}
                autoCorrect={false}
                style={{ flex: 1, fontFamily: fontUI(400), fontSize: 15, color: T.text, padding: 0 }}
              />
              {query.length > 0 && (
                <Pressable onPress={() => setQuery('')} hitSlop={8}>
                  <Text style={{ fontFamily: fontUI(400), fontSize: 15, color: T.muted }}>✕</Text>
                </Pressable>
              )}
            </View>
            {query.trim().length > 0 && (
              <View style={[{ backgroundColor: T.surface, borderRadius: 14, marginBottom: 16, overflow: 'hidden' }, T.shadow]}>
                {SYDNEY_SUBURBS
                  .filter((s) => s.toLowerCase().includes(query.trim().toLowerCase()))
                  .slice(0, 6)
                  .map((s, i, arr) => (
                    <Pressable
                      key={s}
                      onPress={() => { setSuburb(s); setQuery(''); }}
                      style={{ paddingHorizontal: 15, paddingVertical: 13, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: T.line }}
                    >
                      <Text style={{ fontFamily: fontUI(500), fontSize: 15, color: T.text }}>{s}</Text>
                    </Pressable>
                  ))}
                {SYDNEY_SUBURBS.filter((s) => s.toLowerCase().includes(query.trim().toLowerCase())).length === 0 && (
                  <Text style={{ fontFamily: fontUI(400), fontSize: 14, color: T.muted, paddingHorizontal: 15, paddingVertical: 13 }}>
                    No matching suburb — try a nearby one
                  </Text>
                )}
              </View>
            )}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
              {(suburb && !SUBURBS.includes(suburb) ? [suburb, ...SUBURBS] : SUBURBS).map((s) => {
                const on = suburb === s;
                return (
                  <Pressable key={s} onPress={() => setSuburb(s)} style={{ height: 36, paddingHorizontal: 16, borderRadius: 999, backgroundColor: on ? T.chipOn : T.chipBg, justifyContent: 'center' }}>
                    <Text style={{ fontFamily: fontUI(500), fontSize: 14.5, color: on ? T.chipOnInk : T.chipText }}>{s}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Panel>

        {/* 4 — accessibility */}
        <Panel
          top={insets.top + 24}
          footer={
            <>
              <Btn full onPress={next}>{access.length === 0 ? 'None of these — continue' : `Continue — ${access.length} selected`}</Btn>
              {skipLink('Skip', next)}
            </>
          }
        >
          <Lede
            kicker="Access needs"
            title="Any accessibility requirements?"
            body="Pick anything that applies. We'll highlight venues that support your needs. This stays private and you can change it later."
          />
          <View style={{ paddingHorizontal: 22, paddingTop: 22, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {ACCESSIBILITY_OPTIONS.map((a) => {
              const on = access.includes(a);
              return (
                <Pressable
                  key={a}
                  onPress={() => toggleAccess(a)}
                  style={{ paddingHorizontal: 16, paddingVertical: 11, borderRadius: 14, backgroundColor: on ? T.accent : T.chipBg, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                >
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: on ? T.accentInk : T.faint }} />
                  <Text style={{ fontFamily: fontUI(500), fontSize: 15.5, letterSpacing: -0.16, color: on ? T.accentInk : T.text }}>{a}</Text>
                </Pressable>
              );
            })}
          </View>
        </Panel>

        {/* 5 — activities */}
        <Panel
          top={insets.top + 24}
          footer={
            <>
              <Btn full onPress={next} disabled={acts.length === 0}>{acts.length === 0 ? 'Pick a few' : `Continue — ${acts.length} picked`}</Btn>
              {skipLink('Skip — show me everything', next)}
            </>
          }
        >
          <Lede kicker="Almost there" title="What are you into?" body="We'll bump these to the top. You can change it later." />
          <View style={{ paddingHorizontal: 22, paddingTop: 22, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {ACTIVITIES.map((a) => {
              const on = acts.includes(a);
              return (
                <Pressable
                  key={a}
                  onPress={() => toggleAct(a)}
                  style={{ paddingHorizontal: 16, paddingVertical: 11, borderRadius: 14, backgroundColor: on ? T.accent : T.chipBg, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                >
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: on ? T.accentInk : T.faint }} />
                  <Text style={{ fontFamily: fontUI(500), fontSize: 15.5, letterSpacing: -0.16, color: on ? T.accentInk : T.text }}>{a}</Text>
                </Pressable>
              );
            })}
          </View>
        </Panel>

        {/* 6 — card on file. Always skippable: a card wall at the end of
            onboarding is a good way to lose someone who hasn't booked yet.
            Skipping loses nothing — checkout still offers "save this card". */}
        <Panel
          top={insets.top + 24}
          footer={
            <>
              {hasSavedCard && <Btn full onPress={complete}>Done</Btn>}
              {skipLink(hasSavedCard ? 'Not now' : 'Skip — I\'ll add one when I book', complete)}
            </>
          }
        >
          <Lede
            kicker="Last bit"
            title="Book in one tap"
            body="Save a card now and claiming a drop is a single tap. Your card is held securely by our payment provider — Impulse never sees the number."
          />
          <View style={{ paddingHorizontal: 22, paddingTop: 24 }}>
            <WalletPanel wallet={wallet} depositLabel="Save card" />
          </View>
        </Panel>
      </ScrollView>
    </View>
  );
}
