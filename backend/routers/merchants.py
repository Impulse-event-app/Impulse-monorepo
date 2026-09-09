"""Pinch managed merchant onboarding for a venue.

A venue becomes its own Pinch sub-merchant so its takings settle to its own bank
account instead of pooling in the single hardcoded Impulse merchant. This router
covers account creation and compliance only — it does not reroute any charge.
Every venue with a NULL pinch_merchant_id keeps charging exactly as it does today.

Ordering is forced by Pinch: contacts only exist once the merchant is created, and
an identity document can only be attached to a contact that exists, so the merchant
must be created before any document can be uploaded.

Security note, because these are identity documents: uploaded bytes are streamed
straight through to Pinch and never written to disk, storage or the database.
Nothing here logs a filename, a document's contents, or any part of an ID number.
"""
import logging
import os
from datetime import datetime, timezone
from typing import List, Optional
from urllib.parse import urlparse

from fastapi import (
    APIRouter, Depends, File, Form, HTTPException, Request, UploadFile,
)
from sqlalchemy.orm import Session

import pinch_client
from auth import get_current_user
from database import get_db
from models import MerchantDocument, Venue
from pinch_client import PinchError
from routers.venues import _assert_owner, _get_venue_or_404
from schemas import (
    DOCUMENT_TYPES,
    MerchantComplianceResponse,
    MerchantDocumentResponse,
    OnboardingDraft,
    OnboardingDraftRead,
)

logger = logging.getLogger("impulse.merchants")

router = APIRouter()

# Public base URL Pinch should call back on. Falls back to the request's own host,
# which is right in production but is localhost in dev — where Pinch cannot reach
# it. Set this so dev and production behave identically.
PINCH_WEBHOOK_BASE_URL: str = os.environ.get("PINCH_WEBHOOK_BASE_URL", "").rstrip("/")

# Pinch's own cap. Enforced here as well so an oversized upload is rejected
# before we spend a round trip on it.
MAX_DOCUMENT_BYTES = 20 * 1024 * 1024

# Deliberately narrower than the 16 types Pinch accepts. A compliance document is
# a scan or a photo; text/html, application/zip and application/json are on Pinch's
# list but have no business being someone's driver's licence.
ALLOWED_CONTENT_TYPES = {
    "application/pdf": (b"%PDF",),
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/tiff": (b"II*\x00", b"MM\x00*"),
}

# What a venue must supply before Pinch can review them. Surfaced to the UI so the
# venue sees a checklist rather than an unexplained "pending".
_REQUIRED_DOCUMENT_TYPES = ("financial-document", "business-registration")


# ── Ownership ────────────────────────────────────────────────────────────────

