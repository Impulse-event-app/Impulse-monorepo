// stripePay (web) — same API as stripePay.tsx, but the native PaymentSheet
// doesn't exist on web, so the Stripe.js Payment Element is shown in a modal
// through `overlay`. Saved cards appear via the customer session; Apple Pay /
// Google Pay show where the browser supports them.
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { ApiBooking, confirmCardUpdate, confirmHold, startCardSetup, startCardUpdate, startHold } from './api';
import { Btn } from './components';
import { fontUI, useApp } from './theme';

const PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
let stripePromise: Promise<Stripe | null> | null = null;
const stripe = () => (stripePromise ??= loadStripe(PUBLISHABLE_KEY));

export class SheetError extends Error {}

type Open = {
  clientSecret: string;
  customerSessionClientSecret: string;
  mode: 'payment' | 'setup';
  resolve: (done: boolean) => void;
  reject: (err: Error) => void;
};

function Form({ open, close }: { open: Open; close: (done: boolean, err?: Error) => void }) {
  const s = useStripe();
  const elements = useElements();
  const { T } = useApp();
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!s || !elements) return;
    setBusy(true);
    const confirmParams = { return_url: window.location.href };
    const { error } = open.mode === 'setup'
      ? await s.confirmSetup({ elements, confirmParams, redirect: 'if_required' })
      : await s.confirmPayment({ elements, confirmParams, redirect: 'if_required' });
    setBusy(false);
    if (error) {
      // Card errors are shown inline by the Payment Element; anything else closes.
      if (error.type !== 'card_error' && error.type !== 'validation_error') close(false, new SheetError(error.message));
      return;
    }
    close(true);
  };
  return (
    <View style={{ gap: 18 }}>
      {/* Guests are in Australia; without this Stripe guesses the country from the IP. */}
      <PaymentElement options={{ defaultValues: { billingDetails: { address: { country: 'AU' } } } }} />
      {busy ? <ActivityIndicator color={T.accent} style={{ height: 52 }} /> : (
        <Btn full onPress={submit}>{open.mode === 'setup' ? 'Save card' : 'Hold my spot'}</Btn>
      )}
    </View>
  );
}

export function useStripePay(): {
  holdShare: (bookingId: string, shareCents: number) => Promise<ApiBooking | null>;
  updateCard: (bookingId: string) => Promise<ApiBooking | null>;
  addCard: () => Promise<boolean>;
  overlay: ReactNode;
} {
  const { T } = useApp();
  const [open, setOpen] = useState<Open | null>(null);
  const openRef = useRef<Open | null>(null);

  const present = (clientSecret: string, customerSessionClientSecret: string, mode: 'payment' | 'setup') =>
    new Promise<boolean>((resolve, reject) => {
      const o = { clientSecret, customerSessionClientSecret, mode, resolve, reject };
      openRef.current = o;
      setOpen(o);
    });

  const close = (done: boolean, err?: Error) => {
    const o = openRef.current;
    openRef.current = null;
    setOpen(null);
    if (!o) return;
    if (err) o.reject(err);
    else o.resolve(done);
  };

  const holdShare = async (bookingId: string, shareCents: number) => {
    const intent = await startHold(bookingId, shareCents);
    const done = await present(intent.client_secret, intent.customer_session_client_secret, intent.intent_type);
    return done ? confirmHold(bookingId, intent.intent_id) : null;
  };

  const updateCard = async (bookingId: string) => {
    const intent = await startCardUpdate(bookingId);
    const done = await present(intent.client_secret, intent.customer_session_client_secret, intent.intent_type);
    return done ? confirmCardUpdate(bookingId, intent.intent_id) : null;
  };

  const addCard = async () => {
    const setup = await startCardSetup();
    return present(setup.setup_intent_client_secret, setup.customer_session_client_secret, 'setup');
  };

  const overlay = open ? (
    <Modal transparent animationType="fade" visible onRequestClose={() => close(false)}>
      <Pressable onPress={() => close(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 }}>
        {/* Capped at the window and scrollable: the Payment Element plus Link's
            optional fields are taller than a laptop screen, which otherwise
            pushes the confirm button out of reach. */}
        <Pressable
          onPress={() => {}}
          style={{ backgroundColor: T.surface, borderRadius: 20, maxWidth: 460, maxHeight: '90%', width: '100%', alignSelf: 'center', overflow: 'hidden' }}
        >
          <ScrollView contentContainerStyle={{ padding: 22 }} keyboardShouldPersistTaps="handled">
            <Text style={{ ...fontUI(600), fontSize: 17, color: T.text, marginBottom: 16 }}>
              {open.mode === 'setup' ? 'Add a card' : 'Hold your spot'}
            </Text>
            <Elements
              stripe={stripe()}
              options={{
                clientSecret: open.clientSecret,
                customerSessionClientSecret: open.customerSessionClientSecret,
                appearance: { theme: 'flat', variables: { colorPrimary: T.accent, colorBackground: T.surface, colorText: T.text } },
              }}
            >
              <Form open={open} close={close} />
            </Elements>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  ) : null;

  return { holdShare, updateCard, addCard, overlay };
}
