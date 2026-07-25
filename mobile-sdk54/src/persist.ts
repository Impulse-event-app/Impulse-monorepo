// persist.ts — tiny cross-platform key/value storage for small, non-critical
// UI state that should survive reloads/restarts (e.g. the active huddle).
// Native → the OS keychain via SecureStore; Web → localStorage (SecureStore is
// native-only and throws on web). All calls are best-effort and never throw.
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export async function persistGet(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    }
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function persistSet(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  } catch {
    // best effort
  }
}

export async function persistDel(key: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  } catch {
    // best effort
  }
}
