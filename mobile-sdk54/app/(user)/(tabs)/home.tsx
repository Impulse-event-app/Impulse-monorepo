import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import {
  categoryOptions,
  DEFAULT_FILTERS,
  activeFilterCount,
  applyFilters,
} from '../../../src/data';
import { getHuddle, submitBallot, ApiError, ApiHuddle } from '../../../src/api';
import { fontMono, fontUI, useApp } from '../../../src/theme';
import {
  Avatar,
  Btn,
  Chip,
  DropCardEditorial,
  EmptyState,
  FadeIn,
  Glass,
  HuddleMark,
  LargeTitle,
  LiveDot,
  LocPill,
  NUM,
  NavBar,
  Radar,
  ReadableColumn,
  Skeleton,
  TextBtn,
  Touchable,
  ViewSwitch,
  Wordmark,
  dropA11yLabel,
  useNavTop,
  useScrolled,
} from '../../../src/components';
import { ChevronRight, Filter } from '../../../src/icons';
import MapScreen from '../../../src/MapScreen';
import { useRequireAuth } from '../../../src/auth';
import { hapticError, hapticSelection, hapticSuccess } from '../../../src/haptics';
import { FLOATING_TAB_CLEARANCE } from './_layout';

// One-line status for the home huddle card, derived from the live huddle.
// `live` marks the states that are waiting on this user.
function describeHuddle(h: ApiHuddle): { title: string; sub: string; live: boolean } {
  const voted = h.participants.filter((m) => m.has_voted).length;
  const settled = h.paid_count;
  const me = h.participants.find((m) => m.is_me);
  switch (h.status) {
    case 'voting':
      return me?.has_voted
        ? { title: 'Waiting on votes', sub: `${voted} of ${h.group_size} voted`, live: false }
        : { title: 'Your huddle is live', sub: 'Vote your top 3', live: true };
    case 'collecting':
      if (!h.split_confirmed) {
        return h.is_initiator
          ? { title: "It's decided.", sub: 'Choose how to split it', live: true }
          : { title: "It's decided.", sub: `${h.initiator_name} is sorting the split`, live: false };
      }
      return h.my_share?.status === 'unpaid'
        ? { title: "It's decided.", sub: 'Confirm your share', live: true }
        : { title: 'Almost there', sub: `${settled} of ${h.group_size} in`, live: false };
    case 'confirmed':
      return { title: 'Group code ready', sub: 'Show it at the door', live: true };
    case 'redeemed':
      return { title: 'Huddle done', sub: 'Enjoy the night', live: false };
    default:
      return { title: 'Your huddle', sub: 'Open it', live: false };
  }
}

function FilterButton({ count, onPress }: { count: number; onPress: () => void }) {
  const { T } = useApp();
  const ink = count ? T.accentInk : T.text;
  return (
    <Touchable
      onPress={onPress}
      scale={0.96}
      hitSlop={{ top: 5, bottom: 5 }}
      accessibilityLabel={count ? `Filters, ${count} on` : 'Filters'}
    >
      <View
        style={{
          minHeight: 34, paddingVertical: 4, paddingHorizontal: 13, borderCurve: 'continuous', borderRadius: 10, backgroundColor: count ? T.accent : T.fill,
          flexDirection: 'row', alignItems: 'center', gap: 7,
        }}
      >
        <Filter size={17} color={ink} />
        <Text style={{ ...fontUI(500), fontSize: 15, letterSpacing: -0.12, color: ink, ...NUM }}>
          {count ? `Filters · ${count}` : 'Filters'}
        </Text>
      </View>
    </Touchable>
  );
}

function SectionHead({ title, count }: { title: string; count: number }) {
  const { T } = useApp();
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={`${title}, ${count} ${count === 1 ? 'drop' : 'drops'}`}
      style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 30, marginBottom: 12 }}
    >
      <Text style={{ ...fontUI(600), fontSize: 20, letterSpacing: -0.36, color: T.text }}>{title}</Text>
      <Text style={{ ...fontMono(400, 13), fontSize: 13, color: T.muted }}>{count}</Text>
    </View>
  );
}

