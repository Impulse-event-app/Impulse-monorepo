// PhoneVerify.tsx — add and verify a mobile number (required for every
// account). Supabase texts a 6-digit code to the new number and only sets it
// on the account once the code is entered, so the number is proven ours.
// Afterwards the backend stores its hash so friends who have it saved can
// find and invite this person (see src/contacts.ts).
import { useState } from 'react';
import { View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { syncContactIdentity } from './api';
import { normalizePhone } from './contacts';
import { Btn, CodeInput, ErrorText, Field, Label, TextBtn } from './components';

/** True once this account has a verified mobile number. */
export function hasVerifiedPhone(session: Session | null): boolean {
  return !!session?.user?.phone;
}

/** Why we ask. Shown wherever the number is requested (App Review 5.1.1). */
export const PHONE_REASON =
  "Your number is how friends who have it saved find and invite you, and it keeps one account per person for card holds. We never show it to anyone or use it for marketing.";

const friendly = (e: unknown, fallback: string) => {
  const msg = e instanceof Error ? e.message : '';
  if (/already.*(registered|exists|use)/i.test(msg)) return 'That number is already on another Impulse account.';
  if (/expired|invalid/i.test(msg)) return 'That code didn’t work. Check it or send a new one.';
  return msg || fallback;
};

export function PhoneVerify({ onVerified }: { onVerified: () => void }) {
  const [step, setStep] = useState<'number' | 'code'>('number');
  const [raw, setRaw] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const digits = normalizePhone(raw);
  const e164 = digits ? `+${digits}` : null;

  const send = async () => {
    if (!e164) { setError('Enter a mobile number, e.g. 0412 345 678.'); return; }
    setBusy(true); setError(null);
    try {
      const { error: err } = await supabase.auth.updateUser({ phone: e164 });
      if (err) throw err;
      setCode('');
      setStep('code');
    } catch (e) {
      setError(friendly(e, 'Couldn’t send a code. Check the number.'));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!e164) return;
    setBusy(true); setError(null);
    try {
      const { error: err } = await supabase.auth.verifyOtp({ phone: e164, token: code, type: 'phone_change' });
      if (err) throw err;
      await syncContactIdentity().catch((e) => console.warn('contact identity sync failed', e));
      onVerified();
    } catch (e) {
      setError(friendly(e, 'That code didn’t work. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  if (step === 'number') {
    return (
      <View style={{ gap: 14 }}>
        <Field
          value={raw}
          onChangeText={setRaw}
          placeholder="0412 345 678"
          accessibilityLabel="Mobile number"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
        />
        <Label style={{ lineHeight: 18 }}>Australian mobile, or include the country code (+44…).</Label>
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Btn full onPress={send} disabled={!e164 || busy}>{busy ? 'Sending…' : 'Text me a code'}</Btn>
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      <Label style={{ textAlign: 'center' }}>{`Sent to ${e164}. It can take a moment to arrive.`}</Label>
      <CodeInput value={code} onChange={setCode} autoFocus />
      {error ? <ErrorText center>{error}</ErrorText> : null}
      <Btn full onPress={verify} disabled={code.length < 6 || busy}>{busy ? 'Checking…' : 'Verify'}</Btn>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 24 }}>
        <TextBtn size={15} onPress={send} disabled={busy}>Send a new code</TextBtn>
        <TextBtn size={15} onPress={() => { setStep('number'); setCode(''); setError(null); }}>Change number</TextBtn>
      </View>
    </View>
  );
}
