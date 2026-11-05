"""The shared booking flow: holds, captures, the guarantor, no-shows, the
fee model, price lock and the consent guard. Stripe is stubbed at the
payments / stripe_client boundary; rows are SimpleNamespace stand-ins so these
cover the decisions Impulse makes, not the database."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import booking_flow as flow
import payments
import payouts
import stripe_client

T0 = datetime(2026, 9, 26, 12, 0, tzinfo=timezone.utc)
FUTURE = datetime(2030, 1, 1, tzinfo=timezone.utc)
PAST = datetime(2020, 1, 1, tzinfo=timezone.utc)


def _seat(sid, share, status="unpaid", **kw):
    deposit, balance = flow.deposit_split(share)
    return SimpleNamespace(
        id=sid, user_id=kw.pop("user_id", f"u-{sid}"), display_name=sid, seat_label=None,
        joined_at=kw.pop("joined_at", T0), ballot_at=None,
        share_amount_cents=share, deposit_cents=deposit, balance_cents=balance,
        covered_by_member_id=None, deposit_status=status, deposit_attempt=0,
        deposit_payment_id=kw.pop("intent", None), balance_payment_id=None, balance_status="unpaid",
        stripe_payment_method_id=kw.pop("pm", None), hold_status=kw.pop("hold", None),
        hold_expires_at=None, payment_note=None, payment_followup=False, **kw,
    )


def _venue(pilot_ends_at=FUTURE):
    return SimpleNamespace(id="v-1", name="Cityheroes", stripe_account_id="acct_venue",
                           stripe_transfers_status="active", pilot_ends_at=pilot_ends_at)


def _deal(price="25.00", unit="pp", date="Tuesday 29 September 2026"):
    return SimpleNamespace(
        id="deal-1", deal_price=price, unit=unit, date=date, slots=["4:00 PM"],
        venue=_venue(), expires_at=None,
    )


def _booking(seats, has_voting=False, status="collecting"):
    return SimpleNamespace(
        id="bk-1", has_voting=has_voting, status=status, participants=seats,
        initiator_member_id=seats[0].id, deal=_deal(), deal_id="deal-1", slot_time="4:00 PM",
        num_people=len(seats), split_confirmed_at=T0, share_deadline=None,
        locked_unit_price_cents=None, locked_price_cents=None, total_paid=0, split_mode="even",
        updated_at=None, spots_held=True, redeemed_at=None, confirmation_code="123456",
        stripe_payout_id=None, payout_status=None,
    )


class StubDB:
    def __init__(self, fail_commits=0):
        self.commits = 0
        self.fail_commits = fail_commits

    def commit(self):
        self.commits += 1
        if self.fail_commits:
            self.fail_commits -= 1
            raise RuntimeError("simulated crash")

    def rollback(self):
        pass

    def refresh(self, row):
        pass


def _held(pi_id, amount, country="AU"):
    return {"id": pi_id, "status": "requires_capture", "amount": amount,
            "payment_method": {"id": "pm_card", "card": {"country": country}},
            "latest_charge": {"payment_method_details": {"card": {"capture_before": 1900000000}}}}


@pytest.fixture
def stripe_stub(monkeypatch):
    """Records every Stripe-facing call the flow makes through payments."""
    calls = []

    def offsession(**kw):
        calls.append(("offsession", kw))
        return _held(f"pi_{kw['idempotency_key']}", kw["amount_cents"])

    def capture(**kw):
        calls.append(("capture", kw))
        return {"id": kw["intent_id"], "status": "succeeded"}

    monkeypatch.setattr(payments, "place_offsession_hold", offsession)
    monkeypatch.setattr(payments, "capture", capture)
    monkeypatch.setattr(payments, "retrieve_hold", lambda pi: _held(pi, 0))
    monkeypatch.setattr(payments, "cancel_hold", lambda **kw: calls.append(("cancel", kw)))
    monkeypatch.setattr(flow, "_customer_of", lambda db, p: f"cus_{p.id}")
    monkeypatch.setattr(payouts, "pay_out_booking", lambda db, b: calls.append(("payout", b.id)))
    return calls


# ── Guarantor ─────────────────────────────────────────────────────────────────

def _guaranteed_booking():
    ini = _seat("ini", 1850, "paid", pm="pm_ini", hold="held", intent="pi_ini")
    return _booking([
        ini,
        _seat("sam", 1850, joined_at=T0 + timedelta(minutes=1)),
        _seat("alex", 1300, joined_at=T0 + timedelta(minutes=2)),
        _seat("jo", 0, "settled", joined_at=T0 + timedelta(minutes=3)),
    ])


def test_guarantor_holds_unpaid_shares_on_the_initiators_card(stripe_stub):
    b = _guaranteed_booking()
    assert flow.charge_guarantor(StubDB(), b) == 2
    holds = [kw for kind, kw in stripe_stub if kind == "offsession"]
    assert [h["idempotency_key"] for h in holds] == ["guarantor-bk-1-sam", "guarantor-bk-1-alex"]
    assert all(h["customer_id"] == "cus_ini" and h["payment_method_id"] == "pm_ini" for h in holds)
    assert [h["amount_cents"] for h in holds] == [1850, 1300]          # the whole share, not a deposit
    assert all(h["destination"] == "acct_venue" for h in holds)
    assert [p.deposit_status for p in b.participants] == ["paid", "guaranteed", "guaranteed", "settled"]
    assert flow.all_in(b)


def test_guarantor_is_idempotent_across_a_crash_and_rerun(stripe_stub):
    b = _guaranteed_booking()
    with pytest.raises(RuntimeError):
        flow.charge_guarantor(StubDB(fail_commits=1), b)
    b.participants[1].deposit_status = "unpaid"     # the DB rollback
    flow.charge_guarantor(StubDB(), b)
    keys = [kw["idempotency_key"] for kind, kw in stripe_stub if kind == "offsession"]
    # Same key on the retry, so Stripe returns the original hold, not a second one.
    assert keys == ["guarantor-bk-1-sam", "guarantor-bk-1-sam", "guarantor-bk-1-alex"]
    flow.charge_guarantor(StubDB(), b)
    assert len([1 for kind, _ in stripe_stub if kind == "offsession"]) == 3


def test_guarantor_decline_is_flagged_and_code_still_issues(stripe_stub, monkeypatch):
    b = _guaranteed_booking()

    def declined(**kw):
        raise payments.PaymentNotApproved(402, "Your card was declined.")
    monkeypatch.setattr(payments, "place_offsession_hold", declined)
    assert flow.charge_guarantor(StubDB(), b) == 0
    sam = b.participants[1]
    assert sam.deposit_status == "declined" and sam.payment_followup
    assert flow.all_in(b)


# ── Price lock ────────────────────────────────────────────────────────────────

def test_price_lock_holds_when_deal_reprices_mid_collection():
    b = _booking([_seat("ini", 0), _seat("sam", 0, joined_at=T0 + timedelta(minutes=1)),
                  _seat("alex", 0, joined_at=T0 + timedelta(minutes=2))])
    flow.lock_price(b, b.deal)
    flow.even_shares(b)
    shown = {p.id: (p.share_amount_cents, p.deposit_cents) for p in b.participants}
    assert b.locked_price_cents == 7500

    b.deal.deal_price = "40.00"          # venue reprices mid-collection
    b.participants[1].deposit_status = "paid"
    flow.edit_split(b, "even", None, {})
    assert {p.id: (p.share_amount_cents, p.deposit_cents) for p in b.participants} == shown
    assert b.locked_price_cents == 7500


def test_remove_seat_shrinks_by_locked_unit_not_live_price():
    b = _booking([_seat("ini", 0), _seat("sam", 0, joined_at=T0 + timedelta(minutes=1)),
                  _seat("alex", 0, joined_at=T0 + timedelta(minutes=2))])
    b.spots_held = False
    flow.lock_price(b, b.deal)
    flow.even_shares(b)
    b.participants[0].deposit_status = "paid"
    b.deal.deal_price = "99.00"

    class DB(StubDB):
        def delete(self, row):
            pass

    flow.remove_seat(DB(), b, b.participants[2])
    assert b.num_people == 2 and b.locked_price_cents == 5000
    assert [p.share_amount_cents for p in b.participants] == [2500, 2500]


def test_per_unit_deal_is_one_price_for_the_group():
    # "$36 a room" for four people is $36 split four ways — not $144.
    b = _booking([_seat("ini", 0), _seat("sam", 0, joined_at=T0 + timedelta(minutes=1)),
                  _seat("alex", 0, joined_at=T0 + timedelta(minutes=2)), _seat("jo", 0, joined_at=T0 + timedelta(minutes=3))])
    b.deal = _deal("36.00", unit="/room·hr")
    flow.lock_price(b, b.deal)
    flow.even_shares(b)
    assert b.locked_price_cents == 3600
    assert [p.share_amount_cents for p in b.participants] == [900, 900, 900, 900]


def test_per_unit_deal_removal_keeps_the_room_price():
    b = _booking([_seat("ini", 0), _seat("sam", 0, joined_at=T0 + timedelta(minutes=1)),
                  _seat("alex", 0, joined_at=T0 + timedelta(minutes=2))])
    b.spots_held = False
    b.deal = _deal("36.00", unit="/room·hr")
    flow.lock_price(b, b.deal)
    flow.even_shares(b)
    b.participants[0].deposit_status = "paid"

    class DB(StubDB):
        def delete(self, row):
            pass

    flow.remove_seat(DB(), b, b.participants[2])
    assert b.locked_price_cents == 3600 and b.num_people == 2
    assert [p.share_amount_cents for p in b.participants] == [1200, 2400]


def test_unit_missing_means_per_person():
    b = _booking([_seat("ini", 0), _seat("sam", 0)])
    b.deal = _deal("10.00", unit=None)
    flow.lock_price(b, b.deal)
    assert b.locked_price_cents == 2000


# ── Consent guard + claiming a spot ───────────────────────────────────────────

class NoDB:
    def __getattr__(self, name):
        raise AssertionError(f"db.{name} touched before the consent check")


def test_consent_guard_rejects_changed_share_before_anything_is_held():
    b = _booking([_seat("ini", 2500, "paid"), _seat("sam", 2500)])
    sam = b.participants[1]
    with pytest.raises(HTTPException) as e:
        flow.start_hold(NoDB(), b, sam, {"sub": "u-sam"}, sam.share_amount_cents + 1)
    assert e.value.status_code == 409 and "$25.00" in e.value.detail


def _claimable(monkeypatch, booking_date="Tuesday 29 September 2026"):
    b = _booking([_seat("ini", 2500, "paid"), _seat("sam", 3100)])
    b.deal.date = booking_date
    monkeypatch.setattr(flow, "_ensure_user", lambda db, user: SimpleNamespace(id=user["sub"]))
    monkeypatch.setattr(flow.wallet, "sheet_params", lambda row: {
        "customer_id": "cus_sam", "customer_session_client_secret": "cuss_secret"})
    monkeypatch.setattr(flow, "now", lambda: T0)
    return b, b.participants[1]


def test_start_hold_holds_exactly_the_shown_share_for_the_venue(monkeypatch):
    b, sam = _claimable(monkeypatch)
    sent = {}

    def create_hold(**kw):
        sent.update(kw)
        return {"id": "pi_sam", "client_secret": "pi_sam_secret"}
    monkeypatch.setattr(payments, "create_hold", create_hold)
    monkeypatch.setattr(payments, "needs_setup_first", lambda start, at=None: False)

    out = flow.start_hold(StubDB(), b, sam, {"sub": "u-sam"}, 3100)
    assert sent["amount_cents"] == 3100 and sent["destination"] == "acct_venue"
    assert sent["customer_id"] == "cus_sam" and sent["idempotency_key"] == "deposit-bk-1-sam-0"
    assert out["intent_type"] == "payment" and out["client_secret"] == "pi_sam_secret"
    assert sam.deposit_payment_id == "pi_sam" and sam.deposit_status == "unpaid"   # nothing held yet


def test_far_off_booking_saves_the_card_instead_of_holding(monkeypatch):
    b, sam = _claimable(monkeypatch)
    monkeypatch.setattr(payments, "needs_setup_first", lambda start, at=None: True)
    monkeypatch.setattr(payments, "create_setup", lambda **kw: {"id": "seti_sam", "client_secret": "seti_secret"})
    out = flow.start_hold(StubDB(), b, sam, {"sub": "u-sam"}, 3100)
    assert out["intent_type"] == "setup" and sam.deposit_payment_id == "seti_sam"


def test_unverified_venue_cannot_take_a_hold(monkeypatch):
    b, sam = _claimable(monkeypatch)
    b.deal.venue.stripe_transfers_status = "pending"
    with pytest.raises(HTTPException) as e:
        flow.start_hold(StubDB(), b, sam, {"sub": "u-sam"}, 3100)
    assert e.value.status_code == 409


def test_confirm_reads_the_hold_back_from_stripe(monkeypatch):
    b, sam = _claimable(monkeypatch)
    sam.deposit_payment_id = "pi_sam"
    monkeypatch.setattr(payments, "retrieve_hold", lambda pi: _held(pi, 3100))
    monkeypatch.setattr(flow, "maybe_confirm", lambda db, b: None)
    flow.confirm_hold(StubDB(), b, sam, {"sub": "u-sam"}, "pi_sam")
    assert sam.deposit_status == "paid" and sam.hold_status == "held"
    assert sam.stripe_payment_method_id == "pm_card" and sam.hold_expires_at is not None


def test_confirm_rejects_an_intent_for_another_seat(monkeypatch):
    b, sam = _claimable(monkeypatch)
    sam.deposit_payment_id = "pi_sam"
    with pytest.raises(HTTPException) as e:
        flow.confirm_hold(StubDB(), b, sam, {"sub": "u-sam"}, "pi_someone_else")
    assert e.value.status_code == 409 and sam.deposit_status == "unpaid"


def test_confirm_releases_a_hold_for_the_wrong_amount(monkeypatch):
    b, sam = _claimable(monkeypatch)
    sam.deposit_payment_id = "pi_sam"
    cancelled = []
    monkeypatch.setattr(payments, "retrieve_hold", lambda pi: _held(pi, 9999))
    monkeypatch.setattr(payments, "cancel_hold", lambda **kw: cancelled.append(kw["intent_id"]))
    with pytest.raises(HTTPException) as e:
        flow.confirm_hold(StubDB(), b, sam, {"sub": "u-sam"}, "pi_sam")
    assert e.value.status_code == 409 and cancelled == ["pi_sam"] and sam.deposit_status == "unpaid"


def test_confirm_refuses_an_unauthorised_intent(monkeypatch):
    b, sam = _claimable(monkeypatch)
    sam.deposit_payment_id = "pi_sam"
    monkeypatch.setattr(payments, "retrieve_hold", lambda pi: {"id": pi, "status": "requires_payment_method"})
    with pytest.raises(HTTPException) as e:
        flow.confirm_hold(StubDB(), b, sam, {"sub": "u-sam"}, "pi_sam")
    assert e.value.status_code == 402 and sam.deposit_status == "unpaid"


# ── Capture at redemption ─────────────────────────────────────────────────────

def _redeemable(pilot_ends_at=FUTURE):
    b = _booking([
        _seat("ini", 2500, "paid", intent="pi_ini", pm="pm_ini", hold="held"),
        _seat("sam", 1500, "paid", intent="pi_sam", pm="pm_sam", hold="held"),
    ], status="confirmed")
    b.deal.venue.pilot_ends_at = pilot_ends_at
    return b


def test_redeem_captures_every_share_in_full_and_pays_the_venue_out(stripe_stub):
    b = _redeemable()
    out = flow.redeem(StubDB(), b)
    captures = [kw for kind, kw in stripe_stub if kind == "capture"]
    assert [c["amount_cents"] for c in captures] == [2500, 1500]
    assert [c["idempotency_key"] for c in captures] == ["balance-bk-1-ini", "balance-bk-1-sam"]
    assert all(c["application_fee_cents"] == 0 for c in captures)      # pilot: 100% to the venue
    assert out["total_charged_cents"] == 4000 and out["declines"] == 0
    assert b.status == "redeemed" and ("payout", "bk-1") in stripe_stub


def test_after_the_pilot_impulse_takes_its_ten_percent_at_capture(stripe_stub):
    b = _redeemable(pilot_ends_at=PAST)
    flow.redeem(StubDB(), b)
    fees = [kw["application_fee_cents"] for kind, kw in stripe_stub if kind == "capture"]
    ini, sam = b.participants
    assert fees == [ini.deposit_cents, sam.deposit_cents] == [250, 150]   # a flat 10%; Impulse absorbs Stripe's fees


def test_lapsed_hold_is_recharged_on_the_same_card_at_the_door(stripe_stub, monkeypatch):
    b = _redeemable()
    monkeypatch.setattr(payments, "retrieve_hold",
                        lambda pi: {"id": pi, "status": "canceled"} if pi == "pi_sam" else _held(pi, 0))
    flow.redeem(StubDB(), b)
    rehold = [kw for kind, kw in stripe_stub if kind == "offsession"]
    assert len(rehold) == 1 and rehold[0]["payment_method_id"] == "pm_sam" and rehold[0]["amount_cents"] == 1500
    assert b.participants[1].balance_status == "paid"


def test_failed_capture_is_flagged_but_never_blocks_redemption(stripe_stub, monkeypatch):
    b = _redeemable()

    def capture(**kw):
        if kw["intent_id"] == "pi_sam":
            raise payments.PaymentNotApproved(402, "expired")
        return {"id": kw["intent_id"], "status": "succeeded"}
    monkeypatch.setattr(payments, "capture", capture)
    out = flow.redeem(StubDB(), b)
    assert out["declines"] == 1 and b.status == "redeemed"
    assert b.participants[1].balance_status == "declined" and b.participants[1].payment_followup


# ── Releasing holds + no-shows ────────────────────────────────────────────────

def test_huddle_collapse_releases_holds_instead_of_refunding(stripe_stub):
    b = _booking([_seat("ini", 2000, "paid", intent="pi_ini", hold="held"),
                  _seat("sam", 2000, "paid", intent="seti_sam", hold="saved"),
                  _seat("alex", 2000)], has_voting=True)
    released, failed = flow.refund_participants(b, "expired")
    assert (released, failed) == (2, 0)
    assert [kw["intent_id"] for kind, kw in stripe_stub if kind == "cancel"] == ["pi_ini"]   # a saved card has no hold
    assert [p.hold_status for p in b.participants[:2]] == ["released", "released"]


def test_no_show_captures_only_the_ten_percent(stripe_stub):
    b = _redeemable()
    flow._settle_no_show(StubDB(), b, {"no_shows": 0})
    captures = [kw for kind, kw in stripe_stub if kind == "capture"]
    assert [c["amount_cents"] for c in captures] == [p.deposit_cents for p in b.participants]
    assert [c["idempotency_key"] for c in captures] == ["noshow-bk-1-ini", "noshow-bk-1-sam"]
    assert b.status == "no_show"


def test_sweep_leaves_bookings_without_holds_alone(stripe_stub, monkeypatch):
    """Bookings from before Stripe holds have no hold_status. A past slot must
    not turn them into no-shows."""
    b = _booking([_seat("ini", 2500, "paid")], status="confirmed")
    monkeypatch.setattr(flow, "now", lambda: flow.slot_start(b) + timedelta(days=3))

    class Q:
        def options(self, *a):
            return self

        def filter(self, *a):
            return self

        def all(self):
            return [b]

    class DB(StubDB):
        def query(self, *a):
            return Q()

    flow.sweep_holds(DB())
    assert b.status == "confirmed"
    assert not [kind for kind, _ in stripe_stub if kind == "capture"]


def test_saved_card_is_held_four_days_before_the_slot(stripe_stub, monkeypatch):
    b = _booking([_seat("ini", 2500, "paid", intent="seti_ini", pm="pm_ini", hold="saved")], status="confirmed")
    start = flow.slot_start(b)
    monkeypatch.setattr(flow, "now", lambda: start - timedelta(days=3))

    class Q:
        def __init__(self, rows):
            self.rows = rows

        def options(self, *a):
            return self

        def filter(self, *a):
            return self

        def all(self):
            return self.rows

    class DB(StubDB):
        def __init__(self):
            super().__init__()
            self.calls = 0

        def query(self, *a):
            self.calls += 1
            return Q([b] if self.calls == 1 else [])

    counts = flow.sweep_holds(DB())
    assert counts["held_later"] == 1 and b.participants[0].hold_status == "held"
    assert b.participants[0].deposit_payment_id.startswith("pi_hold-")


# ── Updating a card that couldn't be held ─────────────────────────────────────

def _failed_seat_booking(monkeypatch):
    b = _booking([_seat("ini", 2500, "paid", intent="pi_old", pm="pm_old", hold="failed")], status="confirmed")
    p = b.participants[0]
    p.payment_followup, p.payment_note = True, flow.CARD_FAILED_NOTE
    monkeypatch.setattr(flow, "_ensure_user", lambda db, user: SimpleNamespace(id=user["sub"], stripe_customer_id="cus_ini"))
    monkeypatch.setattr(flow.wallet, "sheet_params", lambda row: {
        "customer_id": "cus_ini", "customer_session_client_secret": "cuss"})
    monkeypatch.setattr(payments, "needs_setup_first", lambda start, at=None: False)
    return b, p


def test_failed_hold_is_flagged_for_the_guest_and_pushed(stripe_stub, monkeypatch):
    b = _booking([_seat("ini", 2500, "paid", intent="seti_x", pm="pm_x", hold="saved")], status="confirmed")

    def declined(**kw):
        raise payments.PaymentNotApproved(402, "Your card was declined.")
    pushed = []
    monkeypatch.setattr(payments, "place_offsession_hold", declined)
    monkeypatch.setattr(flow, "push_card_failed", lambda db, b, p: pushed.append(p.id))
    counts = {"held_later": 0, "hold_failures": 0}
    flow._hold_later(StubDB(), b, b.participants[0], counts, "hold")
    p = b.participants[0]
    assert counts["hold_failures"] == 1 and p.hold_status == "failed" and flow.card_needs_update(p)
    assert pushed == ["ini"]


def test_card_update_holds_a_new_card_keyed_to_the_old_intent(monkeypatch):
    b, p = _failed_seat_booking(monkeypatch)
    sent = {}
    monkeypatch.setattr(payments, "create_hold", lambda **kw: sent.update(kw) or {"id": "pi_new", "client_secret": "s"})
    out = flow.start_card_update(StubDB(), b, p, {"sub": "u-ini"})
    assert out["intent_id"] == "pi_new" and sent["amount_cents"] == 2500
    assert sent["idempotency_key"] == "recard-bk-1-ini-pi_old" and sent["metadata"]["type"] == "card_update"
    assert p.deposit_payment_id == "pi_old"            # nothing swapped until the new card is confirmed


def test_confirming_the_new_card_swaps_it_in_and_releases_the_old_hold(monkeypatch):
    b, p = _failed_seat_booking(monkeypatch)
    cancelled = []
    monkeypatch.setattr(payments, "retrieve_hold", lambda pi: {
        **_held(pi, 2500), "customer": "cus_ini",
        "metadata": {"impulseBookingId": "bk-1", "impulseMemberId": "ini"}})
    monkeypatch.setattr(payments, "cancel_hold", lambda **kw: cancelled.append(kw["intent_id"]))
    flow.confirm_card_update(StubDB(), b, p, {"sub": "u-ini"}, "pi_new")
    assert p.deposit_payment_id == "pi_new" and p.hold_status == "held" and p.stripe_payment_method_id == "pm_card"
    assert cancelled == ["pi_old"] and not p.payment_followup and p.payment_note is None
    assert not flow.card_needs_update(p)


def test_a_card_update_for_someone_elses_seat_is_refused(monkeypatch):
    b, p = _failed_seat_booking(monkeypatch)
    monkeypatch.setattr(payments, "retrieve_hold", lambda pi: {
        **_held(pi, 2500), "customer": "cus_someone_else",
        "metadata": {"impulseBookingId": "bk-1", "impulseMemberId": "ini"}})
    with pytest.raises(HTTPException) as e:
        flow.confirm_card_update(StubDB(), b, p, {"sub": "u-ini"}, "pi_new")
    assert e.value.status_code == 409 and p.deposit_payment_id == "pi_old"


def test_card_update_needs_a_seat_that_is_in(monkeypatch):
    b, p = _failed_seat_booking(monkeypatch)
    p.deposit_status = "unpaid"
    with pytest.raises(HTTPException) as e:
        flow.start_card_update(StubDB(), b, p, {"sub": "u-ini"})
    assert e.value.status_code == 409


# ── Fee model ─────────────────────────────────────────────────────────────────

def test_pilot_venue_pays_no_fee_and_unset_pilot_counts_as_pilot():
    assert payments.impulse_fee(venue=_venue(FUTURE), deposit_cents=250, captured_cents=2500) == 0
    assert payments.impulse_fee(venue=_venue(None), deposit_cents=250, captured_cents=2500) == 0


def test_post_pilot_fee_is_a_flat_ten_percent():
    v = _venue(PAST)
    assert payments.impulse_fee(venue=v, deposit_cents=250, captured_cents=2500) == 250
    assert payments.impulse_fee(venue=v, deposit_cents=250, captured_cents=250) == 250   # no-show: the whole 10%
    assert payments.impulse_fee(venue=v, deposit_cents=250, captured_cents=100) == 100   # never more than captured


def test_needs_setup_first_only_beyond_the_hold_window():
    assert not payments.needs_setup_first(T0 + timedelta(days=5), at=T0)
    assert payments.needs_setup_first(T0 + timedelta(days=7), at=T0)
    assert not payments.needs_setup_first(None, at=T0)


# ── Stripe request shape ──────────────────────────────────────────────────────

def test_hold_is_a_manual_capture_destination_charge(monkeypatch):
    sent = {}
    monkeypatch.setattr(stripe_client, "create_payment_intent",
                        lambda params, key: sent.update(params, key=key) or {"id": "pi_1", "client_secret": "s"})
    payments.create_hold(customer_id="cus_1", amount_cents=3100, destination="acct_v",
                         description="d", metadata={"a": "1"}, idempotency_key="deposit-x")
    assert sent["capture_method"] == "manual" and sent["setup_future_usage"] == "off_session"
    assert sent["transfer_data"] == {"destination": "acct_v"} and sent["amount"] == 3100
    assert sent["currency"] == "aud" and "payment_method_types" not in sent
    assert "application_fee_amount" not in sent       # taken at capture, when the pilot status is known
    assert sent["key"] == "deposit-x"


def test_offsession_hold_that_needs_the_guest_is_not_approved(monkeypatch):
    monkeypatch.setattr(stripe_client, "create_payment_intent",
                        lambda params, key: {"id": "pi_1", "status": "requires_action"})
    with pytest.raises(payments.PaymentNotApproved):
        payments.place_offsession_hold(customer_id="c", payment_method_id="pm", amount_cents=100,
                                       destination="acct", description="d", metadata={}, idempotency_key="k")


def test_releasing_an_already_released_hold_is_fine(monkeypatch):
    err = stripe_client.StripeError("already canceled")
    err.code = "payment_intent_unexpected_state"

    def cancel(intent_id, key):
        raise err
    monkeypatch.setattr(stripe_client, "cancel_payment_intent", cancel)
    payments.cancel_hold(intent_id="pi_1", idempotency_key="k")   # no raise


# ── Split edits ───────────────────────────────────────────────────────────────

def test_share_change_moves_the_nonce_on():
    b = _booking([_seat("ini", 2500, "paid"), _seat("sam", 2500), _seat("alex", 2500)])
    b.locked_price_cents = 7500
    flow.edit_split(b, "custom", {"ini": 2500, "sam": 3000, "alex": 2000}, {})
    assert [p.deposit_attempt for p in b.participants] == [0, 1, 1]


def test_edit_split_rejects_changing_a_paid_share():
    b = _booking([_seat("ini", 2500, "paid"), _seat("sam", 2500)])
    b.locked_price_cents = 5000
    with pytest.raises(flow.SplitError):
        flow.edit_split(b, "custom", {"ini": 2000, "sam": 3000}, {})
    assert [p.share_amount_cents for p in b.participants] == [2500, 2500]


