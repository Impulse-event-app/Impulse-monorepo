// A drop's detail: hero, price, blurb, map and the Book now bar.
//
// Rendered two ways:
// - full screen by the route app/(user)/event/[id].tsx (phones, folded Duo);
// - `embedded` in the detail pane of the split layout (open iPhone Duo, iPad),
//   beside the list it was picked from. Embedded, there is no back button (the
//   list is right there) and the booking bar sits inside the pane: every
//   absolute child here is positioned against this component's root View.
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line } from 'react-native-svg';
import { apiDealToDrop, dropCoords, money, pct, useCountdown, type Drop } from './data';
import { HeroMedia } from './HeroMedia';
import { setSelectedDeal } from './layout';
import { VenueMap } from './VenueMap';
import { fontMono, fontUI, useApp, useTheme } from './theme';
import { logInteraction } from './api';
import { useRequireAuth } from './auth';
import { ChevronRight, LocationPin } from './icons';
import {
  BackButton,
  Btn,
  EmptyState,
  FloatingFooter,
  Label,
  LiveDot,
  MetaLine,
  Radar,
  unitLabel,
  unitShort,
  RatingDot,
  ReadableColumn,
  ScreenTitle,
} from './components';

export function DealDetail({ id, embedded = false }: { id: string | undefined; embedded?: boolean }) {
  const { T, apiDeals, signedIn, drops } = useApp();
  const router = useRouter();
  const requireAuth = useRequireAuth();
  const insets = useSafeAreaInsets();
  // Height this view has to fill. HeroMedia keeps the hero to ~45% of the
  // window; in a split pane only half the window tall (an upright, partially
  // open iPhone Duo) that hero filled the whole pane, so cap it by the pane
  // too. Full screen the pane is the window, so nothing changes there.
  const [paneHeight, setPaneHeight] = useState(0);

  const apiDeal = id ? apiDeals[id] ?? null : null;
  const d = apiDeal ? apiDealToDrop(apiDeal) : null;

  // Log a "view" interaction once per drop shown (signed-in only: the endpoint
  // needs an account, and guests aren't tracked). Keyed on the venue, so
  // picking another drop in the split layout logs that one too.
  useEffect(() => {
    if (signedIn && apiDeal?.venue_id) {
      logInteraction(apiDeal.venue_id, 'view').catch(() => {/* fire-and-forget */});
    }
  }, [apiDeal?.venue_id, signedIn]);

  const head = (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute', top: insets.top + 4, left: (embedded ? 0 : insets.left) + 16, right: insets.right + 16, zIndex: 22,
        flexDirection: 'row', alignItems: 'center', justifyContent: embedded ? 'flex-end' : 'space-between',
      }}
    >
      {embedded ? null : <BackButton onPress={() => router.back()} />}
    </View>
  );

  if (!d) {
    return (
      <View style={{ flex: 1, backgroundColor: T.bg, justifyContent: 'center' }}>
        {head}
        <EmptyState title="This drop has gone." body="It may have sold out or ended." />
      </View>
    );
  }

  const coords = dropCoords(d);
  const others = drops.filter((o) => o.venueId === d.venueId && o.id !== d.id);
  const hasPrice = d.now > 0 || d.usual > 0;
  const where = d.km > 0 ? `${d.km} km away` : d.suburb;
  const openDirections = () => {
    const q = encodeURIComponent(d.addr || `${d.venue}, ${d.suburb}`);
    Linking.openURL(Platform.OS === 'ios' ? `http://maps.apple.com/?daddr=${q}` : `https://www.google.com/maps/dir/?api=1&destination=${q}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }} onLayout={(e) => setPaneHeight(Math.round(e.nativeEvent.layout.height))}>
      {/* key: a new drop in the pane starts at the top, not mid-scroll. */}
      <ScrollView key={d.id} showsVerticalScrollIndicator={false}>
        <HeroMedia d={d} height={Math.min(d.video ? 420 : 300, paneHeight ? Math.round(paneHeight * 0.45) : Infinity)} />

        <ReadableColumn style={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: 116 + insets.bottom }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <ScreenTitle>{d.venue}</ScreenTitle>
              <MetaLine d={d} style={{ marginTop: 6, fontSize: 15 }} />
            </View>
            <View style={{ paddingTop: 8 }}>
              <RatingDot d={d} size={15} />
            </View>
          </View>

          {d.kind === 'venue' ? <NothingToday venue={d.venue} /> : <DropTicket d={d} />}

          {/* Where: one row, tap for directions. */}
          <Pressable
            onPress={openDirections}
            accessibilityRole="button"
            accessibilityLabel={`${d.addr || d.suburb}. ${where}`}
            accessibilityHint="Opens directions in Maps."
            style={({ pressed }) => ({
              marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
              paddingVertical: 14, paddingHorizontal: 16, opacity: pressed ? 0.6 : 1,
              borderRadius: 16, borderCurve: 'continuous', backgroundColor: T.fill,
            })}
          >
            <LocationPin size={16} color={T.accent} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text numberOfLines={1} style={{ ...fontUI(500), fontSize: 15, letterSpacing: -0.15, color: T.text }}>{d.addr || d.suburb}</Text>
              <Label>{where}</Label>
            </View>
            <Text style={{ ...fontUI(500), fontSize: 14, color: T.accent }}>Directions</Text>
            <ChevronRight size={7} color={T.accent} />
          </Pressable>

          {/* The venue's other live deals: the feed lists each venue once. */}
          {others.length > 0 && (
            <>
              <Text accessibilityRole="header" style={{ marginTop: 28, ...fontUI(700), fontSize: 20, letterSpacing: -0.4, color: T.text }}>
                More at {d.venue}
              </Text>
              <View style={{ marginTop: 12, borderRadius: 18, borderCurve: 'continuous', borderWidth: 1, borderColor: T.line, backgroundColor: T.surface, overflow: 'hidden' }}>
                {others.map((o, i) => {
                  const off = o.usual > 0 ? pct(o.now, o.usual) : 0;
                  return (
                    <Pressable
                      key={o.id}
                      onPress={() => (embedded ? setSelectedDeal(o.id) : router.replace(`/(user)/event/${o.id}`))}
                      accessibilityRole="button"
                      accessibilityLabel={`${o.gets}, ${money(o.now)} ${unitLabel(o.unit)}${off > 0 ? `, ${off} percent off` : ''}`}
                      style={({ pressed }) => ({
                        flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16,
                        borderTopWidth: i === 0 ? 0 : 1, borderTopColor: T.line, opacity: pressed ? 0.6 : 1,
                      })}
                    >
                      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                        <Text numberOfLines={1} style={{ ...fontUI(500), fontSize: 16, letterSpacing: -0.2, color: T.text }}>{o.gets}</Text>
                        <Label>{o.window}</Label>
                      </View>
                      <Text style={{ ...fontMono(600), fontSize: 16, color: T.text }}>{money(o.now)}</Text>
                      {off > 0 ? <Text style={{ ...fontMono(600), fontSize: 13, color: T.accent }}>−{off}%</Text> : null}
                      <ChevronRight size={7} color={T.faint} />
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {!!d.blurb && (
            <>
              <Text accessibilityRole="header" style={{ marginTop: 28, ...fontUI(700), fontSize: 20, letterSpacing: -0.4, color: T.text }}>
                About
              </Text>
              <Text style={{ marginTop: 10, ...fontUI(400), fontSize: 16, lineHeight: 23, letterSpacing: -0.15, color: T.text }}>
                {d.blurb}
              </Text>
            </>
          )}

          {/* No coordinates: leave the map out rather than show a placeholder. */}
          {coords ? (
            <VenueMap latitude={coords.latitude} longitude={coords.longitude} style={{ marginTop: 28 }} />
          ) : null}
        </ReadableColumn>
      </ScrollView>

      {head}

      {/* Book now on its own: the price is already on screen in the PriceBlock.
          A browse-only venue has nothing to book. */}
      {d.kind === 'venue' ? null : <FloatingFooter>
        <Btn
          full
          onPress={() => requireAuth(() => router.push(`/(user)/claim/${d.id}`))}
          accessibilityHint={signedIn ? undefined : 'You’ll be asked to sign in first.'}
        >
          Book now
        </Btn>
      </FloatingFooter>}
    </View>
  );
}

/** A browse-only venue: no deal and no full-price booking today. */
function NothingToday({ venue }: { venue: string }) {
  const T = useTheme();
  return (
    <View style={{ marginTop: 22, borderRadius: 22, borderCurve: 'continuous', borderWidth: 1, borderColor: T.line, backgroundColor: T.surface, padding: 18, gap: 6 }}>
      <Text style={{ ...fontUI(600), fontSize: 17, letterSpacing: -0.25, color: T.text }}>Nothing to book today</Text>
      <Text style={{ ...fontUI(400), fontSize: 15, lineHeight: 21, color: T.muted }}>
        {venue} isn’t taking bookings through Impulse right now. Deals here show up on your feed when they go live.
      </Text>
    </View>
  );
}

/**
 * The drop as a ticket: the offer and price up top, a perforated tear line,
 * and a stub with the time left and what you save. Impulse's own shape for a
 * deal (your booking becomes a door code, so the deal reads like a ticket).
 */
function DropTicket({ d }: { d: Drop }) {
  const T = useTheme();
  const ms = useCountdown(d.target);
  const p = d.usual > 0 ? pct(d.now, d.usual) : 0;
  const saved = p > 0 ? d.usual - d.now : 0;
  const counting = !!d.target && ms > 0;
  const NOTCH = 18;
  const [w, setW] = useState(0);

  const s = Math.floor(ms / 1000);
  const parts: [number, string][] = [[Math.floor(s / 3600), 'h'], [Math.floor((s % 3600) / 60), 'm'], [s % 60, 's']];
  const shown = parts[0][0] > 0 ? parts : parts.slice(1);

  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={{
        marginTop: 22, borderRadius: 22, borderCurve: 'continuous', borderWidth: 1, borderColor: T.line,
        backgroundColor: T.surface, overflow: 'hidden',
      }}
    >
      {/* Offer and price */}
      <View style={{ padding: 18, paddingBottom: 20, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Radar size={20} decorative />
            <Text style={{ ...fontUI(600), fontSize: 13.5, letterSpacing: -0.1, color: T.text }}>
              {d.kind === 'standard' ? 'Book at the usual price' : 'Impulse special'}
            </Text>
          </View>
          {/* The discount, as text, top right. */}
          {p > 0 ? (
            <Text style={{ ...fontUI(700), fontSize: 15, letterSpacing: -0.2, color: T.accent }}>{p}% off</Text>
          ) : null}
        </View>
        {/* An unnamed deal's title is just "50% off", already shown top right. */}
        {!!d.gets && !/^\s*\d+\s*%\s*off\s*$/i.test(d.gets) && (
          <Text style={{ ...fontUI(600), fontSize: 21, lineHeight: 26, letterSpacing: -0.4, color: T.text }}>{d.gets}</Text>
        )}
        <View
          accessible
          accessibilityLabel={`${money(d.now)} ${unitLabel(d.unit)}${p > 0 ? `, usually ${money(d.usual)}` : ''}`}
          style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 5 }}
        >
          {/* Was, then now: the old price struck through right before the new one. */}
          {p > 0 ? (
            <Text style={{ ...fontMono(500), fontSize: 24, letterSpacing: -0.4, color: T.muted, textDecorationLine: 'line-through' }}>{money(d.usual)}</Text>
          ) : null}
          <Text style={{ ...fontMono(600), fontSize: 38, lineHeight: 42, letterSpacing: -1, color: T.text }}>{money(d.now)}</Text>
          <Text style={{ ...fontUI(400), fontSize: 15, color: T.muted, marginLeft: -3 }}>{unitShort(d.unit)}</Text>
        </View>
      </View>

      {/* Tear line, with a notch cut into each side */}
      <View style={{ height: 1, justifyContent: 'center' }}>
        {w > 0 && (
          <Svg width={w} height={2} style={{ position: 'absolute', left: 0 }}>
            <Line x1={NOTCH} y1={1} x2={w - NOTCH} y2={1} stroke={T.line2} strokeWidth={1.5} strokeDasharray="5 5" />
          </Svg>
        )}
        <View style={{ position: 'absolute', left: -NOTCH / 2 - 1, width: NOTCH, height: NOTCH, borderRadius: NOTCH / 2, backgroundColor: T.bg, borderWidth: 1, borderColor: T.line }} />
        <View style={{ position: 'absolute', right: -NOTCH / 2 - 1, width: NOTCH, height: NOTCH, borderRadius: NOTCH / 2, backgroundColor: T.bg, borderWidth: 1, borderColor: T.line }} />
      </View>

      {/* Stub: time left and what you save */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 16, gap: 12 }}>
        <View
          style={{ flex: 1, gap: 6 }}
          accessible
          accessibilityLabel={counting ? `Ends in ${shown.map(([n, u]) => `${n}${u}`).join(' ')}` : d.window}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <LiveDot color={d.status === 'now' ? T.accent : T.muted} blink={counting} />
            <Label>{counting ? 'Ends in' : 'When'}</Label>
          </View>
          {counting ? (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              {shown.map(([n, u]) => (
                <Text key={u} style={{ ...fontMono(600), fontSize: 22, letterSpacing: -0.4, color: T.text, fontVariant: ['tabular-nums'] }}>
                  {String(n).padStart(2, '0')}
                  <Text style={{ ...fontUI(500), fontSize: 13, color: T.muted }}>{u}</Text>
                </Text>
              ))}
            </View>
          ) : (
            <Text numberOfLines={2} style={{ ...fontUI(500), fontSize: 16, letterSpacing: -0.15, color: T.text }}>{d.window}</Text>
          )}
        </View>
        {saved > 0 ? (
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <Label>You save</Label>
            <Text style={{ ...fontMono(600), fontSize: 22, letterSpacing: -0.4, color: T.accent }}>{money(saved)}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
