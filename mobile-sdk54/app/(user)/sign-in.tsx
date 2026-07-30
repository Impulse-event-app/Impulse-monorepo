// Pre-login entry screen: brand hero → sign-in. This is a separate route from
// onboarding so the two never share a pager. On web, OAuth reloads the whole
// app; the reload is handled by app/index.tsx (not here), which routes the
// now-signed-in user to /onboarding. The inline methods (phone, email, and
// native Google/Apple) call afterAuth() below to move on without a reload.
import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontDisplay, fontMono, fontUI, useApp } from '../../src/theme';
import { Btn, Logo, PulseMark } from '../../src/components';
import { AppleLogo, GoogleLogo, MailGlyph, PhoneGlyph } from '../../src/icons';
import { fetchUserProfile, isOnboarded, markOnboarded, sendPhoneOtp, signInWithApple, signInWithGoogle, signInWithEmail, signUpWithEmail, syncUserProfile, verifyPhoneOtp } from '../../src/auth';
import { supabase } from '../../src/supabase';
import { Lede, Panel, usePagerWidth } from '../../src/onboardingUI';

function PulseRings() {
  const { T } = useApp();
  const vals = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    // react-native-web's Animated.loop won't reliably restart a sequence-with-
    // delay (the rings played once, then froze as a dot). Drive each ring with
    // a timing that resets and re-runs itself in its completion callback — this
    // loops identically on web and native. JS driver on web (no native module),
    // native driver on iOS/Android.
    const useNativeDriver = Platform.OS !== 'web';
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const runRing = (v: Animated.Value) => {
      if (cancelled) return;
      v.setValue(0);
      Animated.timing(v, { toValue: 1, duration: 2600, easing: Easing.out(Easing.ease), useNativeDriver })
        .start(({ finished }) => { if (finished && !cancelled) runRing(v); });
    };
    // Stagger the three rings so they radiate one after another.
    vals.forEach((v, i) => { timers.push(setTimeout(() => runRing(v), i * 860)); });
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [vals]);
  return (
    <View style={{ width: 150, height: 150, alignItems: 'center', justifyContent: 'center' }}>
      {vals.map((v, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute', width: 150, height: 150, borderRadius: 75, borderWidth: 1.5, borderColor: T.accent,
            opacity: v.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.9, 0.12, 0] }),
            transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.37, 1] }) }],
          }}
        />
      ))}
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: T.accent }} />
    </View>
  );
}

function SocialBtn({ kind, onPress, loading }: { kind: 'apple' | 'google'; onPress: () => void; loading?: boolean }) {
  const { T } = useApp();
  const apple = kind === 'apple';
  const bg = apple ? (T.dark ? '#fff' : '#000') : T.surface;
  const fg = apple ? (T.dark ? '#000' : '#fff') : T.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={{
        width: '100%', height: 54, borderRadius: 16, backgroundColor: bg,
        borderWidth: apple ? 0 : 1.5, borderColor: T.line2,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        opacity: loading ? 0.6 : 1,
      }}
    >
      {apple ? <AppleLogo size={18} color={fg} /> : <GoogleLogo size={18} />}
      <Text style={{ fontFamily: fontUI(600), fontSize: 16.5, color: fg }}>Continue with {apple ? 'Apple' : 'Google'}</Text>
    </Pressable>
  );
}

const AUTH_PANEL = 1;

