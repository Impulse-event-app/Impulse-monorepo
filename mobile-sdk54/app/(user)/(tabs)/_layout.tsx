import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, fontUI } from '../../../src/theme';
import { TabTonight, TabMap, TabPlans, TabYou } from '../../../src/icons';

export default function TabsLayout() {
  const T = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: T.bg,
          borderTopColor: T.line,
          borderTopWidth: 0.5,
          height: 58 + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 10,
        },
        tabBarActiveTintColor: T.accent,
        tabBarInactiveTintColor: T.faint,
        tabBarLabelStyle: { fontFamily: fontUI(600), fontSize: 11, letterSpacing: -0.1 },
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
