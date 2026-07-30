// DesktopNotice.web.tsx — web-only overlay nudging desktop visitors onto a
// phone. Impulse's screens (drops feed, huddles, ticket redemption) are laid
// out for a phone viewport, so a laptop visitor gets a stretched, off-brand
// first impression. Rather than block them, we explain and offer a QR to hop
// across, then let them continue.
//
// Mounted once in app/_layout.tsx, above the router, so it covers every route.
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { fontDisplay, fontMono, fontUI, tokens } from './theme';
import { persistGet, persistSet } from './persist';

const DISMISS_KEY = 'impulse.desktopNotice.dismissed';

// Below this the layout is already phone-shaped, so there's nothing to warn
// about — this also covers a desktop user who simply narrows their window.
const DESKTOP_MIN_WIDTH = 900;

/** True for a mouse-driven, desktop-sized viewport. Touch devices are excluded
 *  so a tablet in landscape (a perfectly good experience) is never nagged. */
function isDesktop(width: number): boolean {
  if (width < DESKTOP_MIN_WIDTH) return false;
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return !window.matchMedia('(pointer: coarse)').matches;
}

export function DesktopNotice() {
  const { width } = useWindowDimensions();
  // null = still reading the stored preference; render nothing until we know,
  // so the overlay never flashes for someone who already dismissed it.
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    persistGet(DISMISS_KEY).then((v) => setDismissed(v === '1'));
  }, []);

  if (dismissed !== false || !isDesktop(width)) return null;

  const t = tokens(true); // Root layout has no AppProvider; the app chrome is dark.

  function dismiss() {
    setDismissed(true);
    persistSet(DISMISS_KEY, '1');
  }

  // On a deployed build this is the shareable app URL. On a localhost dev
  // server it will not resolve from a phone — the URL is printed below the
  // code so it stays useful either way.
  const url = typeof window !== 'undefined' ? window.location.href : 'impulse.app';

  return (
    <View
      // @ts-expect-error — RN types have no 'fixed', but react-native-web
      // supports it, and it keeps the overlay put if the page scrolls.
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 9999,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        backgroundColor: 'rgba(10,9,8,0.88)',
      }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: 460,
          padding: 36,
          borderRadius: 22,
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.line2,
          alignItems: 'center',
          ...(t.shadow as object),
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 18 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.accent }} />
          <Text style={{ fontFamily: fontMono(400), fontSize: 11, letterSpacing: 1.6, color: t.faint }}>
            IMPULSE
          </Text>
        </View>

        <Text
          style={{
            fontFamily: fontDisplay(700), fontSize: 26, lineHeight: 32,
            color: t.text, textAlign: 'center', marginBottom: 10,
          }}
        >
          Best experienced on your phone
        </Text>

        <Text
          style={{
            fontFamily: fontUI(400), fontSize: 14.5, lineHeight: 21,
            color: t.muted, textAlign: 'center', marginBottom: 26,
          }}
        >
          Impulse is built for a phone screen — live drops, huddles with friends,
          and scanning your ticket at the door. Scan this code to pick up where
          you left off.
        </Text>

        <View style={{ padding: 14, borderRadius: 16, backgroundColor: '#FFFFFF', marginBottom: 14 }}>
          <QRCode value={url} size={148} backgroundColor="#FFFFFF" color="#0F0E0D" />
        </View>

        <Text
          numberOfLines={1}
          style={{ fontFamily: fontMono(400), fontSize: 11, color: t.faint, marginBottom: 26 }}
        >
          {url.replace(/^https?:\/\//, '')}
        </Text>

        <Pressable
          onPress={dismiss}
          style={{
            paddingVertical: 13, paddingHorizontal: 24, borderRadius: 12,
            borderWidth: 1, borderColor: t.line2, backgroundColor: t.surface2,
          }}
        >
          <Text style={{ fontFamily: fontUI(600), fontSize: 14, color: t.text }}>
            Continue on desktop anyway
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
