// Mock support / legal content pages, reached from the profile ("You") tab.
// One route serves Help & Support, Terms of Service, and Privacy via the [doc]
// param. Copy is placeholder-but-plausible — swap in reviewed text before launch.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontDisplay, fontMono, fontUI, useApp } from '../../../src/theme';
import { ChevronBack } from '../../../src/icons';

type Section = { h: string; body: string[] };
type Doc = { title: string; updated: string; intro: string; sections: Section[] };

const DOCS: Record<string, Doc> = {
  help: {
    title: 'Help & support',
    updated: 'Support hours: 9am–9pm AEST, 7 days',
    intro: "Stuck on something? Most answers are below. If you still need a hand, reach us at support@impulse.app and we'll get back to you within one business day.",
    sections: [
      { h: 'Claiming a drop', body: [
        'When you find a deal you like, tap "Claim slot" and pick a time. Your spot is held the moment payment goes through, and a confirmation code appears under Plans.',
        'Show that code at the venue to redeem. Codes are single-use and tied to your account.',
      ] },
      { h: 'Payments & refunds', body: [
        'We charge the discounted price shown at claim time — no surprises at the door. Your saved card is used automatically.',
        'Plans cancelled at least 2 hours before the slot are refunded in full. Inside 2 hours, deals are non-refundable unless the venue cancels.',
      ] },
      { h: 'Managing your bookings', body: [
        'Every claim lives under the Plans tab, with its status, time, and code. Tap one to view or cancel it.',
      ] },
      { h: 'Contact us', body: [
        'Email support@impulse.app with your account email and the venue name, and we\'ll sort it. For anything urgent at a venue, speak to their staff first.',
      ] },
    ],
  },
  terms: {
    title: 'Terms of service',
    updated: 'Last updated 25 July 2026',
    intro: 'These terms govern your use of Impulse. By creating an account or claiming a deal, you agree to them. Please read them carefully.',
    sections: [
      { h: '1. Your account', body: [
        'You must be 18 or over to hold an account and to claim deals at venues that serve alcohol. You are responsible for activity on your account and for keeping your login secure.',
      ] },
      { h: '2. Bookings & payments', body: [
        'Impulse is a marketplace connecting you with venues; the venue provides the experience. When you claim a deal, you enter an agreement with that venue, and we process payment on their behalf at the price shown.',
      ] },
      { h: '3. Cancellations', body: [
        'You may cancel a plan up to 2 hours before its slot for a full refund. Venues may cancel where a deal can no longer be honoured, in which case you are refunded in full.',
      ] },
      { h: '4. Conduct', body: [
        'Venues may refuse service consistent with the law and their own policies, including for intoxication or unsafe behaviour. Refused entry for such reasons is not eligible for a refund.',
      ] },
      { h: '5. Liability', body: [
        'To the extent permitted by law, Impulse is not liable for the acts of venues or for indirect loss. Nothing in these terms excludes rights you have under the Australian Consumer Law.',
      ] },
      { h: '6. Changes & governing law', body: [
        'We may update these terms; continued use means you accept the changes. These terms are governed by the laws of New South Wales, Australia.',
      ] },
    ],
  },
  privacy: {
    title: 'Privacy policy',
    updated: 'Last updated 25 July 2026',
    intro: 'This policy explains what we collect, why, and the choices you have. We aim to collect only what we need to run Impulse.',
    sections: [
      { h: 'What we collect', body: [
        'Account details (name, email or phone), your preferences (home suburb, favourite activities, party size), and booking history. Payment card details are handled by our payment processor — we store only the last four digits.',
      ] },
      { h: 'How we use it', body: [
        'To show you relevant deals, process and confirm bookings, prevent fraud, and provide support. We do not sell your personal information.',
      ] },
      { h: 'Location', body: [
        'If you allow location access, we use it only while you are using the app to surface nearby drops. We never track your location in the background.',
      ] },
      { h: 'Sharing', body: [
        'We share the minimum necessary with the venue you book (such as your name and confirmation code) and with service providers who help us operate, under confidentiality obligations.',
      ] },
      { h: 'Your rights', body: [
        'You can access, correct, or delete your data, and close your account, by emailing privacy@impulse.app. We retain booking records only as long as needed for legal and accounting purposes.',
      ] },
    ],
  },
};

export default function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T } = useApp();
  const d = DOCS[doc ?? 'help'] ?? DOCS.help;

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          onPress={() => router.back()}
          style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: T.chipBg, alignItems: 'center', justifyContent: 'center' }}
        >
          <ChevronBack size={11} color={T.text} />
        </Pressable>
        <Text style={{ fontFamily: fontDisplay(700), fontSize: 22, color: T.text, letterSpacing: -0.5 }}>{d.title}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 8, paddingBottom: insets.bottom + 40 }}>
        <Text style={{ fontFamily: fontMono(400), fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', color: T.faint, marginBottom: 14 }}>{d.updated}</Text>
        <Text style={{ fontFamily: fontUI(400), fontSize: 16, lineHeight: 25, color: T.muted, marginBottom: 8 }}>{d.intro}</Text>

        {d.sections.map((s) => (
          <View key={s.h} style={{ marginTop: 22 }}>
            <Text style={{ fontFamily: fontDisplay(600), fontSize: 17.5, color: T.text, letterSpacing: -0.3, marginBottom: 8 }}>{s.h}</Text>
            {s.body.map((p, i) => (
              <Text key={i} style={{ fontFamily: fontUI(400), fontSize: 15, lineHeight: 23, color: T.muted, marginBottom: i < s.body.length - 1 ? 10 : 0 }}>{p}</Text>
            ))}
          </View>
        ))}

        <Text style={{ fontFamily: fontMono(400), fontSize: 11, color: T.faint, letterSpacing: 0.4, marginTop: 32, textAlign: 'center' }}>
          impulse · sydney
        </Text>
      </ScrollView>
    </View>
  );
}
