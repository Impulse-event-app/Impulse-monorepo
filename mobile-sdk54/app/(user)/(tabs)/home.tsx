import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
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
  const { T, filters, setFilters, drops, dealsLoading, refreshDeals } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const quickCat = (c: string) => {
    if (c === 'All') setFilters({ ...filters, cats: [] });
    else
      setFilters({
        ...filters,
        cats: filters.cats.includes(c) && filters.cats.length === 1 ? [] : [c],
      });
  };
  const isChipOn = (c: string) => (c === 'All' ? filters.cats.length === 0 : filters.cats.includes(c));

  const filtered = applyFilters(drops, filters);
  const now = filtered.filter((d) => d.status === 'now');
  const later = filtered.filter((d) => d.status === 'later');
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
            <Avatar />
          </View>
          <View style={{ paddingHorizontal: 18, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 18 }}>
            <Text style={{ fontFamily: fontDisplay(700), fontSize: 33, color: T.text, letterSpacing: -1 }}>What's on?</Text>
            <LocPill />
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
    </View>
  );
}
