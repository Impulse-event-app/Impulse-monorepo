// MapScreen.web.tsx — web map tab. react-native-maps is native-only, so on web
// we render a real interactive map with Leaflet + OpenStreetMap tiles (no API
// key required), loaded from a CDN at runtime so nothing changes in the bundle.
// Pins come from dropCoords() — exact venue coordinates when the backend has
// them, otherwise the deal's suburb centre. The deal list sits below, and if
// Leaflet can't load we still show the list, so the tab is never empty.
import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SYDNEY_REGION, activeFilterCount, applyFilters, dropCoords, money } from './data';
import { fontDisplay, fontUI, useApp } from './theme';
import { DropCardCompact } from './components';
import { Filter, Search } from './icons';
import { FLOATING_TAB_CLEARANCE } from '../app/(user)/(tabs)/_layout';

const LEAFLET_VERSION = '1.9.4';
const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const LEAFLET_JS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
const MAP_HEIGHT = 340;

// Lazy-load Leaflet's CSS + JS from the CDN once. Returns true when window.L
// is ready, false while loading or if it failed.
function useLeaflet(): boolean {
  const [ready, setReady] = useState<boolean>(
    () => typeof window !== 'undefined' && !!(window as unknown as { L?: unknown }).L,
  );
  useEffect(() => {
    if (ready || typeof document === 'undefined') return;
    if ((window as unknown as { L?: unknown }).L) { setReady(true); return; }

    if (!document.querySelector(`link[data-leaflet]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      link.setAttribute('data-leaflet', '');
      document.head.appendChild(link);
    }

    let script = document.querySelector('script[data-leaflet]') as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.src = LEAFLET_JS;
      script.async = true;
      script.setAttribute('data-leaflet', '');
      document.head.appendChild(script);
    }
    const onLoad = () => setReady(true);
    script.addEventListener('load', onLoad);
    return () => script?.removeEventListener('load', onLoad);
  }, [ready]);
  return ready;
}

export default function MapScreenWeb() {
  const { T, dark, filters, drops } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const leafletReady = useLeaflet();

  const matched = applyFilters(drops, filters);
  const activeCount = activeFilterCount(filters);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tileRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);

  // Create the map once.
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L;
    if (!leafletReady || !L || !containerRef.current || mapRef.current) return;
    mapRef.current = L.map(containerRef.current, { attributionControl: true, zoomControl: true })
      .setView([SYDNEY_REGION.latitude, SYDNEY_REGION.longitude], 12);
    // The container may not have its final size on first paint.
    setTimeout(() => mapRef.current?.invalidateSize(), 0);
  }, [leafletReady]);

  // Base tiles follow the app's light/dark theme — CARTO's clean minimal
  // basemaps (no API key) for an Apple-Maps-ish look rather than raw OSM.
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L;
    if (!leafletReady || !L || !mapRef.current) return;
    if (tileRef.current) mapRef.current.removeLayer(tileRef.current);
    const style = dark ? 'dark_all' : 'light_all';
    tileRef.current = L.tileLayer(`https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}.png`, {
      maxZoom: 20,
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    }).addTo(mapRef.current);
  }, [leafletReady, dark]);

  // Plot a pin per mappable deal.
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L;
    if (!leafletReady || !L || !mapRef.current) return;
    const map = mapRef.current;
    markersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current = [];

    const points: [number, number][] = [];
    matched.forEach((d) => {
      const c = dropCoords(d);
      if (!c) return;
      const marker = L.marker([c.latitude, c.longitude])
        .addTo(map)
        .bindPopup(`<strong>${d.venue}</strong><br/>${money(d.now)} · ${d.suburb || 'Sydney'}`);
      marker.on('click', () => router.push(`/(user)/event/${d.id}`));
      markersRef.current.push(marker);
      points.push([c.latitude, c.longitude]);
    });

    if (points.length === 1) {
      map.setView(points[0], 14);
    } else if (points.length > 1) {
      map.fitBounds(points, { padding: [48, 48], maxZoom: 14 });
    }
  }, [leafletReady, matched, router]);

  // Tear the map down on unmount so a remount re-initialises cleanly.
  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 40 + FLOATING_TAB_CLEARANCE }}
      >
        {/* top search + filter row */}
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

        {/* interactive map (Leaflet renders into this real DOM node) */}
        <View style={{ marginTop: 14, marginHorizontal: 14, borderRadius: 18, overflow: 'hidden', height: MAP_HEIGHT, backgroundColor: T.surface }}>
          {React.createElement('div', {
            ref: containerRef,
            style: { width: '100%', height: '100%' },
          })}
          {!leafletReady && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: fontUI(400), fontSize: 14, color: T.muted }}>Loading map…</Text>
            </View>
          )}
        </View>

        <Text style={{ fontFamily: fontDisplay(600), fontSize: 15, color: T.muted, paddingHorizontal: 20, marginTop: 20, letterSpacing: -0.2 }}>
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
