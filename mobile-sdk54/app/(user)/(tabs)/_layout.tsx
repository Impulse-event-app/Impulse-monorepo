import { useEffect, useRef, useState } from 'react';
import { Tabs } from 'expo-router';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { MaybeDarkScope, useTheme } from '../../../src/theme';
import { FooterScrim, Glass, useReduceMotion, useReduceTransparency } from '../../../src/components';
import { TabTonight, TabDiscover, TabPlans, TabYou } from '../../../src/icons';
import { hapticSelection } from '../../../src/haptics';
import { expandTabBar, tabBarCompact } from '../../../src/tabBarScroll';

// The tab bar on every platform: a floating capsule of icons. Like
// Instagram's, it shrinks a little as a whole (every tab still visible) while
// you scroll a tab's list down, and grows back when you scroll up, reach the
// top or switch tabs (src/tabBarScroll.ts). Screens clear it via
// useTabBarClearance() in src/layout.ts (100pt, the bar at full size).

// On iPad (and wide Split View panes) the bar stays phone-sized and centred
// rather than stretching edge to edge.
const TAB_BAR_MAX_WIDTH = 520;

const BAR_HEIGHT = 56;
// Gap between the lens and the bar's edge.
const LENS_INSET = 4;
const NATIVE_DRIVER = Platform.OS !== 'web';
// Size of the bar when compact, as a fraction of full size (Instagram's is
// about 0.86).
const COMPACT_SCALE = 0.86;

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
// On Discover (full-screen reels) the bar goes dark so it stands out against
// the video, whatever the app's appearance.
function FloatingTabBar(props: BottomTabBarProps) {
  const onReels = props.state.routes[props.state.index]?.name === 'discover';
  return (
    <MaybeDarkScope dark={onReels}>
      <TabBar {...props} />
    </MaybeDarkScope>
  );
}

function TabBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const T = useTheme();
  const insets = useSafeAreaInsets();
  const solid = useReduceTransparency();
  const [barWidth, setBarWidth] = useState(0);
  const tabWidth = barWidth / state.routes.length;
  const lens = useLiquidLens(state.index, tabWidth);

  // A new tab starts with the bar at full size.
  useEffect(() => { expandTabBar(); }, [state.index]);

  // Scale the whole capsule, pinned at its bottom edge so it shrinks down
  // towards the home indicator rather than floating up.
  const scale = tabBarCompact.interpolate({ inputRange: [0, 1], outputRange: [1, COMPACT_SCALE] });
  const sink = tabBarCompact.interpolate({ inputRange: [0, 1], outputRange: [0, (BAR_HEIGHT * (1 - COMPACT_SCALE)) / 2] });

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
        <Animated.View style={[{ borderCurve: 'continuous', borderRadius: 27, width: '100%', maxWidth: TAB_BAR_MAX_WIDTH, transform: [{ translateY: sink }, { scale }] }, T.floatShadow]}>
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
                // Unselected icons in full text colour, like Instagram; the selected one in red.
                const color = focused ? T.accent : T.text;
                const label = (options.title ?? route.name) as string;

                const onPress = () => {
                  const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                  if (!focused && !event.defaultPrevented) {
                    hapticSelection();
                    navigateToTab(route.key);
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
                    {/* Icons only, like Instagram; VoiceOver reads the label. */}
                    {options.tabBarIcon?.({ focused, color, size: 27 })}
                  </Pressable>
                );
              })}
            </View>
          </Glass>
        </Animated.View>
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
          tabBarIcon: ({ focused, color, size }) => <TabTonight size={size} color={color} on={focused} />,
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Discover',
          tabBarIcon: ({ focused, color, size }) => <TabDiscover size={size} color={color} on={focused} />,
        }}
      />
      <Tabs.Screen
        name="plans"
        options={{
          title: 'Plans',
          tabBarIcon: ({ color, size }) => <TabPlans size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'You',
          tabBarIcon: ({ focused, color, size }) => <TabYou size={size} color={color} on={focused} />,
        }}
      />
    </Tabs>
  );
}
