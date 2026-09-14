// MapScreen.web.tsx — web map tab. react-native-maps is native-only, so on web
// we render MapLibre GL with CARTO's free vector basemaps (no API key, just
// attribution — same CARTO family as the app's old raster tiles, with proper
// light/dark styles). Pins come from dropCoords() — exact venue coordinates
// when the backend has them, otherwise the deal's suburb centre.
import React, { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { SYDNEY_REGION, activeFilterCount, applyFilters, dropCoords, money } from './data';
import { useApp } from './theme';
import { Glass, Touchable } from './components';
import { Filter } from './icons';

const STYLE_LIGHT = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
const STYLE_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

/**
 * Brand v2 price pin as a DOM element: red pill, white tabular label, pointer.
 * The outer element is left unstyled because MapLibre positions it (absolute +
 * transform); styling it directly would override that and stretch it full-width.
 */
function pinElement(label: string, accent: string): HTMLElement {
  const el = document.createElement('div');
  el.style.cursor = 'pointer';
  const pill = document.createElement('div');
  pill.textContent = label;
  Object.assign(pill.style, {
    position: 'relative', display: 'inline-block', height: '26px', padding: '0 11px',
    borderRadius: '999px', background: accent, color: '#FFFFFF', whiteSpace: 'nowrap',
    // line-height lives in the shorthand: a separate lineHeight would be reset by `font`.
    font: '600 13px/26px -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
    fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em',
  } as Partial<CSSStyleDeclaration>);
  const tip = document.createElement('div');
  Object.assign(tip.style, {
    position: 'absolute', left: '50%', bottom: '-6px', marginLeft: '-5px', width: '0', height: '0',
    borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: `7px solid ${accent}`,
  } as Partial<CSSStyleDeclaration>);
  pill.appendChild(tip);
  el.appendChild(pill);
  return el;
}

export default function MapScreenWeb() {
  const { T, dark, filters, drops } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const matched = applyFilters(drops, filters);
  const activeCount = activeFilterCount(filters);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  // MapLibre's controls are plain DOM, outside RN styling. Keep the attribution
  // collapsed to its (i) button and lift it clear of the floating tab bar.
  useEffect(() => {
    const id = 'impulse-map-controls';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      .maplibregl-ctrl-bottom-right { bottom: 104px !important; right: 6px !important; }
      .maplibregl-ctrl-attrib.maplibregl-compact { background: rgba(46,46,48,.6) !important; color: #98989D; }
      .maplibregl-ctrl-attrib.maplibregl-compact a { color: #F5F5F7; }
    `;
    document.head.appendChild(style);
  }, []);

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: dark ? STYLE_DARK : STYLE_LIGHT,
      center: [SYDNEY_REGION.longitude, SYDNEY_REGION.latitude],
      zoom: 11.5,
      attributionControl: { compact: true },
    });
    // MapLibre opens the compact attribution on load; start it collapsed.
    mapRef.current.once('idle', () => {
      containerRef.current?.querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Basemap style follows the app's light/dark theme. Markers are DOM
  // overlays, so they survive the style swap.
  useEffect(() => {
    mapRef.current?.setStyle(dark ? STYLE_DARK : STYLE_LIGHT);
  }, [dark]);

  // Plot a price pin per mappable deal. Rebuilt whenever the data or the
  // active filters change so pins stay in sync.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const bounds = new maplibregl.LngLatBounds();
    matched.forEach((d) => {
      const c = dropCoords(d);
      if (!c) return;
      const el = pinElement(money(d.now), T.accent);
      el.title = `${d.venue} · ${d.suburb || 'Sydney'}`;
      el.addEventListener('click', () => router.push(`/(user)/event/${d.id}`));
      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -7] })
        .setLngLat([c.longitude, c.latitude])
        .addTo(map);
      markersRef.current.push(marker);
      bounds.extend([c.longitude, c.latitude]);
    });

    if (markersRef.current.length === 1) {
      map.jumpTo({ center: bounds.getCenter(), zoom: 14 });
    } else if (markersRef.current.length > 1) {
      map.fitBounds(bounds, { padding: { top: insets.top + 80, bottom: 140, left: 48, right: 48 }, maxZoom: 14, duration: 0 });
    }
  }, [matched, T.accent, router, insets.top]);

  // Tear the map down on unmount so a remount re-initialises cleanly.
  useEffect(() => {
    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: T.mapBg }}>
      {React.createElement('div', {
        ref: containerRef,
        style: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
      })}

      {/* filter button (mirrors MapTopBar in MapScreen.tsx) */}
      <View style={{ position: 'absolute', top: insets.top + 4, right: 16, flexDirection: 'row', zIndex: 8 }}>
        <Touchable
          onPress={() => router.push('/(user)/filters')}
          scale={0.96}
          accessibilityLabel={activeCount ? `Filters, ${activeCount} on` : 'Filters'}
        >
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
    </View>
  );
}
