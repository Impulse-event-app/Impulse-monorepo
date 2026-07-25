import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CATEGORIES,
  DEFAULT_FILTERS,
  activeFilterCount,
  applyFilters,
} from '../../../src/data';
import { fontDisplay, fontMono, fontUI, useApp } from '../../../src/theme';
import {
  Avatar,
  Chip,
  DropCardEditorial,
  Logo,
  LocPill,
  PulseMark,
} from '../../../src/components';
import { Filter } from '../../../src/icons';
import { FLOATING_TAB_CLEARANCE } from './_layout';

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
  const { T, filters, setFilters, drops, dealsLoading, refreshDeals, profile } = useApp();
  const displayName = profile.name || (profile.email ? profile.email.split('@')[0] : '') || 'You';
  const initials = displayName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'U';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [areaOpen, setAreaOpen] = useState(false);

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

  const Section = ({ title, list }: { title: string; list: typeof drops }) =>
    list.length ? (
      <>
        <SectionHead title={title} count={`${list.length} ${list.length === 1 ? 'drop' : 'drops'}`} />
        <View style={{ gap: 16 }}>
          {list.map((d) => (
            <DropCardEditorial key={d.id} d={d} onPress={() => openDrop(d.id)} />
          ))}
        </View>
      </>
    ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 + FLOATING_TAB_CLEARANCE }}
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
