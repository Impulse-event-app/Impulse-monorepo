// DesktopNotice.web.tsx — web-only overlay nudging desktop visitors onto a
// phone. Impulse's screens (drops feed, huddles, ticket redemption) are laid
// out for a phone viewport, so a laptop visitor gets a stretched, off-brand
// first impression. Rather than block them, we explain and offer a QR to hop
// across, then let them continue.
//
// Mounted once in app/_layout.tsx, above the router, so it covers every route.
// There's no AppProvider up here, so this reads tokens directly and only uses
// components that don't need the theme context (Radar).
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { fontMono, fontUI, tokens } from './theme';
import { Radar } from './components';
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

  const t = tokens(true); // The app ground is dark by default.

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
        backgroundColor: 'rgba(10,10,10,0.88)',
      }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: 440,
          padding: 36,
          borderRadius: 14,
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.line,
          alignItems: 'center',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <Radar size={30} />
          <Text style={{ ...fontUI(600), fontSize: 20, letterSpacing: -0.66, color: t.text }}>Impulse</Text>
        </View>

        <Text
          style={{
            ...fontUI(600), fontSize: 26, lineHeight: 31, letterSpacing: -0.57,
            color: t.text, textAlign: 'center', marginBottom: 10,
          }}
        >
          Best on your phone.
        </Text>

        <Text
          style={{
            ...fontUI(400), fontSize: 17, lineHeight: 25, letterSpacing: -0.19,
            color: t.muted, textAlign: 'center', marginBottom: 26,
          }}
        >
          Impulse is built for a phone: live drops, huddles with friends and your code at the door. Scan to pick up where you left off.
        </Text>

        <View style={{ padding: 14, borderRadius: 14, backgroundColor: '#FFFFFF', marginBottom: 14 }}>
          <QRCode value={url} size={148} backgroundColor="#FFFFFF" color="#0A0A0A" />
        </View>

        <Text numberOfLines={1} style={{ ...fontMono(400, 13), fontSize: 13, color: t.muted, marginBottom: 26 }}>
          {url.replace(/^https?:\/\//, '')}
        </Text>

        <Pressable
          onPress={dismiss}
          style={({ pressed }) => ({
            height: 44, paddingHorizontal: 20, borderRadius: 22, justifyContent: 'center',
            borderWidth: 1, borderColor: t.line2, backgroundColor: pressed ? t.fill : 'transparent',
          })}
        >
          <Text style={{ ...fontUI(500), fontSize: 15, letterSpacing: -0.12, color: t.text }}>
            Continue on desktop
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
