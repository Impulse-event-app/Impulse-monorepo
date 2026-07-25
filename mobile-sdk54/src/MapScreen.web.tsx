// MapScreen.web.tsx — web map tab. react-native-maps is native-only, so on web
// we render MapLibre GL with CARTO's free vector basemaps (no API key, just
// attribution — same CARTO family as the app's old raster tiles, with proper
// light/dark styles). Pins come from dropCoords() — exact venue coordinates
// when the backend has them, otherwise the deal's suburb centre. The deal list
// sits below, so even if WebGL/styles fail the tab is never empty.
import React, { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { SYDNEY_REGION, activeFilterCount, applyFilters, dropCoords, money } from './data';
import { fontDisplay, fontUI, useApp } from './theme';
import { DropCardCompact } from './components';
import { Filter, Search } from './icons';

const STYLE_LIGHT = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
const STYLE_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const MAP_HEIGHT = 340;

export default function MapScreenWeb() {
  const { T, dark, filters, drops } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const matched = applyFilters(drops, filters);
  const activeCount = activeFilterCount(filters);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  // Create the map once. A tap on empty map clears the selection.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: dark ? STYLE_DARK : STYLE_LIGHT,
      center: [SYDNEY_REGION.longitude, SYDNEY_REGION.latitude],
      zoom: 11.5,
      attributionControl: { compact: true },
    });
    mapRef.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Basemap style follows the app's light/dark theme. Markers are DOM
  // overlays, so they survive the style swap.
  useEffect(() => {
    mapRef.current?.setStyle(dark ? STYLE_DARK : STYLE_LIGHT);
  }, [dark]);

  // Plot a discount pin per mappable deal. Rebuilt whenever the data, the
  // selection, or the active filters change so pin styling stays in sync.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const bounds = new maplibregl.LngLatBounds();
    matched.forEach((d) => {
      const c = dropCoords(d);
      if (!c) return;
      const marker = new maplibregl.Marker({ color: T.accent })
        .setLngLat([c.longitude, c.latitude])
        .setPopup(
          new maplibregl.Popup({ offset: 20, closeButton: false }).setHTML(
            `<strong>${d.venue}</strong><br/>${money(d.now)} · ${d.suburb || 'Sydney'}`,
          ),
        )
        .addTo(map);
      marker.getElement().style.cursor = 'pointer';
      marker.getElement().addEventListener('click', () => router.push(`/(user)/event/${d.id}`));
      markersRef.current.push(marker);
      bounds.extend([c.longitude, c.latitude]);
    });

    if (markersRef.current.length === 1) {
      map.jumpTo({ center: bounds.getCenter(), zoom: 14 });
    } else if (markersRef.current.length > 1) {
      map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 0 });
    }
  }, [matched, T.accent, router]);

  // Tear the map down on unmount so a remount re-initialises cleanly.
  useEffect(() => {
    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Sit the selected card just above the floating tab bar.
  const barTop = (insets.bottom > 0 ? insets.bottom : 16) + 56;

  return (
    <View style={{ flex: 1, backgroundColor: T.mapBg }}>
      {/* interactive map (Leaflet renders into this real DOM node) */}
      {React.createElement('div', {
        ref: containerRef,
        style: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
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
    </View>
  );
}
