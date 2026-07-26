import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CATEGORIES,
  DEFAULT_FILTERS,
  activeFilterCount,
  applyFilters,
} from '../../../src/data';
import { getHuddle, submitBallot, ApiError, ApiHuddle } from '../../../src/api';
import { fontDisplay, fontMono, fontUI, useApp } from '../../../src/theme';
import {
  Avatar,
  Chip,
  DropCardEditorial,
  HuddleMark,
  Logo,
  LocPill,
  PulseMark,
} from '../../../src/components';
import { Filter } from '../../../src/icons';
import { FLOATING_TAB_CLEARANCE } from './_layout';

// One-line status for the home huddle bar, derived from the live huddle.
function describeHuddle(h: ApiHuddle): { title: string; sub: string } {
  const voted = h.members.filter((m) => m.has_voted).length;
  const paid = h.members.filter((m) => m.deposit_status === 'paid').length;
  const me = h.members.find((m) => m.id === h.my_member_id);
  switch (h.status) {
    case 'open':
      return me?.has_voted
        ? { title: 'Waiting on votes', sub: `${voted} of ${h.group_size} have voted` }
        : { title: 'Your huddle is live', sub: 'Tap to vote your top 3' };
    case 'awaiting_payment':
      return me?.deposit_status === 'paid'
        ? { title: 'Waiting on payments', sub: `${paid} of ${h.group_size} have paid` }
        : { title: "It's decided!", sub: 'Tap to pay your share' };
    case 'active':
      return { title: 'Group code ready', sub: 'Tap to view your code' };
    case 'redeemed':
      return { title: 'Huddle complete', sub: 'Enjoy!' };
    default:
      return { title: 'Your huddle', sub: 'Tap to view' };
  }
}

function FilterButton({ count, onPress }: { count: number; onPress: () => void }) {
  const { T } = useApp();
  return (
    <Pressable
      onPress={onPress}
      style={{
        height: 36, paddingLeft: 13, paddingRight: 15, borderRadius: 999,
        backgroundColor: count ? T.accent : T.chipBg,
        flexDirection: 'row', alignItems: 'center', gap: 7,
      }}
    >
      <Filter size={15} color={count ? T.accentInk : T.text} />
      <Text style={{ fontFamily: fontUI(600), fontSize: 14.5, letterSpacing: -0.14, color: count ? T.accentInk : T.text }}>
        {count ? `Filters · ${count}` : 'Filters'}
      </Text>
    </Pressable>
  );
}

