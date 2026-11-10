// StripeRoot — wraps the app in Stripe's provider so PaymentSheet (cards,
// Apple Pay, Google Pay) works anywhere. Metro picks StripeRoot.web.tsx on web.
import { StripeProvider, useStripe } from '@stripe/stripe-react-native';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { useEffect, type ReactNode } from 'react';

const PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
// impulse, or impulse-staging in the staging app (see app.config.js).
const SCHEME = (Constants.expoConfig?.scheme as string | undefined) ?? 'impulse';

// When a bank's app or Safari sends the guest back after 3D Secure, the link
// (impulse://stripe-redirect…, or impulse-staging://… in the staging app) has to reach Stripe so PaymentSheet can finish.
function StripeLinks() {
  const { handleURLCallback } = useStripe();
  useEffect(() => {
    Linking.getInitialURL().then((url) => { if (url) handleURLCallback(url); });
    const sub = Linking.addEventListener('url', ({ url }) => { handleURLCallback(url); });
    return () => sub.remove();
  }, [handleURLCallback]);
  return null;
}

export function StripeRoot({ children }: { children: ReactNode }) {
  return (
    <StripeProvider
      publishableKey={PUBLISHABLE_KEY}
      merchantIdentifier="merchant.au.impulseapp.impulse"
      urlScheme={SCHEME}
    >
      <>
        <StripeLinks />
        {children}
      </>
    </StripeProvider>
  );
}
