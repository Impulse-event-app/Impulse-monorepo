// Required mobile number for accounts that don't have one yet (signed up with
// Apple, Google or email before numbers were required). The auth gate in
// _layout.tsx sends signed-in users here until it's done. It's not a dead
// end: you can sign out or delete the account from here (App Review 5.1.1(v)).
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../src/theme';
import { Lede } from '../../src/onboardingUI';
import { TextBtn } from '../../src/components';
import { PhoneVerify, PHONE_REASON } from '../../src/PhoneVerify';
import { deleteAccount, signOut } from '../../src/auth';
import { confirmDestructive } from '../../src/confirm';

export default function PhoneScreen() {
  const { T, reset } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  const leave = async () => {
    await signOut().catch(() => {});
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
    setBusy(true);
    try {
      await deleteAccount();
      reset();
      router.replace('/(user)/home');
    } catch (e) {
      Alert.alert("Couldn't delete your account", e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 56, paddingBottom: insets.bottom + 24 }}>
        <Lede title="Add your mobile number." body={PHONE_REASON} />
        <View style={{ paddingHorizontal: 22, paddingTop: 28 }}>
          <PhoneVerify onVerified={() => router.replace('/(user)/home')} />
        </View>
        <View style={{ marginTop: 36, alignItems: 'center', gap: 6 }}>
          <TextBtn size={15} onPress={leave} disabled={busy}>Sign out</TextBtn>
          <TextBtn size={15} onPress={askDelete} disabled={busy}>Delete my account</TextBtn>
          <TextBtn size={15} onPress={() => router.push('/(user)/legal/privacy')}>Privacy policy</TextBtn>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
