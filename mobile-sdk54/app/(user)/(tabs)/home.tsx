import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import {
  CATEGORIES,
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
  TextBtn,
  Touchable,
  Wordmark,
  dropA11yLabel,
  useNavTop,
  useScrolled,
} from '../../../src/components';
import { ChevronRight, Filter } from '../../../src/icons';
import { useRequireAuth } from '../../../src/auth';
import { hapticError, hapticSelection, hapticSuccess } from '../../../src/haptics';
import { FLOATING_TAB_CLEARANCE } from './_layout';

// One-line status for the home huddle card, derived from the live huddle.
// `live` marks the states that are waiting on this user.
function describeHuddle(h: ApiHuddle): { title: string; sub: string; live: boolean } {
  const voted = h.members.filter((m) => m.has_voted).length;
  const paid = h.members.filter((m) => m.deposit_status === 'paid').length;
  const me = h.members.find((m) => m.id === h.my_member_id);
  switch (h.status) {
    case 'open':
      return me?.has_voted
        ? { title: 'Waiting on votes', sub: `${voted} of ${h.group_size} voted`, live: false }
        : { title: 'Your huddle is live', sub: 'Vote your top 3', live: true };
    case 'awaiting_payment':
      return me?.deposit_status === 'paid'
        ? { title: 'Waiting on payments', sub: `${paid} of ${h.group_size} paid`, live: false }
        : { title: "It's decided.", sub: 'Pay your share', live: true };
    case 'active':
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
          minHeight: 34, paddingVertical: 4, paddingHorizontal: 13, borderRadius: 8, backgroundColor: count ? T.accent : T.fill,
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

function HuddleCard({ title, sub, live, onPress }: { title: string; sub: string; live?: boolean; onPress: () => void }) {
  const { T } = useApp();
  return (
    <Touchable onPress={onPress} scale={0.99} accessibilityLabel={`${title}, ${sub}`}>
      <View
        style={{
          backgroundColor: T.surface, borderRadius: 14, borderWidth: 1, borderColor: T.line,
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
    T, filters, setFilters, drops, dealsLoading, refreshDeals, profile, signedIn,
    voteSession, voteRanking, toggleVotePick, clearVoting,
    activeHuddle, setActiveHuddle,
  } = useApp();
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
      await submitBallot(voteSession.huddleId, voteRanking, voteSession.memberToken);
      hapticSuccess();
      const hid = voteSession.huddleId;
      const mt = voteSession.memberToken;
      setActiveHuddle({ huddleId: hid, memberToken: mt });   // home card now tracks it
      clearVoting();
      router.push(`/(user)/huddle/${hid}${mt ? `?mt=${encodeURIComponent(mt)}` : ''}`);
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
        const h = await getHuddle(activeHuddle.huddleId, activeHuddle.memberToken);
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
    const mt = activeHuddle.memberToken;
    router.push(`/(user)/huddle/${activeHuddle.huddleId}${mt ? `?mt=${encodeURIComponent(mt)}` : ''}`);
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
              style={{ position: 'absolute', top: 12, right: 12 }}
            >
              {rank >= 0 ? (
                <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' }}>
                  <Text maxFontSizeMultiplier={1} style={{ ...fontMono(600), fontSize: 15, color: T.accentInk }}>{rank + 1}</Text>
                </View>
              ) : (
                <Glass radius={8} style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
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

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingTop: navTop, paddingBottom: (voting ? 90 : 20) + FLOATING_TAB_CLEARANCE }}
        refreshControl={
          <RefreshControl refreshing={dealsLoading} onRefresh={refreshDeals} tintColor={T.accent} progressViewOffset={navTop} />
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
                    borderRadius: 14, backgroundColor: T.accentSoft, paddingHorizontal: 14, paddingVertical: 12,
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
            {CATEGORIES.map((c) => (
              <Chip key={c} active={isChipOn(c)} onPress={() => quickCat(c)}>
                {c}
              </Chip>
            ))}
          </ScrollView>

          <View style={{ paddingHorizontal: 16 }}>
            {dealsLoading && drops.length === 0 ? (
              <View style={{ alignItems: 'center', marginTop: 80 }}>
                <ActivityIndicator color={T.accent} accessibilityLabel="Loading drops" />
              </View>
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
                        width: i < voteRanking.length ? 16 : 6, height: 6, borderRadius: 3,
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
