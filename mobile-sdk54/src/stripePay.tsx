// stripePay — every card interaction goes through Stripe's PaymentSheet: saved
// cards, a new card, Apple Pay and Google Pay. Raw card details never touch
// this app or our server. Metro picks stripePay.web.tsx on web.
//
// useStripePay() returns:
//   holdShare(bookingId, shareCents) — hold my share for a booking. Resolves
//     with the updated booking, or null if the person closed the sheet.
//   updateCard(bookingId) — hold a different card on a spot whose card
//     couldn't be held. Resolves with the updated booking, or null if closed.
//   addCard() — save a card to the wallet. Resolves true once saved.
//   overlay — always null here (the native sheet presents itself); the web
//     version renders its form through it, so callers render it either way.
import { LinkDisplay, NavigationBarStyle, useStripe } from '@stripe/stripe-react-native';
import { Alert } from 'react-native';
import * as Linking from 'expo-linking';
import type { ReactNode } from 'react';
import { ApiBooking, confirmCardUpdate, confirmHold, startCardSetup, startCardUpdate, startHold } from './api';
import { useApp } from './theme';

type SheetIntent =
  | { paymentIntentClientSecret: string; setupIntentClientSecret?: undefined }
  | { setupIntentClientSecret: string; paymentIntentClientSecret?: undefined };

export class SheetError extends Error {}

export function useStripePay(): {
  holdShare: (bookingId: string, shareCents: number) => Promise<ApiBooking | null>;
  updateCard: (bookingId: string) => Promise<ApiBooking | null>;
  addCard: () => Promise<boolean>;
  overlay: ReactNode;
} {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { T, profile } = useApp();

  /** Resolves true when completed, false when the person closed the sheet. */
  const present = async (customerId: string, customerSessionClientSecret: string, intent: SheetIntent) => {
    const init = await initPaymentSheet({
      merchantDisplayName: 'Impulse',
      customerId,
      customerSessionClientSecret,
      ...intent,
      applePay: { merchantCountryCode: 'AU' },
      googlePay: { merchantCountryCode: 'AU', testEnv: __DEV__ },
      // The app's own scheme (impulse:// or impulse-staging://), so 3D Secure
      // returns to whichever variant started the payment.
      returnURL: Linking.createURL('stripe-redirect'),
      defaultBillingDetails: {
        name: profile.name && profile.name !== 'You' ? profile.name : undefined,
        email: profile.email || undefined,
        address: { country: 'AU' },
      },
      // No Link: just Apple Pay and cards.
      link: { display: LinkDisplay.NEVER },
      appearance: {
        // iOS 26: Stripe's Liquid Glass look (rounded fields, capsule buttons,
        // glass header) to match the system. Ignored on older iOS and Android.
        applyLiquidGlass: true,
        navigationBarStyle: NavigationBarStyle.Glass,
        colors: {
          primary: T.accent, background: T.bg, componentBackground: T.surface,
          primaryText: T.text, secondaryText: T.muted, componentText: T.text,
        },
      },
    });
    if (init.error) throw new SheetError(init.error.message);
    const result = await presentPaymentSheet();
    if (result.error) {
      if (result.error.code === 'Canceled') return false;
      throw new SheetError(result.error.message);
    }
    return true;
  };

  const holdShare = async (bookingId: string, shareCents: number) => {
    const intent = await startHold(bookingId, shareCents);
    if (intent.intent_type === 'demo') {
      return (await confirmDemo()) ? confirmHold(bookingId, intent.intent_id) : null;
    }
    const done = await present(
      intent.customer_id,
      intent.customer_session_client_secret,
      intent.intent_type === 'setup'
        ? { setupIntentClientSecret: intent.client_secret }
        : { paymentIntentClientSecret: intent.client_secret },
    );
    return done ? confirmHold(bookingId, intent.intent_id) : null;
  };

  const updateCard = async (bookingId: string) => {
    const intent = await startCardUpdate(bookingId);
    // A demo seat never needs a new card, so a card update is always a real intent.
    if (intent.intent_type === 'demo') return null;
    const done = await present(
      intent.customer_id,
      intent.customer_session_client_secret,
      intent.intent_type === 'setup'
        ? { setupIntentClientSecret: intent.client_secret }
        : { paymentIntentClientSecret: intent.client_secret },
    );
    return done ? confirmCardUpdate(bookingId, intent.intent_id) : null;
  };

  const addCard = async () => {
    const setup = await startCardSetup();
    return present(setup.customer_id, setup.customer_session_client_secret, {
      setupIntentClientSecret: setup.setup_intent_client_secret,
    });
  };

  return { holdShare, updateCard, addCard, overlay: null };
}

/** App Review demo venue: say plainly that nothing is charged, then book. */
function confirmDemo(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Demo booking',
      'This is a demo venue for App Review. No payment is taken, and no card is needed.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Book (no charge)', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
