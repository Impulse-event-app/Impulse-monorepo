// auth.ts — Impulse: Apple, Google, and Phone OTP auth helpers.
//
// Supabase dashboard prerequisites (one-time setup):
//   Apple  → Auth > Providers > Apple  → enable, add Service ID + key
//   Google → Auth > Providers > Google → enable, add client ID/secret
//            Auth > URL Configuration  → add "impulse://" to Redirect URLs
//   Phone  → Auth > Providers > Phone  → enable, configure Twilio / MessageBird
//
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

// ── Google OAuth (PKCE via system browser) ───────────────────
// Returns null if the user cancels the browser session.
export async function signInWithGoogle() {
  const redirectTo = makeRedirectUri({ scheme: 'impulse', path: 'auth/callback' });
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data.url) throw error ?? new Error('No OAuth URL returned.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return null; // user cancelled

  const { error: sessionError } = await supabase.auth.exchangeCodeForSession(result.url);
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
