// Shared presentational pieces for the two halves of the entry flow, which
// live at separate routes:
//   app/(user)/sign-in.tsx   — pre-login (hero + auth)
//   app/(user)/onboarding.tsx — post-login (the onboarding steps)
// Splitting the routes is what keeps sign-in and onboarding from sharing one
// pager, so a web OAuth reload lands cleanly on /onboarding at step 0 instead
// of trying to resume a scroll position mid-component.
import React from 'react';
import { ScrollView, Text, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontDisplay, fontMono, fontUI, useApp } from './theme';

/**
 * How wide one pager page should be.
 *
 * Prefer `usePagerWidth()` below, which *measures* the scroll container. This
 * is only the pre-measurement fallback.
 *
 * Never a module-level `Dimensions.get('window').width`: native is
 * orientation-locked so a frozen value happens to work there, but on web the
 * window is not the same thing as the pager's laid-out width, and a mismatch
 * makes every page narrower than its container — so the next page shows up
 * alongside the current one instead of off-screen.
 */
export function usePanelWidth(): number {
  return useWindowDimensions().width;
}

/**
 * Measured width of the paging ScrollView, with the window width as a fallback
 * for the first frame. Sizing pages from the container's own layout is what
 * guarantees exactly one page is visible — no reliance on the window matching
 * the element, which is where mobile web diverges from native.
 *
 * Returns [width, onLayout] — spread onLayout onto the paging ScrollView.
 */
export function usePagerWidth(): [number, (e: LayoutChangeEvent) => void] {
  const fallback = useWindowDimensions().width;
  const [measured, setMeasured] = React.useState(0);
  const onLayout = React.useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    // Guard the no-op case so layout passes can't loop.
    setMeasured((prev) => (Math.abs(prev - w) < 0.5 ? prev : w));
  }, []);
  return [measured || fallback, onLayout];
}

/** Full-width page: scrollable body + optional pinned footer.
 *  `width` comes from usePagerWidth() so the page matches its container exactly. */
export function Panel({ children, footer, top = 0, width }: { children: React.ReactNode; footer?: React.ReactNode; top?: number; width?: number }) {
  const insets = useSafeAreaInsets();
  const fallback = usePanelWidth();
  return (
    <View style={{ width: width ?? fallback, flex: 1 }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: top }} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
      {footer && (
        <View style={{ paddingHorizontal: 22, paddingTop: 12, paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : 24, gap: 10 }}>{footer}</View>
      )}
    </View>
  );
}

/** Kicker + large title + optional body copy. */
export function Lede({ kicker, title, body }: { kicker?: string; title: string; body?: string }) {
  const { T } = useApp();
  return (
    <View style={{ paddingHorizontal: 24 }}>
      {kicker && <Text style={{ fontFamily: fontMono(400), fontSize: 11.5, letterSpacing: 1.4, textTransform: 'uppercase', color: T.accent, marginBottom: 14 }}>{kicker}</Text>}
      <Text style={{ fontFamily: fontDisplay(700), fontSize: 32, lineHeight: 35, letterSpacing: -0.96, color: T.text }}>{title}</Text>
      {body && <Text style={{ marginTop: 14, fontFamily: fontUI(400), fontSize: 16.5, lineHeight: 25, color: T.muted, maxWidth: 330 }}>{body}</Text>}
    </View>
  );
}
