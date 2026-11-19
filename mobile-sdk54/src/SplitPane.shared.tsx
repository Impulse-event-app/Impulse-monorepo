// The split (two-pane) layout: a list on the leading side, the selected item's
// detail beside it in a floating card. Used by Home and Discover when
// useLayoutMode() is 'split' (an open iPhone Duo in landscape, iPad, a large
// browser window).
//
// The plain flexbox version: web, Android, and iOS below 27.1 (SplitPane.ts
// re-exports it; SplitPane.ios.tsx falls back to it). iOS 27.1+ uses
// SplitPane.ios.tsx, which lets the system place the split so it lands on the
// fold of a partially open iPhone Duo. Both use ListPane and DetailCard below.
import { View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './theme';
import { LIST_PANE_WIDTH } from './layout';

export type SplitPaneProps = {
  list: React.ReactNode;
  detail: React.ReactNode;
};

/**
 * Space kept between content and the display's rounded corners. An open iPhone
 * Duo in landscape has its status bar in the side rail, so insets.top is 0 and
 * a header would otherwise start in the corner (the logo was clipped).
 */
const CORNER_TOP = 18;
const CORNER_SIDE = 14;
/** Gutter around the floating detail card. */
const GUTTER = 10;
/** Echoes the display's own corner radius. */
const CARD_RADIUS = 30;

/**
 * The list pane. Screens pad by useSafeAreaInsets(), so the pane hands them
 * insets for its own edges only: the leading side and top (with a minimum, to
 * clear the rounded corners), and nothing on the side facing the detail card.
 */
export function ListPane({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const value = {
    top: Math.max(insets.top, CORNER_TOP),
    bottom: insets.bottom,
    left: Math.max(insets.left, CORNER_SIDE),
    right: 0,
  };
  return <SafeAreaInsetsContext.Provider value={value}>{children}</SafeAreaInsetsContext.Provider>;
}

/**
 * The detail pane: a rounded card floating in a gutter, clear of the corners,
 * the rail and the home indicator. Inside it the safe area is zero, since the
 * card itself already sits clear of everything.
 */
export function DetailCard({ children }: { children: React.ReactNode }) {
  const T = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flex: 1,
        marginTop: Math.max(insets.top, GUTTER),
        marginBottom: Math.max(insets.bottom, GUTTER),
        marginRight: insets.right + GUTTER,
        marginLeft: GUTTER / 2,
      }}
    >
      <View style={[{ flex: 1, borderCurve: 'continuous', borderRadius: CARD_RADIUS }, T.floatShadow]}>
        <View
          style={{
            flex: 1, overflow: 'hidden', borderCurve: 'continuous', borderRadius: CARD_RADIUS,
            backgroundColor: T.bg, borderWidth: 1, borderColor: T.line,
          }}
        >
          <SafeAreaInsetsContext.Provider value={{ top: 0, bottom: 0, left: 0, right: 0 }}>
            {children}
          </SafeAreaInsetsContext.Provider>
        </View>
      </View>
    </View>
  );
}

export function SplitPane({ list, detail }: SplitPaneProps) {
  const T = useTheme();
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: T.bg }}>
      <View style={{ width: LIST_PANE_WIDTH, maxWidth: '50%' }}>
        <ListPane>{list}</ListPane>
      </View>
      <View style={{ flex: 1 }}>
        <DetailCard>{detail}</DetailCard>
      </View>
    </View>
  );
}
