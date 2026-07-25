// VenueMap.tsx — native (iOS/Android) static mini-map for the event page.
// Non-interactive: it shows where the venue is, the map tab handles exploring.
// Metro serves VenueMap.web.tsx on web (react-native-maps is native-only).
import { StyleProp, View, ViewStyle } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

export function VenueMap({
  latitude, longitude, height = 160, style,
}: {
  latitude: number;
  longitude: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ height, borderRadius: 16, overflow: 'hidden' }, style]} pointerEvents="none">
      <MapView
        style={{ flex: 1 }}
        initialRegion={{ latitude, longitude, latitudeDelta: 0.012, longitudeDelta: 0.012 }}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
      >
        <Marker coordinate={{ latitude, longitude }} />
      </MapView>
    </View>
  );
}
