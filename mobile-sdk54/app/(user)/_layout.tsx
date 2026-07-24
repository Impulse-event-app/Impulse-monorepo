import { Stack } from 'expo-router';
import { AppProvider } from '../../src/theme';

export const unstable_settings = {
  initialRouteName: 'sign-in',
};

export default function UserLayout() {
  return (
    <AppProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0F0E0D' } }}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="event/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="claim/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="confirm" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen
          name="filters"
          options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }}
        />
      </Stack>
    </AppProvider>
  );
}