def require_owned_venue(
    venue_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Venue:
    """The server-side authorisation for every route in this file.

    Reuses the canonical helpers from routers.venues rather than adding another
    inline copy of the same check. The UI also hides other venues, but that is
    cosmetic — this is the check that counts.
    """
    venue = _get_venue_or_404(venue_id, db)
    _assert_owner(venue, user)
    return venue


# ── Draft ────────────────────────────────────────────────────────────────────

def _read_draft(venue: Venue) -> OnboardingDraftRead:
    """The stored draft with the bank account number removed.

    The number has to survive from the bank step to submission, so it does live in
    the draft column in between — but it must never travel back out to a client,
    not even to the venue that typed it.
    """
    raw = dict(venue.onboarding_draft or {})
    raw.pop("bank_account_number", None)
    draft = OnboardingDraftRead(**raw)
    draft.bank_account_last3 = venue.bank_account_last3
    return draft


@router.get("/venues/{venue_id}/onboarding", response_model=OnboardingDraftRead)
def get_onboarding(venue: Venue = Depends(require_owned_venue)):
    return _read_draft(venue)


@router.put("/venues/{venue_id}/onboarding", response_model=OnboardingDraftRead)
def save_onboarding(
    body: OnboardingDraft,
    venue: Venue = Depends(require_owned_venue),
    db: Session = Depends(get_db),
):
    """Save progress. Merges over the stored draft so one step's save cannot wipe
    another's, and keeps a previously-saved bank number when this save omits it."""
    if venue.pinch_merchant_id:
        raise HTTPException(status_code=409, detail="This venue's merchant account already exists")

    existing = dict(venue.onboarding_draft or {})
    incoming = body.model_dump(exclude_none=True)
    if not incoming.get("bank_account_number") and existing.get("bank_account_number"):
        incoming["bank_account_number"] = existing["bank_account_number"]
    merged = {**existing, **incoming}

    account_number = (merged.get("bank_account_number") or "").strip()
    venue.onboarding_draft = merged
    venue.abn = merged.get("abn") or venue.abn
    venue.afsl_held = merged.get("afsl_held", venue.afsl_held)
    venue.afsl_number = merged.get("afsl_number") or venue.afsl_number
    venue.austrac_registered = merged.get("austrac_registered", venue.austrac_registered)
    venue.bank_account_name = merged.get("bank_account_name") or venue.bank_account_name
    venue.bank_bsb = merged.get("bank_bsb") or venue.bank_bsb
    if account_number:
        venue.bank_account_last3 = account_number[-3:]

    db.commit()
    db.refresh(venue)
    logger.info("Onboarding draft saved for venue %s (steps: %s)",
                venue.id, merged.get("completed_steps"))
    return _read_draft(venue)


# ── Create the merchant ──────────────────────────────────────────────────────

def _compose_notes(draft: dict) -> str:
    """AFSL and AUSTRAC have no field anywhere in the Pinch API, but their own
    compliance guide asks for both. They go in the free-text notes so a reviewer
    sees them, and are stored on the venue as the record of what was declared."""
    lines = []
    if draft.get("afsl_held") is not None:
        if draft.get("afsl_held"):
            lines.append(f"AFSL: yes (number: {draft.get('afsl_number') or 'not supplied'})")
        else:
            lines.append("AFSL: no")
    if draft.get("austrac_registered") is not None:
        lines.append(f"AUSTRAC registered: {'yes' if draft['austrac_registered'] else 'no'}")
    if draft.get("shares_held_in_trust"):
        lines.append("Company shares are held in a trust; trust deed supplied as additional-verification.")
    return "\n".join(lines)


def build_merchant_payload(draft: dict, ip_address: str, user_agent: str) -> dict:
    """Turn a saved draft into the POST /merchants/managed body.

    Frozen against a live sandbox probe rather than the docs. Two traps:
    the API reference spells the address field "legalSreetAddress", which Pinch
    accepts and then silently discards — the working name is legalStreetAddress.
    And the ABN belongs in companyRegistrationNumber; there is no `abn` field.
    """
    missing = [f for f in ("company_name", "company_email", "bank_bsb", "bank_account_number")
               if not (draft.get(f) or "").strip()]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required details: {', '.join(missing)}")

    contacts = draft.get("contacts") or []
    if not contacts:
        raise HTTPException(status_code=400, detail="At least one contact is required")
    if not any(c.get("is_primary_contact") for c in contacts):
        contacts[0]["is_primary_contact"] = True

    bsb = "".join(ch for ch in (draft.get("bank_bsb") or "") if ch.isdigit())
    account_number = "".join(ch for ch in (draft.get("bank_account_number") or "") if ch.isdigit())
    if len(bsb) != 6:
        raise HTTPException(status_code=400, detail="BSB must be 6 digits")
    if not 3 <= len(account_number) <= 9:
        raise HTTPException(status_code=400, detail="Account number must be between 3 and 9 digits")

    payload = {
        "companyName": draft["company_name"].strip(),
        "companyEmail": draft["company_email"].strip(),
        "bankAccountRoutingNumber": bsb,
        "bankAccountNumber": account_number,
        "ipAddress": ip_address,
        "userAgent": user_agent,
        "contacts": [
            {
                "firstName": c.get("first_name"),
                "lastName": c.get("last_name"),
                "email": c["email"],
                "phone": c.get("phone"),
                "contactType": c["contact_type"],
                "isPrimaryContact": bool(c.get("is_primary_contact")),
                "dob": c.get("dob"),
                "streetAddress": c.get("street_address"),
                "suburb": c.get("suburb"),
                "state": c.get("state"),
                "postcode": c.get("postcode"),
                "country": c.get("country") or "AU",
                "ownership": c.get("ownership"),
            }
            for c in contacts
        ],
    }

    optional = {
        "legalEntityName": draft.get("legal_entity_name"),
        "companyPhone": draft.get("company_phone"),
        "companyWebsiteUrl": draft.get("company_website_url"),
        "companyRegistrationNumber": draft.get("abn"),
        "bankAccountName": draft.get("bank_account_name"),
        "legalStreetAddress": draft.get("legal_street_address"),
        "legalSuburb": draft.get("legal_suburb"),
        "legalState": draft.get("legal_state"),
        "legalPostcode": draft.get("legal_postcode"),
        "legalCountry": draft.get("legal_country") or "AU",
        "natureOfBusiness": draft.get("nature_of_business"),
        "organisationType": draft.get("organisation_type"),
        "notes": _compose_notes(draft) or None,
    }
    payload.update({k: v for k, v in optional.items() if v})
    return payload


def _client_ip(request: Request) -> str:
    """Pinch requires the external IP of the person creating the merchant. Taken
    from the request, never from the client body, so it cannot be spoofed by the
    form itself."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "0.0.0.0"


@router.post("/venues/{venue_id}", response_model=MerchantComplianceResponse, status_code=201)
def create_merchant(
    request: Request,
    venue: Venue = Depends(require_owned_venue),
    db: Session = Depends(get_db),
):
    """Create the sub-merchant from the saved draft, then register its webhook."""
    if venue.pinch_merchant_id:
        raise HTTPException(status_code=409, detail="This venue's merchant account already exists")

    draft = dict(venue.onboarding_draft or {})
    payload = build_merchant_payload(
        draft, _client_ip(request), request.headers.get("user-agent", "impulse-venue-web")
    )

    try:
        merchant = pinch_client.create_managed_merchant(payload)
    except PinchError as e:
        logger.error("Pinch merchant creation failed for venue %s: %s %s",
                     venue.id, e.status_code, e.body)
        raise HTTPException(status_code=502, detail=f"Pinch rejected the merchant details: {e.body}")

    merchant_id = merchant.get("id")
    if not merchant_id:
        logger.error("Pinch returned no merchant id for venue %s: %s", venue.id, merchant)
        raise HTTPException(status_code=502, detail="Pinch returned no merchant id")

    compliance = merchant.get("compliance") or {}
    venue.pinch_merchant_id = merchant_id
    venue.pinch_compliance_status = compliance.get("status")
    venue.pinch_submission_status = compliance.get("submissionStatus")
    venue.pinch_compliance_updated_at = datetime.now(timezone.utc)
    venue.pinch_contacts = [
        {
            "contact_id": c.get("id"),
            "contact_type": c.get("contactType"),
            "first_name": c.get("firstName"),
            "last_name": c.get("lastName"),
            "ownership": c.get("ownership"),
            "is_ubo": bool(c.get("isUbo")),
            "is_primary_contact": bool(c.get("isPrimaryContact")),
        }
        for c in (merchant.get("contacts") or [])
    ]

    # The account number has done its job. It is not stored in a column and it is
    # not left sitting in the draft.
    draft.pop("bank_account_number", None)
    venue.onboarding_draft = draft
    db.commit()
    db.refresh(venue)

    _register_compliance_webhook(request, venue, db)
    return _compliance_response(venue, db, compliance)


def _is_publicly_reachable(base: str) -> bool:
    """Whether Pinch could actually POST to this host. Guards the common mistake
    of onboarding a venue from a dev machine and silently registering localhost."""
    host = (urlparse(base).hostname or "").lower()
    if not host or not base.startswith("https://"):
        return False
    return not (
        host in ("localhost", "127.0.0.1", "0.0.0.0", "::1")
        or host.endswith(".local")
        or host.startswith(("10.", "192.168.", "172.16.", "169.254."))
    )


def _register_compliance_webhook(request: Request, venue: Venue, db: Session) -> None:
    """Subscribe to this merchant's compliance-updated events.

    The compliance-updated payload carries no merchant id — only a submission id —
    so the venue is identified by the URL Pinch was told to call. Each venue gets
    its own uri and its own whsec_ signing secret.

    A failure here does not undo the merchant: it exists at Pinch either way, and
    the status endpoint reads live state as a fallback.
    """
    base = PINCH_WEBHOOK_BASE_URL or str(request.base_url).rstrip("/")
    if not _is_publicly_reachable(base):
        # The uri is baked into the webhook at creation time and Pinch will not
        # retry it into existence later, so registering a localhost callback would
        # leave this merchant permanently unreachable. Skip instead: GET /status
        # re-reads compliance live, so onboarding still works — it just updates
        # when the page is opened rather than the moment Pinch decides.
        logger.error(
            "Skipping compliance webhook for venue %s: %r is not publicly reachable. "
            "Set PINCH_WEBHOOK_BASE_URL to the deployed API's base URL.",
            venue.id, base,
        )
        return

    uri = f"{base}/webhooks/pinch/compliance/{venue.id}"
    try:
        hook = pinch_client.create_webhook(
            {"uri": uri, "eventTypes": ["compliance-updated"], "format": "camelCase"},
            venue.pinch_merchant_id,
        )
    except PinchError as e:
        logger.error("Compliance webhook registration failed for venue %s: %s %s",
                     venue.id, e.status_code, e.body)
        return
    venue.pinch_webhook_secret = hook.get("secret")
    db.commit()


# ── Documents ────────────────────────────────────────────────────────────────

def _label_for(document_type: str, contact: Optional[dict]) -> str:
    """A label we generate. The uploader's own filename is never recorded — ID
    document filenames routinely contain the holder's name and licence number."""
    base = document_type.replace("-", " ").capitalize()
    if contact:
        name = " ".join(filter(None, [contact.get("first_name"), contact.get("last_name")]))
        if name:
            return f"{base} — {name}"
    return base


def _validate_upload(content: bytes, declared_type: str) -> None:
    """Server-side content-type and size checks. The browser is not trusted: the
    declared type must be on the allowlist AND the leading bytes must agree with it,
    so a renamed .exe cannot ride in as application/pdf."""
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="File is empty")
    if len(content) > MAX_DOCUMENT_BYTES:
        raise HTTPException(status_code=413, detail="File must be under 20MB")
    signatures = ALLOWED_CONTENT_TYPES.get(declared_type)
    if signatures is None:
        raise HTTPException(
            status_code=415,
            detail="File must be a PDF, JPEG, PNG or TIFF",
        )
    if not any(content.startswith(sig) for sig in signatures):
        raise HTTPException(
            status_code=415,
            detail=f"File contents do not look like a {declared_type} file",
        )


