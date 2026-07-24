// auth.ts — Impulse: Apple, Google, and Phone OTP auth helpers.
//
// Supabase dashboard prerequisites (one-time setup):
//   Apple  → Auth > Providers > Apple  → enable, add Service ID + key
//   Google → Auth > Providers > Google → enable, add client ID/secret
//            Auth > URL Configuration  → add "impulse://" AND the deployed web
//            origin(s) to Redirect URLs, e.g. "https://impulse--*.expo.app/**"
//            (covers every EAS Hosting preview) and "https://impulse.expo.app/**"
//            (production), plus "http://localhost:8081/**" for local web dev.
//   Phone  → Auth > Providers > Phone  → enable, configure Twilio / MessageBird
//
import { Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { ApiError, UserProfileUpdate, getMe, patchMe } from './api';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';

// Required for expo-web-browser OAuth on iOS to close the in-app browser cleanly.
WebBrowser.maybeCompleteAuthSession();

// ── Apple Sign In ────────────────────────────────────────────
// Works on iOS 13+ (device and simulator). Throws ERR_REQUEST_CANCELED
// if the user dismisses the sheet — callers should catch and ignore that.
export async function signInWithApple() {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  if (!credential.identityToken) throw new Error('Apple did not return an identity token.');
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;
  return data.user;
}

// ── Google OAuth (PKCE) ───────────────────────────────────────
// Native: opens a system browser session tied to the "impulse://" deep link.
// Web: a custom URL scheme can't redirect back into a browser tab, so instead
// we do a normal full-page redirect back to wherever this build is hosted
// (window.location.origin — works for the EAS Hosting preview URL, production
// URL, or localhost during `expo start --web` without hardcoding any of them).
// The app/index.tsx root route completes the sign-in by exchanging the "code"
// query param that Supabase appends on that redirect.
// Returns null if the user cancels the browser session (native only — on web
// the page navigates away, so there's nothing left to return here).
export async function signInWithGoogle() {
  if (Platform.OS === 'web') {
    // Trailing slash so the redirect reliably matches a Supabase allowlist entry
    // like "https://impulse--*.expo.app/**". IMPORTANT: this URL must be in the
    // Supabase dashboard's Auth → URL Configuration → Redirect URLs allowlist,
    // otherwise Supabase ignores it and falls back to the project Site URL —
    // which would land the user on whichever other app owns that Site URL.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) throw error;
    return null;
  }

  const redirectTo = makeRedirectUri({ scheme: 'impulse', path: 'auth/callback' });
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data.url) throw error ?? new Error('No OAuth URL returned.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return null; // user cancelled

  // exchangeCodeForSession takes the raw PKCE code, not the whole redirect URL.
  const code = new URL(result.url).searchParams.get('code');
  if (!code) throw new Error('No authorization code found in the redirect.');
  const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
  if (sessionError) throw sessionError;

  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// ── Email / Password ───────────────────────────────────────
export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signUpWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data.user;
}

// ── Phone OTP: send code ─────────────────────────────────────
// phone must be in E.164 format, e.g. "+61412345678"
export async function sendPhoneOtp(phone: string) {
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) throw error;
}

// ── Phone OTP: verify 6-digit code ──────────────────────────
export async function verifyPhoneOtp(phone: string, token: string) {
  const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
  if (error) throw error;
  return data.user;
}

// ── Onboarding status ────────────────────────────────────────
// We record "has finished onboarding" as a flag on the Supabase user's
// metadata rather than only in the backend profile. Metadata rides along on
// the session object, so routing decisions on app launch (see app/index.tsx)
// can read it synchronously — no backend round-trip that would stall the
// splash screen while a cold-started API server wakes up.

/** True once the user has completed onboarding at least once. */
export function isOnboarded(session: Session | null): boolean {
  return session?.user?.user_metadata?.onboarded === true;
}

/** Persist the "onboarded" flag on the current user. Best-effort. */
export async function markOnboarded() {
  await supabase.auth.updateUser({ data: { onboarded: true } }).catch(() => {/* best effort */});
}

// ── Sign out ─────────────────────────────────────────────────
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// ── Fetch profile from the backend API ───────────────────────
// Returns the UserProfile from /users/me, or null if not found / not authed.
export async function fetchUserProfile() {
  try {
    return await getMe();
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

// ── Sync profile to backend API ──────────────────────────────
// Upserts the current user's profile data via PATCH /users/me.
// On first sign-in the backend row may not exist yet (created by a Supabase
// trigger on auth.users). If we get a 404, we fall back to a direct Supabase
// upsert to create the row, then retry the PATCH.
export async function syncUserProfile(updates: {
  suburb?: string;
  acts?: string[];
  party_size?: number;
  full_name?: string;
} = {}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const apiUpdates: UserProfileUpdate = {
    ...(updates.full_name !== undefined ? { full_name: updates.full_name } : {}),
    ...(updates.suburb !== undefined ? { home_suburb: updates.suburb } : {}),
    ...(updates.acts !== undefined ? { preferred_acts: updates.acts } : {}),
    ...(updates.party_size !== undefined ? { party_size: updates.party_size } : {}),
  };

  try {
    await patchMe(apiUpdates);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      // Profile row doesn't exist yet — create it via direct Supabase upsert,
      // then retry the PATCH.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('users') as any).upsert({
        id: user.id,
        email: user.email ?? null,
        phone: user.phone ?? null,
        full_name: updates.full_name ?? null,
        home_suburb: updates.suburb ?? null,
        preferred_acts: updates.acts ?? null,
        party_size: updates.party_size ?? null,
        updated_at: new Date().toISOString(),
      });
      // Now the row exists — apply any extra fields via the API
      if (Object.keys(apiUpdates).length > 0) {
        await patchMe(apiUpdates).catch(() => {/* best effort */});
      }
    } else {
      throw err;
    }
  }
}
