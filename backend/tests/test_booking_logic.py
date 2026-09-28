from datetime import datetime, timedelta, timezone

import pytest

from booking_logic import (
    SplitError, apply_cover, compute_shares, deal_cutoff, deposit_split, parse_slot_datetime,
    recalc_unpaid, resolve_borda, slot_at, validate_custom,
)

T = datetime(2026, 7, 25, 12, 0)
CUTS = {"a": T + timedelta(hours=3), "b": T + timedelta(hours=2), "c": T + timedelta(hours=1)}


# ── Borda ─────────────────────────────────────────────────────────────────────

def test_clear_winner():
    # a: 3+3=6, b: 2+2=4, c: 1+1=2
    assert resolve_borda([["a", "b", "c"], ["a", "b", "c"]], CUTS) == "a"


def test_points_beat_first_places():
    # y: 2 firsts, 6 pts · z: 2 firsts, 6 pts · x: 1 first, 3+2+2 = 7 pts
    # → x wins on points despite fewer first-place votes
    ballots = [["y"], ["y"], ["x"], ["z", "x"], ["z", "x"]]
    cuts = {"x": T + timedelta(hours=1), "y": T + timedelta(hours=2), "z": T + timedelta(hours=3)}
    assert resolve_borda(ballots, cuts) == "x"


def test_tie_broken_by_first_place_votes():
    # a: 3+1=4 (one first) · b: 2+2=4 (no firsts) · c: 1 · d: 3
    # → a and b tie on points, a wins on first-place votes
    ballots = [["a", "b", "c"], ["d", "b", "a"]]
    cuts = {**CUTS, "d": T + timedelta(hours=4)}
    assert resolve_borda(ballots, cuts) == "a"


def test_tie_broken_by_soonest_expiry():
    # Mirrored ballots: a and c tie on points AND firsts; c expires sooner → c
    ballots = [["a", "b", "c"], ["c", "b", "a"]]
    cuts = {"a": T + timedelta(hours=5), "b": T + timedelta(hours=4), "c": T + timedelta(hours=1)}
    assert resolve_borda(ballots, cuts) == "c"


def test_none_expiry_sorts_last_in_tiebreak():
    ballots = [["a", "b"], ["b", "a"]]
    cuts = {"a": None, "b": T}
    assert resolve_borda(ballots, cuts) == "b"


def test_final_tiebreak_deterministic_by_id():
    ballots = [["a", "b"], ["b", "a"]]
    cuts = {"a": T, "b": T}
    assert resolve_borda(ballots, cuts) == "a"


def test_partial_ballots():
    # Single-pick ballots still count as firsts
    assert resolve_borda([["b"], ["b", "a"]], CUTS) == "b"


def test_ineligible_picks_ignored():
    # 'z' isn't a candidate; ranks shift up so 'a' takes the 3 points
    assert resolve_borda([["z", "a"]], CUTS) == "a"


def test_no_eligible_picks():
    assert resolve_borda([["z"], []], CUTS) is None
    assert resolve_borda([], CUTS) is None


# ── Share math ────────────────────────────────────────────────────────────────

def test_shares_sum_to_total():
    for total in (10000, 9999, 101, 5000, 12345):
        for n in (2, 3, 4, 7, 10):
            shares = compute_shares(total, n)
            assert sum(s["total_cents"] for s in shares) == total
            for s in shares:
                assert s["deposit_cents"] + s["balance_cents"] == s["total_cents"]


def test_creator_gets_remainder():
    shares = compute_shares(10001, 3)   # base 3333, remainder 2
    assert shares[0]["total_cents"] == 3335
    assert shares[1]["total_cents"] == shares[2]["total_cents"] == 3333


def test_deposit_formula():
    shares = compute_shares(10000, 2)   # 5000 each → 20% = 1000
    assert all(s["deposit_cents"] == 1000 for s in shares)


def test_deposit_floor():
    shares = compute_shares(800, 2)     # 400 each → 20% = 80 → floored to 100
    assert all(s["deposit_cents"] == 100 for s in shares)
    assert all(s["balance_cents"] == 300 for s in shares)


def test_deposit_clamped_to_tiny_share():
    shares = compute_shares(120, 2)     # 60 each → floor 100 clamps to 60
    assert all(s["deposit_cents"] == 60 and s["balance_cents"] == 0 for s in shares)


