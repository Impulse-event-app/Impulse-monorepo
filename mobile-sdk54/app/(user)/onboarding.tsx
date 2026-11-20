// Post-login onboarding. This route is only ever reached with a live session
// (app/index.tsx and app/(user)/sign-in.tsx route unauthenticated users to
// /sign-in), so it's a plain forward-only flow that always starts at step 0 —
// no sign-in panel, no scroll-resume, none of the state that a web OAuth reload
// used to wipe. A guard below redirects anyone who lands here without a session
// (or who's already onboarded) just in case.
import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ACCESSIBILITY_OPTIONS, CATEGORIES, SYDNEY_SUBURBS } from '../../src/data';
import { fontMono, fontUI, useApp } from '../../src/theme';
import { Btn, Chip, Group, Label, Row, TextBtn } from '../../src/components';
import { Close, GlyphAccess, GlyphBell, GlyphCard, GlyphPin, Search } from '../../src/icons';
import { isOnboarded, markOnboarded, signOut, syncUserProfile } from '../../src/auth';
import { requestLocationAccess, requestNotificationAccess, syncPushToken } from '../../src/permissions';
import { supabase } from '../../src/supabase';
import { GlyphPlate, Lede, PageDots, Panel, usePagerWidth } from '../../src/onboardingUI';
import { useWallet, WalletPanel } from '../../src/wallet';
import { hasVerifiedPhone, PhoneVerify, PHONE_REASON } from '../../src/PhoneVerify';
import { syncContactIdentity } from '../../src/api';

const SUBURBS = ['Sydney CBD', 'Surry Hills', 'Newtown', 'Bondi', 'Marrickville', 'Enmore', 'Darlinghurst', 'Redfern', 'Chippendale', 'Glebe', 'Paddington', 'Manly'];
const ACTIVITIES = CATEGORIES.filter((c) => c !== 'All');
const STEPS = 8; // location, notifications, age, phone, suburb, accessibility, activities, card

