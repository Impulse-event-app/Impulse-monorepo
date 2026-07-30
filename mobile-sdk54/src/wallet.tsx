// wallet.tsx — saved cards, shared by the profile screen and the onboarding
// step so both behave identically.
//
// Raw card details never pass through here. PinchCardField tokenises inside a
// WebView and hands back a token; only that token reaches addPaymentMethod().
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import {
  addPaymentMethod, deletePaymentMethod, listPaymentMethods, describeCard, getMe,
  ApiError, PaymentMethod,
} from './api';
import { supabase } from './supabase';
import { fontUI, useApp } from './theme';
import { PinchCardField } from './PinchCardField';

export function useWallet() {
  const [cards, setCards] = useState<PaymentMethod[] | null>(null);
  const [busy, setBusy] = useState(false);
  // Distinct from "has no cards": a huddle guest who joined by name has no
  // account at all, so there is nowhere to save a card to. null = unknown yet.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setSignedIn(!!session);
    if (!session) {
      setCards([]);
      return;
    }
    try {
      setCards(await listPaymentMethods());
    } catch {
      setCards([]);   // treat an unreachable wallet as empty rather than blocking the screen
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  /** Vault a CaptureJs token against the signed-in user. Returns true on success. */
  const add = useCallback(async (token: string, cardHolderName: string): Promise<boolean> => {
    setBusy(true);
    try {
      // Pinch wants a payer name and email. Prefer the synced profile; fall
      // back to the session email and the name typed on the card, so this also
      // works during onboarding before the profile has been written.
      const profile = await getMe().catch(() => null);
      const { data: { session } } = await supabase.auth.getSession();
      const fullName = (profile?.full_name || cardHolderName || '').trim();
      const [first, ...rest] = fullName.split(/\s+/);
      await addPaymentMethod({
        token,
        first_name: first || 'Impulse',
        last_name: rest.join(' ') || 'Customer',
        email: profile?.email || session?.user?.email || 'no-email@impulse.app',
        make_default: true,
      });
      await refresh();
      return true;
    } catch (err) {
      Alert.alert(
        "Couldn't save that card",
        err instanceof ApiError ? err.message : 'Please try again.',
      );
      return false;
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const remove = useCallback(async (method: PaymentMethod) => {
    setBusy(true);
    try {
      await deletePaymentMethod(method.id);
      await refresh();
    } catch (err) {
      Alert.alert(
        "Couldn't remove that card",
        err instanceof ApiError ? err.message : 'Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  return { cards, busy, signedIn, add, remove, refresh };
}

/** One saved card. `onRemove` omitted → read-only display. */
export function CardRow({
  card, onRemove, disabled,
}: {
  card: PaymentMethod;
  onRemove?: () => void;
  disabled?: boolean;
}) {
  const { T } = useApp();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: T.surface, borderRadius: 14, marginBottom: 9 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: card.is_default ? T.accent : T.line2 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fontUI(600), fontSize: 15, color: T.text }}>{describeCard(card)}</Text>
        <Text style={{ fontFamily: fontUI(400), fontSize: 12.5, color: T.faint, marginTop: 2 }}>
          {[card.expiry_date && `Expires ${card.expiry_date}`, card.is_default && 'Default']
            .filter(Boolean)
            .join(' · ') || 'Saved card'}
        </Text>
      </View>
      {onRemove && (
        <Pressable
          disabled={disabled}
          onPress={() =>
            Alert.alert('Remove card?', `${describeCard(card)} will be removed from your account.`, [
              { text: 'Keep', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: onRemove },
            ])
          }
          hitSlop={8}
          style={{ paddingHorizontal: 6, paddingVertical: 4, opacity: disabled ? 0.4 : 1 }}
        >
          <Text style={{ fontFamily: fontUI(600), fontSize: 13.5, color: T.muted }}>Remove</Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * Card list + "add a card" form. Used verbatim in the profile sheet and the
 * onboarding step, so the two can't drift apart.
 */
export function WalletPanel({
  wallet, depositLabel = 'Save card', onAdded,
}: {
  wallet: ReturnType<typeof useWallet>;
  depositLabel?: string;
  onAdded?: () => void;
}) {
  const { T } = useApp();
  const { cards, busy, add, remove } = wallet;
  const [adding, setAdding] = useState(false);

  if (cards === null) {
    return <ActivityIndicator color={T.accent} style={{ height: 48 }} />;
  }

  const showForm = adding || cards.length === 0;

  return (
    <View>
      {cards.map((c) => (
        <CardRow key={c.id} card={c} disabled={busy} onRemove={() => remove(c)} />
      ))}

      {showForm ? (
        <View style={{ marginTop: cards.length ? 8 : 0 }}>
          <PinchCardField
            depositLabel={depositLabel}
            colors={{ bg: T.bg, text: T.text, muted: T.muted, line: T.line, accent: T.accent, surface: T.surface }}
            onToken={async ({ token, cardHolderName }) => {
              if (await add(token, cardHolderName)) {
                setAdding(false);
                onAdded?.();
              }
            }}
            onError={(message) => Alert.alert('Card error', message)}
          />
          {cards.length > 0 && (
            <Pressable onPress={() => setAdding(false)} style={{ paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ fontFamily: fontUI(500), fontSize: 14, color: T.muted }}>Cancel</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <Pressable
          onPress={() => setAdding(true)}
          style={{ paddingVertical: 14, alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: T.line2, borderStyle: 'dashed', marginTop: 4 }}
        >
          <Text style={{ fontFamily: fontUI(600), fontSize: 14.5, color: T.accent }}>+ Add another card</Text>
        </Pressable>
      )}

      {busy && <ActivityIndicator color={T.accent} style={{ marginTop: 12 }} />}
    </View>
  );
}
