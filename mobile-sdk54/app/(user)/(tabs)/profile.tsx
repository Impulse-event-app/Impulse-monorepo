import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CATEGORIES } from '../../../src/data';
import { fontDisplay, fontMono, fontUI, useApp } from '../../../src/theme';
import { Btn, Switch } from '../../../src/components';
import { ChevronRight, RowIcons } from '../../../src/icons';
import { signOut as supabaseSignOut, syncUserProfile } from '../../../src/auth';
import { FLOATING_TAB_CLEARANCE } from './_layout';

const SUBURBS = ['Sydney CBD', 'Surry Hills', 'Newtown', 'Bondi', 'Marrickville', 'Enmore', 'Darlinghurst', 'Redfern', 'Chippendale', 'Glebe', 'Paddington', 'Manly', 'Strathfield'];
const ACTIVITIES = CATEGORIES.filter((c) => c !== 'All');

type Editor = null | 'suburb' | 'favourites' | 'party' | 'payment';
type Card = { last4: string; exp: string; name: string };

function Group({ label, children }: { label?: string; children: React.ReactNode }) {
  const { T } = useApp();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={{ marginTop: 26 }}>
      {label && (
        <Text style={{ fontFamily: fontMono(400), fontSize: 11, letterSpacing: 1.1, textTransform: 'uppercase', color: T.faint, marginHorizontal: 6, marginBottom: 10 }}>
          {label}
        </Text>
      )}
      <View style={[{ backgroundColor: T.surface, borderRadius: 18, overflow: 'hidden' }, T.shadow]}>
        {items.map((c, i) => (
          <View key={i}>
            {c}
            {i < items.length - 1 && <View style={{ height: 1, backgroundColor: T.line, marginLeft: 54 }} />}
          </View>
        ))}
      </View>
    </View>
  );
}

function RowIcon({ children }: { children: React.ReactNode }) {
  const { T } = useApp();
  return (
    <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: T.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </View>
  );
}

function Row({
  icon, label, value, trailing, onPress,
}: {
  icon?: React.ReactNode;
  label: string;
  value?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
}) {
  const { T } = useApp();
  const tappable = !!onPress;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, minHeight: 56,
        backgroundColor: pressed && tappable ? T.chipBg : 'transparent',
      })}
    >
      {icon && <RowIcon>{icon}</RowIcon>}
      <Text numberOfLines={1} style={{ fontFamily: fontUI(400), fontSize: 16, color: T.text, flex: 1 }}>{label}</Text>
      {value != null && <Text style={{ fontFamily: fontUI(400), fontSize: 15.5, color: T.muted }}>{value}</Text>}
      {trailing}
      {tappable && !trailing && <ChevronRight size={8} color={T.faint} />}
    </Pressable>
  );
}

