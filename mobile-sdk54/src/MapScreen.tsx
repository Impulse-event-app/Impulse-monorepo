// MapScreen.tsx — native (iOS/Android) map tab. Uses react-native-maps, which
// is native-only. The route file app/(user)/(tabs)/map.tsx re-exports this, and
// Metro serves MapScreen.web.tsx instead on web (react-native-maps can't bundle
// there). Keep the two in sync when the map UI changes.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import { Drop, LatLng, SYDNEY_REGION, activeFilterCount, applyFilters, dropCoords, money } from './data';
import { useApp } from './theme';
import { DropCardCompact, FadeIn, Glass, Pin, Touchable } from './components';
import { Filter } from './icons';

// The selected-drop card stays card-sized on iPad instead of spanning the map.
const SELECTED_CARD_MAX_WIDTH = 460;

// Custom marker. react-native-maps caches the rendered child as a static
// image, so we briefly enable tracksViewChanges whenever the pin's look
// changes (selection), then disable it again to keep the map smooth.
function DropMarker({
  latitude, longitude, label, a11yLabel, active, dim, onPress,
}: {
  latitude: number;
  longitude: number;
  label: string;
  a11yLabel?: string;
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
      <View style={{ opacity: dim ? 0.28 : 1, paddingTop: 10 }}>
        <Pin active={active} label={label} accessibilityLabel={a11yLabel} />
      </View>
    </Marker>
  );
}

/** Floating filter button over the map. (No search field until search exists.) */
export function MapTopBar({ activeCount, onFilters }: { activeCount: number; onFilters: () => void }) {
  const { T } = useApp();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ position: 'absolute', top: insets.top + 4, right: 16, flexDirection: 'row', zIndex: 8 }}>
      <Touchable onPress={onFilters} scale={0.96} accessibilityLabel={activeCount ? `Filters, ${activeCount} on` : 'Filters'}>
        {activeCount ? (
          <View style={{ width: 48, height: 44, borderRadius: 10, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Filter size={17} color={T.accentInk} />
          </View>
        ) : (
          <Glass radius={10} style={{ width: 48, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Filter size={17} color={T.text} />
          </Glass>
        )}
      </Touchable>
    </View>
  );
}

export default function MapScreen() {
  const { T, filters, drops } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const [sel, setSel] = useState<string | null>(null);

  // Resolve a coordinate for every deal — exact venue location when the backend
  // has it, otherwise the deal's suburb centre. Only mappable deals get a pin.
  const located = drops
    .map((d) => ({ d, coord: dropCoords(d) }))
    .filter((x) => x.coord != null) as { d: Drop; coord: LatLng }[];
  const selDrop = located.find((x) => x.d.id === sel)?.d ?? null;
  const matchIds = new Set(applyFilters(located.map((x) => x.d), filters).map((d) => d.id));
  const activeCount = activeFilterCount(filters);

  const select = (id: string) => {
    setSel(id);
    const entry = located.find((x) => x.d.id === id);
    if (entry) {
      mapRef.current?.animateCamera({ center: entry.coord }, { duration: 350 });
    }
  };

  // Sit the selected card just above the floating tab bar.
  const barTop = (insets.bottom > 0 ? Math.max(insets.bottom - 10, 8) : 16) + 54;

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
        {located.map(({ d, coord }) => (
          <DropMarker
            key={d.id}
            latitude={coord.latitude}
            longitude={coord.longitude}
            label={money(d.now)}
            a11yLabel={`${d.venue}, ${money(d.now)}`}
            active={sel === d.id}
            dim={!matchIds.has(d.id)}
            onPress={() => select(d.id)}
          />
        ))}
      </MapView>

      <MapTopBar activeCount={activeCount} onFilters={() => router.push('/(user)/filters')} />

      {/* selected mini card */}
      {selDrop && (
        <FadeIn key={selDrop.id} style={{ position: 'absolute', left: 16, right: 16, bottom: barTop + 12, alignItems: 'center' }}>
          <View style={{ width: '100%', maxWidth: SELECTED_CARD_MAX_WIDTH }}>
            <DropCardCompact d={selDrop} onPress={() => router.push(`/(user)/event/${selDrop.id}`)} />
          </View>
        </FadeIn>
      )}
    </View>
  );
}
