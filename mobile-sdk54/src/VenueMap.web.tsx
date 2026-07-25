// VenueMap.web.tsx — web static mini-map for the event page, rendered with
// MapLibre GL + CARTO vector styles (same stack as the map tab). Metro picks
// this over VenueMap.tsx on web. Non-interactive by design.
import React, { useEffect, useRef } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useApp } from './theme';

const STYLE_LIGHT = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
const STYLE_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export function VenueMap({
  latitude, longitude, height = 160, style,
}: {
  latitude: number;
  longitude: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { T, dark } = useApp();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: dark ? STYLE_DARK : STYLE_LIGHT,
      center: [longitude, latitude],
      zoom: 14,
      interactive: false,
      attributionControl: { compact: true },
    });
    markerRef.current = new maplibregl.Marker({ color: T.accent })
      .setLngLat([longitude, latitude])
      .addTo(map);
    mapRef.current = map;
    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow position changes (e.g. navigating between events reuses the screen).
  useEffect(() => {
    mapRef.current?.setCenter([longitude, latitude]);
    markerRef.current?.setLngLat([longitude, latitude]);
  }, [latitude, longitude]);

  // Follow the app theme.
  useEffect(() => {
    mapRef.current?.setStyle(dark ? STYLE_DARK : STYLE_LIGHT);
  }, [dark]);

  return (
    <View style={[{ height, borderRadius: 16, overflow: 'hidden' }, style]}>
      {React.createElement('div', { ref: containerRef, style: { width: '100%', height: '100%' } })}
    </View>
  );
}
