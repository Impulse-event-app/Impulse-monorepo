// wallet.tsx — saved cards, shared by the profile screen and the onboarding
// step so both behave identically.
//
// Raw card details never pass through here. PinchCardField tokenises inside a
// WebView and hands back a token; only that token reaches addPaymentMethod().
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import {
  addPaymentMethod, deletePaymentMethod, listPaymentMethods, describeCard, getMe,
  ApiError, PaymentMethod,
} from './api';
import { supabase } from './supabase';
import { useApp } from './theme';
import { Group, Row, TextBtn } from './components';
import { Plus, RowIcons } from './icons';
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

/** One saved card, as a grouped-list row. `onRemove` omitted → read-only display. */
export function CardRow({
  card, onRemove, disabled,
}: {
  card: PaymentMethod;
  onRemove?: () => void;
  disabled?: boolean;
}) {
  const { T } = useApp();
  const sub = [card.expiry_date && `Expires ${card.expiry_date}`, card.is_default && 'Default']
    .filter(Boolean)
    .join(' · ') || 'Saved card';
  return (
    <Row
      icon={RowIcons.card(T.muted)}
      label={describeCard(card)}
      sublabel={sub}
      trailing={
        onRemove ? (
          <TextBtn
            size={15}
            color={T.accent}
            disabled={disabled}
            onPress={() =>
              Alert.alert('Remove card?', `${describeCard(card)} will be removed from your account.`, [
                { text: 'Keep', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: onRemove },
              ])
            }
          >
            Remove
          </TextBtn>
        ) : undefined
      }
    />
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
      {cards.length > 0 && (
        <Group style={{ marginTop: 0 }} label="Saved cards">
          {cards.map((c) => (
            <CardRow key={c.id} card={c} disabled={busy} onRemove={() => remove(c)} />
          ))}
          {!showForm && (
            <Row icon={<Plus size={13} color={T.accent} />} label="Add a card" accent chevron={false} onPress={() => setAdding(true)} />
          )}
        </Group>
      )}

      {showForm && (
        <View style={{ marginTop: cards.length ? 20 : 0 }}>
          <PinchCardField
            depositLabel={depositLabel}
            colors={{ bg: T.bg, text: T.text, muted: T.muted, line: T.line, accent: T.accent, surface: T.surface, fill: T.fill }}
            onToken={async ({ token, cardHolderName }) => {
              if (await add(token, cardHolderName)) {
                setAdding(false);
                onAdded?.();
              }
            }}
            onError={(message) => Alert.alert('Card error', message)}
          />
          {cards.length > 0 && <TextBtn onPress={() => setAdding(false)}>Cancel</TextBtn>}
        </View>
      )}

      {busy && <ActivityIndicator color={T.accent} style={{ marginTop: 12 }} />}
    </View>
  );
}
