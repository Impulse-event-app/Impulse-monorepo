import { useEffect, useRef, useState } from 'react';
import { Tabs } from 'expo-router';
import { Animated, Easing, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme, fontUI } from '../../../src/theme';
import { FooterScrim, Glass, useReduceMotion, useReduceTransparency } from '../../../src/components';
import { TabTonight, TabMap, TabPlans, TabYou } from '../../../src/icons';
import { hapticSelection } from '../../../src/haptics';

// Height the floating bar occupies from the bottom of the screen. Scroll
// screens add this much bottom padding so content never hides behind it.
export const FLOATING_TAB_CLEARANCE = 100;

// On iPad (and wide Split View panes) the bar stays phone-sized and centred
// rather than stretching edge to edge.
const TAB_BAR_MAX_WIDTH = 520;

const BAR_HEIGHT = 54;
// Gap between the lens and the bar's edge.
const LENS_INSET = 4;
const NATIVE_DRIVER = Platform.OS !== 'web';

/**
 * The selection "lens": a brighter pane of glass behind the focused tab that
 * moves like liquid when the tab changes. It springs to the new tab while
 * stretching along the direction of travel and flattening a little, then
 * settles back into shape with a small overshoot. Longer jumps stretch more.
 *
 * Transform-only (translateX / scaleX / scaleY) so it runs on the native
 * driver. Reduce Motion: it moves straight to the tab. Reduce Transparency:
 * the lens is solid.
 */
function useLiquidLens(index: number, tabWidth: number) {
  const reduceMotion = useReduceMotion();
  const x = useRef(new Animated.Value(0)).current;
  const stretch = useRef(new Animated.Value(0)).current;
  const prevIndex = useRef(index);
  const placed = useRef(false);

  useEffect(() => {
    if (!tabWidth) return;
    const to = index * tabWidth;
    const hops = Math.abs(index - prevIndex.current);
    prevIndex.current = index;

    // First layout, rotation/resize, or Reduce Motion: no travel animation.
    if (!placed.current || hops === 0 || reduceMotion) {
      placed.current = true;
      x.stopAnimation();
      stretch.stopAnimation();
      x.setValue(to);
      stretch.setValue(0);
      return;
    }

    const peak = Math.min(0.5, 0.22 + 0.09 * hops);
    Animated.parallel([
      Animated.spring(x, { toValue: to, stiffness: 240, damping: 24, mass: 0.9, useNativeDriver: NATIVE_DRIVER }),
      Animated.sequence([
        Animated.timing(stretch, { toValue: peak, duration: 130, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER }),
        // Under-damped on the way back, so the lens wobbles once as it lands.
        Animated.spring(stretch, { toValue: 0, stiffness: 210, damping: 13, mass: 0.8, useNativeDriver: NATIVE_DRIVER }),
      ]),
    ]).start();
  }, [index, tabWidth, reduceMotion, x, stretch]);

  const scaleX = stretch.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 2] });
  const scaleY = stretch.interpolate({ inputRange: [-1, 0, 1], outputRange: [1.3, 1, 0.7] });
  return { x, scaleX, scaleY };
}

// Floating liquid-glass tab bar over a progressive scrim.
function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const T = useTheme();
  const insets = useSafeAreaInsets();
  const solid = useReduceTransparency();
  const [barWidth, setBarWidth] = useState(0);
  const tabWidth = barWidth / state.routes.length;
  const lens = useLiquidLens(state.index, tabWidth);

  const lensFill = solid
    ? (T.dark ? T.surface2 : '#FFFFFF')
    : (T.dark ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.88)');

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
      <FooterScrim opacity={0.92} extend={36} />
      <View
        pointerEvents="box-none"
        style={{ paddingHorizontal: 14, paddingBottom: insets.bottom > 0 ? Math.max(insets.bottom - 10, 8) : 16, alignItems: 'center' }}
      >
        <View style={[{ borderCurve: 'continuous', borderRadius: 27, width: '100%', maxWidth: TAB_BAR_MAX_WIDTH }, T.floatShadow]}>
          <Glass radius={27} style={{ height: BAR_HEIGHT, flexDirection: 'row', alignItems: 'center' }}>
            {tabWidth > 0 && (
              <Animated.View
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{
                  position: 'absolute',
                  top: LENS_INSET,
                  left: LENS_INSET,
                  width: tabWidth - LENS_INSET * 2,
                  height: BAR_HEIGHT - LENS_INSET * 2,
                  borderCurve: 'continuous', borderRadius: (BAR_HEIGHT - LENS_INSET * 2) / 2,
                  backgroundColor: lensFill,
                  borderWidth: 0.5,
                  borderColor: T.dark ? T.glassEdge : T.line,
                  shadowColor: '#000',
                  shadowOpacity: T.dark ? 0 : 0.08,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 2 },
                  transform: [{ translateX: lens.x }, { scaleX: lens.scaleX }, { scaleY: lens.scaleY }],
                }}
              />
            )}
            <View
              accessibilityRole="tablist"
              onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
              style={{ flex: 1, height: '100%', flexDirection: 'row', alignItems: 'center' }}
            >
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
