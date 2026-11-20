// InviteSheet.tsx — pick who's taking a seat in a Huddle Pay booking.
// Two ways to find someone on Impulse: people you've booked with before, and
// (when you tap for it) people in your phone's contacts. There's no search of
// everyone on Impulse. For friends who aren't on Impulse yet, the seat's link
// can be shared instead. Picking someone saves the seat and sends them a push.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontUI, useApp } from './theme';
import { recentPeople, UserSearchResult } from './api';
import { ContactFriend, findFriendsInContacts } from './contacts';
import { Btn, Group, Label, Row, TextBtn } from './components';
import { ShareGlyph } from './icons';

type ContactsState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; friends: ContactFriend[]; limited: boolean }
  | { kind: 'denied' }
  | { kind: 'error'; message: string };

export function InviteSheet({
  visible, onPick, onShareLink, onClose,
}: {
  visible: boolean;
  onPick: (u: UserSearchResult) => void;
  onShareLink?: () => void;     // not on Impulse yet — send the seat link
  onClose: () => void;
}) {
  const { T } = useApp();
  const insets = useSafeAreaInsets();
  const [recent, setRecent] = useState<UserSearchResult[] | null>(null);
  const [contacts, setContacts] = useState<ContactsState>({ kind: 'idle' });

  useEffect(() => {
    if (!visible) { setRecent(null); return; }
    recentPeople().then(setRecent).catch(() => setRecent([]));
  }, [visible]);

  // Only on a tap, with the reason on screen: the iOS contacts prompt must
  // never appear out of context (App Review 5.1.1).
  const loadContacts = async () => {
    setContacts({ kind: 'loading' });
    try {
      const r = await findFriendsInContacts();
      if (r.status === 'ok') setContacts({ kind: 'done', friends: r.friends, limited: r.limited });
      else if (r.status === 'denied') setContacts({ kind: 'denied' });
      else setContacts({ kind: 'error', message: 'Contacts are only available in the iPhone app.' });
    } catch (e) {
      setContacts({ kind: 'error', message: e instanceof Error ? e.message : 'Couldn’t read your contacts.' });
    }
  };

  const recentIds = new Set((recent ?? []).map((u) => u.id));

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: T.bg, paddingTop: Platform.OS === 'ios' ? 20 : insets.top + 12 }}>
        <View style={{ paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text accessibilityRole="header" style={{ ...fontUI(600), fontSize: 20, letterSpacing: -0.4, color: T.text }}>
            Who's coming?
          </Text>
          <TextBtn onPress={onClose}>Done</TextBtn>
        </View>
        <Label style={{ marginTop: 8, marginHorizontal: 20 }}>
          They'll get an invite with their share, and the spot shows up in their Plans.
        </Label>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}>
          {recent === null ? (
            <ActivityIndicator color={T.accent} style={{ marginTop: 28 }} />
          ) : recent.length > 0 ? (
            <Group label="People you've booked with">
              {recent.map((u) => (
                <Row key={u.id} icon={<Initial name={u.display_name} />} label={u.display_name} chevron={false} onPress={() => onPick(u)} />
              ))}
            </Group>
          ) : null}

          <Group label="From your contacts" style={{ marginTop: 28 }}>
            {contacts.kind === 'idle' && (
              <View style={{ padding: 16, gap: 12 }}>
                <Label style={{ lineHeight: 19 }}>
                  See which of your contacts are on Impulse. Numbers and emails are checked in a scrambled form and never stored.
                </Label>
                <Btn full variant="secondary" onPress={loadContacts}>Find friends in contacts</Btn>
              </View>
            )}
            {contacts.kind === 'loading' && <ActivityIndicator color={T.accent} style={{ margin: 20 }} />}
            {contacts.kind === 'denied' && (
              <View style={{ padding: 16, gap: 12 }}>
                <Label style={{ lineHeight: 19 }}>Impulse doesn't have access to your contacts. You can turn it on in Settings, or send a link instead.</Label>
                <TextBtn onPress={() => Linking.openSettings()}>Open Settings</TextBtn>
              </View>
            )}
            {contacts.kind === 'error' && <Label style={{ padding: 16, lineHeight: 19 }}>{contacts.message}</Label>}
            {contacts.kind === 'done' && (
              contacts.friends.filter((f) => !recentIds.has(f.id)).length === 0 ? (
                <Label style={{ padding: 16, lineHeight: 19 }}>
                  {contacts.limited
                    ? 'None of the contacts you shared are on Impulse yet. You can share more in Settings, or send a link.'
                    : 'None of your contacts are on Impulse yet. Send them a link instead.'}
                </Label>
              ) : (
                contacts.friends.filter((f) => !recentIds.has(f.id)).map((f) => (
                  <Row
                    key={f.id}
                    icon={<Initial name={f.name} />}
                    label={f.name}
                    sublabel={f.displayName !== f.name ? `On Impulse as ${f.displayName}` : undefined}
                    chevron={false}
                    onPress={() => onPick({ id: f.id, display_name: f.displayName, recent: false })}
                  />
                ))
              )
            )}
          </Group>

          {onShareLink && (
            <Group label="Not on Impulse yet?" style={{ marginTop: 28 }}>
              <Row
                icon={<ShareGlyph size={14} color={T.accent} />}
                label="Send them a link instead"
                accent
                chevron={false}
                onPress={onShareLink}
              />
            </Group>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function Initial({ name }: { name: string }) {
  const { T } = useApp();
  return (
    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ ...fontUI(600), fontSize: 11, color: T.text }}>{name.trim().charAt(0).toUpperCase() || '?'}</Text>
    </View>
  );
}
