// Support and legal content pages, reached from the profile ("You") tab.
// One route serves Help & Support, Terms of Service, and Privacy via the [doc]
// param.
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
    intro: "Stuck on something? Most answers are below. If you still need a hand, reach us at support@impulseapp.au and we'll get back to you within one business day.",
    sections: [
      { h: 'Booking a drop', body: [
        'When you find a deal you like, tap "Book now" and pick a time. Your spot is yours the moment your card is held, and a door code appears under Plans.',
        'Show that code at the venue to redeem. Codes are single-use and tied to your account.',
      ] },
      { h: 'Payments & refunds', body: [
        'When you book, we hold the discounted price on your card. Nothing is charged until the venue checks you in with your door code, and then the hold is charged. No surprises at the door.',
        'Your card is saved securely with our payment provider, so you can book again in one tap. You can remove it any time in You.',
        'If you cancel, or nobody from your booking shows up, the 10% deposit is kept and the rest of the hold is released. If the venue cancels, the whole hold is released. Released holds can take a few days to disappear from your bank statement.',
      ] },
      { h: 'Managing your bookings', body: [
        'Every booking lives under the Plans tab, with its status, time, and code. Tap one to view it, or to cancel a booking you made. Huddles are cancelled from the huddle screen.',
      ] },
      { h: 'Contact us', body: [
        'Email support@impulseapp.au with your account email and the venue name, and we\'ll sort it. For anything urgent at a venue, speak to their staff first.',
      ] },
    ],
  },
  terms: {
    title: 'Terms of service',
    updated: 'Last updated 18 November 2026',
    intro: 'These terms are an agreement between you and Impulse Labs Pty Ltd (ABN 31 704 068 931), which runs Impulse. They govern your use of Impulse. By creating an account or booking a deal, you agree to them. Please read them carefully.',
    sections: [
      { h: '1. Your account', body: [
        'You must be 18 or over to hold an account and to book deals at venues that serve alcohol. Each account needs a mobile number verified by a text message code. You are responsible for activity on your account and for keeping your login secure.',
      ] },
      { h: '2. Bookings & payments', body: [
        'Impulse is a marketplace connecting you with venues; the venue provides the experience. When you book a deal, you enter an agreement with that venue, and we process payment on their behalf at the price shown.',
        'When you book, we place a hold on your card for your share of the price. The hold is charged when the venue checks you in. If your booking is more than six days away, we save your card when you book and place the hold closer to the date.',
        'In a split booking, each person\'s share is held on their own card. If a share is still unpaid at the deadline, the person who made the booking agreed to cover it, and it is held on their card.',
        'You authorise us to save the card you use and to place holds and charge it for your bookings as described in these terms. If a hold can\'t be placed, we\'ll ask you to update your card; if it still can\'t be charged, the venue may ask you to pay at the door.',
      ] },
      { h: '3. Cancellations', body: [
        'The 10% deposit on each booking is non-refundable. If you cancel a plan before it is checked in, the deposit is charged and the rest of the hold is released. The same applies if nobody from your booking shows up.',
        'Venues may cancel where a deal can no longer be honoured, in which case your hold is released in full and nothing is charged.',
      ] },
      { h: '4. Conduct', body: [
        'Venues may refuse service consistent with the law and their own policies, including for intoxication or unsafe behaviour. Refused entry for such reasons is treated as a no-show.',
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
    updated: 'Last updated 18 November 2026',
    intro: 'This policy explains what we collect, why, and the choices you have. We aim to collect only what we need to run Impulse.',
    sections: [
      { h: 'Who we are', body: [
        'Impulse is run by Impulse Labs Pty Ltd (ABN 31 704 068 931) ("Impulse", "we", "us"), which operates the Impulse app and venue portal from Sydney, Australia. We handle personal information under the Australian Privacy Principles in the Privacy Act 1988 (Cth). Questions or requests: privacy@impulseapp.au.',
      ] },
      { h: 'What we collect', body: [
        'Account details: your name, your mobile number (required, and verified by a text message code), your email address if you sign in with one, and which sign-in method you use (Apple, Google, email or SMS code).',
        'What you tell us during setup: that you are 18 or over, your home suburb, favourite activities, usual party size and any access needs you choose to share. Access needs can be health-related, so we only use them to point out venues that support them, and you can leave them blank.',
        'Bookings: the deals you book, times, party size, who you split a booking with, door codes and payment status.',
        'Payments: your card is entered into, and stored by, our payment processor Stripe. We keep only a reference to your card (such as brand and last four digits) and never see or store the full number.',
        'Activity in the app: which venues you open, used to put more relevant deals first.',
        'Device: a push notification token if you allow notifications.',
        'Contacts, only if you choose "Find friends in contacts" and allow access: the phone numbers and email addresses in your contacts are scrambled (hashed) on your phone, and only those scrambled values are sent to check which of your contacts are on Impulse. We do not store them, and your contacts\' names never leave your phone.',
        'We do not use advertising or analytics trackers, and we do not track you across other companies\' apps or websites.',
      ] },
      { h: 'How we use it', body: [
        'To run your account, show you relevant deals, process and confirm bookings and split payments, send booking updates and invites, prevent fraud, and provide support. We do not sell your personal information.',
      ] },
      { h: 'Location', body: [
        'If you allow location access, the app uses it once, on your phone, to suggest your home suburb. Your precise location is not sent to or stored by Impulse, and it is never used in the background. Only the suburb you choose is saved.',
      ] },
      { h: 'Who can see your information', body: [
        'Venues you book with see your name, party size, booking time and door code.',
        'People in a split booking or huddle with you see your display name and your share. Someone who has your mobile number (or your Google or Apple email) saved in their contacts can find you to invite you to a booking; they see your display name, never your number. There is no public search of Impulse users.',
        'Service providers that help us run Impulse: Stripe (payments), Supabase (accounts and database), Render (servers), Vercel (websites), Expo and Apple (push notifications), Apple and Google (sign-in) and our SMS provider (sign-in and verification codes). Some of them store data outside Australia, including in the United States, under their own security and privacy commitments.',
        'We may disclose information where the law requires it.',
      ] },
      { h: 'How long we keep it', body: [
        'We keep your account information until you delete your account. Booking and payment records are kept without your name or contact details for up to 7 years, as required for tax and accounting.',
      ] },
      { h: 'Your rights', body: [
        'You can delete your account at any time in the app: open You, then Delete account. That removes your profile, preferences, activity, saved cards and sign-in straight away, and revokes Sign in with Apple. If you can\'t get into the app, email privacy@impulseapp.au and we\'ll delete it for you. To access or correct your data, email privacy@impulseapp.au.',
        'If you are unhappy with how we have handled your information, email us first. You can also complain to the Office of the Australian Information Commissioner (oaic.gov.au).',
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
