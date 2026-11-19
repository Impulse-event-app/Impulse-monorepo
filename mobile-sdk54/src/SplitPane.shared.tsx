// The split (two-pane) layout: a list on the leading side, the selected item's
// detail beside it. Used by Home and Discover when useLayoutMode() is 'split'
// (an open iPhone Duo, iPad, a wide browser window).
//
// The plain flexbox version: web, Android, and iOS below 27.1 (SplitPane.ts
// re-exports it; SplitPane.ios.tsx falls back to it).
// iOS 27.1+ uses SplitPane.ios.tsx, which lets the system place the split so
// it lands on the fold of a partially open iPhone Duo.
import { View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './theme';
import { LIST_PANE_WIDTH } from './layout';

export type SplitPaneProps = {
  list: React.ReactNode;
  detail: React.ReactNode;
};

/**
 * Gives each pane only the safe-area insets on its own outer edge. Screens
 * pad by useSafeAreaInsets(), so without this the list pane would also pad
 * for a rail on the far (detail) edge of the window, and the detail pane for
 * one on the list's edge.
 */
export function PaneInsets({ side, children }: { side: 'leading' | 'trailing'; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const value = side === 'leading'
    // Keep the list's header clear of the display's rounded top-left corner.
    // An open iPhone Duo in landscape has its status bar in the side rail, so
    // insets.top is 0 there and the logo was clipped by the corner.
    ? { ...insets, top: Math.max(insets.top, 18), left: Math.max(insets.left, 14), right: 0 }
    : { ...insets, left: 0 };
  return <SafeAreaInsetsContext.Provider value={value}>{children}</SafeAreaInsetsContext.Provider>;
}

export function SplitPane({ list, detail }: SplitPaneProps) {
  const T = useTheme();
  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <View style={{ width: LIST_PANE_WIDTH, maxWidth: '50%' }}>
        <PaneInsets side="leading">{list}</PaneInsets>
      </View>
      <View style={{ width: 1, backgroundColor: T.line }} />
      <View style={{ flex: 1 }}>
        <PaneInsets side="trailing">{detail}</PaneInsets>
      </View>
    </View>
  );
}
