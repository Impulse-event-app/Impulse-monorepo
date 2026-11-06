// wallet.tsx — saved cards, shared by the profile screen and the onboarding
// step so both behave identically.
//
// Raw card details never pass through here: cards are added in Stripe's own
// sheet (stripePay) and live on the user's Stripe Customer, so the same saved
// card works at every venue.
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { deletePaymentMethod, listPaymentMethods, describeCard, ApiError, PaymentMethod } from './api';
import { supabase } from './supabase';
import { useApp } from './theme';
import { Btn, Group, Row, TextBtn } from './components';
import { Plus, RowIcons } from './icons';
import { useStripePay } from './stripePay';

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

  const stripePay = useStripePay();

  /** Add a card through Stripe's sheet. Returns true once it's saved. */
  const add = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    try {
      const saved = await stripePay.addCard();
      if (saved) await refresh();
      return saved;
    } catch (err) {
      Alert.alert("Couldn't save that card", err instanceof Error ? err.message : 'Please try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }, [refresh, stripePay]);

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

  return { cards, busy, signedIn, add, remove, refresh, overlay: stripePay.overlay };
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
 * Card list + "add a card". Used verbatim in the profile sheet and the
 * onboarding step, so the two can't drift apart.
 */
export function WalletPanel({
  wallet, depositLabel = 'Add a card', onAdded,
}: {
  wallet: ReturnType<typeof useWallet>;
  depositLabel?: string;
  onAdded?: () => void;
}) {
  const { T } = useApp();
  const { cards, busy, add, remove } = wallet;

  if (cards === null) {
    return <ActivityIndicator color={T.accent} style={{ height: 48 }} />;
  }

  const onAdd = async () => {
    if (await add()) onAdded?.();
  };

  return (
    <View>
      {cards.length > 0 && (
        <Group style={{ marginTop: 0 }} label="Saved cards">
          {cards.map((c) => (
            <CardRow key={c.id} card={c} disabled={busy} onRemove={() => remove(c)} />
          ))}
          <Row icon={<Plus size={13} color={T.accent} />} label="Add a card" accent chevron={false} onPress={onAdd} />
        </Group>
      )}

      {cards.length === 0 && <Btn full onPress={onAdd} disabled={busy}>{depositLabel}</Btn>}

      {busy && <ActivityIndicator color={T.accent} style={{ marginTop: 12 }} />}
      {wallet.overlay}
    </View>
  );
}
