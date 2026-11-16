"""Find friends from the address book without anyone's contacts reaching us.

The app normalises each phone number and email in the user's contacts, hashes
them on the device (SHA-256, hex) and sends only the hashes to
POST /users/match-contacts. We compare them with the hashes stored on each
user, return the matches, and keep nothing that was sent.

Only identifiers someone has proved they own are matchable, so nobody can show
up in a friend's contacts as somebody else:
  - phone: the `phone` claim of the Supabase JWT. Supabase only sets it once
    the number is verified by SMS code (sign-in, or a verified phone change).
  - email: only when a Google or Apple identity vouches for it. Email/password
    sign-ups aren't trusted, because without "Confirm email" anyone can type
    anyone's address. Apple relay addresses are skipped; nobody has them saved.

The normalisation here must match mobile-sdk54/src/contacts.ts exactly.

A SHA-256 of a phone number can be reversed by brute force (there aren't many
phone numbers), so the hashes are not the protection on their own: the rate
limit below is, together with returning only an id and a display name.
"""
import hashlib
import re
import threading
import time
from collections import defaultdict, deque
from typing import Optional

TRUSTED_EMAIL_PROVIDERS = {"google", "apple"}
APPLE_RELAY = re.compile(r"@privaterelay\.appleid\.com$", re.IGNORECASE)
HASH_RE = re.compile(r"^[0-9a-f]{64}$")

MAX_HASHES_PER_REQUEST = 2000
# Hashes one user may check per rolling day. A big address book is a few
# thousand identifiers; enumerating phone numbers would take millions.
DAILY_HASH_BUDGET = 6000
WINDOW_SECONDS = 24 * 60 * 60


def normalize_phone(raw: Optional[str]) -> Optional[str]:
    """E.164 digits without the '+', e.g. '61412345678'. Australian local
    formats ('0412 345 678', '412 345 678') get the 61 prefix. Returns None
    for anything that can't be a full number."""
    if not raw:
        return None
    s = raw.strip()
    plus = s.startswith("+")
    digits = re.sub(r"\D", "", s)
    if not digits:
        return None
    if plus:
        pass
    elif digits.startswith("0011"):            # AU international dialling prefix
        digits = digits[4:]
    elif digits.startswith("0") and len(digits) == 10:
        digits = "61" + digits[1:]
    elif len(digits) == 9 and digits[0] in "2345789":
        digits = "61" + digits
    if not 8 <= len(digits) <= 15:
        return None
    return digits


def normalize_email(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    e = raw.strip().lower()
    if "@" not in e or APPLE_RELAY.search(e):
        return None
    return e


def hash_identifier(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def verified_identity(claims: dict) -> tuple[Optional[str], Optional[str]]:
    """(phone, email) this user has proved they own, from their verified JWT."""
    phone = normalize_phone("+" + claims["phone"]) if claims.get("phone") else None
    app_meta = claims.get("app_metadata") or {}
    providers = set(app_meta.get("providers") or [])
    if app_meta.get("provider"):
        providers.add(app_meta["provider"])
    email = normalize_email(claims.get("email")) if providers & TRUSTED_EMAIL_PROVIDERS else None
    return phone, email


def clean_hashes(hashes: list[str]) -> list[str]:
    """Lower-cased, de-duplicated, well-formed hashes only."""
    seen: dict[str, None] = {}
    for h in hashes:
        h = (h or "").strip().lower()
        if HASH_RE.match(h):
            seen[h] = None
    return list(seen)


class HashBudget:
    """Per-user rolling 24h budget of hashes checked. In memory, so it's per
    process and resets on deploy. That's enough to make enumerating phone
    numbers impractical (millions of guesses) without new infrastructure."""

    def __init__(self, limit: int = DAILY_HASH_BUDGET, window: int = WINDOW_SECONDS):
        self.limit = limit
        self.window = window
        self._used: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def take(self, user_id: str, n: int, now: Optional[float] = None) -> bool:
        now = time.time() if now is None else now
        with self._lock:
            q = self._used[user_id]
            while q and q[0][0] <= now - self.window:
                q.popleft()
            if sum(c for _, c in q) + n > self.limit:
                return False
            q.append((now, n))
            return True


budget = HashBudget()
