// Window-size layout helpers: the one place the app decides between the phone
// layout and the split (two-pane) layout.
//
// Everything here reads the window at render time, never the device. An iPhone
// Duo is a phone whose window grows when it unfolds and shrinks when it folds,
// mid-session, so a value cached at launch (or a Platform.isPad check) would be
// wrong after the first fold. Apple's rule for Duo: lay out by available space,
// not by idiom, orientation or a list of known screen sizes.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Below this window width the app uses the single-column phone layout. */
export const SPLIT_MIN_WIDTH = 700;

/**
 * And below this height. An iPhone in landscape is wide enough (about 874pt)
 * but only about 400pt tall: the list pane's header and filters would fill it,
 * leaving no room for drops. Seen on the iPhone 17 Pro simulator.
 */
export const SPLIT_MIN_HEIGHT = 500;

/** Width of the list pane in the split layout. The detail pane takes the rest. */
export const LIST_PANE_WIDTH = 400;

export type LayoutMode = 'compact' | 'split';

/**
 * `'split'` when the window has room for a list and a detail side by side: an
 * open iPhone Duo in landscape, an iPad, a large browser window. Every normal
 * iPhone (in either orientation) and a folded Duo are `'compact'`.
 */
export function useLayoutMode(): LayoutMode {
  const { width, height } = useWindowDimensions();
  return width >= SPLIT_MIN_WIDTH && height >= SPLIT_MIN_HEIGHT ? 'split' : 'compact';
}

/**
 * Bottom padding a tab screen needs so its last row clears the tab bar.
 *
 * iOS uses native tabs (app/(user)/(tabs)/_layout.ios.tsx): the bar is
 * included in insets.bottom only while it sits along the bottom, so when iOS
 * moves it into the side rail (iPhone Duo folded or landscape) no space is
 * wasted. Web and Android draw the floating JS bar, which needs a fixed 100.
 */
export function useTabBarClearance(): number {
  const insets = useSafeAreaInsets();
  return Platform.OS === 'ios' ? insets.bottom : 100;
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
