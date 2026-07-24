// supabase.ts — Impulse: Supabase client + connection helpers.
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { Database } from './database.types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (__DEV__ && (!supabaseUrl || !supabaseAnonKey)) {
  console.warn('[Impulse] Missing Supabase env vars — check your .env file.');
}

// Session storage adapter.
//   Native → the OS keychain/keystore via SecureStore, so the session survives
//            app restarts securely.
//   Web    → SecureStore is native-only (its methods throw on web), so we let
//            supabase-js use its browser default (localStorage). Passing
//            `undefined` selects that default.
const authStorage =
  Platform.OS === 'web'
    ? undefined
    : {
        getItem: (key: string) => SecureStore.getItemAsync(key),
        setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
        removeItem: (key: string) => SecureStore.deleteItemAsync(key),
      };

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * Lightweight connection probe.
 * Calls auth.getSession() which hits the Supabase Auth server.
 * Returns true if the project is reachable (even with no active session).
 */
export async function pingSupabase(): Promise<boolean> {
  try {
    const { error } = await supabase.auth.getSession();
    return error === null;
  } catch {
    return false;
  }
}
