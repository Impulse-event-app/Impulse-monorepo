"""Saved-card guards. Pinch is stubbed — these cover the decisions Impulse
makes about a stored source, not Pinch's own behaviour."""
import pytest

import payments
import pinch_client


def _payer(sources):
    return {"id": "pyr_1", "sources": sources}


# ── supportsRealtime guard ────────────────────────────────────────────────────
# Pinch has no list-sources endpoint; the payer object embeds `sources`, and a
# source can vault fine yet still not be chargeable via /payments/realtime.

def test_chargeable_when_source_supports_realtime(monkeypatch):
    monkeypatch.setattr(
        pinch_client, "get_payer",
        lambda pid, mid: _payer([{"id": "src_1", "supportsRealtime": True}]),
    )
    assert payments.source_is_chargeable(
        payer_id="pyr_1", source_id="src_1", merchant_id="m"
    ) is True


def test_not_chargeable_when_realtime_unsupported(monkeypatch):
    monkeypatch.setattr(
        pinch_client, "get_payer",
        lambda pid, mid: _payer([{"id": "src_1", "supportsRealtime": False}]),
    )
    assert payments.source_is_chargeable(
        payer_id="pyr_1", source_id="src_1", merchant_id="m"
    ) is False


def test_not_chargeable_when_source_absent(monkeypatch):
    """Detached at Pinch's end but still in our table — must not be charged."""
    monkeypatch.setattr(
        pinch_client, "get_payer",
        lambda pid, mid: _payer([{"id": "src_other", "supportsRealtime": True}]),
    )
    assert payments.source_is_chargeable(
        payer_id="pyr_1", source_id="src_1", merchant_id="m"
    ) is False


def test_not_chargeable_when_payer_has_no_sources(monkeypatch):
    """`sources` missing entirely — treat as unusable rather than crashing."""
    monkeypatch.setattr(pinch_client, "get_payer", lambda pid, mid: {"id": "pyr_1"})
    assert payments.source_is_chargeable(
        payer_id="pyr_1", source_id="src_1", merchant_id="m"
    ) is False


# ── payer reuse ───────────────────────────────────────────────────────────────

def test_vault_source_reuses_the_given_payer(monkeypatch):
    """The whole point: vaulting a second card must not mint a second payer."""
    created_payers = []
    monkeypatch.setattr(
        pinch_client, "create_payer",
        lambda body, mid: created_payers.append(body) or {"id": "pyr_new"},
    )
    monkeypatch.setattr(
        pinch_client, "create_payment_source",
        lambda pid, body, mid: {"id": "src_2", "cardScheme": "visa", "displayCardNumber": "4654"},
    )

    source = payments.vault_source(payer_id="pyr_existing", token="tkn_2", merchant_id="m")

    assert source["id"] == "src_2"
    assert created_payers == [], "vault_source must not create a payer"


def test_vault_card_still_creates_a_payer_for_the_throwaway_path(monkeypatch):
    monkeypatch.setattr(pinch_client, "create_payer", lambda body, mid: {"id": "pyr_one_off"})
    monkeypatch.setattr(
        pinch_client, "create_payment_source", lambda pid, body, mid: {"id": "src_one_off"},
    )
    payer_id, source_id = payments.vault_card(
        first_name="A", last_name="B", email="a@b.c", token="tkn", merchant_id="m",
    )
    assert (payer_id, source_id) == ("pyr_one_off", "src_one_off")
