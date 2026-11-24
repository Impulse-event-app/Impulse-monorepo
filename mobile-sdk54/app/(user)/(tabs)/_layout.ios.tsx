// iOS tab bar: the system's native tabs, not the JS FloatingTabBar in
// _layout.tsx (which web and Android still use).
//
// Native tabs are what let iOS place the bar for us. On iPhone Duo (built with
// the iOS 27.1 SDK) the bar becomes a vertical rail beside the status bar when
// the phone is folded or open in landscape, and moves back to the bottom in
// portrait. A custom JS bar can't go into that rail. On iOS 26+ the native bar
// is liquid glass, so it keeps the look of the custom one.
//
// Screens keep their own bottom padding for the bar, as with the JS bar.
import { NativeTabs } from 'expo-router/native-tabs';
import { useTheme } from '../../../src/theme';

export default function TabsLayout() {
  const T = useTheme();
  return (
    <NativeTabs tintColor={T.accent} preferredPlacement="automatic" minimizeBehavior="never">
      <NativeTabs.Trigger name="home">
        <NativeTabs.Trigger.Icon sf={{ default: 'smallcircle.filled.circle', selected: 'smallcircle.filled.circle.fill' }} />
        <NativeTabs.Trigger.Label>What's on</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="discover">
        <NativeTabs.Trigger.Icon sf={{ default: 'play.rectangle', selected: 'play.rectangle.fill' }} />
        <NativeTabs.Trigger.Label>Discover</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="plans">
        <NativeTabs.Trigger.Icon sf={{ default: 'list.bullet.rectangle', selected: 'list.bullet.rectangle.fill' }} />
        <NativeTabs.Trigger.Label>Plans</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Icon sf={{ default: 'person', selected: 'person.fill' }} />
        <NativeTabs.Trigger.Label>You</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
