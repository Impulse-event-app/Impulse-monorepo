import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CATEGORIES } from '../../src/data';
import { fontDisplay, fontMono, fontUI, useApp } from '../../src/theme';
import { Btn, Logo, PulseMark } from '../../src/components';
import { AppleLogo, GlyphBell, GlyphPin, GoogleLogo, MailGlyph, PhoneGlyph, Search } from '../../src/icons';
import { sendPhoneOtp, signInWithApple, signInWithGoogle, signInWithEmail, signUpWithEmail, syncUserProfile, verifyPhoneOtp } from '../../src/auth';

const { width: W } = Dimensions.get('window');
const SUBURBS = ['Sydney CBD', 'Surry Hills', 'Newtown', 'Bondi', 'Marrickville', 'Enmore', 'Darlinghurst', 'Redfern', 'Chippendale', 'Glebe', 'Paddington', 'Manly'];
const ACTIVITIES = CATEGORIES.filter((c) => c !== 'All');
const STEPS = 7;

function Panel({ children, footer, top = 0 }: { children: React.ReactNode; footer?: React.ReactNode; top?: number }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ width: W, flex: 1 }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: top }} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
      {footer && (
        <View style={{ paddingHorizontal: 22, paddingTop: 12, paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : 24, gap: 10 }}>{footer}</View>
      )}
    </View>
  );
}

function Lede({ kicker, title, body }: { kicker?: string; title: string; body?: string }) {
  const { T } = useApp();
  return (
    <View style={{ paddingHorizontal: 24 }}>
      {kicker && <Text style={{ fontFamily: fontMono(400), fontSize: 11.5, letterSpacing: 1.4, textTransform: 'uppercase', color: T.accent, marginBottom: 14 }}>{kicker}</Text>}
      <Text style={{ fontFamily: fontDisplay(700), fontSize: 32, lineHeight: 35, letterSpacing: -0.96, color: T.text }}>{title}</Text>
      {body && <Text style={{ marginTop: 14, fontFamily: fontUI(400), fontSize: 16.5, lineHeight: 25, color: T.muted, maxWidth: 330 }}>{body}</Text>}
    </View>
  );
}

function PermIcon({ children }: { children: React.ReactNode }) {
  const { T } = useApp();
  return (
    <View style={{ width: 116, height: 116, borderRadius: 30, backgroundColor: T.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 30 }}>
      {children}
    </View>
  );
}