function StatTile({ big, label }: { big: string | number; label: string }) {
  const { T } = useApp();
  return (
    <View style={[{ flex: 1, backgroundColor: T.surface, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 15 }, T.shadow]}>
      <Text numberOfLines={1} style={{ fontFamily: fontDisplay(700), fontSize: 24, color: T.text, letterSpacing: -0.48 }}>{big}</Text>
      <Text style={{ fontFamily: fontUI(400), fontSize: 13, color: T.muted, marginTop: 6 }}>{label}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const { T, dark, setDark, plans, profile, setProfile, refreshProfile, reset } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile.name);
  const [notif, setNotif] = useState({ near: true, reminders: true, weekly: false });
  const setN = (k: keyof typeof notif, v: boolean) => setNotif((p) => ({ ...p, [k]: v }));

  // Which field editor is open (bottom sheet), plus its working drafts.
  const [editor, setEditor] = useState<Editor>(null);
  const [draftSuburb, setDraftSuburb] = useState('');
  const [draftActs, setDraftActs] = useState<string[]>([]);
  const [draftParty, setDraftParty] = useState(2);
  // Payment is a mock: stored in app state only (no real card is ever collected).
  const [card, setCard] = useState<Card>({ last4: '4242', exp: '04/28', name: '' });
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExp, setCardExp] = useState('');

  const openSuburb = () => { setDraftSuburb(profile.suburb); setEditor('suburb'); };
  const openFavourites = () => { setDraftActs(profile.acts || []); setEditor('favourites'); };
  const openParty = () => { setDraftParty(profile.party || 2); setEditor('party'); };
  const openPayment = () => { setCardName(card.name); setCardNumber(''); setCardExp(card.exp); setEditor('payment'); };
  const close = () => setEditor(null);

  const saveSuburb = () => {
    setProfile((p) => ({ ...p, suburb: draftSuburb }));
    syncUserProfile({ suburb: draftSuburb }).catch(console.warn);
    close();
  };
  const saveFavourites = () => {
    setProfile((p) => ({ ...p, acts: draftActs }));
    syncUserProfile({ acts: draftActs }).catch(console.warn);
    close();
  };
  const saveParty = () => {
    setProfile((p) => ({ ...p, party: draftParty }));
    syncUserProfile({ party_size: draftParty }).catch(console.warn);
    close();
  };
  const savePayment = () => {
    const digits = cardNumber.replace(/\D/g, '');
    // Keep only the last 4 — the full number is never stored, synced, or sent.
    setCard({
      last4: digits.length >= 4 ? digits.slice(-4) : card.last4,
      exp: cardExp.trim() || card.exp,
      name: cardName.trim(),
    });
    setCardNumber(''); // drop the full PAN from memory immediately
    close();
  };
  const toggleDraftAct = (a: string) =>
    setDraftActs((p) => (p.includes(a) ? p.filter((x) => x !== a) : [...p, a]));

  // Pull the latest profile from the backend whenever this tab opens.
  useEffect(() => {
    refreshProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const acts = profile.acts || [];
  const actLabel = acts.length === 0 ? 'Everything' : acts.length === 1 ? acts[0] : `${acts[0]} +${acts.length - 1}`;
  const plansCount = plans.length;
  const displayName = profile.name || (profile.email ? profile.email.split('@')[0] : '') || 'You';
  const initials = displayName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'U';

  const saveName = () => {
    const v = draft.trim();
    if (v) {
      setProfile((p) => ({ ...p, name: v }));
      syncUserProfile({ full_name: v }).catch(console.warn);
    }
    setEditing(false);
  };

  const signOut = () => {
    supabaseSignOut().catch(console.warn);
    reset();
    router.replace('/');
  };

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: 40 + FLOATING_TAB_CLEARANCE }}>
        {/* header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: fontDisplay(700), fontSize: 33, color: T.text, letterSpacing: -1 }}>You</Text>
          <Pressable
            onPress={() => {
              if (editing) saveName();
              else {
                setDraft(profile.name || displayName);
                setEditing(true);
              }
            }}
          >
            <Text style={{ fontFamily: fontUI(600), fontSize: 15, color: T.accent }}>{editing ? 'Done' : 'Edit'}</Text>
          </Pressable>
        </View>

        {/* identity card */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15, marginTop: 18 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: T.accentSoft, borderWidth: 1.5, borderColor: T.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: fontDisplay(700), fontSize: 24, color: T.accent }}>
              {initials}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            {editing ? (
              <TextInput
                value={draft}
                onChangeText={setDraft}
                onBlur={saveName}
                onSubmitEditing={saveName}
                autoFocus
                style={{ fontFamily: fontDisplay(700), fontSize: 22, letterSpacing: -0.44, color: T.text, borderBottomWidth: 2, borderBottomColor: T.accent, paddingBottom: 3 }}
              />
            ) : (
              <Text numberOfLines={1} style={{ fontFamily: fontDisplay(700), fontSize: 22, color: T.text, letterSpacing: -0.44 }}>{displayName}</Text>
            )}
            <Text numberOfLines={1} style={{ fontFamily: fontUI(400), fontSize: 14.5, color: T.muted, marginTop: 3 }}>{profile.email || profile.phone}</Text>
          </View>
        </View>

        {/* stats */}
        <View style={{ flexDirection: 'row', gap: 11, marginTop: 20 }}>
          <StatTile big={plansCount} label={plansCount === 1 ? 'Plan claimed' : 'Plans claimed'} />
          <StatTile big={profile.suburb || 'Sydney'} label="Home base" />
        </View>

        <Group label="Going out">
          <Row icon={RowIcons.pin(T.accent)} label="Home suburb" value={profile.suburb || 'Set suburb'} onPress={openSuburb} />
          <Row icon={RowIcons.star(T.accent)} label="Favourites" value={actLabel} onPress={openFavourites} />
          <Row icon={RowIcons.people(T.accent)} label="Usual party size" value={`${profile.party} ${profile.party === 1 ? 'person' : 'people'}`} onPress={openParty} />
        </Group>

        <Group label="Notifications">
          <Row icon={RowIcons.bell(T.accent)} label="Drops near me" trailing={<Switch on={notif.near} onChange={(v) => setN('near', v)} />} />
          <Row icon={RowIcons.clock(T.accent)} label="Slot reminders" trailing={<Switch on={notif.reminders} onChange={(v) => setN('reminders', v)} />} />
          <Row icon={RowIcons.mail(T.accent)} label="Weekly what's-on" trailing={<Switch on={notif.weekly} onChange={(v) => setN('weekly', v)} />} />
        </Group>

        <Group label="App">
          <Row icon={RowIcons.moon(T.accent)} label="Nocturnal theme" trailing={<Switch on={dark} onChange={setDark} />} />
          <Row icon={RowIcons.card(T.accent)} label="Payment" value={`•••• ${card.last4}`} onPress={openPayment} />
        </Group>

        <Group label="Support">
          <Row icon={RowIcons.help(T.accent)} label="Help & support" onPress={() => router.push('/(user)/legal/help')} />
          <Row icon={RowIcons.doc(T.accent)} label="Terms of service" onPress={() => router.push('/(user)/legal/terms')} />
          <Row icon={RowIcons.shield(T.accent)} label="Privacy" onPress={() => router.push('/(user)/legal/privacy')} />
        </Group>

        <Pressable onPress={signOut} style={{ marginTop: 22, height: 52, borderRadius: 16, backgroundColor: T.chipBg, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: fontUI(600), fontSize: 16, color: T.text }}>Sign out</Text>
        </Pressable>

        <Text style={{ textAlign: 'center', marginTop: 22, fontFamily: fontMono(400), fontSize: 11, color: T.faint, letterSpacing: 0.4 }}>
          impulse · v1.0.0 · made in sydney
        </Text>
      </ScrollView>

      <Modal visible={editor !== null} transparent animationType="slide" onRequestClose={close}>
        <Pressable onPress={close} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} />
        <View style={{ backgroundColor: T.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 22, paddingTop: 10, paddingBottom: insets.bottom + 20 }}>
          <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: T.line, marginBottom: 18 }} />

          {editor === 'suburb' && (
            <>
              <Text style={{ fontFamily: fontDisplay(700), fontSize: 22, color: T.text, letterSpacing: -0.44, marginBottom: 16 }}>Home suburb</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 20 }}>
                {SUBURBS.map((s) => {
                  const on = draftSuburb === s;
                  return (
                    <Pressable key={s} onPress={() => setDraftSuburb(s)} style={{ height: 38, paddingHorizontal: 16, borderRadius: 999, backgroundColor: on ? T.chipOn : T.chipBg, justifyContent: 'center' }}>
                      <Text style={{ fontFamily: fontUI(500), fontSize: 14.5, color: on ? T.chipOnInk : T.chipText }}>{s}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Btn full onPress={saveSuburb} disabled={!draftSuburb}>Save</Btn>
            </>
          )}

          {editor === 'favourites' && (
            <>
              <Text style={{ fontFamily: fontDisplay(700), fontSize: 22, color: T.text, letterSpacing: -0.44, marginBottom: 6 }}>Favourites</Text>
              <Text style={{ fontFamily: fontUI(400), fontSize: 14.5, color: T.muted, marginBottom: 16 }}>We bump these to the top of your feed.</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 20 }}>
                {ACTIVITIES.map((a) => {
                  const on = draftActs.includes(a);
                  return (
                    <Pressable key={a} onPress={() => toggleDraftAct(a)} style={{ paddingHorizontal: 15, paddingVertical: 10, borderRadius: 12, backgroundColor: on ? T.accent : T.chipBg, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: on ? T.accentInk : T.faint }} />
                      <Text style={{ fontFamily: fontUI(500), fontSize: 14.5, color: on ? T.accentInk : T.text }}>{a}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Btn full onPress={saveFavourites}>{draftActs.length ? `Save — ${draftActs.length} picked` : 'Save (show everything)'}</Btn>
            </>
          )}

          {editor === 'party' && (
            <>
              <Text style={{ fontFamily: fontDisplay(700), fontSize: 22, color: T.text, letterSpacing: -0.44, marginBottom: 6 }}>Usual party size</Text>
              <Text style={{ fontFamily: fontUI(400), fontSize: 14.5, color: T.muted, marginBottom: 22 }}>How many people you usually book for.</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28, marginBottom: 26 }}>
                <Pressable onPress={() => setDraftParty((n) => Math.max(1, n - 1))} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: T.chipBg, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: fontDisplay(700), fontSize: 26, color: T.text, marginTop: -2 }}>−</Text>
                </Pressable>
                <Text style={{ fontFamily: fontDisplay(700), fontSize: 44, color: T.text, letterSpacing: -1, minWidth: 60, textAlign: 'center' }}>{draftParty}</Text>
                <Pressable onPress={() => setDraftParty((n) => Math.min(12, n + 1))} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: T.chipBg, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: fontDisplay(700), fontSize: 26, color: T.text, marginTop: -2 }}>+</Text>
                </Pressable>
              </View>
              <Btn full onPress={saveParty}>Save</Btn>
            </>
          )}

          {editor === 'payment' && (
            <>
              <Text style={{ fontFamily: fontDisplay(700), fontSize: 22, color: T.text, letterSpacing: -0.44, marginBottom: 6 }}>Payment method</Text>
              <Text style={{ fontFamily: fontUI(400), fontSize: 13, color: T.faint, marginBottom: 18 }}>Demo only — don't enter a real card number.</Text>
              <TextInput
                value={cardName}
                onChangeText={setCardName}
                placeholder="Name on card"
                placeholderTextColor={T.faint}
                autoCapitalize="words"
                style={{ fontFamily: fontUI(400), fontSize: 16, color: T.text, backgroundColor: T.surface, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 14, marginBottom: 11 }}
              />
              <TextInput
                value={cardNumber}
                onChangeText={(t) => setCardNumber(t.replace(/[^\d ]/g, '').slice(0, 19))}
                placeholder="Card number"
                placeholderTextColor={T.faint}
                keyboardType="number-pad"
                style={{ fontFamily: fontUI(400), fontSize: 16, color: T.text, backgroundColor: T.surface, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 14, marginBottom: 11 }}
              />
              <TextInput
                value={cardExp}
                onChangeText={(t) => setCardExp(t.replace(/[^\d/]/g, '').slice(0, 5))}
                placeholder="MM/YY"
                placeholderTextColor={T.faint}
                keyboardType="number-pad"
                style={{ fontFamily: fontUI(400), fontSize: 16, color: T.text, backgroundColor: T.surface, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 14, marginBottom: 20 }}
              />
              <Btn full onPress={savePayment}>Save card</Btn>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}
