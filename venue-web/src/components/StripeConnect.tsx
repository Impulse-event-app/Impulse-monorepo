"use client";

import { loadConnectAndInitialize, type StripeConnectInstance } from "@stripe/connect-js";
import { ConnectComponentsProvider } from "@stripe/react-connect-js";
import { useEffect, useState } from "react";

import { merchantApi } from "@/lib/api";
import { useTheme } from "@/providers/ThemeProvider";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

/** Stripe's components take literal colours, not CSS variables, so read the
 *  current theme's tokens off <html>. */
function appearance() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    overlays: "dialog" as const,
    variables: {
      colorPrimary: v("--accent"),
      colorBackground: v("--surface"),
      colorText: v("--text"),
      colorSecondaryText: v("--muted"),
      colorBorder: v("--line2"),
      fontFamily: css.fontFamily,
      borderRadius: "12px",
    },
  };
}

/** Wraps Stripe's embedded Connect components (onboarding, payouts, the
 *  notification banner) for one venue. The client secret comes from our
 *  backend, which owns the secret key; it is fetched again whenever Stripe
 *  asks, so a long-open page never goes stale. */
export function StripeConnect({ venueId, children }: { venueId: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  // Created once per mount; callers key this component by venue. It only ever
  // renders in the browser (after the payments status has loaded), so reading
  // the DOM here is safe.
  const [instance] = useState<StripeConnectInstance | null>(() =>
    PUBLISHABLE_KEY && typeof window !== "undefined"
      ? loadConnectAndInitialize({
          publishableKey: PUBLISHABLE_KEY,
          fetchClientSecret: async () => (await merchantApi.accountSession(venueId)).client_secret,
          appearance: appearance(),
        })
      : null,
  );

  useEffect(() => {
    instance?.update({ appearance: appearance() });
  }, [instance, theme]);

  if (!PUBLISHABLE_KEY) {
    return (
      <p style={{ color: "var(--bad)", fontSize: 13.5 }}>
        Payments aren&apos;t configured: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set.
      </p>
    );
  }
  if (!instance) return null;
  return <ConnectComponentsProvider connectInstance={instance}>{children}</ConnectComponentsProvider>;
}
