"""Contact matching: normalisation (must agree with mobile-sdk54/src/contacts.ts),
which identities count as verified, hash hygiene and the daily budget."""
import hashlib

import contact_match as cm


def test_australian_formats_normalise_to_the_same_number():
    want = "61412345678"
    for raw in ("0412 345 678", "+61 412 345 678", "(04) 1234-5678", "412345678", "0011 61 412 345 678", "+61412345678"):
        assert cm.normalize_phone(raw) == want, raw


def test_foreign_numbers_keep_their_country_code():
    assert cm.normalize_phone("+1 (415) 555-0132") == "14155550132"
    assert cm.normalize_phone("+44 20 7946 0958") == "442079460958"


def test_junk_is_not_a_phone_number():
    for raw in (None, "", "abc", "000", "+1 23"):
        assert cm.normalize_phone(raw) is None, raw


def test_emails_lowercase_and_relay_addresses_are_skipped():
    assert cm.normalize_email("  Sam@Example.COM ") == "sam@example.com"
    assert cm.normalize_email("abc123@privaterelay.appleid.com") is None
    assert cm.normalize_email("not-an-email") is None


def test_hash_is_plain_sha256_hex():
    assert cm.hash_identifier("61412345678") == hashlib.sha256(b"61412345678").hexdigest()


def test_jwt_phone_is_trusted_because_supabase_only_sets_it_once_verified():
    phone, email = cm.verified_identity({"phone": "61412345678", "email": "sam@example.com",
                                         "app_metadata": {"provider": "phone", "providers": ["phone"]}})
    assert phone == "61412345678"
    assert email is None


def test_email_is_trusted_only_from_google_or_apple():
    assert cm.verified_identity({"email": "sam@example.com", "app_metadata": {"providers": ["email"]}}) == (None, None)
    assert cm.verified_identity({"email": "Sam@Gmail.com", "app_metadata": {"providers": ["google"]}}) == (None, "sam@gmail.com")
    assert cm.verified_identity({"email": "x@privaterelay.appleid.com", "app_metadata": {"provider": "apple"}}) == (None, None)


def test_no_phone_claim_means_not_findable_by_phone():
    assert cm.verified_identity({"phone": "", "app_metadata": {}}) == (None, None)


def test_clean_hashes_drops_malformed_and_duplicates():
    h = "a" * 64
    assert cm.clean_hashes([h, h.upper(), "nope", "b" * 63, ""]) == [h]


def test_budget_blocks_after_the_daily_limit_and_recovers():
    b = cm.HashBudget(limit=100, window=60)
    assert b.take("u", 60, now=0)
    assert not b.take("u", 41, now=1)
    assert b.take("someone-else", 100, now=1)
    assert b.take("u", 41, now=61)
