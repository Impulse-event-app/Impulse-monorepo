// MapScreen.tsx — native (iOS/Android) map tab. Uses react-native-maps, which
// is native-only. The route file app/(user)/(tabs)/map.tsx re-exports this, and
// Metro serves MapScreen.web.tsx instead on web (react-native-maps can't bundle
// there). Keep the two in sync when the map UI changes.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import { DEFAULT_FILTERS, Drop, LatLng, SYDNEY_REGION, activeFilterCount, applyFilters, dropCoords, money } from './data';
import { fontUI, useApp } from './theme';
import { DropCardCompact, FadeIn, Glass, Pin, TextBtn, Touchable } from './components';
import { Filter } from './icons';
import { hapticSelection } from './haptics';

// The selected-drop card stays card-sized on iPad instead of spanning the map.
const SELECTED_CARD_MAX_WIDTH = 460;

// Custom marker. react-native-maps caches the rendered child as a static
// image, so we briefly enable tracksViewChanges whenever the pin's look
// changes (selection), then disable it again to keep the map smooth.
function DropMarker({
  latitude, longitude, label, cat, a11yLabel, active, onPress,
}: {
  latitude: number;
  longitude: number;
  label: string;
  cat: string;
  a11yLabel?: string;
  active: boolean;
  onPress: () => void;
}) {
  const [track, setTrack] = useState(true);
  useEffect(() => {
    setTrack(true);
    const t = setTimeout(() => setTrack(false), 500);
    return () => clearTimeout(t);
  }, [active, cat, label]);

  return (
    <Marker
      coordinate={{ latitude, longitude }}
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={track}
      onPress={onPress}
      zIndex={active ? 5 : 2}
    >
      {/* The pin is a picture of a button, not a button: taps must land on the
          native marker, whose recognizer fires onPress. */}
      <View pointerEvents="none" style={{ paddingTop: 10 }}>
        <Pin active={active} label={label} cat={cat} accessibilityLabel={a11yLabel} />
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
          <View style={{ width: 48, height: 44, borderCurve: 'continuous', borderRadius: 12, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Filter size={17} color={T.accentInk} />
          </View>
        ) : (
          <Glass radius={12} style={{ width: 48, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Filter size={17} color={T.text} />
          </Glass>
        )}
      </Touchable>
    </View>
  );
}

export default function MapScreen() {
  const { T, filters, setFilters, drops } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const [sel, setSel] = useState<string | null>(null);

  // Resolve a coordinate for every deal — exact venue location when the backend
  // has it, otherwise the deal's suburb centre. Only mappable deals get a pin.
  const located = drops
    .map((d) => ({ d, coord: dropCoords(d) }))
    .filter((x) => x.coord != null) as { d: Drop; coord: LatLng }[];
  // Only deals that pass the filters get a pin (matching the list and the web
  // map). Fading the rest left them stacked over the matches — same-suburb
  // deals share a coordinate — so the filters looked like they did nothing.
  const matchIds = new Set(applyFilters(located.map((x) => x.d), filters).map((d) => d.id));
  const shown = located.filter((x) => matchIds.has(x.d.id));
  const selDrop = shown.find((x) => x.d.id === sel)?.d ?? null;
  const activeCount = activeFilterCount(filters);

  // When the filters change, drop a selection they exclude (it would linger as
  // the card) and frame the matching pins, so filtering to an area or category
  // off-screen actually shows the results.
  const firstFilters = useRef(true);
  useEffect(() => {
    if (firstFilters.current) { firstFilters.current = false; return; }
    if (sel && !matchIds.has(sel)) setSel(null);
    const coords = shown.map((x) => x.coord);
    if (coords.length === 1) {
      mapRef.current?.animateToRegion({ ...coords[0], latitudeDelta: 0.02, longitudeDelta: 0.02 }, 400);
    } else if (coords.length > 1) {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
        animated: true,
      });
    }
  }, [filters]);   // eslint-disable-line react-hooks/exhaustive-deps

  // On iOS a tap on a marker also reaches the map's own tap handler —
  // react-native-maps' AIRMapManager fires the MapView's onPress for every tap,
  // markers included — which would clear the selection in the same tap. So a
  // map tap arriving right after a marker press is ignored. (Order-proof: if the
  // map's handler runs first, the marker's setSel still wins.)
  const lastMarkerPress = useRef(0);

  const select = (id: string) => {
    lastMarkerPress.current = Date.now();
    hapticSelection();
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
        onPress={() => {
          if (Date.now() - lastMarkerPress.current > 400) setSel(null);
        }}
        mapPadding={{ top: insets.top + 56, right: 0, bottom: barTop, left: 0 }}
      >
        {shown.map(({ d, coord }) => (
          <DropMarker
            key={d.id}
            latitude={coord.latitude}
            longitude={coord.longitude}
            label={money(d.now)}
            cat={d.cat}
            a11yLabel={`${d.venue}, ${d.cat}, ${money(d.now)}`}
            active={sel === d.id}
            onPress={() => select(d.id)}
          />
        ))}
      </MapView>

      <MapTopBar activeCount={activeCount} onFilters={() => router.push('/(user)/filters')} />

      {located.length > 0 && shown.length === 0 && (
        <View style={{ position: 'absolute', top: insets.top + 60, left: 16, right: 16, alignItems: 'center' }}>
          <Glass radius={12} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 14, paddingRight: 10, paddingVertical: 8 }}>
            <Text style={{ ...fontUI(400, 14), fontSize: 14, color: T.text }}>No deals match your filters</Text>
            <TextBtn onPress={() => setFilters(DEFAULT_FILTERS)} color={T.accent} size={15} weight={500}>Clear</TextBtn>
          </Glass>
        </View>
      )}

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
