"""The shared booking flow: guarantor charge, price lock, consent guard and
Pinch nonce replays. Pinch is stubbed; rows are SimpleNamespace stand-ins so
these cover the decisions Impulse makes, not the database."""
import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import booking_flow as flow
import payments
import pinch_client
from pinch_client import PinchError

T0 = datetime(2026, 9, 26, 12, 0, tzinfo=timezone.utc)


def _seat(sid, share, status="unpaid", **kw):
    deposit, balance = flow.deposit_split(share)
    return SimpleNamespace(
        id=sid, user_id=kw.pop("user_id", f"u-{sid}"), display_name=sid, seat_label=None,
        joined_at=kw.pop("joined_at", T0), ballot_at=None,
        share_amount_cents=share, deposit_cents=deposit, balance_cents=balance,
        covered_by_member_id=None, deposit_status=status, deposit_attempt=0,
        deposit_payment_id=None, balance_payment_id=None, balance_status="unpaid",
        pinch_payer_id=kw.pop("payer", None), pinch_source_id=kw.pop("source", None),
        payment_note=None, payment_followup=False, **kw,
    )


def _deal(price="25.00", unit="pp"):
    return SimpleNamespace(
        id="deal-1", deal_price=price, unit=unit, date="Tuesday 29 September 2026", slots=["4:00 PM"],
        venue=SimpleNamespace(name="Cityheroes"), expires_at=None,
    )


