import { Tabs } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme, fontUI } from '../../../src/theme';
import { TabTonight, TabMap, TabPlans, TabYou } from '../../../src/icons';

// Height the floating bar occupies from the bottom of the screen. Scroll
// screens add this much bottom padding so content never hides behind it.
export const FLOATING_TAB_CLEARANCE = 96;

function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const T = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        paddingBottom: insets.bottom > 0 ? insets.bottom : 16,
      }}
    >
      <View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: T.surface,
            borderRadius: 30,
            padding: 6,
            borderWidth: 1,
            borderColor: T.line2,
          },
          T.shadow,
        ]}
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const color = focused ? T.accentInk : T.faint;
          const label = (options.title ?? route.name) as string;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={label}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 7,
                height: 44,
                paddingHorizontal: focused ? 16 : 13,
                borderRadius: 22,
                backgroundColor: focused ? T.accent : 'transparent',
              }}
            >
              {options.tabBarIcon?.({ focused, color, size: 21 })}
              {focused && (
                <Text style={{ fontFamily: fontUI(600), fontSize: 13.5, letterSpacing: -0.1, color: T.accentInk }}>
                  {label}
                </Text>
              )}
            </Pressable>
          );
        })}
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
