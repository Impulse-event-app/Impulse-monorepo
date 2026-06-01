import { Tabs } from 'expo-router';
import { Text } from 'react-native';

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Dashboard: '📊',
    'Add Deal': '➕',
    Events: '📋',
    Venue: '🏢',
  };
  return (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.45 }}>
      {icons[label]}
    </Text>
  );
}

export default function AdminLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0D0D0D',
          borderTopColor: '#2C2C2E',
          borderTopWidth: 1,
          height: 80,
          paddingBottom: 20,
        },
        tabBarActiveTintColor: '#FF5C35',
        tabBarInactiveTintColor: '#8E8E93',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ focused }) => <TabIcon label="Dashboard" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="add-event"
        options={{
          title: 'Add Deal',
          tabBarIcon: ({ focused }) => <TabIcon label="Add Deal" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: 'Events',
          tabBarIcon: ({ focused }) => <TabIcon label="Events" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="venue"
        options={{
          title: 'Venue',
          tabBarIcon: ({ focused }) => <TabIcon label="Venue" focused={focused} />,
        }}
      />
      {/* Hide edit route from tab bar */}
      <Tabs.Screen name="event/[id]" options={{ href: null }} />
    </Tabs>
  );
}
