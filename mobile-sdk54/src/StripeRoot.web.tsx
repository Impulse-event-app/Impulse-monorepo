// StripeRoot (web) — the native SDK doesn't run on web; stripePay.web.tsx
// loads Stripe.js itself when a payment opens.
import type { ReactNode } from 'react';

export function StripeRoot({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
