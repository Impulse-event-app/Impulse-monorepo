// MapScreen.web.tsx — web fallback for the map tab. react-native-maps is
// native-only (it imports react-native internals that don't exist on web and
// breaks the web bundle), so on the hosted web build we list the located deals
// instead of plotting them on an interactive map. The native map lives in
// MapScreen.tsx; Metro resolves this file on web and that one on iOS/Android.
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activeFilterCount, applyFilters } from './data';
import { fontDisplay, fontUI, useApp } from './theme';
import { DropCardCompact } from './components';
import { Filter, Search } from './icons';
import { FLOATING_TAB_CLEARANCE } from '../app/(user)/(tabs)/_layout';

export default function MapScreenWeb() {
  const { T, filters, drops } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Only deals that carry venue coordinates would appear on the map.
  const located = drops.filter((d) => d.latitude != null && d.longitude != null);
  const matched = applyFilters(located, filters);
  const activeCount = activeFilterCount(filters);

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 40 + FLOATING_TAB_CLEARANCE }}
      >
        {/* top search + filter row (mirrors the native map) */}
        <View style={{ flexDirection: 'row', gap: 9, paddingHorizontal: 18 }}>
          <View style={[{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: T.surface, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 12 }, T.shadow]}>
            <Search size={17} color={T.muted} />
            <Text style={{ fontFamily: fontUI(400), fontSize: 15, color: T.muted }}>Search Sydney</Text>
          </View>
          <Pressable
            onPress={() => router.push('/(user)/filters')}
            style={[{ width: 48, borderRadius: 14, backgroundColor: activeCount ? T.accent : T.surface, alignItems: 'center', justifyContent: 'center' }, T.shadow]}
          >
            <Filter size={18} color={activeCount ? T.accentInk : T.text} />
          </Pressable>
        </View>

        <Text style={{ fontFamily: fontDisplay(600), fontSize: 15, color: T.muted, paddingHorizontal: 20, marginTop: 18, letterSpacing: -0.2 }}>
          {matched.length} {matched.length === 1 ? 'venue' : 'venues'} nearby
        </Text>

        <View style={{ paddingHorizontal: 14, marginTop: 10, gap: 10 }}>
          {matched.map((d) => (
            <DropCardCompact key={d.id} d={d} onPress={() => router.push(`/(user)/event/${d.id}`)} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
