"""Falling discounts: the pure step maths (price_drops.py)."""
from types import SimpleNamespace

import pytest

from price_drops import check_drops, discount_after, left_at_price, slot_prices

DROPS = [{"after": 5, "discount_pct": 25}, {"after": 10, "discount_pct": 15}]


@pytest.mark.parametrize("used,pct,left", [(0, 35, 5), (4, 35, 1), (5, 25, 5), (9, 25, 1), (10, 15, None), (50, 15, None)])
def test_discount_steps_down_after_each_count(used, pct, left):
    assert discount_after(35, DROPS, used) == pct
    assert left_at_price(DROPS, used) == left


def test_a_flat_deal_never_changes():
    assert discount_after(35, None, 100) == 35 and left_at_price(None, 0) is None


@pytest.mark.parametrize("bad", [
    [{"after": 5, "discount_pct": 35}],                                       # not less off
    [{"after": 5, "discount_pct": 25}, {"after": 5, "discount_pct": 15}],      # same count
    [{"after": 5, "discount_pct": 25}, {"after": 8, "discount_pct": 30}],      # goes back up
    [{"after": i + 1, "discount_pct": 30 - i} for i in range(6)],             # too many
])
def test_nonsense_steps_are_refused(bad):
    with pytest.raises(ValueError):
        check_drops(35, bad)


def test_empty_steps_mean_a_flat_deal():
    assert check_drops(35, []) is None and check_drops(35, None) is None


def test_slot_prices_count_each_slot_alone():
    deal = SimpleNamespace(id="d", slots=["6:00 PM", "8:00 PM"], original_price=40, discount_pct=35,
                           deal_price=26, price_drops=DROPS)
    p = slot_prices(deal, {("d", "8:00 PM"): 6})
    assert p[0] == {"slot": "6:00 PM", "discount_pct": 35, "deal_price": 26.0, "left_at_price": 5}
    assert p[1] == {"slot": "8:00 PM", "discount_pct": 25, "deal_price": 30.0, "left_at_price": 4}


def test_steps_have_to_start_inside_the_deals_spots():
    # 20 spots: First 5, Next 5, Next 5, then the last 5 fit…
    drops = [{"after": 5, "discount_pct": 40}, {"after": 10, "discount_pct": 30}, {"after": 15, "discount_pct": 20}]
    assert check_drops(50, drops, total_spots=20) == drops
    # …a step starting at the 21st booking never would.
    with pytest.raises(ValueError, match="20 spots"):
        check_drops(50, drops + [{"after": 20, "discount_pct": 10}], total_spots=20)
    # Unlimited spots put no cap on it.
    assert check_drops(50, drops + [{"after": 20, "discount_pct": 10}], total_spots=9999)
