// Pre-login entry screen: brand hero → sign-in. This is a separate route from
// onboarding so the two never share a pager. On web, OAuth reloads the whole
// app; the reload is handled by app/index.tsx (not here), which routes the
// now-signed-in user to /onboarding. The inline methods (phone, email, and
// native Google/Apple) call afterAuth() below to move on without a reload.
//
// Guests can skip this ("Look around first" / "Not now"). When a guest hits
// something that needs an account, useRequireAuth() opens this screen with
// `next` (where they were) and `back=1` (return by going back), so signing in
// drops them right where they left off.
import React, { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import { fontUI, useApp } from '../../src/theme';
import { BackButton, Btn, CodeInput, ErrorText, Field, Radar, TextBtn, Wordmark } from '../../src/components';
import { GoogleLogo, MailGlyph, PhoneGlyph } from '../../src/icons';
import {
  fetchUserProfile, isOnboarded, markIntroSeen, markOnboarded, sendPhoneOtp, signInWithApple, signInWithGoogle,
  signInWithEmail, signUpWithEmail, syncUserProfile, verifyPhoneOtp,
} from '../../src/auth';
import { supabase } from '../../src/supabase';
import { Lede, Panel, usePagerWidth } from '../../src/onboardingUI';
import { HeroMotion, HeroWord } from '../../src/HeroMotion';

function GoogleBtn({ onPress, loading }: { onPress: () => void; loading?: boolean }) {
  const { T } = useApp();
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!loading }}
      style={({ pressed }) => ({
        width: '100%', minHeight: 52, paddingVertical: 8, borderRadius: 26,
        backgroundColor: pressed ? T.fill : 'transparent', borderWidth: 1, borderColor: T.line2,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        opacity: loading ? 0.5 : 1,
      })}
    >
      <GoogleLogo size={17} />
      <Text style={{ ...fontUI(500), fontSize: 17, letterSpacing: -0.19, color: T.text }}>Continue with Google</Text>
    </Pressable>
  );
}

const AUTH_PANEL = 1;

