// MapScreen.web.tsx — web map tab. react-native-maps is native-only, so on web
// we render a real interactive map with Leaflet + CARTO tiles (no API key),
// loaded from a CDN at runtime so nothing changes in the bundle. The layout
// mirrors the native map (MapScreen.tsx): a full-screen map with a floating
// search/filter row, custom discount-% pins, and a slide-up card on tap. Keep
// the two in sync when the map UI changes.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Drop, LatLng, SYDNEY_REGION, activeFilterCount, applyFilters, dropCoords, pct } from './data';
import { fontDisplay, fontUI, useApp } from './theme';
import { DropCardCompact } from './components';
import { Filter, Search } from './icons';

const LEAFLET_VERSION = '1.9.4';
const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const LEAFLET_JS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;

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

// Build the HTML for one pin — an accent discount pill with a pointer,
// mirroring the native <Pin> component. `active` adds a halo ring; `dim`
// fades venues filtered out of the current results.
function pinHtml(label: string, accent: string, ink: string, active: boolean, dim: boolean): string {
  const font = fontDisplay(700);
  return `
  <div style="opacity:${dim ? 0.35 : 1};display:flex;flex-direction:column;align-items:center;pointer-events:auto;cursor:pointer;">
    ${active ? `<div style="position:absolute;top:-7px;width:38px;height:38px;border-radius:19px;border:2px solid ${accent};opacity:0.5;"></div>` : ''}
    <div style="background:${accent};color:${ink};font-family:'${font}',system-ui,sans-serif;font-weight:700;font-size:12px;height:${active ? 30 : 26}px;display:flex;align-items:center;padding:0 10px;border-radius:999px;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.18);">${label}</div>
    <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid ${accent};margin-top:-1px;"></div>
  </div>`;
}

export default function MapScreenWeb() {
  const { T, dark, filters, drops } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const leafletReady = useLeaflet();
  const [sel, setSel] = useState<string | null>(null);

  // Resolve a coordinate for every deal — exact venue location when the backend
  // has it, otherwise the deal's suburb centre. Only mappable deals get a pin.
  const located = useMemo(
    () => drops
      .map((d) => ({ d, coord: dropCoords(d) }))
      .filter((x) => x.coord != null) as { d: Drop; coord: LatLng }[],
    [drops],
  );
  const selDrop = located.find((x) => x.d.id === sel)?.d ?? null;
  const matchIds = useMemo(
    () => new Set(applyFilters(located.map((x) => x.d), filters).map((d) => d.id)),
    [located, filters],
  );
  const activeCount = activeFilterCount(filters);

  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tileRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);

  // Create the map once. A tap on empty map clears the selection.
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L;
    if (!leafletReady || !L || !containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { attributionControl: false, zoomControl: false })
      .setView([SYDNEY_REGION.latitude, SYDNEY_REGION.longitude], 12);
    map.on('click', () => setSel(null));
    mapRef.current = map;
    // The container may not have its final size on first paint.
    setTimeout(() => map.invalidateSize(), 0);
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
    }).addTo(mapRef.current);
  }, [leafletReady, dark]);

  // Plot a discount pin per mappable deal. Rebuilt whenever the data, the
  // selection, or the active filters change so pin styling stays in sync.
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L;
    if (!leafletReady || !L || !mapRef.current) return;
    const map = mapRef.current;
    markersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current = [];

    located.forEach(({ d, coord }) => {
      const active = sel === d.id;
      const dim = !matchIds.has(d.id);
      const icon = L.divIcon({
        className: '',
        html: pinHtml(`${pct(d.now, d.usual)}%`, T.accent, T.accentInk, active, dim),
        iconSize: [64, 44],
        iconAnchor: [32, 44],
      });
      const marker = L.marker([coord.latitude, coord.longitude], {
        icon,
        zIndexOffset: active ? 1000 : dim ? -100 : 0,
      }).addTo(map);
      marker.on('click', () => {
        if (dim) return;
        setSel(d.id);
        map.panTo([coord.latitude, coord.longitude], { animate: true, duration: 0.35 });
      });
      markersRef.current.push(marker);
    });
  }, [leafletReady, located, matchIds, sel, T.accent, T.accentInk]);

  // Tear the map down on unmount so a remount re-initialises cleanly.
  useEffect(() => {
    return () => {
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
      {!leafletReady && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: fontUI(400), fontSize: 14, color: T.muted }}>Loading map…</Text>
        </View>
      )}

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
