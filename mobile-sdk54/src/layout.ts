// Window-size layout helpers: the one place the app decides between the phone
// layout and the split (two-pane) layout.
//
// Everything here reads the window at render time, never the device. An iPhone
// Duo is a phone whose window grows when it unfolds and shrinks when it folds,
// mid-session, so a value cached at launch (or a Platform.isPad check) would be
// wrong after the first fold. Apple's rule for Duo: lay out by available space,
// not by idiom, orientation or a list of known screen sizes.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Below this window width the app uses the single-column phone layout. */
export const SPLIT_MIN_WIDTH = 700;

/**
 * And below this height. An iPhone in landscape is wide enough (about 874pt)
 * but only about 400pt tall: the list pane's header and filters would fill it,
 * leaving no room for drops. Seen on the iPhone 17 Pro simulator.
 */
export const SPLIT_MIN_HEIGHT = 500;

/**
 * Width of the list pane in the split layout: half the window, so on an open
 * iPhone Duo the split lands on the hinge and neither pane runs across the
 * fold. The detail pane takes the other half.
 */
export function useListPaneWidth(): number {
  const { width } = useWindowDimensions();
  return Math.floor(width / 2);
}

export type LayoutMode = 'compact' | 'split';

// ── hinge ────────────────────────────────────────────────────
// The iPhone Duo's hinge status, fed by HingeObserver (src/HingeObserver.ios.tsx,
// mounted once in app/_layout.tsx) from SwiftUI's onHingeChange. Stays
// 'unknown' on devices without a hinge, Android, web and iOS before 27.1.
// Used only to spot one pose the window size can't: see useSplitAxis().
export type HingeStatus = 'closed' | 'partiallyOpen' | 'fullyOpen' | 'unknown';
let hingeStatus: HingeStatus = 'unknown';
const hingeListeners = new Set<() => void>();

export function setHingeStatus(status: HingeStatus) {
  if (status === hingeStatus) return;
  hingeStatus = status;
  hingeListeners.forEach((l) => l());
}

function useHingeStatus(): HingeStatus {
  return useSyncExternalStore(
    (l) => {
      hingeListeners.add(l);
      return () => hingeListeners.delete(l);
    },
    () => hingeStatus,
    () => hingeStatus,
  );
}

/**
 * Which way the split layout divides the window.
 *
 * `'horizontal'` (side by side) normally. `'vertical'` (one pane above the
 * other) on an iPhone Duo held upright and partially open, like a small
 * laptop: the fold then runs across the middle of the screen, so a single
 * column would have its content bent over the crease. Split top and bottom,
 * the list sits on the upright half and the picked drop, with its Book now
 * button, on the half lying flat, within reach of a thumb.
 */
export function useSplitAxis(): 'horizontal' | 'vertical' {
  const { width, height } = useWindowDimensions();
  const hinge = useHingeStatus();
  return hinge === 'partiallyOpen' && height > width && height >= SPLIT_MIN_WIDTH ? 'vertical' : 'horizontal';
}

/**
 * `'split'` when the window has room for a list and a detail side by side: an
 * open iPhone Duo in landscape, an iPad, a large browser window. Also an
 * iPhone Duo held upright and partially open, split top and bottom
 * (useSplitAxis()). Every normal iPhone (in either orientation) and a folded
 * Duo are `'compact'`.
 */
export function useLayoutMode(): LayoutMode {
  const { width, height } = useWindowDimensions();
  const axis = useSplitAxis();
  if (axis === 'vertical') return 'split';
  return width >= SPLIT_MIN_WIDTH && height >= SPLIT_MIN_HEIGHT ? 'split' : 'compact';
}

/**
 * Bottom padding a tab screen needs so its last row clears the floating tab
 * bar (app/(user)/(tabs)/_layout.tsx), on every platform. The bar only ever
 * shrinks on scroll, so its full size is what content must clear.
 */
export function useTabBarClearance(): number {
  return 100;
}

/** Height of the floating tab bar's capsule. */
export const TAB_BAR_HEIGHT = 56;

/** Gap between the bottom of the window and the floating tab bar. */
export function tabBarBottomGap(insetBottom: number): number {
  return insetBottom > 0 ? Math.max(insetBottom - 10, 8) : 16;
}

/**
 * How far the floating tab bar reaches up from the bottom of the window, plus
 * a little air. The split layout's detail pane uses it as its bottom safe-area
 * inset, so its pinned Book now bar sits above the tab bar instead of under it.
 */
export function tabBarFootprint(insetBottom: number): number {
  return tabBarBottomGap(insetBottom) + TAB_BAR_HEIGHT + 8;
}

/**
 * Left and right padding that keeps content clear of the iPhone Duo's rail
 * and status bar, which sit on the camera edge (either side, depending on
 * pose and Split View). Zero on a normal iPhone in portrait.
 */
export function useSideInsets(extra = 0): { paddingLeft: number; paddingRight: number } {
  const insets = useSafeAreaInsets();
  return { paddingLeft: insets.left + extra, paddingRight: insets.right + extra };
}

// ── split-layout selection ───────────────────────────────────
// The drop shown in each tab's detail pane. Tiny module stores rather than
// screen state, so they survive the screen remounting and can be set from the
// event route (which hands its drop to Home's pane when the phone unfolds).
// Home and Discover keep separate selections: Discover's follows the reel
// that's playing, and that mustn't change what Home's pane shows.
export type SplitPaneKey = 'home' | 'discover';
const selectedDeal: Record<SplitPaneKey, string | null> = { home: null, discover: null };
const listeners = new Set<() => void>();

export function setSelectedDeal(id: string | null, key: SplitPaneKey = 'home') {
  if (id === selectedDeal[key]) return;
  selectedDeal[key] = id;
  listeners.forEach((l) => l());
}

export function useSelectedDeal(key: SplitPaneKey = 'home'): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => selectedDeal[key],
    () => selectedDeal[key],
  );
}

/**
 * Calls `onChange(mode)` when the layout mode changes after mount: an iPhone
 * Duo folding (split → compact) or unfolding (compact → split), a window
 * resize on iPad. Not called for the first render.
 */
export function useLayoutModeChange(onChange: (mode: LayoutMode) => void): LayoutMode {
  const mode = useLayoutMode();
  const prev = useRef(mode);
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    if (prev.current === mode) return;
    prev.current = mode;
    cb.current(mode);
  }, [mode]);
  return mode;
}