/** Stand-in drop cards, shaped like DropCardEditorial, until the first deals fetch lands. */
function DropListSkeleton() {
  const { T } = useApp();
  return (
    <View accessible accessibilityLabel="Loading drops">
      <View style={{ marginTop: 30, marginBottom: 12 }}>
        <Skeleton width={96} height={20} />
      </View>
      <View style={{ gap: 16 }}>
        {[0, 1].map((i) => (
          <View key={i} style={{ backgroundColor: T.surface, borderCurve: 'continuous', borderRadius: 22, borderWidth: 1, borderColor: T.line }}>
            <View style={{ margin: 8, marginBottom: 0 }}>
              <Skeleton height={162} radius={15} />
            </View>
            <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 18, gap: 10 }}>
              <Skeleton width="60%" height={22} />
              <Skeleton width="45%" height={13} />
              <Skeleton width={110} height={26} style={{ marginTop: 6 }} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function HuddleCard({ title, sub, live, onPress }: { title: string; sub: string; live?: boolean; onPress: () => void }) {
  const { T } = useApp();
  return (
    <Touchable onPress={onPress} scale={0.99} accessibilityLabel={`${title}, ${sub}`}>
      <View
        style={{
          backgroundColor: T.surface, borderCurve: 'continuous', borderRadius: 16, borderWidth: 1, borderColor: T.line,
          paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12,
        }}
      >
        <HuddleMark size={36} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={2} style={{ ...fontUI(500), fontSize: 17, letterSpacing: -0.19, color: T.text }}>{title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 2 }}>
            {live && <LiveDot color={T.accent} blink />}
            <Text numberOfLines={2} style={{ ...fontUI(live ? 500 : 400, 13), fontSize: 13, color: live ? T.accent : T.muted, flexShrink: 1 }}>{sub}</Text>
          </View>
        </View>
        <ChevronRight size={8} color={T.faint} />
      </View>
    </Touchable>
  );
}

export default function HomeScreen() {
  const {
    T, filters, setFilters, drops, dealsLoaded, dealsFailed, refreshDeals, retryDeals, profile, signedIn,
    voteSession, voteRanking, toggleVotePick, clearVoting,
    activeHuddle, setActiveHuddle,
  } = useApp();
  // What's on is one feed seen two ways. The map mounts on first use and then
  // stays, so switching back keeps both the list's scroll and the map's camera.
  const [view, setView] = useState<'list' | 'map'>('list');
  const [mapMounted, setMapMounted] = useState(false);
  const toggleView = () => {
    hapticSelection();
    setMapMounted(true);
    setView((v) => (v === 'list' ? 'map' : 'list'));
  };
  const displayName = profile.name || (profile.email ? profile.email.split('@')[0] : '') || 'You';
  const initials = displayName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'U';
  const router = useRouter();
  const requireAuth = useRequireAuth();
  const navTop = useNavTop();
  const [scrolled, onScroll] = useScrolled();
  const [submitting, setSubmitting] = useState(false);

  // Huddle voting mode: the feed becomes the ballot. Only deals that fit the
  // group (candidateIds) are pickable.
  const voting = !!voteSession;
  const candidateSet = new Set(voteSession?.candidateIds ?? []);

  const submitBallot_ = async () => {
    if (!voteSession || voteRanking.length === 0) return;
    setSubmitting(true);
    try {
      await submitBallot(voteSession.huddleId, voteRanking);
      hapticSuccess();
      const hid = voteSession.huddleId;
      setActiveHuddle({ huddleId: hid });   // home card now tracks it
      clearVoting();
      router.push(`/(user)/huddle/${hid}`);
    } catch (err) {
      hapticError();
      Alert.alert('Could not submit', err instanceof ApiError ? err.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Poll the active huddle so the home card shows its live status (waiting for
  // votes / decided / code ready). Cleared when the huddle ends.
  const [huddleStatus, setHuddleStatus] = useState<ApiHuddle | null>(null);
  useEffect(() => {
    if (!activeHuddle || voting) { setHuddleStatus(null); return; }
    let alive = true;
    const tick = async () => {
      try {
        const h = await getHuddle(activeHuddle.huddleId);
        if (!alive) return;
        // Terminal states clear the card (and its persisted value).
        if (['expired', 'collapsed', 'redeemed', 'cancelled'].includes(h.status)) {
          setActiveHuddle(null);
          setHuddleStatus(null);
        } else {
          setHuddleStatus(h);
        }
      } catch (err) {
        // Stale/removed huddle → drop it. Other errors are transient; keep state.
        if (alive && err instanceof ApiError && (err.status === 404 || err.status === 403)) {
          setActiveHuddle(null);
          setHuddleStatus(null);
        }
      }
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(t); };
  }, [activeHuddle, voting]);   // eslint-disable-line react-hooks/exhaustive-deps

  const huddleBar = huddleStatus ? describeHuddle(huddleStatus) : null;
  const openHuddle = () => {
    if (!activeHuddle) return;
    router.push(`/(user)/huddle/${activeHuddle.huddleId}`);
  };

  const areaLabel = filters.areas.length
    ? filters.areas.length === 1 ? filters.areas[0] : `${filters.areas[0]} +${filters.areas.length - 1}`
    : 'All Sydney';

  const quickCat = (c: string) => {
    if (c === 'All') setFilters({ ...filters, cats: [] });
    else
      setFilters({
        ...filters,
        cats: filters.cats.includes(c) && filters.cats.length === 1 ? [] : [c],
      });
  };
  const isChipOn = (c: string) => (c === 'All' ? filters.cats.length === 0 : filters.cats.includes(c));

  // Preferred activities float to the top within each section (stable sort
  // keeps the filter ordering within each group).
  const preferred = new Set(profile.acts);
  const filtered = applyFilters(drops, filters);
  const boosted = preferred.size
    ? [...filtered].sort((a, b) => Number(preferred.has(b.cat)) - Number(preferred.has(a.cat)))
    : filtered;
  const now = boosted.filter((d) => d.status === 'now');
  const later = boosted.filter((d) => d.status === 'later');
  const activeCount = activeFilterCount(filters);

  const openDrop = (id: string) => router.push(`/(user)/event/${id}`);

  // In voting mode a tap toggles the pick (candidates only); otherwise it opens
  // the deal. A rank badge overlays each card.
  const onCard = (id: string) => {
    if (voting) {
      if (candidateSet.has(id)) {
        hapticSelection();
        toggleVotePick(id);
      }
    } else {
      openDrop(id);
    }
  };

  const renderCard = (d: (typeof drops)[number], i: number) => {
    const rank = voteRanking.indexOf(d.id);
    const pickable = voting && candidateSet.has(d.id);
    const a11yLabel = voting
      ? `${dropA11yLabel(d)}, ${rank >= 0 ? `your pick ${rank + 1}` : pickable ? 'not picked' : 'not on this ballot'}`
      : undefined;
    const a11yHint = voting && pickable ? (rank >= 0 ? 'Double-tap to remove this pick.' : 'Double-tap to pick.') : undefined;
    return (
      <FadeIn key={d.id} delay={Math.min(i, 8) * 55}>
        {/* Dimming lives on an inner view: FadeIn animates its own opacity. */}
        <View style={{ opacity: voting && !pickable ? 0.4 : 1 }}>
          <DropCardEditorial d={d} onPress={() => onCard(d.id)} a11yLabel={a11yLabel} a11yHint={a11yHint} />
          {voting && (
            <View
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              // Bottom-right of the photo (inset 8, 162pt tall): the top right is the discount badge's.
              style={{ position: 'absolute', top: 130, right: 18 }}
            >
              {rank >= 0 ? (
                <View style={{ width: 30, height: 30, borderCurve: 'continuous', borderRadius: 10, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' }}>
                  <Text maxFontSizeMultiplier={1} style={{ ...fontMono(600), fontSize: 15, color: T.accentInk }}>{rank + 1}</Text>
                </View>
              ) : (
                <Glass radius={10} style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
                  <Text maxFontSizeMultiplier={1} style={{ ...fontUI(500), fontSize: 17, color: T.text }}>{pickable ? '+' : '–'}</Text>
                </Glass>
              )}
            </View>
          )}
        </View>
      </FadeIn>
    );
  };

  // A render helper, not a component — defining a component inside render
  // would remount the cards (and replay their fade) on every state change.
  const section = (title: string, list: typeof drops, from = 0) =>
    list.length ? (
      <>
        <SectionHead title={title} count={list.length} />
        <View style={{ gap: 16 }}>{list.map((d, i) => renderCard(d, from + i))}</View>
      </>
    ) : null;

  const voteLabel = voteRanking.length === 0
    ? 'Pick your top 3'
    : voteRanking.length === 3
    ? 'Lock in my vote'
    : `Submit ${voteRanking.length} pick${voteRanking.length > 1 ? 's' : ''}`;

  // The pull spinner is for the pull only: the first load and background
  // refreshes (foregrounding) already have the skeleton or stale cards.
  const [pulling, setPulling] = useState(false);
  const onPull = async () => {
    setPulling(true);
    try { await refreshDeals(); } finally { setPulling(false); }
  };

  // A huddle ballot is the list, so voting always shows it.
  const shown = voting ? 'list' : view;

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <View style={{ flex: 1, display: shown === 'list' ? 'flex' : 'none' }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingTop: navTop, paddingBottom: (voting ? 90 : 20) + FLOATING_TAB_CLEARANCE }}
          refreshControl={
            <RefreshControl refreshing={pulling} onRefresh={onPull} tintColor={T.accent} progressViewOffset={navTop} />
          }
        >
          <ReadableColumn>
            <View style={{ paddingHorizontal: 16 }}>
              <LargeTitle>What's on</LargeTitle>
              <View style={{ marginTop: 6 }}>
                <LocPill label={areaLabel} onPress={() => router.push('/(user)/area')} />
              </View>

              <View style={{ marginTop: 18 }}>
                {voting ? (
                  /* Voting mode — the feed below is now the ballot */
                  <View
                    style={{
                      borderCurve: 'continuous', borderRadius: 16, backgroundColor: T.accentSoft, paddingHorizontal: 14, paddingVertical: 12,
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                    }}
                  >
                    <HuddleMark size={36} />
                    <View style={{ flex: 1 }} accessible accessibilityLabel="Pick your top 3. Tap in order. Your vote is private.">
                      <Text style={{ ...fontUI(500), fontSize: 17, letterSpacing: -0.19, color: T.text }}>
                        Pick your top 3
                      </Text>
                      <Text style={{ ...fontUI(400), fontSize: 13, lineHeight: 18, color: T.muted, marginTop: 2 }}>
                        Tap in order. Your vote is private.
                      </Text>
                    </View>
                    <TextBtn onPress={clearVoting} color={T.accent} size={15} weight={500}>Cancel</TextBtn>
                  </View>
                ) : huddleBar ? (
                  <HuddleCard title={huddleBar.title} sub={huddleBar.sub} live={huddleBar.live} onPress={openHuddle} />
                ) : (
                  <HuddleCard
                    title="Start a huddle"
                    sub="Vote with friends, split the deposit"
                    onPress={() => requireAuth(() => router.push('/(user)/huddle/new'))}
                  />
                )}
              </View>
            </View>

            {/* category rail */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 6, alignItems: 'center' }}
            >
              <FilterButton count={activeCount} onPress={() => router.push('/(user)/filters')} />
              {['All', ...categoryOptions(drops)].map((c) => (
                <Chip key={c} active={isChipOn(c)} onPress={() => quickCat(c)}>
                  {c}
                </Chip>
              ))}
            </ScrollView>

            <View style={{ paddingHorizontal: 16 }}>
              {drops.length === 0 && dealsFailed ? (
                <EmptyState
                  mark={false}
                  style={{ marginTop: 80 }}
                  title="Couldn't load drops."
                  body="Check your connection and try again."
                  action={
                    <TextBtn onPress={retryDeals} color={T.accent} weight={500}>
                      Try again
                    </TextBtn>
                  }
                />
              ) : !dealsLoaded && drops.length === 0 ? (
                <DropListSkeleton />
              ) : (
                <>
                  {section('On now', now)}
                  {section('Later tonight', later, now.length)}
                  {filtered.length === 0 && (
                    <EmptyState
                      mark={false}
                      style={{ marginTop: 80 }}
                      title="Nothing matches."
                      body="Drop a suburb or raise the price."
                      action={
                        <TextBtn onPress={() => setFilters(DEFAULT_FILTERS)} color={T.accent} weight={500}>
                          Clear filters
                        </TextBtn>
                      }
                    />
                  )}
                </>
              )}
            </View>
          </ReadableColumn>
        </ScrollView>

        <NavBar
          title="What's on"
          scrolled={scrolled}
          hideLeadingOnScroll
          leading={
            <>
              <Radar size={30} decorative />
              <Wordmark size={19} />
            </>
          }
          trailing={
            <>
              {/* A huddle ballot is the list, so there's no map while voting. */}
              {!voting && <ViewSwitch to="map" onPress={toggleView} />}
              {signedIn ? (
                <Touchable onPress={() => router.push('/(user)/(tabs)/profile')} accessibilityLabel="Your profile" hitSlop={5} scale={0.96}>
                  <Avatar initials={initials} />
                </Touchable>
              ) : (
                <TextBtn
                  onPress={() => router.push({ pathname: '/(user)/sign-in', params: { next: '/home', back: '1' } })}
                  color={T.accent}
                  weight={500}
                >
                  Sign in
                </TextBtn>
              )}
            </>
          }
        />
      </View>

      {mapMounted && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: shown === 'map' ? 'flex' : 'none' }}>
          <MapScreen onShowList={toggleView} />
        </View>
      )}

      {/* Voting submit — floats clear above the tab bar */}
      {voting && (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: FLOATING_TAB_CLEARANCE - 4, paddingHorizontal: 16 }}>
          <ReadableColumn>
            {submitting ? (
              <View style={{ height: 52, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={T.accent} accessibilityLabel="Submitting your vote" />
              </View>
            ) : (
              <Btn full onPress={submitBallot_} disabled={voteRanking.length === 0} accessibilityLabel={voteLabel}>
                <View style={{ flexDirection: 'row', gap: 5 }}>
                  {[0, 1, 2].map((i) => (
                    <View
                      key={i}
                      style={{
                        width: i < voteRanking.length ? 16 : 6, height: 6, borderCurve: 'continuous', borderRadius: 3,
                        backgroundColor: i < voteRanking.length ? T.accentInk : 'rgba(255,255,255,0.4)',
                      }}
                    />
                  ))}
                </View>
                <Text style={{ ...fontUI(500), fontSize: 17, letterSpacing: -0.19, color: T.accentInk }}>
                  {voteLabel}
                </Text>
              </Btn>
            )}
          </ReadableColumn>
        </View>
      )}
    </View>
  );
}
