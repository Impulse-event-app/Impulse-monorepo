"""
Thin client for the Pinch Payments API (managed-merchant mode).

Docs: https://docs.getpinch.com.au
Auth is OAuth2 client credentials: PINCH_CLIENT_ID (Application Id) +
PINCH_API_KEY (Secret Key) are exchanged at auth.getpinch.com.au for a
Bearer token valid 1 hour, which is cached and refreshed here.

Every API call sends:
  Authorization: Bearer {access_token}
  pinch-version: 2020.1
  Current-Merchant: {merchant_id}
  Content-Type: application/json

Amounts are integer cents. Payment ids look like pmt_XXX, payers pyr_XXX,
sources src_XXX, refunds ref_XXX.
"""
import os
import threading
import time

import httpx
from dotenv import load_dotenv

load_dotenv()

PINCH_BASE_URL: str = os.environ.get("PINCH_BASE_URL", "https://api.getpinch.com.au/test").rstrip("/")
PINCH_API_KEY: str = os.environ["PINCH_API_KEY"]
PINCH_CLIENT_ID: str = os.environ["PINCH_CLIENT_ID"]

PINCH_AUTH_URL = "https://auth.getpinch.com.au/connect/token"
PINCH_VERSION = "2020.1"
_TIMEOUT = 30.0


class PinchError(Exception):
    """Raised on any non-2xx Pinch response. Carries the exact response body."""

    def __init__(self, status_code: int, body: str):
        self.status_code = status_code
        self.body = body
        super().__init__(f"Pinch API error {status_code}: {body}")


# ── OAuth token cache (1-hour lifetime, refreshed 60s early) ─────────────────

_token_lock = threading.Lock()
_token: dict = {"value": None, "expires_at": 0.0}


def _access_token() -> str:
    with _token_lock:
        if _token["value"] and time.time() < _token["expires_at"] - 60:
            return _token["value"]
        resp = httpx.post(
            PINCH_AUTH_URL,
            data={
                "grant_type": "client_credentials",
                "client_id": PINCH_CLIENT_ID,
                "client_secret": PINCH_API_KEY,
            },
            timeout=_TIMEOUT,
        )
        if resp.status_code != 200:
            raise PinchError(resp.status_code, resp.text)
        body = resp.json()
        _token["value"] = body["access_token"]
        _token["expires_at"] = time.time() + float(body.get("expires_in", 3600))
        return _token["value"]


def _headers(merchant_id: str) -> dict:
    return {
        "Authorization": f"Bearer {_access_token()}",
        "pinch-version": PINCH_VERSION,
        "Current-Merchant": merchant_id,
        "Content-Type": "application/json",
    }


def _post(path: str, body: dict, merchant_id: str) -> dict:
    url = f"{PINCH_BASE_URL}{path}"
    resp = httpx.post(url, json=body, headers=_headers(merchant_id), timeout=_TIMEOUT)
    if resp.status_code < 200 or resp.status_code >= 300:
        raise PinchError(resp.status_code, resp.text)
    return resp.json()


def create_payer(input: dict, merchant_id: str) -> dict:
    """POST /payers — input: firstName, lastName, email, mobile. Returns payer with id pyr_XXX."""
    return _post("/payers", input, merchant_id)


def create_payment_source(payer_id: str, input: dict, merchant_id: str) -> dict:
    """
    POST /payers/{id}/sources — vault a card against a payer.
    input: {"sourceType": "credit-card", "token": "tkn_XXX"}. Returns source with id src_XXX.
    """
    return _post(f"/payers/{payer_id}/sources", input, merchant_id)


def create_payment(input: dict, merchant_id: str) -> dict:
    """
    POST /payments/realtime — charge synchronously.
    input: payerId, sourceId (or token), amount (cents), description,
    applicationFee (cents), metadata, nonce. Returns payment with id pmt_XXX and status.
    """
    return _post("/payments/realtime", input, merchant_id)


def create_refund(input: dict, merchant_id: str) -> dict:
    """POST /refunds — input: paymentId, amount (cents), reason, nonce. Returns refund ref_XXX.

    NOTE: present for API completeness only. Impulse deposits are non-refundable —
    nothing in the app calls this.
    """
    return _post("/refunds", input, merchant_id)
