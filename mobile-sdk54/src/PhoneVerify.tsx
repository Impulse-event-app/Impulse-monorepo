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
import { Btn, CodeInput, ErrorText, Field, Label, TextBtn } from './components';

/** Only Australian numbers for now: the field shows a fixed +61 and the user
 *  types the local part. Accepts "0412 345 678", "412 345 678", or an
 *  autofilled "+61 412 345 678". Returns E.164 ("+61412345678") or null. */
export const PHONE_PREFIX = '+61';
export function auPhoneE164(local: string): string | null {
  let d = local.replace(/\D/g, '');
  if (d.startsWith('0061')) d = d.slice(4);
  else if (d.startsWith('61') && d.length >= 11) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  return /^4\d{8}$/.test(d) ? `${PHONE_PREFIX}${d}` : null;
}

/** For the field's onChangeText: drops a country code that autofill or a
 *  paste adds ("+61 491 187 385"), since the field already shows +61. A
 *  leading 0 ("0491 187 385") is left as typed; auPhoneE164 handles it. */
export function stripAuPrefix(text: string): string {
  return text.replace(/^\s*(\+\s*61|0061)[\s-]*/, '');
}

/** True once this account has a verified mobile number. */
export function hasVerifiedPhone(session: Session | null): boolean {
  return !!session?.user?.phone;
}

/** Why we ask, kept to one line under the title (App Review 5.1.1). */
export const PHONE_REASON = 'So friends who have your number can find and invite you.';

/** The rest of the why, as a small note under the field. */
const PHONE_NOTE = 'It also keeps one account per person. Never shown to anyone or used for marketing.';

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

  const e164 = auPhoneE164(raw);

  const send = async () => {
    if (!e164) { setError('Enter an Australian mobile number, e.g. 0412 345 678.'); return; }
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
          prefix={PHONE_PREFIX}
          value={raw}
          onChangeText={(t) => setRaw(stripAuPrefix(t))}
          placeholder="412 345 678"
          accessibilityLabel="Mobile number"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
        />
        <Label style={{ lineHeight: 18 }}>{PHONE_NOTE}</Label>
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