function PulseRings() {
  const { T } = useApp();
  const vals = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const loops = vals.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 860),
          Animated.timing(v, { toValue: 1, duration: 2600, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
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

export default function Onboarding() {
  const { T, profile, setProfile } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const [suburb, setSuburb] = useState<string | null>(null);
  const [acts, setActs] = useState<string[]>([]);
  const [ageDeclined, setAgeDeclined] = useState(false);

  // Auth sub-flow (within the sign-in step)
  const [phoneView, setPhoneView] = useState<'buttons' | 'phone' | 'otp' | 'email'>('buttons');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailMode, setEmailMode] = useState<'signin' | 'signup'>('signin');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const goTo = (i: number) => {
    const p = Math.max(0, Math.min(STEPS - 1, i));
    scrollRef.current?.scrollTo({ x: p * W, animated: true });
    setPage(p);
  };
  const next = () => goTo(page + 1);

  const complete = () => {
    if (suburb || acts.length) {
      setProfile((p) => ({ ...p, suburb: suburb || p.suburb, acts: acts.length ? acts : p.acts }));
    }
    // Fire-and-forget profile sync to public.users
    syncUserProfile({ suburb: suburb ?? undefined, acts }).catch(console.warn);
    router.replace('/(user)/home');
  };

  // ── auth handlers ───────────────────────────────────────────
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
      if (user) next();
    }).catch((e) => setAuthError(e.message ?? 'Apple sign-in failed.'));

  const handleGoogle = () =>
    withAuth(async () => {
      const user = await signInWithGoogle();
      if (user) next();
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
      if (user) { setPhoneView('buttons'); setPhoneNumber(''); setOtpCode(''); next(); }
    }).catch((e) => setAuthError(e.message ?? 'Invalid code. Please try again.'));

  const handleEmailAuth = () =>
    withAuth(async () => {
      const user = emailMode === 'signin'
        ? await signInWithEmail(email, password)
        : await signUpWithEmail(email, password);
      if (user) { setPhoneView('buttons'); setEmail(''); setPassword(''); next(); }
    }).catch((e) => setAuthError(e.message ?? 'Authentication failed. Check your details.'));

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.round(e.nativeEvent.contentOffset.x / W));
  };

  const toggleAct = (a: string) => setActs((p) => (p.includes(a) ? p.filter((x) => x !== a) : [...p, a]));

  const skipLink = (label: string, onPress: () => void) => (
    <Pressable onPress={onPress} style={{ paddingVertical: 6, alignItems: 'center' }}>
      <Text style={{ fontFamily: fontUI(400), fontSize: 15, color: T.muted }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      {/* progress dots + skip */}
      <View style={{ position: 'absolute', top: insets.top + 6, left: 0, right: 0, zIndex: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[...Array(STEPS)].map((_, i) => (
            <Pressable key={i} onPress={() => goTo(i)} hitSlop={8}>
              <View style={{ width: i === page ? 22 : 7, height: 7, borderRadius: 4, backgroundColor: i === page ? T.accent : T.line2 }} />
            </Pressable>
          ))}
        </View>
        {page < STEPS - 1 ? (
          <Pressable onPress={complete}>
            <Text style={{ fontFamily: fontUI(500), fontSize: 14, color: T.faint }}>Skip</Text>
          </Pressable>
        ) : (
          <View style={{ width: 30 }} />
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={{ flex: 1 }}
      >
        {/* 0 — hero (minimal) */}
        <Panel
          top={insets.top + 8}
          footer={
            <>
              <Btn full onPress={next}>Get started</Btn>
              {skipLink('I already have an account', next)}
            </>
          }
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

        {/* 1 — sign in */}
        <Panel
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
                <SocialBtn kind="apple" onPress={handleApple} loading={authLoading} />
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
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={T.faint}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
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
                <Btn full onPress={handleEmailAuth} disabled={!email || password.length < 6 || authLoading}>
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

        {/* 2 — location */}
        <Panel
          footer={
            <>
              <Btn full onPress={next}>Allow location</Btn>
              {skipLink('Not now', next)}
            </>
          }
        >
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
            <PermIcon><GlyphPin color={T.accent} /></PermIcon>
            <Text style={{ fontFamily: fontMono(400), fontSize: 11.5, letterSpacing: 1.4, textTransform: 'uppercase', color: T.accent, marginBottom: 12 }}>Find your area</Text>
            <Text style={{ fontFamily: fontDisplay(700), fontSize: 30, lineHeight: 33, letterSpacing: -0.9, color: T.text }}>What's on near you</Text>
            <Text style={{ marginTop: 13, fontFamily: fontUI(400), fontSize: 16.5, lineHeight: 25, color: T.muted, maxWidth: 320 }}>
              Impulse uses your location to surface drops within a few suburbs — never in the background, only while you're looking.
            </Text>
          </View>
        </Panel>

        {/* 3 — notifications */}
        <Panel
          footer={
            <>
              <Btn full onPress={next}>Turn on notifications</Btn>
              {skipLink('Not now', next)}
            </>
          }
        >
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
            <PermIcon><GlyphBell color={T.accent} /></PermIcon>
            <Text style={{ fontFamily: fontMono(400), fontSize: 11.5, letterSpacing: 1.4, textTransform: 'uppercase', color: T.accent, marginBottom: 12 }}>Stay in the loop</Text>
            <Text style={{ fontFamily: fontDisplay(700), fontSize: 30, lineHeight: 33, letterSpacing: -0.9, color: T.text }}>Get the drop</Text>
            <Text style={{ marginTop: 13, fontFamily: fontUI(400), fontSize: 16.5, lineHeight: 25, color: T.muted, maxWidth: 320 }}>
              A nudge when something good opens up near you tonight. No daily blast, no noise — just the ones worth leaving the house for.
            </Text>
          </View>
        </Panel>

        {/* 4 — age */}
        <Panel
          footer={
            <>
              <Btn full onPress={next}>Yes, I'm 18 or over</Btn>
              {skipLink("I'm under 18", () => {
                setAgeDeclined(true);
                setTimeout(next, 650);
              })}
            </>
          }
        >
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
            <PermIcon>
              <Text style={{ fontFamily: fontDisplay(700), fontSize: 46, letterSpacing: -1.8, color: T.accent }}>
                18<Text style={{ fontSize: 28 }}>+</Text>
              </Text>
            </PermIcon>
            <Text style={{ fontFamily: fontMono(400), fontSize: 11.5, letterSpacing: 1.4, textTransform: 'uppercase', color: T.accent, marginBottom: 12 }}>Quick one</Text>
            <Text style={{ fontFamily: fontDisplay(700), fontSize: 30, lineHeight: 33, letterSpacing: -0.9, color: T.text }}>Are you 18 or over?</Text>
            <Text style={{ marginTop: 13, fontFamily: fontUI(400), fontSize: 16.5, lineHeight: 25, color: T.muted, maxWidth: 320 }}>
              Some venues serve alcohol, so we check once. We'll still show you the all-ages stuff either way.
            </Text>
            {ageDeclined && (
              <View style={{ marginTop: 18, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: T.accentSoft, borderRadius: 12, maxWidth: 320 }}>
                <Text style={{ fontFamily: fontUI(400), fontSize: 14, color: T.text }}>No worries — we'll hide 18+ venues and show you everything else.</Text>
              </View>
            )}
          </View>
        </Panel>

        {/* 5 — suburb */}
        <Panel
          top={insets.top + 24}
          footer={<Btn full onPress={next} disabled={!suburb}>{suburb ? `Set to ${suburb}` : 'Pick your suburb'}</Btn>}
        >
          <Lede kicker="Home base" title="Where do you call home?" body="We'll sort drops by what's closest. Change it any time." />
          <View style={{ paddingHorizontal: 22, paddingTop: 20 }}>
            <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: T.surface, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 12, marginBottom: 16 }, T.shadow]}>
              <Search size={17} color={T.muted} />
              <Text style={{ fontFamily: fontUI(400), fontSize: 15, color: T.faint }}>Search Sydney suburbs</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
              {SUBURBS.map((s) => {
                const on = suburb === s;
                return (
                  <Pressable key={s} onPress={() => setSuburb(s)} style={{ height: 36, paddingHorizontal: 16, borderRadius: 999, backgroundColor: on ? T.chipOn : T.chipBg, justifyContent: 'center' }}>
                    <Text style={{ fontFamily: fontUI(500), fontSize: 14.5, color: on ? T.chipOnInk : T.chipText }}>{s}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Panel>

        {/* 6 — activities */}
        <Panel
          top={insets.top + 24}
          footer={
            <>
              <Btn full onPress={complete} disabled={acts.length === 0}>{acts.length === 0 ? 'Pick a few' : `Done — ${acts.length} picked`}</Btn>
              {skipLink('Skip — show me everything', complete)}
            </>
          }
        >
          <Lede kicker="Last bit" title="What are you into?" body="We'll bump these to the top. You can change it later." />
          <View style={{ paddingHorizontal: 22, paddingTop: 22, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {ACTIVITIES.map((a) => {
              const on = acts.includes(a);
              return (
                <Pressable
                  key={a}
                  onPress={() => toggleAct(a)}
                  style={{ paddingHorizontal: 16, paddingVertical: 11, borderRadius: 14, backgroundColor: on ? T.accent : T.chipBg, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                >
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: on ? T.accentInk : T.faint }} />
                  <Text style={{ fontFamily: fontUI(500), fontSize: 15.5, letterSpacing: -0.16, color: on ? T.accentInk : T.text }}>{a}</Text>
                </Pressable>
              );
            })}
          </View>
        </Panel>
      </ScrollView>
    </View>
  );
}
