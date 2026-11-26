// Feeds the iPhone Duo's hinge status into src/layout.ts (setHingeStatus), so
// the layout can spot the upright, partially open pose (useSplitAxis()).
//
// SwiftUI only reports the hinge to views in a SwiftUI hierarchy, so this is a
// 1pt, invisible SwiftUI host whose only job is the onHingeChange modifier.
// Mounted once, in app/_layout.tsx. On iOS before 27.1 and devices without a
// hinge the status stays 'unknown'.
import { View } from 'react-native';
import { Host, VStack } from '@expo/ui/swift-ui';
import { onHingeChange } from '@expo/ui/swift-ui/modifiers';
import { setHingeStatus } from './layout';

const report = onHingeChange((_, next) => setHingeStatus(next.hinge?.status ?? 'unknown'));

export function HingeObserver() {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', top: 0, left: 0, width: 1, height: 1, opacity: 0 }}
    >
      <Host style={{ width: 1, height: 1 }}>
        <VStack modifiers={[report]}>{null}</VStack>
      </Host>
    </View>
  );
}