def test_even_split_sums_exactly_across_prices_and_sizes():
    for total in list(range(0, 2000, 7)) + [9999, 10001, 12345, 49999, 50000]:
        for n in range(1, 11):
            shares = compute_shares(total, n)
            assert sum(s["total_cents"] for s in shares) == total
            # Remainder lands on the initiator (index 0) and nowhere else.
            assert all(s["total_cents"] == total // n for s in shares[1:])
            assert shares[0]["total_cents"] == total // n + total % n


def test_deposit_split_is_the_share_rule():
    assert deposit_split(5000) == (1000, 4000)
    assert deposit_split(400) == (100, 300)
    assert deposit_split(60) == (60, 0)
    assert deposit_split(0) == (0, 0)


# ── Custom split ──────────────────────────────────────────────────────────────

def test_custom_split_accepts_exact_total():
    validate_custom([1850, 1850, 1300], 5000)


def test_custom_split_rejects_short():
    with pytest.raises(SplitError) as e:
        validate_custom([1850, 1850, 1000], 5000)
    assert "$47.00" in str(e.value) and "$50.00" in str(e.value) and "$3.00 still to assign" in str(e.value)


def test_custom_split_rejects_over():
    with pytest.raises(SplitError) as e:
        validate_custom([2000, 2000, 2000], 5000)
    assert "$10.00 too much" in str(e.value)


def test_custom_split_rejects_negative():
    with pytest.raises(SplitError):
        validate_custom([6000, -1000], 5000)


def test_custom_split_allows_zero_shares():
    validate_custom([5000, 0, 0], 5000)


# ── Cover someone ─────────────────────────────────────────────────────────────

def test_cover_moves_share_and_settles_covered():
    shares, covers = apply_cover({"a": 1700, "b": 1650, "c": 1650}, {}, set(), "a", "c")
    assert shares == {"a": 3350, "b": 1650, "c": 0}
    assert covers == {"c": "a"}
    assert sum(shares.values()) == 5000


def test_cover_rejects_paid_covered_seat():
    with pytest.raises(SplitError):
        apply_cover({"a": 1700, "b": 1650}, {}, {"b"}, "a", "b")


def test_cover_rejects_paid_coverer():
    with pytest.raises(SplitError):
        apply_cover({"a": 1700, "b": 1650}, {}, {"a"}, "a", "b")


def test_cover_rejects_double_cover_and_self():
    with pytest.raises(SplitError):
        apply_cover({"a": 1, "b": 1, "c": 1}, {"c": "b"}, set(), "a", "c")
    with pytest.raises(SplitError):
        apply_cover({"a": 1, "b": 1}, {}, set(), "a", "a")


# ── Recalculation ─────────────────────────────────────────────────────────────

def test_recalc_never_touches_paid_seats():
    order = ["ini", "b", "c", "d"]
    shares = {"ini": 2503, "b": 2500, "c": 2500, "d": 2500}
    new = recalc_unpaid(order, shares, {}, {"ini", "c"}, 7500)   # group shrank by one 2500 seat
    assert new["ini"] == 2503 and new["c"] == 2500
    assert new["b"] + new["d"] == 7500 - 2503 - 2500
    assert sum(new.values()) == 7500


def test_recalc_remainder_goes_to_initiator_when_unpaid():
    new = recalc_unpaid(["ini", "b", "c"], {"ini": 0, "b": 0, "c": 0}, {}, set(), 10001)
    assert new == {"ini": 3335, "b": 3333, "c": 3333}


def test_recalc_remainder_goes_to_first_unpaid_when_initiator_paid():
    new = recalc_unpaid(["ini", "b", "c"], {"ini": 3335, "b": 0, "c": 0}, {}, {"ini"}, 10001)
    assert new == {"ini": 3335, "b": 3333, "c": 3333}
    new = recalc_unpaid(["ini", "b", "c"], {"ini": 3000, "b": 0, "c": 0}, {}, {"ini"}, 10001)
    assert new == {"ini": 3000, "b": 3501, "c": 3500}


def test_recalc_folds_covered_seat_into_unpaid_coverer():
    new = recalc_unpaid(["ini", "b", "c"], {"ini": 3000, "b": 0, "c": 0}, {"c": "b"}, {"ini"}, 9000)
    assert new == {"ini": 3000, "b": 6000, "c": 0}


def test_recalc_keeps_cover_by_paid_coverer_at_zero():
    new = recalc_unpaid(["ini", "b", "c"], {"ini": 6000, "b": 3000, "c": 0}, {"c": "ini"}, {"ini"}, 9000)
    assert new == {"ini": 6000, "b": 3000, "c": 0}


def test_recalc_rejects_when_paid_exceeds_new_total():
    with pytest.raises(SplitError) as e:
        recalc_unpaid(["ini", "b"], {"ini": 6000, "b": 1000}, {}, {"ini"}, 5000)
    assert "refunding" in str(e.value)


def test_recalc_rejects_change_when_everyone_paid():
    with pytest.raises(SplitError):
        recalc_unpaid(["ini", "b"], {"ini": 2500, "b": 2500}, {}, {"ini", "b"}, 4000)


# ── Cutoff parsing ────────────────────────────────────────────────────────────

def test_parse_slot_datetime():
    assert parse_slot_datetime("Friday 25 July 2026", "5:00 PM") == datetime(2026, 7, 25, 17, 0)
    assert parse_slot_datetime("garbage", "5:00 PM") is None


def test_slot_is_read_in_sydney_time():
    # 7:00 PM on 3 Oct 2026 in Sydney is AEST (+10), before daylight saving starts.
    assert slot_at("Saturday 3 October 2026", "7:00 PM") == datetime(2026, 10, 3, 9, 0, tzinfo=timezone.utc)
    # After the switch to AEDT (+11) on 4 Oct 2026.
    assert slot_at("Saturday 10 October 2026", "7:00 PM") == datetime(2026, 10, 10, 8, 0, tzinfo=timezone.utc)


def test_deal_cutoff_last_slot_minus_1h():
    # Last slot 8:00 PM Sydney (AEST) → cutoff 7:00 PM Sydney = 09:00 UTC.
    cutoff = deal_cutoff(None, "Friday 25 July 2026", ["5:00 PM", "8:00 PM"])
    assert cutoff == datetime(2026, 7, 25, 9, 0, tzinfo=timezone.utc)


def test_deal_cutoff_expiry_wins_when_sooner():
    expiry = datetime(2026, 7, 25, 4, 0, tzinfo=timezone.utc)
    assert deal_cutoff(expiry, "Friday 25 July 2026", ["8:00 PM"]) == expiry


def test_deal_cutoff_naive_expiry_is_utc():
    assert deal_cutoff(datetime(2026, 7, 25, 4, 0), "Friday 25 July 2026", ["8:00 PM"]) == \
        datetime(2026, 7, 25, 4, 0, tzinfo=timezone.utc)


def test_deal_cutoff_unknown():
    assert deal_cutoff(None, "sometime", ["whenever"]) is None