def _booking(seats, has_voting=False, status="collecting"):
    return SimpleNamespace(
        id="bk-1", has_voting=has_voting, status=status, participants=seats,
        initiator_member_id=seats[0].id, deal=_deal(), deal_id="deal-1", slot_time="4:00 PM",
        num_people=len(seats), split_confirmed_at=T0, share_deadline=None,
        locked_unit_price_cents=None, locked_price_cents=None, total_paid=0, split_mode="even",
        updated_at=None, spots_held=True,
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


def _record_charges(monkeypatch, status="approved"):
    calls = []

    def fake_charge(**kw):
        calls.append(kw)
        return {"id": f"pmt_{len(calls)}", "status": status}

    monkeypatch.setattr(payments, "charge_deposit", fake_charge)
    return calls


# ── Guarantor ─────────────────────────────────────────────────────────────────

def _guaranteed_booking():
    ini = _seat("ini", 1850, "paid", payer="pyr_ini", source="src_ini")
    return _booking([
        ini,
        _seat("sam", 1850, joined_at=T0 + timedelta(minutes=1)),
        _seat("alex", 1300, joined_at=T0 + timedelta(minutes=2)),
        _seat("jo", 0, "settled", joined_at=T0 + timedelta(minutes=3)),
    ])


def test_guarantor_charges_unpaid_seats_to_initiator_with_nonce(monkeypatch):
    b = _guaranteed_booking()
    calls = _record_charges(monkeypatch)

    assert flow.charge_guarantor(StubDB(), b) == 2
    assert [c["nonce"] for c in calls] == ["guarantor-bk-1-sam", "guarantor-bk-1-alex"]
    assert all(c["payer_id"] == "pyr_ini" and c["source_id"] == "src_ini" for c in calls)
    assert [c["amount_cents"] for c in calls] == [b.participants[1].deposit_cents, b.participants[2].deposit_cents]
    assert [p.deposit_status for p in b.participants] == ["paid", "guaranteed", "guaranteed", "settled"]
    assert flow.all_in(b)


def test_guarantor_is_idempotent_across_a_crash_and_rerun(monkeypatch):
    b = _guaranteed_booking()
    calls = _record_charges(monkeypatch)

    # Crash after the first charge, before its status is committed. The DB
    # rollback leaves the seat unpaid, so the rerun re-sends the same nonce —
    # which Pinch answers with the original payment (see replay tests below).
    with pytest.raises(RuntimeError):
        flow.charge_guarantor(StubDB(fail_commits=1), b)
    b.participants[1].deposit_status = "unpaid"
    flow.charge_guarantor(StubDB(), b)
    assert [c["nonce"] for c in calls] == ["guarantor-bk-1-sam", "guarantor-bk-1-sam", "guarantor-bk-1-alex"]

    # Once written, a further sweep makes no Pinch call at all.
    flow.charge_guarantor(StubDB(), b)
    assert len(calls) == 3


def test_guarantor_decline_is_flagged_and_code_still_issues(monkeypatch):
    b = _guaranteed_booking()

    def declined(**kw):
        raise payments.PaymentNotApproved(200, json.dumps({"status": "declined"}))

    monkeypatch.setattr(payments, "charge_deposit", declined)
    assert flow.charge_guarantor(StubDB(), b) == 0
    sam = b.participants[1]
    assert sam.deposit_status == "declined" and sam.payment_followup
    assert flow.all_in(b)   # nothing blocks the code


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


# ── Consent guard ─────────────────────────────────────────────────────────────

class NoDB:
    def __getattr__(self, name):
        raise AssertionError(f"db.{name} touched before the consent check")


def _pay_body(expected):
    return SimpleNamespace(expected_deposit_cents=expected, payment_method_id="pm_1", token=None,
                           save_card=False, first_name=None, last_name=None, email=None)


def test_consent_guard_rejects_changed_amount_before_any_charge():
    b = _booking([_seat("ini", 2500, "paid"), _seat("sam", 2500)])
    sam = b.participants[1]
    with pytest.raises(HTTPException) as e:
        flow.pay_share(NoDB(), b, sam, {"sub": "u-sam"}, _pay_body(sam.deposit_cents + 1))
    assert e.value.status_code == 409 and "$25.00" in e.value.detail


def test_pay_charges_exactly_the_displayed_deposit(monkeypatch):
    b = _booking([_seat("ini", 2500, "paid"), _seat("sam", 3100)])
    sam = b.participants[1]
    calls = _record_charges(monkeypatch)
    monkeypatch.setattr(flow.wallet, "resolve_source", lambda *a, **k: ("pyr_sam", "src_sam"))
    monkeypatch.setattr(flow, "maybe_confirm", lambda db, b: None)

    class DB(StubDB):
        def query(self, *a):
            return SimpleNamespace(filter=lambda *a: SimpleNamespace(first=lambda: object()))

        def refresh(self, row):
            pass

    flow.pay_share(DB(), b, sam, {"sub": "u-sam"}, _pay_body(sam.deposit_cents))
    assert calls[0]["amount_cents"] == sam.deposit_cents == 620
    assert calls[0]["nonce"] == "deposit-bk-1-sam-0"
    assert sam.deposit_status == "paid"


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


# ── Pinch nonce replay (403 isNonceReplay, amount ignored) ────────────────────

def _replay(amount, charge_amount_cents, status="approved", surcharged=True):
    body = {"isNonceReplay": True, "data": {
        "id": "pmt_orig", "amount": amount, "status": status, "isSurcharged": surcharged,
        "metadata": json.dumps({"chargeAmountCents": charge_amount_cents}),
    }}
    return PinchError(403, json.dumps(body))


def _charge(amount_cents=1092):
    return payments.charge_deposit(payer_id="pyr", source_id="src", amount_cents=amount_cents,
                                   description="d", metadata={}, nonce="n", merchant_id="m")


def test_replay_of_same_approved_charge_counts_as_success(monkeypatch):
    def replay(input, mid):
        raise _replay(1141, 1092)   # amount includes the card surcharge
    monkeypatch.setattr(pinch_client, "create_payment", replay)
    assert _charge()["id"] == "pmt_orig"


def test_replay_with_different_amount_is_surfaced(monkeypatch):
    def replay(input, mid):
        raise _replay(1141, 1092)
    monkeypatch.setattr(pinch_client, "create_payment", replay)
    with pytest.raises(PinchError) as e:
        _charge(1500)
    assert e.value.status_code == 403 and "isNonceReplay" in e.value.body


def test_replay_of_declined_charge_is_not_approved(monkeypatch):
    def replay(input, mid):
        raise _replay(1092, 1092, status="declined")
    monkeypatch.setattr(pinch_client, "create_payment", replay)
    with pytest.raises(payments.PaymentNotApproved):
        _charge()


def test_charge_stamps_intended_amount_into_metadata(monkeypatch):
    sent = {}

    def ok(input, mid):
        sent.update(input)
        return {"id": "pmt_1", "status": "approved"}
    monkeypatch.setattr(pinch_client, "create_payment", ok)
    _charge(777)
    assert json.loads(sent["metadata"])["chargeAmountCents"] == 777