export default function SignIn() {
  const { T, setProfile } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [W, onPagerLayout] = usePagerWidth();
  // Which panel we're on, so a viewport change can put us back on it.
  const [panel, setPanel] = useState(0);

  const [phoneView, setPhoneView] = useState<'buttons' | 'phone' | 'otp' | 'email'>('buttons');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [emailMode, setEmailMode] = useState<'signin' | 'signup'>('signin');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // If someone lands here already signed in (e.g. tapped Back), send them on.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      router.replace(isOnboarded(session) ? '/(user)/home' : '/(user)/onboarding');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goToAuth = () => {
    setPanel(AUTH_PANEL);
    scrollRef.current?.scrollTo({ x: AUTH_PANEL * W, animated: true });
  };

  // Re-anchor when the viewport width changes. On mobile web that fires when
  // the keyboard opens over the email/phone inputs and when the URL bar
  // collapses — without this the pages resize under a stale scroll offset and
  // the panel sits half off-screen.
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: panel * W, animated: false });
  }, [W, panel]);

  // Where to go once signed in: the app if they've onboarded before, else the
  // onboarding flow. Web OAuth doesn't reach here (it reloads → app/index.tsx).
  const afterAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session && isOnboarded(session)) { router.replace('/(user)/home'); return; }
    const existing = await fetchUserProfile().catch(() => null);
    const onboarded = !!(existing && (existing.home_suburb || (existing.preferred_acts?.length ?? 0) > 0));
    if (onboarded) { await markOnboarded(); router.replace('/(user)/home'); return; }
    router.replace('/(user)/onboarding');
  };

  const withAuth = async (fn: () => Promise<unknown>) => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      await fn();
    } finally {
      setAuthLoading(false);
    }
  };

  const handleApple = () =>
    withAuth(async () => {
      const user = await signInWithApple().catch((e) => {
        if (e.code !== 'ERR_REQUEST_CANCELED') throw e;
        return null;
      });
      if (user) await afterAuth();
    }).catch((e) => setAuthError(e.message ?? 'Apple sign-in failed.'));

  const handleGoogle = () =>
    withAuth(async () => {
      const user = await signInWithGoogle();
      if (user) await afterAuth();
    }).catch((e) => setAuthError(e.message ?? 'Google sign-in failed.'));

  const handleSendOtp = () =>
    withAuth(async () => {
      await sendPhoneOtp(phoneNumber);
      setOtpCode('');
      setPhoneView('otp');
    }).catch((e) => setAuthError(e.message ?? 'Could not send code. Check the number.'));

  const handleVerifyOtp = () =>
    withAuth(async () => {
      const user = await verifyPhoneOtp(phoneNumber, otpCode);
      if (user) { setPhoneNumber(''); setOtpCode(''); await afterAuth(); }
    }).catch((e) => setAuthError(e.message ?? 'Invalid code. Please try again.'));

  const handleEmailAuth = () =>
    withAuth(async () => {
      if (emailMode === 'signin') {
        const user = await signInWithEmail(email, password);
        if (!user) return;
        setEmail(''); setPassword('');
        await afterAuth();
        return;
      }
      // Sign-up → create the account, save their name, then onboard.
      const user = await signUpWithEmail(email, password);
      if (!user) return;
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      if (fullName) {
        setProfile((p) => ({ ...p, name: fullName }));
        await syncUserProfile({ full_name: fullName }).catch(() => {/* best effort */});
      }
      setEmail(''); setPassword(''); setFirstName(''); setLastName('');
      router.replace('/(user)/onboarding');
    }).catch((e) => setAuthError(e.message ?? 'Authentication failed. Check your details.'));

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        onLayout={onPagerLayout}
        style={{ flex: 1 }}
      >
        {/* hero */}
        <Panel
          width={W}
          top={insets.top + 8}
          footer={<Btn full onPress={goToAuth}>Get started</Btn>}
        >
          <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 8, justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <PulseMark size={28} radius={8} />
              <Logo size={20} />
            </View>
            <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', paddingVertical: 30 }}>
              <PulseRings />
            </View>
            <View style={{ paddingBottom: 8 }}>
              <Text style={{ fontFamily: fontDisplay(700), fontSize: 52, lineHeight: 51, letterSpacing: -2, color: T.text }}>Plans,{'\n'}on impulse.</Text>
              <Text style={{ marginTop: 16, fontFamily: fontUI(400), fontSize: 16.5, lineHeight: 24, color: T.muted, maxWidth: 300 }}>
                Last-minute things to do in Sydney, with the price already worked out.
              </Text>
            </View>
          </View>
        </Panel>

        {/* sign in */}
        <Panel
          width={W}
          top={insets.top + 24}
          footer={
            <Text style={{ fontFamily: fontUI(400), fontSize: 12, lineHeight: 17, color: T.faint, textAlign: 'center' }}>
              By continuing you agree to our <Text style={{ color: T.muted }}>Terms</Text> and <Text style={{ color: T.muted }}>Privacy Policy</Text>.
            </Text>
          }
        >
          {phoneView === 'buttons' && (
            <>
              <Lede kicker="Welcome in" title="Get in." body="One tap and you're set. We'll only ever use your number to hold your slots." />
              <View style={{ paddingHorizontal: 24, paddingTop: 34, gap: 11 }}>
                {/* expo-apple-authentication is iOS/tvOS only — no Apple Sign In on Android or web. */}
                {Platform.OS === 'ios' && <SocialBtn kind="apple" onPress={handleApple} loading={authLoading} />}
                <SocialBtn kind="google" onPress={handleGoogle} loading={authLoading} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 8 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: T.line }} />
                  <Text style={{ fontFamily: fontMono(400), fontSize: 11, color: T.faint, letterSpacing: 0.7 }}>OR</Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: T.line }} />
                </View>
                <Btn full variant="secondary" onPress={() => { setAuthError(null); setPhoneView('phone'); }} disabled={authLoading}>
                  <PhoneGlyph size={17} color={T.text} />
                  <Text style={{ fontFamily: fontUI(600), fontSize: 17, color: T.text }}>Continue with phone</Text>
                </Btn>
                <Btn full variant="secondary" onPress={() => { setAuthError(null); setEmailMode('signin'); setPhoneView('email'); }} disabled={authLoading}>
                  <MailGlyph size={17} color={T.text} />
                  <Text style={{ fontFamily: fontUI(600), fontSize: 17, color: T.text }}>Continue with email</Text>
                </Btn>
                {authError ? (
                  <Text style={{ fontFamily: fontUI(400), fontSize: 13.5, color: '#FF5A4D', textAlign: 'center' }}>{authError}</Text>
                ) : null}
              </View>
            </>
          )}

          {phoneView === 'phone' && (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
              <Lede kicker="Phone number" title="What's your number?" body="We'll send a one-time code to verify it's you." />
              <View style={{ paddingHorizontal: 24, paddingTop: 30, gap: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: T.surface, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 14 }}>
                  <Text style={{ fontFamily: fontUI(500), fontSize: 16, color: T.muted, marginRight: 6 }}>+</Text>
                  <TextInput
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    placeholder="61 412 345 678"
                    placeholderTextColor={T.faint}
                    keyboardType="phone-pad"
                    autoFocus
                    style={{ flex: 1, fontFamily: fontUI(400), fontSize: 17, color: T.text }}
                  />
                </View>
                {authError ? (
                  <Text style={{ fontFamily: fontUI(400), fontSize: 13.5, color: '#FF5A4D' }}>{authError}</Text>
                ) : null}
                <Btn full onPress={handleSendOtp} disabled={phoneNumber.length < 8 || authLoading}>
                  {authLoading ? 'Sending…' : 'Send code'}
                </Btn>
                <Pressable onPress={() => { setPhoneView('buttons'); setAuthError(null); }} style={{ alignItems: 'center', paddingVertical: 6 }}>
                  <Text style={{ fontFamily: fontUI(400), fontSize: 15, color: T.muted }}>Back</Text>
                </Pressable>
              </View>
            </KeyboardAvoidingView>
          )}

          {phoneView === 'otp' && (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
              <Lede kicker="Verification" title="Enter the code." body={`Sent to +${phoneNumber}. Check your messages.`} />
              <View style={{ paddingHorizontal: 24, paddingTop: 30, gap: 14 }}>
                <TextInput
                  value={otpCode}
                  onChangeText={(t) => setOtpCode(t.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  placeholderTextColor={T.faint}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                  style={{
                    fontFamily: fontMono(700), fontSize: 32, letterSpacing: 8,
                    color: T.text, textAlign: 'center',
                    backgroundColor: T.surface, borderRadius: 14,
                    paddingVertical: 18,
                  }}
                />
                {authError ? (
                  <Text style={{ fontFamily: fontUI(400), fontSize: 13.5, color: '#FF5A4D', textAlign: 'center' }}>{authError}</Text>
                ) : null}
                <Btn full onPress={handleVerifyOtp} disabled={otpCode.length < 6 || authLoading}>
                  {authLoading ? 'Verifying…' : 'Verify'}
                </Btn>
                <Pressable onPress={() => { setPhoneView('phone'); setOtpCode(''); setAuthError(null); }} style={{ alignItems: 'center', paddingVertical: 6 }}>
                  <Text style={{ fontFamily: fontUI(400), fontSize: 15, color: T.muted }}>Resend / change number</Text>
                </Pressable>
              </View>
            </KeyboardAvoidingView>
          )}

          {phoneView === 'email' && (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
              <Lede
                kicker={emailMode === 'signin' ? 'Welcome back' : 'Create account'}
                title={emailMode === 'signin' ? 'Sign in.' : 'Join Impulse.'}
                body={emailMode === 'signin' ? 'Enter your email and password.' : 'Pick an email and a password to get started.'}
              />
              <View style={{ paddingHorizontal: 24, paddingTop: 30, gap: 12 }}>
                {emailMode === 'signup' && (
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <TextInput
                      value={firstName}
                      onChangeText={setFirstName}
                      placeholder="First name"
                      placeholderTextColor={T.faint}
                      autoCapitalize="words"
                      autoCorrect={false}
                      autoFocus
                      style={{ flex: 1, fontFamily: fontUI(400), fontSize: 17, color: T.text, backgroundColor: T.surface, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 14 }}
                    />
                    <TextInput
                      value={lastName}
                      onChangeText={setLastName}
                      placeholder="Last name"
                      placeholderTextColor={T.faint}
                      autoCapitalize="words"
                      autoCorrect={false}
                      style={{ flex: 1, fontFamily: fontUI(400), fontSize: 17, color: T.text, backgroundColor: T.surface, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 14 }}
                    />
                  </View>
                )}
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={T.faint}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus={emailMode === 'signin'}
                  style={{ fontFamily: fontUI(400), fontSize: 17, color: T.text, backgroundColor: T.surface, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 14 }}
                />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor={T.faint}
                  secureTextEntry
                  autoCapitalize="none"
                  style={{ fontFamily: fontUI(400), fontSize: 17, color: T.text, backgroundColor: T.surface, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 14 }}
                />
                {authError ? (
                  <Text style={{ fontFamily: fontUI(400), fontSize: 13.5, color: '#FF5A4D' }}>{authError}</Text>
                ) : null}
                <Btn full onPress={handleEmailAuth} disabled={!email || password.length < 6 || (emailMode === 'signup' && (!firstName.trim() || !lastName.trim())) || authLoading}>
                  {authLoading ? 'Please wait…' : emailMode === 'signin' ? 'Sign in' : 'Create account'}
                </Btn>
                <Pressable onPress={() => { setEmailMode(emailMode === 'signin' ? 'signup' : 'signin'); setAuthError(null); }} style={{ alignItems: 'center', paddingVertical: 4 }}>
                  <Text style={{ fontFamily: fontUI(400), fontSize: 15, color: T.muted }}>
                    {emailMode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
                  </Text>
                </Pressable>
                <Pressable onPress={() => { setPhoneView('buttons'); setAuthError(null); }} style={{ alignItems: 'center', paddingVertical: 4 }}>
                  <Text style={{ fontFamily: fontUI(400), fontSize: 15, color: T.faint }}>Back</Text>
                </Pressable>
              </View>
            </KeyboardAvoidingView>
          )}
        </Panel>
      </ScrollView>
    </View>
  );
}
