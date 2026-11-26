// Scroll-driven shrink for the floating tab bar (app/(user)/(tabs)/_layout.tsx).
//
// Like Instagram's bar: scrolling down a tab's list shrinks the whole capsule
// a little (every tab stays visible and tappable), scrolling up or reaching
// the top brings it back to full size. Tab screens report their scroll with
// reportTabScroll (useScrolled does it when asked); the bar reads
// tabBarCompact, 0 = full size, 1 = compact.
import { useEffect, useSyncExternalStore } from 'react';
import { Animated, Platform } from 'react-native';

export const tabBarCompact = new Animated.Value(0);

// Below this offset the bar is always full size.
const TOP_ZONE = 24;
// How far you must scroll in one direction before the bar changes, so a
// finger resting on the list or a small bounce doesn't flicker it.
const DIRECTION_SLOP = 12;

let compact = false;
let lastY = 0;
let travel = 0;

function animateTo(next: boolean) {
  if (next === compact) return;
  compact = next;
  Animated.spring(tabBarCompact, {
    toValue: next ? 1 : 0,
    stiffness: 260,
    damping: 28,
    mass: 0.9,
    useNativeDriver: Platform.OS !== 'web',
  }).start();
}

/** Feed a tab list's vertical content offset on every scroll event. */
export function reportTabScroll(y: number) {
  const delta = y - lastY;
  lastY = y;
  if (y <= TOP_ZONE) {
    travel = 0;
    animateTo(false);
    return;
  }
  // Restart the count whenever the direction flips.
  travel = Math.sign(delta) === Math.sign(travel) ? travel + delta : delta;
  if (travel > DIRECTION_SLOP) animateTo(true);
  else if (travel < -DIRECTION_SLOP) animateTo(false);
}

/** Back to full size, e.g. on a tab change. Forgets the last scroll offset. */
export function expandTabBar() {
  travel = 0;
  lastY = 0;
  animateTo(false);
}

// ── swiping between tabs ─────────────────────────────────────
// A horizontal swipe on a tab screen moves to the next or previous tab. A
// screen turns it off while it needs horizontal drags itself (Home's map).

const blockers = new Set<string>();
const swipeListeners = new Set<() => void>();
const emit = () => swipeListeners.forEach((l) => l());

/** Turn tab swiping off while `blocked` is true (keyed so screens don't clash). */
export function useBlockTabSwipe(key: string, blocked: boolean) {
  useEffect(() => {
    if (!blocked) return;
    blockers.add(key);
    emit();
    return () => { blockers.delete(key); emit(); };
  }, [key, blocked]);
}

export function useTabSwipeEnabled(): boolean {
  return useSyncExternalStore(
    (l) => { swipeListeners.add(l); return () => { swipeListeners.delete(l); }; },
    () => blockers.size === 0,
    () => true,
  );
}
