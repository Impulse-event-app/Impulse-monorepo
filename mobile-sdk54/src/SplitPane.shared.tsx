// The split (two-pane) layout: a list on the leading side, the selected item's
// detail beside it (or below it: see useSplitAxis() in src/layout.ts). Used by Home and Discover when useLayoutMode() is 'split'
// (an open iPhone Duo, iPad, a wide browser window).
//
// The plain flexbox version: web, Android, and iOS below 27.1 (SplitPane.ts
// re-exports it; SplitPane.ios.tsx falls back to it).
// iOS 27.1+ uses SplitPane.ios.tsx, which lets the system place the split so
// it lands on the fold of a partially open iPhone Duo.
import { View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './theme';
import { tabBarFootprint, useListPaneWidth } from './layout';

export type SplitPaneProps = {
  list: React.ReactNode;
  detail: React.ReactNode;
};

/**
 * Gives each pane only the safe-area insets on its own outer edges. Screens
 * pad by useSafeAreaInsets(), so without this the list pane would also pad
 * for a rail on the far (detail) edge of the window, and the detail pane for
 * one on the list's edge.
 *
 * `axis` is the split's direction (useSplitAxis()): side by side, or one pane
 * above the other on an upright, partially open iPhone Duo.
 */
export function PaneInsets({ side, axis = 'horizontal', children }: {
  side: 'leading' | 'trailing';
  axis?: 'horizontal' | 'vertical';
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  // The floating tab bar spans the whole window, so the detail pane (which
  // touches the window's bottom edge in both directions) treats it as part of
  // its bottom edge: its Book now bar then sits above the tab bar rather than
  // under it. (The list pane already pads its scroll content by
  // useTabBarClearance().)
  const detailBottom = tabBarFootprint(insets.bottom);
  let value;
  if (axis === 'vertical') {
    value = side === 'leading'
      // Top pane: ends at the fold, so nothing below it to clear. The tab bar
      // is in the bottom pane, so the list needs no room for it either.
      ? { ...insets, bottom: 0 }
      // Bottom pane: starts at the fold.
      : { ...insets, top: 0, bottom: detailBottom };
  } else {
    value = side === 'leading'
      // Keep the list's header clear of the display's rounded top-left corner.
      // An open iPhone Duo in landscape has its status bar in the side rail, so
      // insets.top is 0 there and the logo was clipped by the corner.
      ? { ...insets, top: Math.max(insets.top, 18), left: Math.max(insets.left, 14), right: 0 }
      : { ...insets, left: 0, bottom: detailBottom };
  }
  return <SafeAreaInsetsContext.Provider value={value}>{children}</SafeAreaInsetsContext.Provider>;
}

export function SplitPane({ list, detail }: SplitPaneProps) {
  const T = useTheme();
  const listWidth = useListPaneWidth();
  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <View style={{ width: listWidth }}>
        <PaneInsets side="leading">{list}</PaneInsets>
      </View>
      {/* The divider is the detail pane's own edge, so the split stays exactly at half. */}
      <View style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: T.line }}>
        <PaneInsets side="trailing">{detail}</PaneInsets>
      </View>
    </View>
  );
}
