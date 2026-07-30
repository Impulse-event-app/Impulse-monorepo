// Shared presentational pieces for the two halves of the entry flow, which
// live at separate routes:
//   app/(user)/sign-in.tsx   — pre-login (hero + auth)
//   app/(user)/onboarding.tsx — post-login (the onboarding steps)
// Splitting the routes is what keeps sign-in and onboarding from sharing one
// pager, so a web OAuth reload lands cleanly on /onboarding at step 0 instead
// of trying to resume a scroll position mid-component.
import React from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontDisplay, fontMono, fontUI, useApp } from './theme';

/**
 * Live width of one pager page.
 *
 * Must be a hook, never a module-level `Dimensions.get('window').width`. Native
 * is orientation-locked so a frozen value happens to work there, but on mobile
 * web the viewport changes constantly — URL bar collapsing, rotation, and the
 * on-screen keyboard opening on the sign-in inputs. A stale width leaves the
 * paging ScrollView's pages the wrong size and every scrollTo() offset wrong,
 * which strands the user between two panels (and both pagers set
 * scrollEnabled={false}, so they can't swipe out of it).
 */
export function usePanelWidth(): number {
  return useWindowDimensions().width;
}

/** Full-width page: scrollable body + optional pinned footer. */
export function Panel({ children, footer, top = 0 }: { children: React.ReactNode; footer?: React.ReactNode; top?: number }) {
  const insets = useSafeAreaInsets();
  const width = usePanelWidth();
  return (
    <View style={{ width, flex: 1 }}>
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
