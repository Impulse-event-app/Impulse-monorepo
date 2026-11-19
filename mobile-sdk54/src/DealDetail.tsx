// A drop's detail: hero, price, blurb, map and the Book now bar.
//
// Rendered two ways:
// - full screen by the route app/(user)/event/[id].tsx (phones, folded Duo);
// - `embedded` in the detail pane of the split layout (open iPhone Duo, iPad),
//   beside the list it was picked from. Embedded, there is no back button (the
//   list is right there) and the booking bar sits inside the pane: every
//   absolute child here is positioned against this component's root View.
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { money, apiDealToDrop, dropCoords } from './data';
import { HeroMedia } from './HeroMedia';
import { VenueMap } from './VenueMap';
import { fontMono, fontUI, useApp } from './theme';
import { logInteraction } from './api';
import { useRequireAuth } from './auth';
import {
  BackButton,
  Btn,
  EmptyState,
  FloatingFooter,
  Label,
  Live,
  MetaLine,
  PriceBlock,
  RatingDot,
  ReadableColumn,
  ScreenTitle,
  unitLabel,
} from './components';

export function DealDetail({ id, embedded = false }: { id: string | undefined; embedded?: boolean }) {
  const { T, apiDeals, signedIn } = useApp();
  const router = useRouter();
  const requireAuth = useRequireAuth();
  const insets = useSafeAreaInsets();

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
      {/* No countdown pill here: the Live line under the price already shows it. */}
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
  const facts = [
    ['What you get', d.gets],
    ['Where', d.addr],
  ].filter(([, v]) => !!v);

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      {/* key: a new drop in the pane starts at the top, not mid-scroll. */}
      <ScrollView key={d.id} showsVerticalScrollIndicator={false}>
        <HeroMedia d={d} height={d.video ? 420 : 300} />

        <ReadableColumn style={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: 150 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <ScreenTitle>{d.venue}</ScreenTitle>
              <MetaLine d={d} style={{ marginTop: 6, fontSize: 15 }} />
            </View>
            <View style={{ paddingTop: 8 }}>
              <RatingDot d={d} size={15} />
            </View>
          </View>

          <View style={{ marginTop: 24, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: T.line, gap: 12 }}>
            <PriceBlock d={d} big />
            <Live d={d} />
          </View>

          {!!d.blurb && (
            <Text style={{ marginTop: 24, ...fontUI(400), fontSize: 17, lineHeight: 25, letterSpacing: -0.19, color: T.text }}>
              {d.blurb}
            </Text>
          )}

          <View style={{ marginTop: 28, gap: 16 }}>
            {facts.map(([k, v]) => (
              <View key={k} accessible accessibilityLabel={`${k}: ${v}`}>
                <Label>{k}</Label>
                <Text style={{ ...fontUI(400), fontSize: 17, lineHeight: 23, letterSpacing: -0.19, color: T.text, marginTop: 4 }}>{v}</Text>
              </View>
            ))}
          </View>

          {/* No coordinates: leave the map out rather than show a placeholder. */}
          {coords ? (
            <VenueMap latitude={coords.latitude} longitude={coords.longitude} style={{ marginTop: 28 }} />
          ) : null}
        </ReadableColumn>
      </ScrollView>

      {head}

      {/* booking bar */}
      <FloatingFooter row gap={16}>
        <View accessible accessibilityLabel={`${money(d.now)} ${unitLabel(d.unit)}`}>
          <Text style={{ ...fontMono(600), fontSize: 22, letterSpacing: -0.4, color: T.text }}>{money(d.now)}</Text>
          <Text style={{ ...fontUI(400), fontSize: 12.5, color: T.muted }}>{unitLabel(d.unit)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Btn
            full
            onPress={() => requireAuth(() => router.push(`/(user)/claim/${d.id}`))}
            accessibilityHint={signedIn ? undefined : 'You’ll be asked to sign in first.'}
          >
            Book now
          </Btn>
        </View>
      </FloatingFooter>
    </View>
  );
}