@router.post("/venues/{venue_id}/documents", response_model=MerchantDocumentResponse, status_code=201)
async def upload_document(
    document_type: str = Form(...),
    contact_id: Optional[str] = Form(None),
    file: UploadFile = File(...),
    venue: Venue = Depends(require_owned_venue),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Forward one compliance document to Pinch. Nothing is persisted but metadata."""
    if not venue.pinch_merchant_id:
        raise HTTPException(
            status_code=409,
            detail="Create the merchant account before uploading documents",
        )
    if document_type not in DOCUMENT_TYPES:
        raise HTTPException(status_code=400, detail="Unknown document type")

    contact = None
    if contact_id:
        contact = next((c for c in (venue.pinch_contacts or [])
                        if c.get("contact_id") == contact_id), None)
        if contact is None:
            raise HTTPException(status_code=400, detail="Unknown contact for this venue")

    # Read with a hard stop one byte past the limit, so an oversized upload is
    # rejected without buffering all of it.
    content = await file.read(MAX_DOCUMENT_BYTES + 1)
    declared_type = (file.content_type or "").split(";")[0].strip().lower()
    _validate_upload(content, declared_type)

    # A generated, non-identifying filename. Pinch echoes whatever it is given, and
    # the venue's own filename is not something we want in Pinch's UI or our logs.
    safe_name = f"{document_type}{_EXTENSIONS[declared_type]}"

    try:
        result = pinch_client.upload_merchant_document(
            merchant_id=venue.pinch_merchant_id,
            document_type=document_type,
            filename=safe_name,
            content=content,
            content_type=declared_type,
            contact_id=contact_id,
        )
    except PinchError as e:
        logger.error("Pinch document upload failed for venue %s (%s): %s %s",
                     venue.id, document_type, e.status_code, e.body)
        raise HTTPException(status_code=502, detail=f"Pinch rejected the document: {e.body}")

    document = MerchantDocument(
        venue_id=venue.id,
        pinch_document_id=result["id"],
        document_type=document_type,
        pinch_contact_id=contact_id,
        label=_label_for(document_type, contact),
        size_bytes=len(content),
        content_type=declared_type,
        uploaded_by=user["sub"],
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    # Document type, size and the Pinch id only — never the filename or contents.
    logger.info("Document uploaded for venue %s: type=%s bytes=%d pinch_id=%s",
                venue.id, document_type, len(content), result["id"])
    return document


_EXTENSIONS = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/tiff": ".tif",
}


# ── Status ───────────────────────────────────────────────────────────────────

def _outstanding(venue: Venue, documents: List[MerchantDocument]) -> List[str]:
    """What the venue still has to do, in plain words."""
    if not venue.pinch_merchant_id:
        return ["Complete and submit your business details"]

    items: List[str] = []
    supplied = {d.document_type for d in documents}
    if "financial-document" not in supplied:
        items.append("Upload a bank statement for the settlement account")
    if "business-registration" not in supplied:
        items.append("Upload your ASIC extract or ABN registration")

    with_identity = {d.pinch_contact_id for d in documents
                     if d.document_type == "identity-document"}
    for contact in (venue.pinch_contacts or []):
        if contact.get("contact_id") not in with_identity:
            name = " ".join(filter(None, [contact.get("first_name"), contact.get("last_name")]))
            items.append(f"Upload photo ID for {name or 'each director and beneficial owner'}")
    return items


def _compliance_response(venue: Venue, db: Session, compliance: Optional[dict] = None
                         ) -> MerchantComplianceResponse:
    documents = (db.query(MerchantDocument)
                 .filter(MerchantDocument.venue_id == venue.id)
                 .order_by(MerchantDocument.created_at)
                 .all())
    compliance = compliance or {}
    return MerchantComplianceResponse(
        venue_id=venue.id,
        pinch_merchant_id=venue.pinch_merchant_id,
        compliance_status=venue.pinch_compliance_status,
        submission_status=venue.pinch_submission_status,
        merchant_status=venue.pinch_merchant_status,
        compliance_notes=venue.pinch_compliance_notes,
        updated_at=venue.pinch_compliance_updated_at,
        live_enabled=bool(compliance.get("liveEnabled")),
        transactions_enabled=bool(compliance.get("transactionsEnabled")),
        settlements_enabled=bool(compliance.get("settlementsEnabled")),
        can_publish_deals=can_publish_deals(venue),
        contacts=venue.pinch_contacts or [],
        documents=[MerchantDocumentResponse.model_validate(d) for d in documents],
        outstanding=_outstanding(venue, documents),
    )


def can_publish_deals(venue: Venue) -> bool:
    """A venue that has never been onboarded is unaffected by any of this — that is
    every venue predating this flow, and they must keep working. Once a venue has a
    merchant, it has to clear compliance before its deals can go live, because a
    published deal takes money that would otherwise have nowhere to settle."""
    if not venue.pinch_merchant_id:
        return True
    return venue.pinch_merchant_status == "active"


@router.get("/venues/{venue_id}/status", response_model=MerchantComplianceResponse)
def get_status(
    venue: Venue = Depends(require_owned_venue),
    db: Session = Depends(get_db),
):
    """Stored status, refreshed from Pinch so a missed webhook cannot leave a
    venue looking stuck when it has actually been approved."""
    compliance = None
    if venue.pinch_merchant_id:
        try:
            merchant = pinch_client.get_managed_merchant(venue.pinch_merchant_id)
        except PinchError as e:
            logger.error("Could not refresh compliance for venue %s: %s %s",
                         venue.id, e.status_code, e.body)
            merchant = None
        if merchant:
            compliance = merchant.get("compliance") or {}
            venue.pinch_compliance_status = compliance.get("status")
            venue.pinch_submission_status = compliance.get("submissionStatus")
            if compliance.get("liveEnabled") and compliance.get("transactionsEnabled"):
                venue.pinch_merchant_status = "active"
            db.commit()
            db.refresh(venue)
    return _compliance_response(venue, db, compliance)
