// contacts.ts — find friends on Impulse from the phone's address book.
//
// Privacy (App Store 5.1.2): contacts never leave the device in the clear.
// Each phone number and email is normalised and SHA-256 hashed here, only the
// hashes are sent (POST /users/match-contacts), and the server stores none of
// them. Matches come back as { id, display_name, hash }, and we show each one
// under the name saved in this phone.
//
// Normalisation must match backend/contact_match.py exactly.
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { matchContacts } from './api';

export type ContactFriend = {
  id: string;            // Impulse user id
  name: string;          // as saved in this phone's contacts
  displayName: string;   // their Impulse name
};

/** E.164 digits without the '+', e.g. '61412345678'. Australian local
 *  formats get the 61 prefix. null when it can't be a full number. */
export function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  const plus = s.startsWith('+');
  let digits = s.replace(/\D/g, '');
  if (!digits) return null;
  if (plus) {
    // already international
  } else if (digits.startsWith('0011')) {
    digits = digits.slice(4);               // AU international dialling prefix
  } else if (digits.startsWith('0') && digits.length === 10) {
    digits = '61' + digits.slice(1);
  } else if (digits.length === 9 && '2345789'.includes(digits[0])) {
    digits = '61' + digits;
  }
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

export function normalizeEmail(raw?: string | null): string | null {
  if (!raw) return null;
  const e = raw.trim().toLowerCase();
  if (!e.includes('@') || /@privaterelay\.appleid\.com$/.test(e)) return null;
  return e;
}

const sha256 = (v: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, v);

const BATCH = 2000;   // the server's per-request cap

export type ContactsResult =
  | { status: 'ok'; friends: ContactFriend[]; limited: boolean }
  | { status: 'denied' | 'unavailable' };

/**
 * Ask for contacts access (only ever call this from a user tap, with the
 * reason on screen), then return the contacts who are on Impulse.
 */
export async function findFriendsInContacts(): Promise<ContactsResult> {
  if (Platform.OS === 'web') return { status: 'unavailable' };
  const Contacts = await import('expo-contacts');
  const perm = await Contacts.requestPermissionsAsync();
  if (!perm.granted) return { status: 'denied' };

  const rows = await Contacts.Contact.getAllDetails([
    Contacts.ContactField.FULL_NAME,
    Contacts.ContactField.PHONES,
    Contacts.ContactField.EMAILS,
  ] as const);

  // hash → the contact's name in this phone (first one wins).
  const nameByHash = new Map<string, string>();
  for (const c of rows) {
    const name = (c.fullName ?? '').trim();
    if (!name) continue;
    const ids = [
      ...(c.phones ?? []).map((p) => normalizePhone(p.number)),
      ...(c.emails ?? []).map((e) => normalizeEmail(e.address)),
    ].filter((v): v is string => !!v);
    for (const id of ids) {
      const h = await sha256(id);
      if (!nameByHash.has(h)) nameByHash.set(h, name);
    }
  }

  const hashes = [...nameByHash.keys()];
  const byUser = new Map<string, ContactFriend>();
  for (let i = 0; i < hashes.length; i += BATCH) {
    const hits = await matchContacts(hashes.slice(i, i + BATCH));
    for (const m of hits) {
      if (byUser.has(m.id)) continue;
      byUser.set(m.id, { id: m.id, name: nameByHash.get(m.hash) ?? m.display_name, displayName: m.display_name });
    }
  }
  const friends = [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { status: 'ok', friends, limited: perm.accessPrivileges === 'limited' };
}
