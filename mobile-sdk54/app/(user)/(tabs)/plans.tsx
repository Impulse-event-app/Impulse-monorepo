import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontDisplay, fontMono, fontUI, useApp } from '../../../src/theme';
import { Btn, FauxQR, PulseMark } from '../../../src/components';
import { FLOATING_TAB_CLEARANCE } from './_layout';

export default function PlansScreen() {
  const { T, plans } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 18 }}>
          <Text style={{ fontFamily: fontDisplay(700), fontSize: 33, color: T.text, letterSpacing: -1, marginBottom: 4 }}>Plans</Text>
        </View>

        {plans.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 14, paddingTop: 80, paddingBottom: 80 }}>
            <View style={{ opacity: 0.5 }}>
              <PulseMark size={56} radius={15} />
            </View>
            <Text style={{ fontFamily: fontDisplay(600), fontSize: 21, color: T.text, letterSpacing: -0.42 }}>No plans yet</Text>
            <Text style={{ fontFamily: fontUI(400), fontSize: 15, color: T.muted, lineHeight: 22, textAlign: 'center' }}>
              When you claim a slot it shows up here, code and all.
            </Text>
            <View style={{ marginTop: 8 }}>
              <Btn onPress={() => router.replace('/(user)/home')}>Find something tonight</Btn>
            </View>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 18, paddingTop: 18, paddingBottom: 24 + FLOATING_TAB_CLEARANCE, gap: 13 }}>
            {plans.map((p) => (
              <Pressable
                key={p.code}
                onPress={() => router.push(`/(user)/confirm?code=${encodeURIComponent(p.code)}`)}
                style={[{ backgroundColor: T.surface, borderRadius: 18, padding: 16, flexDirection: 'row', gap: 14, alignItems: 'center' }, T.shadow]}
              >
                <FauxQR code={p.code} size={72} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <Text numberOfLines={1} style={{ fontFamily: fontDisplay(600), fontSize: 16.5, color: T.text, letterSpacing: -0.33, flex: 1 }}>
                      {p.venue}
                    </Text>
                    <View style={{ backgroundColor: T.accentSoft, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 }}>
                      <Text style={{ fontFamily: fontUI(600), fontSize: 11.5, color: T.accent }}>Claimed</Text>
                    </View>
                  </View>
                  <Text style={{ fontFamily: fontUI(400), fontSize: 13.5, color: T.muted, marginTop: 3 }}>
                    {p.cat} · {p.party} {p.party === 1 ? 'person' : 'people'}
                  </Text>
                  <Text style={{ fontFamily: fontMono(400), fontSize: 13, color: T.text, marginTop: 8, letterSpacing: 0.5 }}>{p.code}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
