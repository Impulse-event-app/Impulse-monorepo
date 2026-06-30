import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { money, apiDealToDrop } from '../../../src/data';
import { fontDisplay, fontUI, useApp } from '../../../src/theme';
import { logInteraction } from '../../../src/api';
import {
  Btn,
  CountdownPill,
  MetaLine,
  Placeholder,
  PriceBlock,
  RatingDot,
} from '../../../src/components';
import { ChevronBack } from '../../../src/icons';

function PushHead({ onBack, floating }: { onBack: () => void; floating?: boolean }) {
  const { T } = useApp();
  const insets = useSafeAreaInsets();
  const bg = floating ? 'rgba(15,14,13,0.5)' : T.chipBg;
  const ink = floating ? '#fff' : T.text;
  return (
    <Pressable
      onPress={onBack}
      style={{
        position: 'absolute', top: insets.top + 4, left: 16, zIndex: 10,
        width: 40, height: 40, borderRadius: 999, backgroundColor: bg,
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <ChevronBack size={11} color={ink} />
    </Pressable>
  );
}

export default function DetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { T, apiDeals } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const apiDeal = id ? apiDeals[id] ?? null : null;
  const d = apiDeal ? apiDealToDrop(apiDeal) : null;

  // Log a "view" interaction once when the screen mounts
  useEffect(() => {
    if (apiDeal?.venue_id) {
      logInteraction(apiDeal.venue_id, 'view').catch(() => {/* fire-and-forget */});
    }
  }, [apiDeal?.venue_id]);

  if (!d) {
    return (
      <View style={{ flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center' }}>
        <PushHead onBack={() => router.back()} />
        <Text style={{ fontFamily: fontUI(400), fontSize: 16, color: T.muted }}>Drop not found</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View>
          <Placeholder label={d.cat + ' · venue photo'} style={{ height: 300 }} />
          <PushHead onBack={() => router.back()} floating />
          {d.target ? (
            <View style={{ position: 'absolute', top: insets.top + 4, right: 16 }}>
              <CountdownPill d={d} />
            </View>
          ) : null}
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 140 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fontDisplay(700), fontSize: 28, color: T.text, letterSpacing: -0.84 }}>{d.venue}</Text>
              <MetaLine d={d} style={{ marginTop: 5, fontSize: 14.5 }} />
            </View>
            <RatingDot d={d} />
          </View>

          <View style={[{ marginTop: 20, paddingHorizontal: 18, paddingVertical: 16, backgroundColor: T.surface, borderRadius: 18 }, T.shadow]}>
            <PriceBlock d={d} big />
            <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.line, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: d.status === 'now' ? T.accent : T.faint }} />
              <Text style={{ fontFamily: fontUI(400), fontSize: 14, color: T.muted }}>{d.window}</Text>
            </View>
          </View>

          <Text style={{ marginTop: 22, fontFamily: fontUI(400), fontSize: 16, lineHeight: 25, color: T.text }}>{d.blurb}</Text>

          <View style={{ marginTop: 18, borderRadius: 16, overflow: 'hidden', backgroundColor: T.line, gap: 1 }}>
            {[
              ['What you get', d.gets],
              ['Where', d.addr],
            ].map(([k, v]) => (
              <View key={k} style={{ backgroundColor: T.surface, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', justifyContent: 'space-between', gap: 16 }}>
                <Text style={{ fontFamily: fontUI(400), fontSize: 14, color: T.muted }}>{k}</Text>
                <Text style={{ fontFamily: fontUI(400), fontSize: 14.5, color: T.text, textAlign: 'right', flex: 1 }}>{v}</Text>
              </View>
            ))}
          </View>

          <Placeholder label="map" style={{ height: 120, borderRadius: 16, marginTop: 14 }} />
        </View>
      </ScrollView>

      {/* sticky claim bar */}
      <View
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          paddingHorizontal: 20, paddingTop: 14, paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : 24,
          backgroundColor: T.bg, borderTopWidth: 0.5, borderTopColor: T.line,
          flexDirection: 'row', alignItems: 'center', gap: 16,
        }}
      >
        <View>
          <Text style={{ fontFamily: fontDisplay(600), fontSize: 22, color: T.text }}>
            {money(d.now)}
            <Text style={{ fontFamily: fontUI(500), fontSize: 12, color: T.muted }}>{d.unit}</Text>
          </Text>
          <Text style={{ fontFamily: fontUI(400), fontSize: 12, color: T.faint, textDecorationLine: 'line-through' }}>usually {money(d.usual)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Btn full onPress={() => router.push(`/(user)/claim/${d.id}`)}>Claim slot</Btn>
        </View>
      </View>
    </View>
  );
}
