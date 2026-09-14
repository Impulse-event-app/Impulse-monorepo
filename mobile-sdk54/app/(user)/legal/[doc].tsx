// Mock support / legal content pages, reached from the profile ("You") tab.
// One route serves Help & Support, Terms of Service, and Privacy via the [doc]
// param. Copy is placeholder-but-plausible — swap in reviewed text before launch.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontUI, useApp } from '../../../src/theme';
import { BackButton, Label, NavBar, Radar, ScreenTitle, useScrolled } from '../../../src/components';

type Section = { h: string; body: string[] };
type Doc = { title: string; updated: string; intro: string; sections: Section[] };

const DOCS: Record<string, Doc> = {
  help: {
    title: 'Help & support',
    updated: 'Support hours: 9am–9pm AEST, 7 days',
    intro: "Stuck on something? Most answers are below. If you still need a hand, reach us at support@impulse.app and we'll get back to you within one business day.",
    sections: [
      { h: 'Booking a drop', body: [
        'When you find a deal you like, tap "Book now" and pick a time. Your spot is held the moment payment goes through, and a door code appears under Plans.',
        'Show that code at the venue to redeem. Codes are single-use and tied to your account.',
      ] },
      { h: 'Payments & refunds', body: [
        'We charge the discounted price shown at booking — no surprises at the door. Your saved card is used automatically.',
        'Plans cancelled at least 2 hours before the slot are refunded in full. Inside 2 hours, deals are non-refundable unless the venue cancels.',
      ] },
      { h: 'Managing your bookings', body: [
        'Every booking lives under the Plans tab, with its status, time, and code. Tap one to view or cancel it.',
      ] },
      { h: 'Contact us', body: [
        'Email support@impulse.app with your account email and the venue name, and we\'ll sort it. For anything urgent at a venue, speak to their staff first.',
      ] },
    ],
  },
  terms: {
    title: 'Terms of service',
    updated: 'Last updated 25 July 2026',
    intro: 'These terms govern your use of Impulse. By creating an account or booking a deal, you agree to them. Please read them carefully.',
    sections: [
      { h: '1. Your account', body: [
        'You must be 18 or over to hold an account and to book deals at venues that serve alcohol. You are responsible for activity on your account and for keeping your login secure.',
      ] },
      { h: '2. Bookings & payments', body: [
        'Impulse is a marketplace connecting you with venues; the venue provides the experience. When you book a deal, you enter an agreement with that venue, and we process payment on their behalf at the price shown.',
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
        'We share the minimum necessary with the venue you book (such as your name and door code) and with service providers who help us operate, under confidentiality obligations.',
      ] },
      { h: 'Your rights', body: [
        'You can delete your account at any time in the app: open You, then Delete account. That removes your profile, preferences, saved cards and sign-in straight away. Booking records are kept without your name or contact details, and only as long as needed for legal and accounting purposes. To access or correct your data, email privacy@impulse.app.',
      ] },
    ],
  },
};

export default function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T } = useApp();
  const [scrolled, onScroll] = useScrolled(24);
  const d = DOCS[doc ?? 'help'] ?? DOCS.help;

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingTop: insets.top + 60, paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}
      >
        <ScreenTitle>{d.title}</ScreenTitle>
        <Label style={{ marginTop: 8 }}>{d.updated}</Label>
        <Text style={{ marginTop: 20, ...fontUI(400), fontSize: 17, lineHeight: 25, letterSpacing: -0.19, color: T.muted }}>{d.intro}</Text>

        {d.sections.map((s) => (
          <View key={s.h} style={{ marginTop: 28 }}>
            <Text style={{ ...fontUI(600), fontSize: 20, letterSpacing: -0.36, color: T.text, marginBottom: 8 }}>{s.h}</Text>
            {s.body.map((p, i) => (
              <Text
                key={i}
                style={{ ...fontUI(400), fontSize: 17, lineHeight: 25, letterSpacing: -0.19, color: T.text, marginBottom: i < s.body.length - 1 ? 12 : 0 }}
              >
                {p}
              </Text>
            ))}
          </View>
        ))}

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 40 }}>
          <Radar size={20} kind="compact" />
          <Label>Impulse · Sydney</Label>
        </View>
      </ScrollView>

      <NavBar title={d.title} scrolled={scrolled} leading={<BackButton onPress={() => router.back()} />} />
    </View>
  );
}
