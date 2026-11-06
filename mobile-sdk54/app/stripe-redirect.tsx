// Landing route for impulse://stripe-redirect (the 3D Secure return link).
// Stripe handles the link itself (see src/StripeRoot.tsx); this only stops the
// router showing "not found" and puts the guest back where they were.
import { router } from 'expo-router';
import { useEffect } from 'react';

export default function StripeRedirect() {
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, []);
  return null;
}
