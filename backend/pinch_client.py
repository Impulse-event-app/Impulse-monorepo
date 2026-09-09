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
from typing import Optional

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


def _headers(merchant_id: Optional[str] = None) -> dict:
    """Standard JSON headers. merchant_id=None omits Current-Merchant, which is
    how the platform-level calls (creating a managed merchant, listing them) are
    attributed to the master account rather than to a sub-merchant."""
    headers = {
        "Authorization": f"Bearer {_access_token()}",
        "pinch-version": PINCH_VERSION,
        "Content-Type": "application/json",
    }
    if merchant_id:
        headers["Current-Merchant"] = merchant_id
    return headers


def _headers_multipart(merchant_id: str) -> dict:
    """Same, minus Content-Type — httpx must set it itself so it can append the
    multipart boundary. Setting it here produces a body Pinch cannot parse."""
    return {
        "Authorization": f"Bearer {_access_token()}",
        "pinch-version": PINCH_VERSION,
        "Current-Merchant": merchant_id,
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
    input: {"sourceType": "credit-card", "token": "tkn_XXX"}. Returns source with id src_XXX
    plus the display fields we persist: displayCardNumber (bare last 4, not masked),
    cardScheme (lowercase, e.g. "visa"), expiryDate, funding, cardHolderName.
    """
    return _post(f"/payers/{payer_id}/sources", input, merchant_id)


def get_payer(payer_id: str, merchant_id: str) -> dict:
    """
    GET /payers/{id} — the payer with its embedded `sources` array. Each source
    carries two fields the create-source response does not: isAuthorised and
    supportsRealtime. There is no list-sources endpoint; this is how you read
    a payer's stored cards back.
    """
    return _get(f"/payers/{payer_id}", merchant_id)


def delete_source(payer_id: str, source_id: str, merchant_id: str) -> None:
    """
    DELETE /payers/{id}/sources/{sourceId} — detach a vaulted card.
    Returns 200 with no body. An unknown source id returns 400 with
    errorMessage "Source with id: src_XXX not found".
    """
    url = f"{PINCH_BASE_URL}/payers/{payer_id}/sources/{source_id}"
    resp = httpx.delete(url, headers=_headers(merchant_id), timeout=_TIMEOUT)
    if resp.status_code < 200 or resp.status_code >= 300:
        raise PinchError(resp.status_code, resp.text)


def create_payment(input: dict, merchant_id: str) -> dict:
    """
    POST /payments/realtime — charge synchronously.
    input: payerId, sourceId (or token), amount (cents), description,
    applicationFee (cents), metadata, nonce. Returns payment with id pmt_XXX and status.
    """
    return _post("/payments/realtime", input, merchant_id)


def get_payment(payment_id: str, merchant_id: str) -> dict:
    """GET /payments/{id} — used to read the actual captured amount."""
    url = f"{PINCH_BASE_URL}/payments/{payment_id}"
    resp = httpx.get(url, headers=_headers(merchant_id), timeout=_TIMEOUT)
    if resp.status_code < 200 or resp.status_code >= 300:
        raise PinchError(resp.status_code, resp.text)
    return resp.json()


def _get(path: str, merchant_id: str, params: Optional[dict] = None) -> dict:
    url = f"{PINCH_BASE_URL}{path}"
    resp = httpx.get(url, headers=_headers(merchant_id), params=params, timeout=_TIMEOUT)
    if resp.status_code < 200 or resp.status_code >= 300:
        raise PinchError(resp.status_code, resp.text)
    return resp.json()


def get_transfer(transfer_id: str, merchant_id: str) -> dict:
    """GET /transfers/{id} — a transfer is Pinch actually sending funds to a
    bank account, as opposed to a payment merely being approved.

    Returns id (tra_XXX), transferDate, amount (net cents), currency, totalFees,
    reference, accountName, bsb, accountNumber, status and a `summary` array
    broken down by Settlements / Dishonours / Application Fees / Transfer Fee /
    Refunds.
    """
    return _get(f"/transfers/{transfer_id}", merchant_id)


def list_transfer_line_items(transfer_id: str, merchant_id: str,
                             page: int = 1, page_size: int = 500) -> dict:
    """GET /transfers/items/{id} — the individual payments inside a transfer.

    Paginated: returns page, pageSize, totalPages, totalItems and `data`, where
    each item carries id, type, gross, fees, total, currency, description,
    transactionDate and metadata. `metadata` comes back as a JSON *string* —
    the same string payments.py wrote — so it still contains impulseBookingId.
    """
    return _get(
        f"/transfers/items/{transfer_id}", merchant_id,
        params={"page": page, "pageSize": page_size},
    )


def iter_transfer_line_items(transfer_id: str, merchant_id: str) -> list:
    """Every line item across all pages, in Pinch's order."""
    items: list = []
    page = 1
    while True:
        body = list_transfer_line_items(transfer_id, merchant_id, page=page)
        items.extend(body.get("data") or [])
        if page >= int(body.get("totalPages") or 1):
            return items
        page += 1


def create_refund(input: dict, merchant_id: str) -> dict:
    """POST /refunds — input: paymentId, amount (cents), reason, nonce. Returns refund ref_XXX.

    NOTE: present for API completeness only. Impulse deposits are non-refundable —
    nothing in the app calls this.
    """
    return _post("/refunds", input, merchant_id)


# ── Managed merchants (onboarding a venue as its own sub-merchant) ───────────
#
# Field names below are frozen against a live sandbox probe, not the docs — the
# guide at docs/managed-merchant-onboarding is stale (its POST /merchants/upload-document
# 404s) and the API reference's create schema misspells legalStreetAddress as
# "legalSreetAddress", which Pinch silently drops rather than rejecting.


def create_managed_merchant(input: dict) -> dict:
    """
    POST /merchants/managed — create a sub-merchant under the master account.

    Sent with master credentials and NO Current-Merchant header; every call made
    on the new merchant's behalf afterwards must carry it.

    input requires: companyName, companyEmail, bankAccountRoutingNumber (6-digit
    BSB), bankAccountNumber (3-9 digits), contacts (>=1), ipAddress, userAgent.
    Contacts require email, contactType (owner|director|shareholder|executive)
    and isPrimaryContact; firstName, lastName, phone, dob and `ownership`
    (a percentage, which does round-trip despite being undocumented on the way in)
    are optional. The ABN goes in companyRegistrationNumber.

    Returns the merchant: `id` (mch_XXX), `contacts` each with an `id` (con_XXX)
    needed to attach identity documents, and a `compliance` object.
    """
    return _post("/merchants/managed", input, None)


def list_managed_merchants() -> list:
    """GET /merchants/managed — every sub-merchant under the master account."""
    url = f"{PINCH_BASE_URL}/merchants/managed"
    resp = httpx.get(url, headers=_headers(None), timeout=_TIMEOUT)
    if resp.status_code < 200 or resp.status_code >= 300:
        raise PinchError(resp.status_code, resp.text)
    return resp.json()


def get_managed_merchant(merchant_id: str) -> Optional[dict]:
    """
    The one sub-merchant, or None. Pinch exposes no GET /merchants/{id}, so this
    lists them all and filters — fine at our scale, and the only way to read a
    merchant's live compliance state back.
    """
    for merchant in list_managed_merchants():
        if merchant.get("id") == merchant_id:
            return merchant
    return None


def upload_merchant_document(
    merchant_id: str,
    document_type: str,
    filename: str,
    content: bytes,
    content_type: str,
    contact_id: Optional[str] = None,
) -> dict:
    """
    POST /merchants/documents — one compliance document, multipart, one file per call.

    Form fields are PascalCase: File, DocumentType, and ContactId (which attaches
    an identity-document to a specific director/UBO — without it the document is
    filed against the merchant generally and Pinch cannot tell whose ID it is).

    document_type: identity-document | financial-document | business-registration
    | additional-verification. Max 20MB.

    Returns {"id": "doc_XXX", "documentType": ..., "filename": ...}.

    NOTE: `content` is the caller's raw file bytes. Nothing in here logs it, the
    filename, or the response beyond the document id — these are identity documents.
    """
    data = {"DocumentType": document_type}
    if contact_id:
        data["ContactId"] = contact_id
    resp = httpx.post(
        f"{PINCH_BASE_URL}/merchants/documents",
        files={"File": (filename, content, content_type)},
        data=data,
        headers=_headers_multipart(merchant_id),
        timeout=_TIMEOUT,
    )
    if resp.status_code < 200 or resp.status_code >= 300:
        raise PinchError(resp.status_code, resp.text)
    return resp.json()


def create_webhook(input: dict, merchant_id: str) -> dict:
    """
    POST /webhooks — subscribe to events for one sub-merchant.
    input: uri, eventTypes (list), format ("camelCase" or PascalCase by default).

    Returns id (wbk_XXX), uri, eventTypes and `secret` (whsec_XXX) — the HMAC key
    for verifying deliveries to that uri. Store the secret; Pinch will not show it again.
    """
    return _post("/webhooks", input, merchant_id)
