from datetime import datetime, timedelta

from huddle_logic import compute_shares, deal_cutoff, parse_slot_datetime, resolve_borda

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


# ── Cutoff parsing ────────────────────────────────────────────────────────────

def test_parse_slot_datetime():
    assert parse_slot_datetime("Friday 25 July 2026", "5:00 PM") == datetime(2026, 7, 25, 17, 0)
    assert parse_slot_datetime("garbage", "5:00 PM") is None


def test_deal_cutoff_last_slot_minus_1h():
    cutoff = deal_cutoff(None, "Friday 25 July 2026", ["5:00 PM", "8:00 PM"])
    assert cutoff == datetime(2026, 7, 25, 19, 0)


def test_deal_cutoff_expiry_wins_when_sooner():
    expiry = datetime(2026, 7, 25, 14, 0)
    assert deal_cutoff(expiry, "Friday 25 July 2026", ["8:00 PM"]) == expiry


def test_deal_cutoff_unknown():
    assert deal_cutoff(None, "sometime", ["whenever"]) is None
