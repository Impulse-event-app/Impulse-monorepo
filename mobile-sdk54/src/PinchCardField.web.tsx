// PinchCardField (web) — Metro resolves this over PinchCardField.tsx on web builds,
// where react-native-webview is unsupported. We're already in a browser, so the
// CaptureJs script is loaded straight into the page and the form is plain RN
// primitives. Raw card details go only to Pinch's tokenise endpoint via
// CaptureJs — never to our server.

import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, TextInputProps, View } from 'react-native';
import type { PinchColors } from './PinchCardField';

const CAPTUREJS_SRC = 'https://cdn.getpinch.com.au/capturejs/pinch.capture.v2.js';
const CAPTUREJS_INTEGRITY = 'sha384-hglYFSKC4AMA/rAQOGB3OiA8u5ri5F4qNMGgw4I+fggDSlTmPyREcj1J+VGnkAX8';

const PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_PINCH_PUBLISHABLE_KEY ?? '';

export type PinchTokenResult = { token: string; cardHolderName: string };

type Props = {
  /** A money amount (e.g. "$4.90") reads "Pay $4.90 deposit"; any other text is used as-is. */
  depositLabel: string;
  colors: PinchColors;
  onToken: (result: PinchTokenResult) => void;
  onError: (message: string) => void;
};

type PinchGlobal = {
  Capture: (opts: { publishableKey: string }) => {
    createToken: (fields: Record<string, string>) => Promise<{ token?: string; errors?: unknown }>;
  };
};

function payButtonLabel(depositLabel: string) {
  return depositLabel.trim().startsWith('$') ? `Pay ${depositLabel} deposit` : depositLabel;
}

/** Pull a readable message out of a CaptureJs rejection ({ hasError, errors }). */
function extractPinchError(e: unknown): string {
  if (e instanceof Error) return e.message;
  const errors = (e as { errors?: unknown })?.errors;
  if (typeof errors === 'string') {
    try {
      const parsed = JSON.parse(errors) as Array<{ errorMessage?: string }>;
      const msgs = parsed.map((x) => x.errorMessage).filter(Boolean);
      if (msgs.length) return msgs.join(' ');
    } catch {
      return errors;
    }
  }
  if (Array.isArray(errors)) {
    const msgs = (errors as Array<{ errorMessage?: string }>).map((x) => x.errorMessage).filter(Boolean);
    if (msgs.length) return msgs.join(' ');
  }
  return 'Card could not be verified.';
}

let captureJsPromise: Promise<void> | null = null;

function loadCaptureJs(): Promise<void> {
  if (captureJsPromise) return captureJsPromise;
  captureJsPromise = new Promise((resolve, reject) => {
    if ((window as unknown as { Pinch?: PinchGlobal }).Pinch) return resolve();
    const script = document.createElement('script');
    script.src = CAPTUREJS_SRC;
    script.integrity = CAPTUREJS_INTEGRITY;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve();
    script.onerror = () => {
      captureJsPromise = null; // allow retry on next mount
      reject(new Error('CaptureJs failed to load'));
    };
    document.head.appendChild(script);
  });
  return captureJsPromise;
}

/** Brand v2 input: 52pt, radius 10, quiet fill, accent border on focus. */
function CardInput({ c, ...rest }: TextInputProps & { c: PinchColors }) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={c.muted}
      {...rest}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        height: 52, paddingHorizontal: 14, fontSize: 17, letterSpacing: -0.2, color: c.text,
        fontVariant: ['tabular-nums'], backgroundColor: c.fill ?? c.surface, borderRadius: 10,
        borderWidth: 1, borderColor: focused ? c.accent : 'transparent',
        // react-native-web: drop the browser focus ring; the border shows focus instead.
        ...({ outlineStyle: 'none' } as object),
      }}
    />
  );
}

export function PinchCardField({ depositLabel, colors: c, onToken, onError }: Props) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cardHolderName, setCardHolderName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('');
  const [expiryYear, setExpiryYear] = useState('');
  const [cvc, setCvc] = useState('');

  useEffect(() => {
    loadCaptureJs()
      .then(() => setReady(true))
      .catch(() => onError('Payment library failed to load. Check your connection.'));
    // onError is stable enough for a load-once effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const labelStyle = { fontSize: 13, letterSpacing: -0.05, color: c.muted, marginTop: 14, marginBottom: 7, marginHorizontal: 4 } as const;

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      const Pinch = (window as unknown as { Pinch?: PinchGlobal }).Pinch;
      if (!Pinch) throw new Error('Payment library failed to load. Check your connection.');
      const result = await Pinch.Capture({ publishableKey: PUBLISHABLE_KEY }).createToken({
        sourceType: 'credit-card',
        cardNumber: cardNumber.replace(/\s+/g, ''),
        expiryMonth: expiryMonth.trim(),
        expiryYear: expiryYear.trim(),
        cvc: cvc.trim(),
        cardHolderName: cardHolderName.trim(),
      });
      if (result?.token) {
        onToken({ token: result.token, cardHolderName: cardHolderName.trim() });
      } else {
        const msg = result?.errors ? JSON.stringify(result.errors) : 'Card could not be verified.';
        setError(msg);
        onError(msg);
      }
    } catch (e) {
      // CaptureJs rejects with { hasError, errors } where errors is Pinch's
      // response body (e.g. "Not a valid test card number…") — surface it.
      const msg = extractPinchError(e);
      setError(msg);
      onError(msg);
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return (
      <View style={{ height: 120, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  return (
    <View>
      <Text style={[labelStyle, { marginTop: 0 }]}>Name on card</Text>
      <CardInput c={c} value={cardHolderName} onChangeText={setCardHolderName} placeholder="Jordan Lee" autoComplete="cc-name" />
      <Text style={labelStyle}>Card number</Text>
      <CardInput c={c} value={cardNumber} onChangeText={setCardNumber} placeholder="4111 1111 1111 1111" inputMode="numeric" autoComplete="cc-number" />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={labelStyle}>Month</Text>
          <CardInput c={c} value={expiryMonth} onChangeText={setExpiryMonth} placeholder="MM" maxLength={2} inputMode="numeric" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={labelStyle}>Year</Text>
          <CardInput c={c} value={expiryYear} onChangeText={setExpiryYear} placeholder="YYYY" maxLength={4} inputMode="numeric" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={labelStyle}>CVC</Text>
          <CardInput c={c} value={cvc} onChangeText={setCvc} placeholder="123" maxLength={4} inputMode="numeric" />
        </View>
      </View>
      <Pressable
        onPress={submit}
        disabled={busy}
        accessibilityRole="button"
        style={({ pressed }) => ({
          marginTop: 20, height: 52, borderRadius: 26, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center',
          opacity: busy ? 0.35 : 1, transform: pressed && !busy ? [{ scale: 0.985 }] : undefined,
        })}
      >
        {busy
          ? <ActivityIndicator color="#fff" />
          : <Text style={{ color: '#fff', fontSize: 17, letterSpacing: -0.2, fontWeight: '500', fontVariant: ['tabular-nums'] }}>{payButtonLabel(depositLabel)}</Text>}
      </Pressable>
      {!!error && <Text style={{ color: c.accent, fontSize: 15, lineHeight: 21, marginTop: 10, marginHorizontal: 4 }}>{error}</Text>}
    </View>
  );
}
