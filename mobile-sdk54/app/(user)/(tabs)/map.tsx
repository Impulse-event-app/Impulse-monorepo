import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import { SYDNEY_REGION, activeFilterCount, applyFilters, money } from '../../../src/data';
import { fontUI, useApp } from '../../../src/theme';
import { DropCardCompact, Pin } from '../../../src/components';
import { Filter, Search } from '../../../src/icons';
import { FLOATING_TAB_CLEARANCE } from './_layout';

// Custom marker. react-native-maps caches the rendered child as a static
// image, so we briefly enable tracksViewChanges whenever the pin's look
// changes (selection), then disable it again to keep the map smooth.
function DropMarker({
  latitude, longitude, label, active, dim, onPress,
}: {
  latitude: number;
  longitude: number;
  label: string;
  active: boolean;
  dim: boolean;
  onPress: () => void;
}) {
  const [track, setTrack] = useState(true);
  useEffect(() => {
    setTrack(true);
    const t = setTimeout(() => setTrack(false), 500);
    return () => clearTimeout(t);
  }, [active, dim]);

  return (
    <Marker
      coordinate={{ latitude, longitude }}
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={track}
      onPress={dim ? undefined : onPress}
      zIndex={active ? 5 : dim ? 1 : 2}
    >
      <View style={{ opacity: dim ? 0.35 : 1 }}>
        <Pin active={active} label={label} />
      </View>
    </Marker>
  );
}

export default function MapScreen() {
  const { T, filters, drops } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const [sel, setSel] = useState<string | null>(null);

  // Only deals that actually carry venue coordinates are placed on the map.
  const located = drops.filter((d) => d.latitude != null && d.longitude != null);
  const selDrop = located.find((d) => d.id === sel) || null;
  const matchIds = new Set(applyFilters(located, filters).map((d) => d.id));
  const activeCount = activeFilterCount(filters);

  const select = (id: string) => {
    setSel(id);
    const d = located.find((x) => x.id === id);
    if (d && d.latitude != null && d.longitude != null) {
      mapRef.current?.animateCamera({ center: { latitude: d.latitude, longitude: d.longitude } }, { duration: 350 });
    }
  };

  // Sit the selected card just above the floating tab bar.
  const barTop = (insets.bottom > 0 ? insets.bottom : 16) + 56;

  return (
    <View style={{ flex: 1, backgroundColor: T.mapBg }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={SYDNEY_REGION}
        userInterfaceStyle={T.dark ? 'dark' : 'light'}
        showsCompass={false}
        showsPointsOfInterest={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        onPress={() => setSel(null)}
        mapPadding={{ top: insets.top + 56, right: 0, bottom: barTop, left: 0 }}
      >
        {located.map((d) => (
          <DropMarker
            key={d.id}
            latitude={d.latitude as number}
            longitude={d.longitude as number}
            label={money(d.now)}
            active={sel === d.id}
            dim={!matchIds.has(d.id)}
            onPress={() => select(d.id)}
          />
        ))}
      </MapView>

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
        <View style={{ position: 'absolute', left: 14, right: 14, bottom: barTop + 8 }}>
          <DropCardCompact d={selDrop} onPress={() => router.push(`/(user)/event/${selDrop.id}`)} />
        </View>
      )}
    </View>
  );
}