export default function SignIn() {
  const { T, setProfile } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { next, back } = useLocalSearchParams<{ next?: string; back?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const [W, onPagerLayout] = usePagerWidth();
  // Which panel we're on, so a viewport change can put us back on it. Arriving
  // with a destination means the user asked for something that needs an
  // account — skip the brand hero and go straight to the options.
  const [panel, setPanel] = useState(next ? AUTH_PANEL : 0);

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

  // Signed in: return to where the user came from, or the feed.
  const leave = () => {
    if (back === '1' && router.canGoBack()) router.back();
    else router.replace(next || '/(user)/home');
  };

  // Guest: carry on without an account.
  const browse = () => {
    markIntroSeen();
    if (router.canGoBack()) router.back();
    else router.replace('/(user)/home');
  };

  // If someone lands here already signed in (e.g. tapped Back), send them on.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      if (isOnboarded(session)) leave();
      else router.replace('/(user)/onboarding');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goToAuth = () => {
    markIntroSeen();
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

  // Where to go once signed in: back to what they were doing if they've
  // onboarded before, else the onboarding flow. Web OAuth doesn't reach here
  // (it reloads → app/index.tsx).
  const afterAuth = async () => {
    markIntroSeen();
    const { data: { session } } = await supabase.auth.getSession();
    if (session && isOnboarded(session)) { leave(); return; }
    const existing = await fetchUserProfile().catch(() => null);
    const onboarded = !!(existing && (existing.home_suburb || (existing.preferred_acts?.length ?? 0) > 0));
    if (onboarded) { await markOnboarded(); leave(); return; }
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
    }).catch((e) => setAuthError(e.message ?? 'That code didn’t work. Try again.'));

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
      markIntroSeen();
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      if (fullName) {
        setProfile((p) => ({ ...p, name: fullName }));
        await syncUserProfile({ full_name: fullName }).catch(() => {/* best effort */});
      }
      setEmail(''); setPassword(''); setFirstName(''); setLastName('');
      router.replace('/(user)/onboarding');
    }).catch((e) => setAuthError(e.message ?? 'Authentication failed. Check your details.'));

  const backTo = (to: 'buttons' | 'phone', clearCode = false) => (
    <View style={{ paddingHorizontal: 16, marginBottom: 30 }}>
      <BackButton
        onPress={() => {
          setPhoneView(to);
          setAuthError(null);
          if (clearCode) setOtpCode('');
        }}
      />
    </View>
  );

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
          scroll={false}
          inactive={panel !== 0}
          footer={
            <>
              <Btn full onPress={goToAuth}>Get started</Btn>
              <TextBtn onPress={browse}>Look around first</TextBtn>
            </>
          }
        >
          <HeroMotion>
            <View style={{ paddingHorizontal: 22, paddingBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <Radar size={30} decorative />
                <Wordmark size={20} />
              </View>
              <Text style={{ ...fontUI(600), fontSize: 34, lineHeight: 38, letterSpacing: -1.02, color: T.text }}>Tonight, it's</Text>
              <HeroWord style={{ ...fontUI(600), fontSize: 34, lineHeight: 38, letterSpacing: -1.02 }} />
              <Text style={{ marginTop: 14, ...fontUI(400), fontSize: 17, lineHeight: 25, letterSpacing: -0.19, color: T.muted, maxWidth: 320 }}>
                Openings at Sydney venues, with the price already set.
              </Text>
            </View>
          </HeroMotion>
        </Panel>

        {/* sign in */}
        <Panel
          width={W}
          top={insets.top + 4}
          inactive={panel !== AUTH_PANEL}
          footer={
            <Text style={{ ...fontUI(400), fontSize: 13, lineHeight: 18, color: T.muted, textAlign: 'center' }}>
              By continuing you agree to the{' '}
              <Text accessibilityRole="link" onPress={() => router.push('/(user)/legal/terms')} style={{ color: T.text, textDecorationLine: 'underline' }}>
                Terms
              </Text>
              {' '}and{' '}
              <Text accessibilityRole="link" onPress={() => router.push('/(user)/legal/privacy')} style={{ color: T.text, textDecorationLine: 'underline' }}>
                Privacy Policy
              </Text>
              .
            </Text>
          }
        >
          {phoneView === 'buttons' && (
            <>
              {/* A way out: nothing in the feed needs an account until you book. */}
              <View style={{ minHeight: 70, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 12 }}>
                <TextBtn onPress={browse} color={T.accent} weight={500} style={{ paddingHorizontal: 8 }}>Not now</TextBtn>
              </View>
              <Lede title="Sign in." body={next ? 'Sign in to keep going. It takes one tap.' : "One tap and you're in."} />
              <View style={{ paddingHorizontal: 22, paddingTop: 34, gap: 11 }}>
                {/* expo-apple-authentication is iOS/tvOS only — no Apple Sign In on Android or web.
                    The system button follows Apple's branding rules and localises itself. */}
                {Platform.OS === 'ios' && (
                  <View pointerEvents={authLoading ? 'none' : 'auto'} style={{ opacity: authLoading ? 0.5 : 1 }}>
                    <AppleAuthentication.AppleAuthenticationButton
                      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                      buttonStyle={
                        T.dark
                          ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                          : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                      }
                      cornerRadius={26}
                      style={{ width: '100%', height: 52 }}
                      onPress={handleApple}
                    />
                  </View>
                )}
                <GoogleBtn onPress={handleGoogle} loading={authLoading} />
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 8 }}
                >
                  <View style={{ flex: 1, height: 1, backgroundColor: T.line }} />
                  <Text style={{ ...fontUI(400), fontSize: 13, color: T.muted }}>or</Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: T.line }} />
                </View>
                <Btn full variant="secondary" onPress={() => { setAuthError(null); setPhoneView('phone'); }} disabled={authLoading}>
                  <PhoneGlyph size={17} color={T.text} />
                  <Text style={{ ...fontUI(500), fontSize: 17, letterSpacing: -0.19, color: T.text }}>Continue with phone</Text>
                </Btn>
                <Btn full variant="secondary" onPress={() => { setAuthError(null); setEmailMode('signin'); setPhoneView('email'); }} disabled={authLoading}>
                  <MailGlyph size={17} color={T.text} />
                  <Text style={{ ...fontUI(500), fontSize: 17, letterSpacing: -0.19, color: T.text }}>Continue with email</Text>
                </Btn>
                {authError ? <ErrorText center>{authError}</ErrorText> : null}
              </View>
            </>
          )}

          {phoneView === 'phone' && (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
              {backTo('buttons')}
              <Lede title="What's your number?" body="We text a six-digit code to check it's you." />
              <View style={{ paddingHorizontal: 22, paddingTop: 30, gap: 14 }}>
                <Field
                  prefix="+"
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  placeholder="61 412 345 678"
                  accessibilityLabel="Phone number, with country code"
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  autoComplete="tel"
                  autoFocus
                />
                {authError ? <ErrorText>{authError}</ErrorText> : null}
                <Btn full onPress={handleSendOtp} disabled={phoneNumber.length < 8 || authLoading}>
                  {authLoading ? 'Sending…' : 'Send code'}
                </Btn>
              </View>
            </KeyboardAvoidingView>
          )}

          {phoneView === 'otp' && (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
              {backTo('phone', true)}
              <Lede title="Enter the code." body={`Sent to +${phoneNumber}. It can take a moment to arrive.`} />
              <View style={{ paddingHorizontal: 22, paddingTop: 30, gap: 16 }}>
                <CodeInput value={otpCode} onChange={setOtpCode} autoFocus />
                {authError ? <ErrorText center>{authError}</ErrorText> : null}
                <Btn full onPress={handleVerifyOtp} disabled={otpCode.length < 6 || authLoading}>
                  {authLoading ? 'Checking…' : 'Verify'}
                </Btn>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 24 }}>
                  <TextBtn size={15} onPress={handleSendOtp} disabled={authLoading}>Send a new code</TextBtn>
                  <TextBtn size={15} onPress={() => { setPhoneView('phone'); setOtpCode(''); setAuthError(null); }}>Change number</TextBtn>
                </View>
              </View>
            </KeyboardAvoidingView>
          )}

          {phoneView === 'email' && (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
              {backTo('buttons')}
              <Lede
                title={emailMode === 'signin' ? 'Sign in.' : 'Join Impulse.'}
                body={emailMode === 'signin' ? 'Enter your email and password.' : 'Pick an email and a password.'}
              />
              <View style={{ paddingHorizontal: 22, paddingTop: 30, gap: 12 }}>
                {emailMode === 'signup' && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                    <Field
                      containerStyle={{ flex: 1, minWidth: 140 }}
                      value={firstName}
                      onChangeText={setFirstName}
                      placeholder="First name"
                      textContentType="givenName"
                      autoComplete="given-name"
                      autoCapitalize="words"
                      autoCorrect={false}
                      autoFocus
                    />
                    <Field
                      containerStyle={{ flex: 1, minWidth: 140 }}
                      value={lastName}
                      onChangeText={setLastName}
                      placeholder="Last name"
                      textContentType="familyName"
                      autoComplete="family-name"
                      autoCapitalize="words"
                      autoCorrect={false}
                    />
                  </View>
                )}
                <Field
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  accessibilityLabel="Email"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  autoFocus={emailMode === 'signin'}
                />
                <Field
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  secureTextEntry
                  textContentType={emailMode === 'signin' ? 'password' : 'newPassword'}
                  autoCapitalize="none"
                  autoComplete={emailMode === 'signin' ? 'current-password' : 'new-password'}
                />
                {authError ? <ErrorText>{authError}</ErrorText> : null}
                <Btn full onPress={handleEmailAuth} disabled={!email || password.length < 6 || (emailMode === 'signup' && (!firstName.trim() || !lastName.trim())) || authLoading}>
                  {authLoading ? 'Please wait…' : emailMode === 'signin' ? 'Sign in' : 'Create account'}
                </Btn>
                <TextBtn size={15} onPress={() => { setEmailMode(emailMode === 'signin' ? 'signup' : 'signin'); setAuthError(null); }}>
                  {emailMode === 'signin' ? 'No account? Sign up' : 'Have an account? Sign in'}
                </TextBtn>
              </View>
            </KeyboardAvoidingView>
          )}
        </Panel>
      </ScrollView>
    </View>
  );
}