export default function Onboarding() {
  const { T, setProfile } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [W, onPagerLayout] = usePagerWidth();
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
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const wallet = useWallet();
  const hasSavedCard = !!wallet.cards?.length;

  // Guard: this flow is for signed-in, not-yet-onboarded users only.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/(user)/sign-in'); return; }
      if (isOnboarded(session)) { router.replace('/(user)/home'); return; }
      if (hasVerifiedPhone(session)) {
        // Signed in by SMS code: the number is already verified.
        setVerifiedPhone(session.user.phone ?? null);
        syncContactIdentity().catch(() => {});
      }
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

  // Re-anchor on viewport change (mobile web: keyboard, URL bar; iPad:
  // rotation, Split View). Pages resize with the window, so a stale scroll
  // offset would leave the current step half off-screen — and
  // scrollEnabled={false} means the user can't swipe back onto it.
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
    setProfile((p) => ({
      ...p,
      suburb: suburb || p.suburb,
      acts: acts.length ? acts : p.acts,
      notifications: notifEnabled,
    }));
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

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: T.bg }} />;
  }

  const top = insets.top + 44;
  const matches = query.trim()
    ? SYDNEY_SUBURBS.filter((s) => s.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6)
    : [];

  // A centred permission-style step: glass plate, title, body.
  const centred = (glyph: React.ReactNode, title: string, body: string, extra?: React.ReactNode) => (
    <View style={{ flex: 1, justifyContent: 'center', paddingTop: top }}>
      <View style={{ paddingHorizontal: 22 }}>
        <GlyphPlate>{glyph}</GlyphPlate>
      </View>
      <Lede title={title} body={body} />
      {extra}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: T.bg, paddingLeft: insets.left, paddingRight: insets.right }}>
      {/* Progress — read-only, so no step can be skipped from the header. */}
      <View style={{ position: 'absolute', top: insets.top + 14, left: 22, right: 22, zIndex: 20 }}>
        <PageDots count={STEPS} index={page} />
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        onLayout={onPagerLayout}
        style={{ flex: 1 }}
      >
        {/* 0 — location */}
        <Panel
          width={W}
          inactive={page !== 0}
          footer={
            <>
              {/* One neutral button straight to the system prompt, which is
                  where the user decides (App Review 5.1.1(iv)). */}
              <Btn full onPress={allowLocation} disabled={permBusy}>Continue</Btn>
            </>
          }
        >
          {centred(
            <GlyphPin color={T.accent} />,
            'Find your home suburb',
            "Next, iOS asks to share your location. We use it once to suggest your suburb, and never in the background.",
          )}
        </Panel>

        {/* 1 — notifications */}
        <Panel
          width={W}
          inactive={page !== 1}
          footer={
            <>
              <Btn full onPress={allowNotifications} disabled={permBusy}>Continue</Btn>
            </>
          }
        >
          {centred(
            <GlyphBell color={T.accent} />,
            'Know when plans change',
            'Next, iOS asks about notifications. We only send booking updates and invites from friends.',
          )}
        </Panel>

        {/* 2 — age */}
        <Panel
          width={W}
          inactive={page !== 2}
          footer={
            <>
              {ageDeclined ? (
                // Accounts are 18+ (Terms), and the app is rated 18+ because
                // venues serve alcohol, so an under-18 answer ends here.
                <Btn full onPress={() => { signOut().catch(() => {}).finally(() => router.replace('/(user)/sign-in')); }}>Sign out</Btn>
              ) : (
                <>
                  <Btn full onPress={() => { setAgeBracket(18); next(); }}>Yes, I'm 18 or over</Btn>
                  <TextBtn onPress={() => setAgeDeclined(true)}>I'm under 18</TextBtn>
                </>
              )}
            </>
          }
        >
          {centred(
            <Text
              accessibilityElementsHidden
              importantForAccessibility="no"
              maxFontSizeMultiplier={1}
              style={{ ...fontMono(600), fontSize: 40, letterSpacing: -1.2, color: T.accent }}
            >
              18+
            </Text>,
            'Are you 18 or over?',
            'Some venues serve alcohol, so we check once.',
            ageDeclined ? (
              <View
                accessibilityLiveRegion="polite"
                style={{ marginTop: 18, marginHorizontal: 22, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: T.surface, borderCurve: 'continuous', borderRadius: 16, borderWidth: 1, borderColor: T.line, maxWidth: 360 }}
              >
                <Text style={{ ...fontUI(400), fontSize: 15, color: T.text }}>Sorry, Impulse is only for people aged 18 and over.</Text>
              </View>
            ) : undefined,
          )}
        </Panel>

        {/* 3 — mobile number (required; no skip). */}
        <Panel
          width={W}
          top={top + 18}
          inactive={page !== 3}
          footer={verifiedPhone ? <Btn full onPress={next}>Continue</Btn> : undefined}
        >
          <Lede title="Your mobile number" body={PHONE_REASON} />
          <View style={{ paddingHorizontal: 22, paddingTop: 24 }}>
            {verifiedPhone ? (
              <Text style={{ ...fontUI(500), fontSize: 17, color: T.text }}>{/^\d+$/.test(verifiedPhone) ? `+${verifiedPhone} is verified.` : 'Your number is verified.'}</Text>
            ) : page === 3 ? (
              <PhoneVerify
                onVerified={() => {
                  supabase.auth.getSession().then(({ data }) => setVerifiedPhone(data.session?.user?.phone || 'verified'));
                  next();
                }}
              />
            ) : null}
          </View>
        </Panel>

        {/* 4 — suburb */}
        <Panel
          width={W}
          top={top + 18}
          inactive={page !== 4}
          footer={<Btn full onPress={next} disabled={!suburb}>{suburb ? `Set to ${suburb}` : 'Pick your suburb'}</Btn>}
        >
          <Lede title="Where do you start from?" body="We sort by what's closest. Change it any time." />
          <View style={{ paddingHorizontal: 22, paddingTop: 22 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: T.fill, borderCurve: 'continuous', borderRadius: 10, paddingHorizontal: 14, minHeight: 44, marginBottom: 18 }}>
              <Search size={16} color={T.muted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search suburbs"
                placeholderTextColor={T.muted}
                accessibilityLabel="Search suburbs"
                autoCorrect={false}
                returnKeyType="search"
                style={{ flex: 1, alignSelf: 'stretch', paddingVertical: 10, ...fontUI(400), fontSize: 16, letterSpacing: -0.18, color: T.text }}
              />
              {query.length > 0 && (
                <Pressable onPress={() => setQuery('')} hitSlop={16} accessibilityRole="button" accessibilityLabel="Clear search">
                  <Close size={12} color={T.muted} />
                </Pressable>
              )}
            </View>
            {query.trim().length > 0 && (
              <Group style={{ marginTop: 0, marginBottom: 18 }} inset={16}>
                {matches.length ? (
                  matches.map((s) => (
                    <Row key={s} label={s} chevron={false} onPress={() => { setSuburb(s); setQuery(''); }} />
                  ))
                ) : (
                  <Row label={<Label>No match. Try a nearby suburb.</Label>} />
                )}
              </Group>
            )}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 10 }}>
              {(suburb && !SUBURBS.includes(suburb) ? [suburb, ...SUBURBS] : SUBURBS).map((s) => (
                <Chip key={s} active={suburb === s} onPress={() => setSuburb(s)}>{s}</Chip>
              ))}
            </View>
          </View>
        </Panel>

        {/* 5 — accessibility */}
        <Panel
          width={W}
          top={top + 18}
          inactive={page !== 5}
          footer={
            <>
              <Btn full onPress={next}>{access.length === 0 ? 'None of these' : `Continue · ${access.length} selected`}</Btn>
              <TextBtn onPress={next}>Skip</TextBtn>
            </>
          }
        >
          <View style={{ paddingHorizontal: 22 }}>
            <GlyphPlate><GlyphAccess color={T.accent} /></GlyphPlate>
          </View>
          <Lede title="Any access needs?" body="Pick what applies. We point out venues that support it. This stays private." />
          <View style={{ paddingHorizontal: 22, paddingTop: 24, flexDirection: 'row', flexWrap: 'wrap', columnGap: 9, rowGap: 10 }}>
            {ACCESSIBILITY_OPTIONS.map((a) => (
              <Chip key={a} active={access.includes(a)} onPress={() => toggleAccess(a)}>{a}</Chip>
            ))}
          </View>
        </Panel>

        {/* 6 — activities */}
        <Panel
          width={W}
          top={top + 18}
          inactive={page !== 6}
          footer={
            <>
              <Btn full onPress={next} disabled={acts.length === 0}>{acts.length === 0 ? 'Pick a few' : `Done · ${acts.length} picked`}</Btn>
              <TextBtn onPress={next}>Show me everything</TextBtn>
            </>
          }
        >
          <Lede title="What are you into?" body="We put these first. Change it later." />
          <View style={{ paddingHorizontal: 22, paddingTop: 24, flexDirection: 'row', flexWrap: 'wrap', columnGap: 9, rowGap: 10 }}>
            {ACTIVITIES.map((a) => (
              <Chip key={a} active={acts.includes(a)} onPress={() => toggleAct(a)}>{a}</Chip>
            ))}
          </View>
        </Panel>

        {/* 7 — card on file. Always skippable: a card wall at the end of
            onboarding is a good way to lose someone who hasn't booked yet.
            Skipping loses nothing — checkout still offers "save this card". */}
        <Panel
          width={W}
          top={top + 18}
          inactive={page !== 7}
          footer={
            <>
              {hasSavedCard && <Btn full onPress={complete}>Done</Btn>}
              <TextBtn onPress={complete}>{hasSavedCard ? 'Not now' : "Skip. I'll add one when I book"}</TextBtn>
            </>
          }
        >
          <View style={{ paddingHorizontal: 22 }}>
            <GlyphPlate><GlyphCard color={T.accent} /></GlyphPlate>
          </View>
          <Lede title="Book in one tap." body="Save a card and booking takes one tap. Impulse never sees the number." />
          <View style={{ paddingHorizontal: 22, paddingTop: 24 }}>
            <WalletPanel wallet={wallet} depositLabel="Add a card" />
          </View>
        </Panel>
      </ScrollView>
    </View>
  );
}
