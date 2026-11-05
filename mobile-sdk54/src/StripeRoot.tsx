// StripeRoot — wraps the app in Stripe's provider so PaymentSheet (cards,
// Apple Pay, Google Pay) works anywhere. Metro picks StripeRoot.web.tsx on web.
import { StripeProvider } from '@stripe/stripe-react-native';
import type { ReactNode } from 'react';

const PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

export function StripeRoot({ children }: { children: ReactNode }) {
  return (
    <StripeProvider
      publishableKey={PUBLISHABLE_KEY}
      merchantIdentifier="merchant.au.impulseapp.impulse"
      urlScheme="impulse"
    >
      <>{children}</>
    </StripeProvider>
  );
}
