// Shared presentational pieces for the two halves of the entry flow, which
// live at separate routes:
//   app/(user)/sign-in.tsx   — pre-login (hero + auth)
//   app/(user)/onboarding.tsx — post-login (the onboarding steps)
// Splitting the routes is what keeps sign-in and onboarding from sharing one
// pager, so a web OAuth reload lands cleanly on /onboarding at step 0 instead
// of trying to resume a scroll position mid-component.
import React from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontUI, useApp } from './theme';
import { Glass, READABLE_WIDTH } from './components';

/**
 * How wide one pager page should be.
 *
 * Prefer `usePagerWidth()` below, which *measures* the scroll container. This
 * is only the pre-measurement fallback.
 *
 * Never a module-level `Dimensions.get('window').width`: iPad rotates and
 * resizes in Split View, and on web the window is not the same thing as the
 * pager's laid-out width. A mismatch makes every page narrower than its
 * container — so the next page shows up alongside the current one instead of
 * off-screen.
 */
export function usePanelWidth(): number {
  return useWindowDimensions().width;
}

/**
 * Measured width of the paging ScrollView, with the window width as a fallback
 * for the first frame. Sizing pages from the container's own layout is what
 * guarantees exactly one page is visible — no reliance on the window matching
 * the element, which is where mobile web and iPad multitasking diverge.
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

const COLUMN = { width: '100%', maxWidth: READABLE_WIDTH, alignSelf: 'center' } as const;

/** Full-width page: scrollable body + optional pinned footer, content held to a readable width.
 *  `width` comes from usePagerWidth() so the page matches its container exactly.
 *  `inactive` hides an off-screen page from VoiceOver (pager pages stay mounted). */
export function Panel({
  children, footer, top = 0, width, scroll = true, inactive = false,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  top?: number;
  width?: number;
  scroll?: boolean;
  inactive?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const fallback = usePanelWidth();
  return (
    <View
      style={{ width: width ?? fallback, flex: 1 }}
      accessibilityElementsHidden={inactive}
      importantForAccessibility={inactive ? 'no-hide-descendants' : 'auto'}
    >
      {scroll ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: top }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={[COLUMN, { flexGrow: 1 }]}>{children}</View>
        </ScrollView>
      ) : (
        <View style={[COLUMN, { flex: 1, paddingTop: top }]}>{children}</View>
      )}
      {footer && (
        <View style={[COLUMN, { paddingHorizontal: 22, paddingTop: 12, paddingBottom: insets.bottom > 0 ? insets.bottom + 6 : 34, gap: 10 }]}>
          {footer}
        </View>
      )}
    </View>
  );
}

/** Title + optional body copy. */
export function Lede({ title, body }: { title: string; body?: string }) {
  const { T } = useApp();
  return (
    <View style={{ paddingHorizontal: 22 }}>
      <Text accessibilityRole="header" style={{ ...fontUI(600), fontSize: 30, lineHeight: 34, letterSpacing: -0.66, color: T.text }}>{title}</Text>
      {body && (
        <Text style={{ marginTop: 12, ...fontUI(400), fontSize: 17, lineHeight: 25, letterSpacing: -0.19, color: T.muted, maxWidth: 360 }}>
          {body}
        </Text>
      )}
    </View>
  );
}

/** Pager position: pill for the current page, dots for the rest. Read as "Step 2 of 7". */
export function PageDots({ count, index, onPress }: { count: number; index: number; onPress?: (i: number) => void }) {
  const { T } = useApp();
  const interactive = !!onPress;
  return (
    <View
      accessible={!interactive}
      accessibilityRole={interactive ? undefined : 'progressbar'}
      accessibilityLabel={interactive ? undefined : `Step ${index + 1} of ${count}`}
      accessibilityValue={interactive ? undefined : { min: 1, max: count, now: index + 1 }}
      style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <Pressable
          key={i}
          disabled={!interactive}
          onPress={() => onPress?.(i)}
          hitSlop={4}
          accessibilityElementsHidden={!interactive}
          importantForAccessibility={interactive ? 'auto' : 'no-hide-descendants'}
          accessibilityRole={interactive ? 'button' : undefined}
          accessibilityLabel={`Step ${i + 1} of ${count}`}
          style={{ width: i === index ? 20 : 6, height: 6, borderCurve: 'continuous', borderRadius: 3, backgroundColor: i === index ? T.accent : T.faint }}
        />
      ))}
    </View>
  );
}

/** 104pt glass plate that holds a permission glyph. Decorative. */
export function GlyphPlate({ children }: { children: React.ReactNode }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Glass radius={26} style={{ width: 104, height: 104, marginBottom: 30, alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </Glass>
    </View>
  );
}
