import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Dimensions, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DROPS, PIN_POS, activeFilterCount, applyFilters, money } from '../../../src/data';
import { fontMono, fontUI, useApp } from '../../../src/theme';
import { DropCardCompact, Pin } from '../../../src/components';
import { Filter, Search } from '../../../src/icons';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export default function MapScreen() {
  const { T, filters } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [sel, setSel] = useState<string | null>(null);

  const selDrop = DROPS.find((d) => d.id === sel) || null;
  const matchIds = new Set(applyFilters(DROPS, filters).map((d) => d.id));
  const activeCount = activeFilterCount(filters);

  const GRID = 46;
  const cols = Math.ceil(SCREEN_W / GRID) + 1;
  const rows = Math.ceil(SCREEN_H / GRID) + 1;

  return (
    <View style={{ flex: 1, backgroundColor: T.mapBg, overflow: 'hidden' }}>
      {/* faux map: grid */}
      {[...Array(cols)].map((_, i) => (
        <View key={`v${i}`} style={{ position: 'absolute', top: 0, bottom: 0, left: i * GRID, width: 1, backgroundColor: T.mapLine }} />
      ))}
      {[...Array(rows)].map((_, i) => (
        <View key={`h${i}`} style={{ position: 'absolute', left: 0, right: 0, top: i * GRID, height: 1, backgroundColor: T.mapLine }} />
      ))}
      {/* blocks */}
      <View style={{ position: 'absolute', left: '8%', top: '12%', width: '34%', height: '22%', backgroundColor: T.mapBlock, borderRadius: 8 }} />
      <View style={{ position: 'absolute', left: '58%', top: '30%', width: '30%', height: '30%', backgroundColor: T.mapBlock, borderRadius: 8 }} />
      <View style={{ position: 'absolute', left: '15%', top: '62%', width: '40%', height: '26%', backgroundColor: T.mapBlock, borderRadius: 8 }} />
      {/* roads */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: '47%', height: 6, backgroundColor: T.mapLine }} />
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: '46%', width: 6, backgroundColor: T.mapLine }} />

      <Text style={{ position: 'absolute', right: 12, bottom: 8, fontFamily: fontMono(400), fontSize: 9.5, letterSpacing: 0.8, textTransform: 'uppercase', color: T.phText }}>
        map placeholder
      </Text>

      {/* pins */}
      {DROPS.map((d) => {
        const [x, y] = PIN_POS[d.id] || [50, 50];
        const match = matchIds.has(d.id);
        return (
          <View
            key={d.id}
            pointerEvents={match ? 'auto' : 'none'}
            style={{
              position: 'absolute', left: `${x}%`, top: `${y}%`,
              transform: [{ translateX: -24 }, { translateY: -36 }],
              opacity: match ? 1 : 0.32, zIndex: sel === d.id ? 5 : match ? 2 : 1,
            }}
          >
            <Pin active={sel === d.id} label={money(d.now)} onPress={() => setSel(d.id)} />
          </View>
        );
      })}

      {/* top search + filter row */}
      <View style={{ position: 'absolute', top: insets.top + 4, left: 18, right: 18, flexDirection: 'row', gap: 9 }}>
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

      {/* selected mini card */}
      {selDrop && (
        <View style={{ position: 'absolute', left: 14, right: 14, bottom: 16 }}>
          <DropCardCompact d={selDrop} onPress={() => router.push(`/(user)/event/${selDrop.id}`)} />
        </View>
      )}
    </View>
  );
}
