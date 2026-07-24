// PinchCardField (web) — Metro resolves this over PinchCardField.tsx on web builds,
// where react-native-webview is unsupported. We're already in a browser, so the
// CaptureJs script is loaded straight into the page and the form is plain RN
// primitives. Raw card details go only to Pinch's tokenise endpoint via
// CaptureJs — never to our server.

import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

const CAPTUREJS_SRC = 'https://cdn.getpinch.com.au/capturejs/pinch.capture.v2.js';
const CAPTUREJS_INTEGRITY = 'sha384-hglYFSKC4AMA/rAQOGB3OiA8u5ri5F4qNMGgw4I+fggDSlTmPyREcj1J+VGnkAX8';

const PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_PINCH_PUBLISHABLE_KEY ?? '';

export type PinchTokenResult = { token: string; cardHolderName: string };

type Props = {
  /** e.g. "$4.90" — shown on the pay button */
  depositLabel: string;
  colors: { bg: string; text: string; muted: string; line: string; accent: string; surface: string };
  onToken: (result: PinchTokenResult) => void;
  onError: (message: string) => void;
};

type PinchGlobal = {
  Capture: (opts: { publishableKey: string }) => {
    createToken: (fields: Record<string, string>) => Promise<{ token?: string; errors?: unknown }>;
  };
};

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

  const inputStyle = {
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: c.text,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 12,
  } as const;
  const labelStyle = { fontSize: 13, color: c.muted, marginTop: 12, marginBottom: 5 } as const;

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
      <Text style={labelStyle}>Name on card</Text>
      <TextInput value={cardHolderName} onChangeText={setCardHolderName} placeholder="Jane Smith"
        placeholderTextColor={c.muted} autoComplete="cc-name" style={inputStyle} />
      <Text style={labelStyle}>Card number</Text>
      <TextInput value={cardNumber} onChangeText={setCardNumber} placeholder="4111 1111 1111 1111"
        placeholderTextColor={c.muted} inputMode="numeric" autoComplete="cc-number" style={inputStyle} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={labelStyle}>Expiry month</Text>
          <TextInput value={expiryMonth} onChangeText={setExpiryMonth} placeholder="MM" maxLength={2}
            placeholderTextColor={c.muted} inputMode="numeric" style={inputStyle} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={labelStyle}>Expiry year</Text>
          <TextInput value={expiryYear} onChangeText={setExpiryYear} placeholder="YYYY" maxLength={4}
            placeholderTextColor={c.muted} inputMode="numeric" style={inputStyle} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={labelStyle}>CVC</Text>
          <TextInput value={cvc} onChangeText={setCvc} placeholder="123" maxLength={4}
            placeholderTextColor={c.muted} inputMode="numeric" style={inputStyle} />
        </View>
      </View>
      <Pressable
        onPress={submit}
        disabled={busy}
        style={{ marginTop: 18, paddingVertical: 14, borderRadius: 999, backgroundColor: c.accent, alignItems: 'center', opacity: busy ? 0.5 : 1 }}
      >
        {busy
          ? <ActivityIndicator color="#fff" />
          : <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Pay {depositLabel} deposit</Text>}
      </Pressable>
      {!!error && <Text style={{ color: '#e5484d', fontSize: 13, marginTop: 10 }}>{error}</Text>}
    </View>
  );
}
