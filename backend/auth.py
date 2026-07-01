import os
import threading
from typing import Optional

import httpx
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

load_dotenv()

SUPABASE_URL: str = os.environ["SUPABASE_URL"]
_JWKS_URL = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"

_bearer = HTTPBearer()
_optional_bearer = HTTPBearer(auto_error=False)

# ── JWKS cache ────────────────────────────────────────────────────────────────
# Fetched once on first request, refreshed if a new kid is seen.

_jwks_lock = threading.Lock()
_jwks_cache: Optional[dict] = None


def _load_jwks() -> dict:
    global _jwks_cache
    with _jwks_lock:
        if _jwks_cache is None:
            resp = httpx.get(_JWKS_URL, timeout=10)
            resp.raise_for_status()
            _jwks_cache = resp.json()
    return _jwks_cache


def _get_key_for_token(token: str) -> dict:
    """Return the JWKS key matching the token's kid, refreshing cache once if needed."""
    global _jwks_cache
    try:
        header = jwt.get_unverified_header(token)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token header")

    kid = header.get("kid")

    for attempt in range(2):
        jwks = _load_jwks()
        for key in jwks.get("keys", []):
            if kid is None or key.get("kid") == kid:
                return key
        # kid not found — bust cache and retry once
        with _jwks_lock:
            _jwks_cache = None

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token signing key not found",
    )


def _decode(token: str) -> dict:
    key = _get_key_for_token(token)
    alg = jwt.get_unverified_header(token).get("alg", "RS256")
    try:
        return jwt.decode(token, key, algorithms=[alg], audience="authenticated")
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    """
    Verify a Supabase-issued JWT and return the decoded payload.
    Supports both RS256 (new JWT Signing Keys) and HS256 (legacy).
    """
    return _decode(credentials.credentials)


def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_optional_bearer),
) -> Optional[dict]:
    """Returns the decoded JWT payload if a valid token is present, else None."""
    if credentials is None:
        return None
    try:
        return _decode(credentials.credentials)
    except HTTPException:
        return None
