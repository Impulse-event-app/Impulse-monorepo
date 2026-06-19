import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DROPS, genCode, money } from '../../../src/data';
import { fontDisplay, fontUI, useApp } from '../../../src/theme';
import { Btn, Chip, Stepper } from '../../../src/components';
import { ChevronBack } from '../../../src/icons';

export default function ClaimScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { T, addPlan } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const d = DROPS.find((x) => x.id === id) || null;

  const times = d?.status === 'now' ? ['Now', '7:30pm', '8:30pm'] : ['7:00pm', '8:00pm', '9:00pm'];
  const [party, setParty] = useState(2);
  const [time, setTime] = useState(times[0]);

  if (!d) {
    return (
      <View style={{ flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: fontUI(400), fontSize: 16, color: T.muted }}>Drop not found</Text>
      </View>
    );
  }

  const perPerson = d.unit === 'pp';
  const total = perPerson ? d.now * party : d.now;

  const onConfirm = () => {
    const code = genCode();
    addPlan({ code, dropId: d.id, venue: d.venue, cat: d.cat, party, time, total });
    router.replace(`/(user)/confirm?code=${encodeURIComponent(code)}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <Pressable
        onPress={() => router.back()}
        style={{ position: 'absolute', top: insets.top + 4, left: 16, zIndex: 10, width: 40, height: 40, borderRadius: 999, backgroundColor: T.chipBg, alignItems: 'center', justifyContent: 'center' }}
      >
        <ChevronBack size={11} color={T.text} />
      </Pressable>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 56, paddingHorizontal: 22, paddingBottom: 140 }}>
        <Text style={{ fontFamily: fontDisplay(700), fontSize: 28, color: T.text, letterSpacing: -0.84 }}>Claim your slot</Text>
        <Text style={{ fontFamily: fontUI(400), fontSize: 15, color: T.muted, marginTop: 6 }}>{d.venue} · {d.suburb}</Text>

        <View style={{ marginTop: 30 }}>
          <Text style={{ fontFamily: fontUI(600), fontSize: 17, color: T.text }}>How many?</Text>
          <Text style={{ fontFamily: fontUI(400), fontSize: 13.5, color: T.faint, marginTop: 2, marginBottom: 16 }}>{d.gets}</Text>
          <Stepper value={party} onChange={setParty} max={d.cap} />
        </View>

        <View style={{ marginTop: 34 }}>
          <Text style={{ fontFamily: fontUI(600), fontSize: 17, color: T.text, marginBottom: 14 }}>Pick a time</Text>
          <View style={{ flexDirection: 'row', gap: 9 }}>
            {times.map((t) => (
              <Chip key={t} active={time === t} onPress={() => setTime(t)}>{t}</Chip>
            ))}
          </View>
        </View>

        <View style={[{ marginTop: 36, paddingHorizontal: 18, paddingVertical: 16, backgroundColor: T.surface, borderRadius: 18 }, T.shadow]}>
          {[
            ["Tonight's price", `${money(d.now)}${d.unit}`],
            [perPerson ? `${party} × people` : 'Slot', perPerson ? `× ${party}` : '1'],
          ].map(([k, v]) => (
            <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
              <Text style={{ fontFamily: fontUI(400), fontSize: 14.5, color: T.muted }}>{k}</Text>
              <Text style={{ fontFamily: fontUI(400), fontSize: 14.5, color: T.text }}>{v}</Text>
            </View>
          ))}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 12, borderTopWidth: 1, borderTopColor: T.line }}>
            <Text style={{ fontFamily: fontUI(600), fontSize: 16, color: T.text }}>Total</Text>
            <Text style={{ fontFamily: fontDisplay(700), fontSize: 26, color: T.text }}>{money(total)}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 22, paddingTop: 14, paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : 24, backgroundColor: T.bg, borderTopWidth: 0.5, borderTopColor: T.line }}>
        <Btn full onPress={onConfirm}>Confirm &amp; claim</Btn>
      </View>
    </View>
  );
}
