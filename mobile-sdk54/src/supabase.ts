// supabase.ts — Impulse: Supabase client + connection helpers.
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import type { Database } from './database.types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (__DEV__ && (!supabaseUrl || !supabaseAnonKey)) {
  console.warn('[Impulse] Missing Supabase env vars — check your .env file.');
}

// SecureStore adapter — persists the auth session across app restarts.
const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: SecureStoreAdapter,
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
