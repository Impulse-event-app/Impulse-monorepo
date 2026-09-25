import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Linking, ScrollView, Text, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { fontMono, fontUI, useApp, type Appearance } from '../../../src/theme';
import {
  Btn,
  EmptyState,
  Group,
  Label,
  LargeTitle,
  NavBar,
  Radar,
  ReadableColumn,
  Row,
  Switch,
  TextBtn,
  useNavTop,
  useScrolled,
} from '../../../src/components';
import { RowIcons } from '../../../src/icons';
import { deleteAccount, signOut as supabaseSignOut, syncUserProfile } from '../../../src/auth';
import { useWallet } from '../../../src/wallet';
import { describeCard } from '../../../src/api';
import { requestNotificationAccess, syncPushToken } from '../../../src/permissions';
import { confirmDestructive } from '../../../src/confirm';
import { FLOATING_TAB_CLEARANCE } from './_layout';

const APPEARANCE_LABEL: Record<Appearance, string> = { system: 'System', light: 'Light', dark: 'Dark' };
const VERSION = Constants.expoConfig?.version ?? '';

type EditorField = 'suburb' | 'favourites' | 'party' | 'payment' | 'appearance';

function StatTile({ big, label }: { big: string | number; label: string }) {
  const { T } = useApp();
  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${big}`}
      style={{ flex: 1, backgroundColor: T.surface, borderCurve: 'continuous', borderRadius: 12, borderWidth: 1, borderColor: T.line, padding: 16 }}
    >
      <Text numberOfLines={2} style={{ ...fontMono(600), fontSize: 24, lineHeight: 28, letterSpacing: -0.48, color: T.text }}>{big}</Text>
      <Label style={{ marginTop: 7 }}>{label}</Label>
    </View>
  );
}

export default function ProfileScreen() {
  const { T, appearance, plans, profile, setProfile, refreshProfile, reset, signedIn } = useApp();
  const router = useRouter();
  const navTop = useNavTop();
  const [scrolled, onScroll] = useScrolled();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile.name);
  const [notifBusy, setNotifBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Real cards on file, vaulted at Pinch — this screen only ever sees the
  // scheme and last 4 that Pinch returns.
  const wallet = useWallet();
  const defaultCard = wallet.cards?.find((c) => c.is_default) ?? wallet.cards?.[0] ?? null;

  // Pull the latest profile and cards whenever this tab opens signed in.
  useEffect(() => {
    if (!signedIn) return;
    refreshProfile();
    wallet.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  const openEditor = (field: EditorField) => router.push(`/(user)/profile-edit/${field}`);
  const signIn = () => router.push({ pathname: '/(user)/sign-in', params: { next: '/profile', back: '1' } });

  const acts = profile.acts || [];
  const actLabel = acts.length === 0 ? 'Everything' : acts.length === 1 ? acts[0] : `${acts[0]} +${acts.length - 1}`;
  const plansCount = plans.length;
  const displayName = profile.name || (profile.email ? profile.email.split('@')[0] : '') || 'You';
  const initials = displayName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'U';
  const I = (k: keyof typeof RowIcons) => RowIcons[k](T.muted);

  const saveName = () => {
    const v = draft.trim();
    if (v) {
      setProfile((p) => ({ ...p, name: v }));
      syncUserProfile({ full_name: v }).catch(console.warn);
    }
    setEditing(false);
  };

  // A real switch: it asks the OS, and it's saved to the account.
  const setNotifications = async (on: boolean) => {
    setNotifBusy(true);
    try {
      if (on) {
        const granted = await requestNotificationAccess();
        if (!granted) {
          // iOS only shows the permission prompt once; after that it's in Settings.
          Alert.alert(
            'Notifications are off',
            'To hear when something opens up nearby, turn on notifications for Impulse in Settings.',
            [
              { text: 'Not now', style: 'cancel' },
              { text: 'Open Settings', onPress: () => { Linking.openSettings().catch(() => {}); } },
            ],
          );
          return;
        }
        syncPushToken().catch(() => {});
      }
      setProfile((p) => ({ ...p, notifications: on }));
      await syncUserProfile({ notifications_enabled: on }).catch(console.warn);
    } finally {
      setNotifBusy(false);
    }
  };

  const signOut = async () => {
    // Await the Supabase sign-out BEFORE navigating, so the next screen
    // doesn't see a stale session.
    try {
      await supabaseSignOut();
    } catch (e) {
      console.warn(e);
    }
    reset();
    router.replace('/(user)/home');
  };

  const askDelete = async () => {
    const ok = await confirmDestructive(
      'Delete your account?',
      "Your profile, saved cards and preferences are removed and you're signed out. This can't be undone.",
      'Delete account',
    );
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteAccount();
      reset();
      router.replace('/(user)/home');
    } catch (e) {
      Alert.alert("Couldn't delete your account", e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: navTop, paddingHorizontal: 16, paddingBottom: 24 + FLOATING_TAB_CLEARANCE }}
      >
        <ReadableColumn>
          <LargeTitle>You</LargeTitle>

          {signedIn ? (
            <>
              {/* identity */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 22 }}>
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={{ width: 60, height: 60, borderCurve: 'continuous', borderRadius: 30, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.line, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text maxFontSizeMultiplier={1} style={{ ...fontUI(600), fontSize: 22, color: T.text }}>{initials}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  {editing ? (
                    <TextInput
                      value={draft}
                      onChangeText={setDraft}
                      onBlur={saveName}
                      onSubmitEditing={saveName}
                      autoFocus
                      accessibilityLabel="Your name"
                      textContentType="name"
                      autoComplete="name"
                      returnKeyType="done"
                      style={{ ...fontUI(600), fontSize: 22, letterSpacing: -0.48, color: T.text, borderBottomWidth: 1.5, borderBottomColor: T.accent, paddingBottom: 3 }}
                    />
                  ) : (
                    <Text numberOfLines={2} style={{ ...fontUI(600), fontSize: 22, letterSpacing: -0.48, color: T.text }}>{displayName}</Text>
                  )}
                  <Text numberOfLines={1} style={{ ...fontUI(400, 15), fontSize: 15, color: T.muted, marginTop: 4 }}>{profile.email || profile.phone}</Text>
                </View>
              </View>

              {/* stats */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 24 }}>
                <StatTile big={plansCount} label={plansCount === 1 ? 'Plan booked' : 'Plans booked'} />
                <StatTile big={profile.suburb || 'Sydney'} label="Home base" />
              </View>

              <Group label="Going out">
                <Row icon={I('pin')} label="Home suburb" value={profile.suburb || 'Set suburb'} onPress={() => openEditor('suburb')} />
                <Row icon={I('star')} label="Favourites" value={actLabel} onPress={() => openEditor('favourites')} />
                <Row icon={I('people')} label="Usual party size" value={`${profile.party}`} onPress={() => openEditor('party')} />
              </Group>

              <Group label="Notifications" footer="One nudge when something opens up nearby tonight. Never a daily blast.">
                <Row
                  icon={I('bell')}
                  label="Drops near me"
                  trailing={
                    <Switch
                      on={profile.notifications}
                      onChange={setNotifications}
                      disabled={notifBusy}
                      accessibilityLabel="Drops near me"
                    />
                  }
                />
              </Group>
            </>
          ) : (
            <EmptyState
              style={{ marginTop: 36 }}
              title="Sign in to book."
              body="Keep your door codes in Plans, save a card and book in one tap."
              action={<Btn onPress={signIn}>Sign in</Btn>}
            />
          )}

          <Group label="App">
            <Row icon={I('moon')} label="Appearance" value={APPEARANCE_LABEL[appearance]} onPress={() => openEditor('appearance')} />
            {signedIn && (
              <Row icon={I('card')} label="Payment" value={defaultCard ? describeCard(defaultCard) : 'Add a card'} onPress={() => openEditor('payment')} />
            )}
          </Group>

          <Group label="Support">
            <Row icon={I('help')} label="Help" onPress={() => router.push('/(user)/legal/help')} />
            <Row icon={I('doc')} label="Terms of service" onPress={() => router.push('/(user)/legal/terms')} />
            <Row icon={I('shield')} label="Privacy" onPress={() => router.push('/(user)/legal/privacy')} />
          </Group>

          {signedIn && (
            <Group label="Account">
              <Row icon={I('signout')} label="Sign out" chevron={false} onPress={signOut} />
              <Row
                icon={<View />}
                label="Delete account"
                destructive
                chevron={false}
                disabled={deleting}
                onPress={askDelete}
                trailing={deleting ? <ActivityIndicator color={T.accent} /> : undefined}
              />
            </Group>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 28 }}>
            <Radar size={20} kind="compact" decorative />
            <Label>{VERSION ? `Version ${VERSION} · Sydney` : 'Impulse · Sydney'}</Label>
          </View>
        </ReadableColumn>
      </ScrollView>

      <NavBar
        title="You"
        scrolled={scrolled}
        trailing={
          signedIn ? (
            <TextBtn
              color={T.accent}
              onPress={() => {
                if (editing) saveName();
                else {
                  setDraft(profile.name || displayName);
                  setEditing(true);
                }
              }}
            >
              {editing ? 'Done' : 'Edit'}
            </TextBtn>
          ) : undefined
        }
      />
    </View>
  );
}
