import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontDisplay, fontMono, fontUI, useApp } from '../../../src/theme';
import { Switch } from '../../../src/components';
import { ChevronRight, RowIcons } from '../../../src/icons';

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
  const { T, dark, setDark, plans, profile, setProfile, reset } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile.name);
  const [notif, setNotif] = useState({ near: true, reminders: true, weekly: false });
  const setN = (k: keyof typeof notif, v: boolean) => setNotif((p) => ({ ...p, [k]: v }));

  const acts = profile.acts || [];
  const actLabel = acts.length === 0 ? 'Everything' : acts.length === 1 ? acts[0] : `${acts[0]} +${acts.length - 1}`;
  const plansCount = plans.length;

  const saveName = () => {
    const v = draft.trim();
    if (v) setProfile((p) => ({ ...p, name: v }));
    setEditing(false);
  };

  const signOut = () => {
    reset();
    router.replace('/');
  };

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: 40 }}>
        {/* header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: fontDisplay(700), fontSize: 33, color: T.text, letterSpacing: -1 }}>You</Text>
          <Pressable
            onPress={() => {
              if (editing) saveName();
              else {
                setDraft(profile.name);
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
              {profile.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
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
              <Text numberOfLines={1} style={{ fontFamily: fontDisplay(700), fontSize: 22, color: T.text, letterSpacing: -0.44 }}>{profile.name}</Text>
            )}
            <Text style={{ fontFamily: fontUI(400), fontSize: 14.5, color: T.muted, marginTop: 3 }}>{profile.phone}</Text>
          </View>
        </View>

        {/* stats */}
        <View style={{ flexDirection: 'row', gap: 11, marginTop: 20 }}>
          <StatTile big={plansCount} label={plansCount === 1 ? 'Plan claimed' : 'Plans claimed'} />
          <StatTile big={profile.suburb || 'Sydney'} label="Home base" />
        </View>

        <Group label="Going out">
          <Row icon={RowIcons.pin(T.accent)} label="Home suburb" value={profile.suburb || 'Set suburb'} onPress={() => {}} />
          <Row icon={RowIcons.star(T.accent)} label="Favourites" value={actLabel} onPress={() => {}} />
          <Row icon={RowIcons.people(T.accent)} label="Usual party size" value={`${profile.party} ${profile.party === 1 ? 'person' : 'people'}`} onPress={() => {}} />
        </Group>

        <Group label="Notifications">
          <Row icon={RowIcons.bell(T.accent)} label="Drops near me" trailing={<Switch on={notif.near} onChange={(v) => setN('near', v)} />} />
          <Row icon={RowIcons.clock(T.accent)} label="Slot reminders" trailing={<Switch on={notif.reminders} onChange={(v) => setN('reminders', v)} />} />
          <Row icon={RowIcons.mail(T.accent)} label="Weekly what's-on" trailing={<Switch on={notif.weekly} onChange={(v) => setN('weekly', v)} />} />
        </Group>

        <Group label="App">
          <Row icon={RowIcons.moon(T.accent)} label="Nocturnal theme" trailing={<Switch on={dark} onChange={setDark} />} />
          <Row icon={RowIcons.card(T.accent)} label="Payment" value="•••• 4242" onPress={() => {}} />
        </Group>

        <Group label="Support">
          <Row icon={RowIcons.help(T.accent)} label="Help & support" onPress={() => {}} />
          <Row icon={RowIcons.doc(T.accent)} label="Terms of service" onPress={() => {}} />
          <Row icon={RowIcons.shield(T.accent)} label="Privacy" onPress={() => {}} />
        </Group>

        <Pressable onPress={signOut} style={{ marginTop: 22, height: 52, borderRadius: 16, backgroundColor: T.chipBg, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: fontUI(600), fontSize: 16, color: T.text }}>Sign out</Text>
        </Pressable>

        <Text style={{ textAlign: 'center', marginTop: 22, fontFamily: fontMono(400), fontSize: 11, color: T.faint, letterSpacing: 0.4 }}>
          impulse · v1.0.0 · made in sydney
        </Text>
      </ScrollView>
    </View>
  );
}
