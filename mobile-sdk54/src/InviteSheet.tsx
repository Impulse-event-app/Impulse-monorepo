// InviteSheet.tsx — pick who's taking a seat in a Huddle Pay booking.
// Search Impulse by name (people you've booked with come first); picking
// someone saves the seat for them and sends them a push. For friends who
// aren't on Impulse yet, the seat's link can be shared instead.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontUI, useApp } from './theme';
import { searchUsers, UserSearchResult } from './api';
import { Field, Group, Label, Row, TextBtn } from './components';
import { ShareGlyph } from './icons';

const MIN_CHARS = 3;
const DEBOUNCE_MS = 250;

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
  const [q, setQ] = useState('');
  const [results, setResults] = useState<UserSearchResult[] | null>(null);
  const seq = useRef(0);

  useEffect(() => { if (!visible) { setQ(''); setResults(null); } }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const term = q.trim();
    if (term.length > 0 && term.length < MIN_CHARS) { setResults(null); return; }
    const mine = ++seq.current;
    const t = setTimeout(() => {
      searchUsers(term)
        .then((r) => { if (mine === seq.current) setResults(r); })
        .catch(() => { if (mine === seq.current) setResults([]); });
    }, term ? DEBOUNCE_MS : 0);
    return () => clearTimeout(t);
  }, [q, visible]);

  const term = q.trim();
  const tooShort = term.length > 0 && term.length < MIN_CHARS;

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
        <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
          <Field
            value={q}
            onChangeText={setQ}
            placeholder="Search by name"
            autoFocus
            autoCorrect={false}
            autoCapitalize="words"
            returnKeyType="search"
            accessibilityLabel="Search people on Impulse"
          />
          <Label style={{ marginTop: 8, marginHorizontal: 4 }}>
            They'll get an invite with their share, and the spot shows up in their Plans.
          </Label>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}>
          {tooShort ? (
            <Label style={{ marginTop: 24, textAlign: 'center' }}>Keep typing — at least 3 letters.</Label>
          ) : results === null ? (
            <ActivityIndicator color={T.accent} style={{ marginTop: 28 }} />
          ) : results.length === 0 ? (
            <Label style={{ marginTop: 24, textAlign: 'center', lineHeight: 18 }}>
              {term ? `No one on Impulse matches “${term}”.` : 'Search for a friend by name.'}
            </Label>
          ) : (
            <Group label={term ? 'On Impulse' : "People you've booked with"}>
              {results.map((u) => (
                <Row
                  key={u.id}
                  icon={<Initial name={u.display_name} />}
                  label={u.display_name}
                  sublabel={term && u.recent ? "You've booked together" : undefined}
                  chevron={false}
                  onPress={() => onPick(u)}
                />
              ))}
            </Group>
          )}

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
