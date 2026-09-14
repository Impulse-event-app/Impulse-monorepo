import { Tabs } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme, fontUI } from '../../../src/theme';
import { FooterScrim, Glass } from '../../../src/components';
import { TabTonight, TabMap, TabPlans, TabYou } from '../../../src/icons';
import { hapticSelection } from '../../../src/haptics';

// Height the floating bar occupies from the bottom of the screen. Scroll
// screens add this much bottom padding so content never hides behind it.
export const FLOATING_TAB_CLEARANCE = 100;

// On iPad (and wide Split View panes) the bar stays phone-sized and centred
// rather than stretching edge to edge.
const TAB_BAR_MAX_WIDTH = 520;

// Floating liquid-glass tab bar over a progressive scrim.
function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const T = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
      <FooterScrim opacity={0.92} extend={36} />
      <View
        pointerEvents="box-none"
        style={{ paddingHorizontal: 14, paddingBottom: insets.bottom > 0 ? Math.max(insets.bottom - 10, 8) : 16, alignItems: 'center' }}
      >
        <View style={[{ borderRadius: 27, width: '100%', maxWidth: TAB_BAR_MAX_WIDTH }, T.floatShadow]}>
          <Glass radius={27} style={{ height: 54, flexDirection: 'row', alignItems: 'center' }}>
            <View accessibilityRole="tablist" style={{ flex: 1, height: '100%', flexDirection: 'row', alignItems: 'center' }}>
              {state.routes.map((route, index) => {
                const { options } = descriptors[route.key];
                const focused = state.index === index;
                const color = focused ? T.accent : T.muted;
                const label = (options.title ?? route.name) as string;

                const onPress = () => {
                  const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                  if (!focused && !event.defaultPrevented) {
                    hapticSelection();
                    navigation.navigate(route.name);
                  }
                };

                return (
                  <Pressable
                    key={route.key}
                    onPress={onPress}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: focused }}
                    accessibilityLabel={label}
                    style={{ flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 2 }}
                  >
                    {options.tabBarIcon?.({ focused, color, size: 23 })}
                    <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={{ ...fontUI(focused ? 600 : 500), fontSize: 10.5, letterSpacing: -0.04, color }}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Glass>
        </View>
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const T = useTheme();
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: T.bg },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "What's on",
          tabBarIcon: ({ focused, color }) => <TabTonight color={color} on={focused} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ focused, color }) => <TabMap color={color} on={focused} />,
        }}
      />
      <Tabs.Screen
        name="plans"
        options={{
          title: 'Plans',
          tabBarIcon: ({ color }) => <TabPlans color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'You',
          tabBarIcon: ({ focused, color }) => <TabYou color={color} on={focused} />,
        }}
      />
    </Tabs>
  );
}