function SectionHead({ title, count }: { title: string; count: string }) {
  const { T } = useApp();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 9, marginTop: 26, marginBottom: 13, marginHorizontal: 4 }}>
      <Text style={{ fontFamily: fontDisplay(600), fontSize: 19, color: T.text, letterSpacing: -0.38 }}>{title}</Text>
      <Text style={{ fontFamily: fontMono(400), fontSize: 12, color: T.faint }}>{count}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const {
    T, filters, setFilters, drops, dealsLoading, refreshDeals, profile,
    voteSession, voteRanking, toggleVotePick, clearVoting,
    activeHuddle, setActiveHuddle,
  } = useApp();
  const displayName = profile.name || (profile.email ? profile.email.split('@')[0] : '') || 'You';
  const initials = displayName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'U';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [areaOpen, setAreaOpen] = useState(false);
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
      const hid = voteSession.huddleId;
      const mt = voteSession.memberToken;
      setActiveHuddle({ huddleId: hid, memberToken: mt });   // home bar now tracks it
      clearVoting();
      router.push(`/(user)/huddle/${hid}${mt ? `?mt=${encodeURIComponent(mt)}` : ''}`);
    } catch (err) {
      Alert.alert('Could not submit', err instanceof ApiError ? err.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Poll the active huddle so the home bar shows its live status (waiting for
  // votes / decided / code ready). Cleared when the huddle ends.
  const [huddleStatus, setHuddleStatus] = useState<ApiHuddle | null>(null);
  useEffect(() => {
    if (!activeHuddle || voting) { setHuddleStatus(null); return; }
    let alive = true;
    const tick = async () => {
      try {
        const h = await getHuddle(activeHuddle.huddleId, activeHuddle.memberToken);
        if (!alive) return;
        // Terminal states clear the bar (and its persisted value).
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

  // Area picker options: the user's home suburb first, then every suburb that
  // currently has a drop. "All Sydney" clears the area filter.
  const areaOptions = [
    ...new Set([
      ...(profile.suburb ? [profile.suburb] : []),
      ...drops.map((d) => d.suburb).filter(Boolean),
    ]),
  ];
  const areaLabel = filters.areas.length
    ? filters.areas.length === 1 ? filters.areas[0] : `${filters.areas[0]} +${filters.areas.length - 1}`
    : 'All Sydney';
  const pickArea = (s: string | null) => {
    setFilters({ ...filters, areas: s ? [s] : [] });
    setAreaOpen(false);
  };

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
  // the deal. A rank badge overlays picked cards.
  const onCard = (id: string) => {
    if (voting) {
      if (candidateSet.has(id)) toggleVotePick(id);
    } else {
      openDrop(id);
    }
  };

  const renderCard = (d: (typeof drops)[number]) => {
    const rank = voteRanking.indexOf(d.id);
    const pickable = voting && candidateSet.has(d.id);
    return (
      <View key={d.id} style={{ opacity: voting && !pickable ? 0.4 : 1 }}>
        <DropCardEditorial d={d} onPress={() => onCard(d.id)} />
        {voting && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute', top: 12, right: 12,
              width: 34, height: 34, borderRadius: 999,
              backgroundColor: rank >= 0 ? T.accent : 'rgba(15,14,13,0.55)',
              alignItems: 'center', justifyContent: 'center',
              borderWidth: rank >= 0 ? 0 : 1.5, borderColor: '#fff',
            }}
          >
            <Text style={{ fontFamily: fontMono(700), fontSize: 15, color: '#fff' }}>
              {rank >= 0 ? rank + 1 : pickable ? '+' : '—'}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const Section = ({ title, list }: { title: string; list: typeof drops }) =>
    list.length ? (
      <>
        <SectionHead title={title} count={`${list.length} ${list.length === 1 ? 'drop' : 'drops'}`} />
        <View style={{ gap: 16 }}>
          {list.map(renderCard)}
        </View>
      </>
    ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: (voting ? 120 : 40) + FLOATING_TAB_CLEARANCE }}
        refreshControl={
          <RefreshControl
            refreshing={dealsLoading}
            onRefresh={refreshDeals}
            tintColor={T.accent}
          />
        }
      >
        <View style={{ paddingTop: insets.top + 8 }}>
          <View style={{ paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <PulseMark size={28} radius={8} />
              <Logo size={20} />
            </View>
            <Pressable onPress={() => router.push('/(user)/(tabs)/profile')}>
              <Avatar initials={initials} />
            </Pressable>
          </View>
          <View style={{ paddingHorizontal: 18, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 18 }}>
            <Text style={{ fontFamily: fontDisplay(700), fontSize: 33, color: T.text, letterSpacing: -1 }}>What's on?</Text>
            <LocPill label={areaLabel} onPress={() => setAreaOpen(true)} />
          </View>

          {voting ? (
            /* Voting mode banner — the feed below is now the ballot */
            <View style={[{ marginHorizontal: 18, marginTop: 16, borderRadius: 18, backgroundColor: T.accentSoft, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
              <HuddleMark size={38} radius={12} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: fontUI(600), fontSize: 15.5, color: T.text }}>Pick your top 3</Text>
                <Text style={{ fontFamily: fontUI(400), fontSize: 12.5, color: T.muted, marginTop: 1 }}>
                  Tap deals in order — first tap is your top pick. Your vote is private.
                </Text>
              </View>
              <Pressable onPress={clearVoting} hitSlop={10}>
                <Text style={{ fontFamily: fontUI(600), fontSize: 13, color: T.accent }}>Cancel</Text>
              </Pressable>
            </View>
          ) : huddleBar ? (
            /* Active huddle — live status (waiting for votes / payments / code) */
            <Pressable
              onPress={openHuddle}
              style={[{ marginHorizontal: 18, marginTop: 16, borderRadius: 18, backgroundColor: T.surface, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: T.accentSoft }, T.shadow]}
            >
              <HuddleMark size={38} radius={12} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: fontUI(600), fontSize: 15.5, color: T.text }}>{huddleBar.title}</Text>
                <Text style={{ fontFamily: fontUI(400), fontSize: 12.5, color: T.muted, marginTop: 1 }}>{huddleBar.sub}</Text>
              </View>
              <Text style={{ fontFamily: fontUI(600), fontSize: 18, color: T.accent }}>›</Text>
            </Pressable>
          ) : (
            /* Start a Huddle — group vote → one booking, one code */
            <Pressable
              onPress={() => router.push('/(user)/huddle/new')}
              style={[{ marginHorizontal: 18, marginTop: 16, borderRadius: 18, backgroundColor: T.surface, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }, T.shadow]}
            >
              <HuddleMark size={38} radius={12} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: fontUI(600), fontSize: 15.5, color: T.text }}>Start a Huddle</Text>
                <Text style={{ fontFamily: fontUI(400), fontSize: 12.5, color: T.muted, marginTop: 1 }}>
                  Group votes, one booking, split the deposit
                </Text>
              </View>
              <Text style={{ fontFamily: fontUI(600), fontSize: 18, color: T.faint }}>›</Text>
            </Pressable>
          )}
        </View>

        {/* filter rail */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 4, alignItems: 'center' }}
        >
          <FilterButton count={activeCount} onPress={() => router.push('/(user)/filters')} />
          <View style={{ width: 1, height: 24, backgroundColor: T.line, marginHorizontal: 2 }} />
          {CATEGORIES.map((c) => (
            <Chip key={c} active={isChipOn(c)} onPress={() => quickCat(c)}>
              {c}
            </Chip>
          ))}
        </ScrollView>

        <View style={{ paddingHorizontal: 18 }}>
          {dealsLoading && drops.length === 0 ? (
            <View style={{ alignItems: 'center', marginTop: 80 }}>
              <ActivityIndicator color={T.accent} />
            </View>
          ) : (
            <>
              <Section title="On now" list={now} />
              <Section title="Later tonight" list={later} />
              {filtered.length === 0 && (
                <View style={{ alignItems: 'center', marginTop: 64, paddingHorizontal: 40 }}>
                  <Text style={{ fontFamily: fontDisplay(600), fontSize: 19, color: T.text, letterSpacing: -0.38, textAlign: 'center' }}>
                    Nothing matches yet
                  </Text>
                  <Text style={{ fontFamily: fontUI(400), fontSize: 14.5, color: T.muted, marginTop: 6, lineHeight: 21, textAlign: 'center' }}>
                    Try widening your filters — drop a suburb or nudge the price up.
                  </Text>
                  <Pressable onPress={() => setFilters(DEFAULT_FILTERS)} style={{ marginTop: 16 }}>
                    <Text style={{ fontFamily: fontUI(600), fontSize: 15, color: T.accent }}>Clear filters</Text>
                  </Pressable>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>

      {/* Voting submit — floats clear above the tab bar so it's never hidden */}
      {voting && (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: FLOATING_TAB_CLEARANCE - 8, paddingHorizontal: 18 }}>
          {submitting ? (
            <View style={[{ height: 56, borderRadius: 18, backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center' }, T.shadow]}>
              <ActivityIndicator color={T.accent} />
            </View>
          ) : (
            <Pressable
              onPress={submitBallot_}
              disabled={voteRanking.length === 0}
              style={[{ height: 56, borderRadius: 18, backgroundColor: voteRanking.length === 0 ? T.chipBg : T.accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 }, T.shadow]}
            >
              {/* three progress pips fill as you rank */}
              <View style={{ flexDirection: 'row', gap: 5 }}>
                {[0, 1, 2].map((i) => {
                  const filled = i < voteRanking.length;
                  const on = voteRanking.length > 0;
                  return (
                    <View
                      key={i}
                      style={{
                        width: filled ? 18 : 8, height: 8, borderRadius: 999,
                        backgroundColor: filled
                          ? (on ? T.accentInk : T.muted)
                          : (on ? 'rgba(255,255,255,0.35)' : T.line2),
                      }}
                    />
                  );
                })}
              </View>
              <Text style={{ fontFamily: fontUI(600), fontSize: 16.5, color: voteRanking.length === 0 ? T.muted : T.accentInk }}>
                {voteRanking.length === 0
                  ? 'Pick your top 3'
                  : voteRanking.length === 3
                  ? 'Lock in my vote'
                  : `Submit ${voteRanking.length} pick${voteRanking.length > 1 ? 's' : ''}`}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Area picker — opened by the location pill */}
      <Modal visible={areaOpen} transparent animationType="fade" onRequestClose={() => setAreaOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={() => setAreaOpen(false)}>
          <View style={{ position: 'absolute', top: insets.top + 96, right: 18, left: 18, maxWidth: 340, alignSelf: 'flex-end' }}>
            <Pressable style={[{ backgroundColor: T.surface, borderRadius: 18, overflow: 'hidden' }, T.shadow]} onPress={() => {}}>
              <Text style={{ fontFamily: fontMono(400), fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: T.faint, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
                Show drops in
              </Text>
              {[null, ...areaOptions].map((s, i, arr) => {
                const on = s === null ? filters.areas.length === 0 : filters.areas.includes(s);
                const isHome = s !== null && s === profile.suburb;
                return (
                  <Pressable
                    key={s ?? 'all'}
                    onPress={() => pickArea(s)}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: T.line }}
                  >
                    <Text style={{ fontFamily: fontUI(on ? 600 : 400), fontSize: 15.5, color: on ? T.accent : T.text }}>
                      {s ?? 'All Sydney'}{isHome ? '  ·  home' : ''}
                    </Text>
                    {on && <Text style={{ fontFamily: fontUI(600), fontSize: 15, color: T.accent }}>✓</Text>}
                  </Pressable>
                );
              })}
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
