import logging
import os
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

import payments
import pinch_client
import wallet
from auth import SUPABASE_URL, get_current_user
from database import get_db
from models import Booking, BookingParticipant, PaymentMethod, User, UserVenueInteraction, Venue
from schemas import (
    UserSearchResult,
    PaymentMethodCreate,
    PaymentMethodResponse,
    PushTokenRegister,
    UserResponse,
    UserUpdate,
)

logger = logging.getLogger("impulse.users")

router = APIRouter()

SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")


SEARCH_MIN_CHARS = 3
SEARCH_LIMIT = 8


def _search_name(u: User) -> str:
    return (u.full_name or "").strip() or "Impulse member"


@router.get("/search", response_model=List[UserSearchResult])
def search_users(
    q: Optional[str] = Query(None, max_length=80),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Find a friend to invite into a booking.

    Privacy: returns only an id and a display name — never email or phone.
    Names match by word prefix and need at least 3 characters; an email or
    phone number only matches exactly, so the directory can't be browsed by
    contact details. With no query, returns people you've already shared a
    booking with, most recent first. Capped at 8 results."""
    me = user["sub"]
    # People I've been in a booking with — shown first, and on their own when q is empty.
    mine = db.query(BookingParticipant.booking_id).filter(BookingParticipant.user_id == me)
    recent_rows = (
        db.query(User, func.max(BookingParticipant.joined_at).label("last"))
        .join(BookingParticipant, BookingParticipant.user_id == User.id)
        .filter(BookingParticipant.booking_id.in_(mine), User.id != me)
        .group_by(User.id)
        .order_by(func.max(BookingParticipant.joined_at).desc())
        .limit(SEARCH_LIMIT)
        .all()
    )
    recent_ids = {u.id for u, _ in recent_rows}

    term = (q or "").strip()
    if len(term) < SEARCH_MIN_CHARS:
        return [UserSearchResult(id=u.id, display_name=_search_name(u), recent=True) for u, _ in recent_rows]

    like = term.replace("%", "").replace("_", "")
    matches = (
        db.query(User)
        .filter(
            User.id != me,
            or_(
                User.full_name.ilike(f"{like}%"),
                User.full_name.ilike(f"% {like}%"),
                func.lower(User.email) == term.lower(),
                User.phone == term,
            ),
        )
        .limit(SEARCH_LIMIT * 2)
        .all()
    )
    matches.sort(key=lambda u: (u.id not in recent_ids, _search_name(u).lower()))
    return [
        UserSearchResult(id=u.id, display_name=_search_name(u), recent=u.id in recent_ids)
        for u in matches[:SEARCH_LIMIT]
    ]


@router.get("/me", response_model=UserResponse)
def get_me(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Return the calling user's profile."""
    row = db.query(User).filter(User.id == user["sub"]).first()
    if not row:
        raise HTTPException(status_code=404, detail="User profile not found")
    return row


@router.patch("/me", response_model=UserResponse)
def update_me(
    body: UserUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Update (or create) the calling user's onboarding / profile fields."""
    row = db.query(User).filter(User.id == user["sub"]).first()
    if not row:
        # First-time sign-in via email/password — create the row now.
        row = User(id=user["sub"], email=user.get("email"))
        db.add(row)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


# ── Account deletion ──────────────────────────────────────────────────────────
# App Store Review 5.1.1(v): an account created in the app must be deletable in
# the app. What goes and what stays:
#   - gone: the profile row, saved cards (detached at Pinch too), recommender
#     interactions, and the Supabase auth identity (so they can't sign back in)
#   - kept, anonymised: bookings (financial records) and huddle seats (other
#     members' group state). Their user_id is set to NULL; the huddle seat's
#     display name is scrubbed.
# Venue owners are refused — their venue, deals and payouts would go with them.


def _delete_auth_user(user_id: str) -> None:
    """Remove the Supabase auth user. Idempotent: an already-missing user is fine."""
    if not SUPABASE_SERVICE_ROLE_KEY:
        logger.error("Account deletion requested but SUPABASE_SERVICE_ROLE_KEY is unset")
        raise HTTPException(status_code=503, detail="Account deletion isn't available right now. Try again later.")
    resp = httpx.delete(
        f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        },
        timeout=15,
    )
    if resp.status_code == 404:
        return
    if resp.status_code >= 400:
        logger.error("Deleting auth user %s failed: %s %s", user_id, resp.status_code, resp.text)
        raise HTTPException(status_code=502, detail="Couldn't delete your account. Try again.")


@router.delete("/me", status_code=204)
def delete_me(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Permanently delete the caller's account. See the section comment above."""
    uid = user["sub"]

    if db.query(Venue.id).filter(Venue.owner_id == uid).first():
        raise HTTPException(
            status_code=409,
            detail="This account runs a venue, so it can't be deleted here. Email support@impulse.app and we'll close it with you.",
        )

    row = db.query(User).filter(User.id == uid).first()

    # 1. Detach saved cards at Pinch first. Nothing will point at them once the
    #    user row is gone, so a failure here must stop the deletion. A source
    #    Pinch no longer knows about (400) is already detached.
    if row and row.pinch_payer_id:
        for method in db.query(PaymentMethod).filter(PaymentMethod.user_id == uid).all():
            try:
                pinch_client.delete_source(row.pinch_payer_id, method.pinch_source_id, wallet.PINCH_MERCHANT_ID)
            except payments.PinchError as exc:
                if exc.status_code != 400:
                    logger.error("Detaching source %s during account deletion failed: %s %s",
                                 method.pinch_source_id, exc.status_code, exc.body)
                    raise HTTPException(status_code=502, detail="Couldn't remove your saved cards. Try again.")

    # 2. Anonymise what we keep, then remove what we don't — one transaction.
    #    Unlinking explicitly (rather than relying on the FK's ON DELETE SET
    #    NULL) means a database that hasn't had the migration applied fails
    #    loudly on the NOT NULL constraint instead of cascading bookings away.
    try:
        db.query(Booking).filter(Booking.user_id == uid).update(
            {Booking.user_id: None}, synchronize_session=False,
        )
        db.query(BookingParticipant).filter(BookingParticipant.user_id == uid).update(
            {BookingParticipant.user_id: None, BookingParticipant.display_name: "Former member"},
            synchronize_session=False,
        )
        db.query(UserVenueInteraction).filter(UserVenueInteraction.user_id == uid).delete(synchronize_session=False)
        db.query(PaymentMethod).filter(PaymentMethod.user_id == uid).delete(synchronize_session=False)
        db.query(User).filter(User.id == uid).delete(synchronize_session=False)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        logger.error("Account deletion for %s hit a constraint (is the keep-bookings migration applied?): %s", uid, exc)
        raise HTTPException(status_code=503, detail="Account deletion isn't available right now. Try again later.")

    # 3. Remove the sign-in identity. If this fails the data is already gone and
    #    a retry finishes the job (every step above is a no-op the second time).
    _delete_auth_user(uid)


@router.put("/me/push-token", status_code=204)
def register_push_token(
    body: PushTokenRegister,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Store the caller's Expo push token (for huddle + booking notifications)."""
    row = db.query(User).filter(User.id == user["sub"]).first()
    if not row:
        row = User(id=user["sub"], email=user.get("email"))
        db.add(row)
    row.expo_push_token = body.expo_push_token
    db.commit()


# ── Saved cards ───────────────────────────────────────────────────────────────
# One Pinch payer per user, created once; each saved card is a source vaulted
# against it. This is what stops a returning customer minting a fresh payer on
# every booking.


def _get_or_create_user(db: Session, user: dict) -> User:
    row = db.query(User).filter(User.id == user["sub"]).first()
    if not row:
        row = User(id=user["sub"], email=user.get("email"))
        db.add(row)
        db.flush()
    return row


@router.get("/me/payment-methods", response_model=List[PaymentMethodResponse])
def list_payment_methods(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """The caller's saved cards, default first then newest."""
    return (
        db.query(PaymentMethod)
        .filter(PaymentMethod.user_id == user["sub"])
        .order_by(PaymentMethod.is_default.desc(), PaymentMethod.created_at.desc())
        .all()
    )


@router.post("/me/payment-methods", response_model=PaymentMethodResponse, status_code=201)
def add_payment_method(
    body: PaymentMethodCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Vault a CaptureJs token against the caller's payer and keep it on file."""
    row = _get_or_create_user(db, user)
    payer_id = wallet.ensure_payer(
        row, first_name=body.first_name, last_name=body.last_name, email=body.email,
    )

    try:
        source = payments.vault_source(
            payer_id=payer_id, token=body.token, merchant_id=wallet.PINCH_MERCHANT_ID,
        )
    except payments.PinchError as exc:
        # Roll back the payer we may have just created rather than leaving the
        # user pointing at one with no usable card.
        db.rollback()
        logger.warning("Vaulting a card failed for user %s: %s %s",
                       user["sub"], exc.status_code, exc.body)
        raise HTTPException(status_code=402, detail="That card couldn't be saved.")

    # save_source() always makes the new card default, which is right for the
    # first one and for an explicit request; otherwise keep the existing default.
    previous_default = (
        db.query(PaymentMethod)
        .filter(PaymentMethod.user_id == row.id, PaymentMethod.is_default == True)
        .first()
    )
    method = wallet.save_source(db, row, source)
    if previous_default and not body.make_default:
        method.is_default = False
        db.flush()
        previous_default.is_default = True

    db.commit()
    db.refresh(method)
    return method


@router.delete("/me/payment-methods/{method_id}", status_code=204)
def delete_payment_method(
    method_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Detach a saved card from Pinch and forget it locally."""
    method = (
        db.query(PaymentMethod)
        .filter(PaymentMethod.id == method_id, PaymentMethod.user_id == user["sub"])
        .first()
    )
    if not method:
        raise HTTPException(status_code=404, detail="Payment method not found")

    row = db.query(User).filter(User.id == user["sub"]).first()
    if row and row.pinch_payer_id:
        try:
            pinch_client.delete_source(
                row.pinch_payer_id, method.pinch_source_id, wallet.PINCH_MERCHANT_ID,
            )
        except payments.PinchError as exc:
            # A source Pinch no longer knows about (400 "not found") should
            # still disappear from the user's wallet — anything else is a real
            # failure and must not silently leave a card the user believes is gone.
            if exc.status_code != 400:
                logger.error("Detaching source %s failed: %s %s",
                             method.pinch_source_id, exc.status_code, exc.body)
                raise HTTPException(status_code=502, detail="Couldn't remove that card. Try again.")
            logger.info("Source %s already gone from Pinch; removing locally", method.pinch_source_id)

    was_default = method.is_default
    db.delete(method)
    db.flush()

    # Promote the newest survivor so the user always has a default to pay with.
    if was_default:
        survivor = (
            db.query(PaymentMethod)
            .filter(PaymentMethod.user_id == user["sub"])
            .order_by(PaymentMethod.created_at.desc())
            .first()
        )
        if survivor:
            survivor.is_default = True

    db.commit()
