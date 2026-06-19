import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontDisplay, fontUI, tokens } from '../src/theme';

const T = tokens(true);

export default function RoleSelector() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: T.bg,
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingTop: insets.top + 100,
        paddingBottom: insets.bottom + 40,
      }}
    >
      <View style={{ alignItems: 'center', gap: 14 }}>
        {/* pulse mark */}
        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: '#0F0E0D', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 6 }}>
          <View style={{ position: 'absolute', width: 46, height: 46, borderRadius: 23, borderWidth: 1.2, borderColor: 'rgba(255,90,77,0.22)' }} />
          <View style={{ position: 'absolute', width: 33, height: 33, borderRadius: 17, borderWidth: 1.4, borderColor: 'rgba(255,90,77,0.45)' }} />
          <View style={{ width: 19, height: 19, borderRadius: 10, backgroundColor: T.accent }} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
          <Text style={{ fontFamily: fontDisplay(600), fontSize: 44, letterSpacing: -1, color: T.text }}>impulse</Text>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: T.accent, marginLeft: 3, marginBottom: 7 }} />
        </View>
        <Text style={{ fontFamily: fontUI(400), fontSize: 16, color: T.muted, textAlign: 'center' }}>
          Last-minute plans in Sydney, sorted by price.
        </Text>
      </View>

      <View style={{ gap: 12 }}>
        <Pressable
          onPress={() => router.replace('/(user)/onboarding')}
          style={{ backgroundColor: T.accent, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontFamily: fontUI(600), fontSize: 17, color: T.accentInk }}>Browse what's on</Text>
        </Pressable>

        <Pressable
          onPress={() => router.replace('/(admin)/dashboard')}
          style={{ backgroundColor: T.chipBg, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontFamily: fontUI(600), fontSize: 17, color: T.muted }}>Venue admin</Text>
        </Pressable>
      </View>
    </View>
  );
}
