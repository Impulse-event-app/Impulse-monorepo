"""Sign in with Apple: token exchange and revocation.

App Store Review 5.1.1(v) requires apps offering Sign in with Apple to revoke
the user's Apple tokens when they delete their account. Supabase handles the
sign-in itself but never keeps Apple's refresh token, so the app hands us the
one-time authorization code right after sign-in, we exchange it here for a
refresh token, store it on the user, and revoke it on account deletion.

Config (all from a Sign in with Apple key in Apple Developer -> Keys):
  APPLE_TEAM_ID      10-char team id
  APPLE_KEY_ID       10-char key id
  APPLE_PRIVATE_KEY  PEM contents of the downloaded .p8 (literal "\\n" ok)
  APPLE_CLIENT_ID    the iOS bundle id; defaults to au.impulseapp.impulse
"""
import logging
import os
import time
from typing import Optional

import httpx
from jose import jwt

logger = logging.getLogger("impulse.apple")

APPLE_AUDIENCE = "https://appleid.apple.com"
APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token"
APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke"

# Apple caps client secrets at 6 months; we mint a fresh short-lived one per call.
CLIENT_SECRET_TTL_SECONDS = 5 * 60


class AppleError(Exception):
    def __init__(self, status_code: int, body: str):
        super().__init__(f"Apple returned {status_code}: {body}")
        self.status_code = status_code
        self.body = body


def _config() -> Optional[dict]:
    team_id = os.environ.get("APPLE_TEAM_ID")
    key_id = os.environ.get("APPLE_KEY_ID")
    private_key = os.environ.get("APPLE_PRIVATE_KEY")
    if not (team_id and key_id and private_key):
        return None
    return {
        "team_id": team_id,
        "key_id": key_id,
        # Dashboards often store multi-line secrets with escaped newlines.
        "private_key": private_key.replace("\\n", "\n"),
        "client_id": os.environ.get("APPLE_CLIENT_ID") or "au.impulseapp.impulse",
    }


def is_configured() -> bool:
    return _config() is not None


def client_secret(cfg: dict, now: Optional[int] = None) -> str:
    """The ES256 JWT Apple accepts as client_secret."""
    now = int(now if now is not None else time.time())
    return jwt.encode(
        {
            "iss": cfg["team_id"],
            "iat": now,
            "exp": now + CLIENT_SECRET_TTL_SECONDS,
            "aud": APPLE_AUDIENCE,
            "sub": cfg["client_id"],
        },
        cfg["private_key"],
        algorithm="ES256",
        headers={"kid": cfg["key_id"]},
    )


def exchange_code(authorization_code: str) -> Optional[str]:
    """Exchange a one-time authorization code for Apple's refresh token.

    Returns None when Apple isn't configured (a no-op until the env vars are
    set). Raises AppleError if Apple refuses the code."""
    cfg = _config()
    if cfg is None:
        logger.warning("Apple authorization code received but APPLE_* env vars are unset; not storing a token")
        return None
    resp = httpx.post(
        APPLE_TOKEN_URL,
        data={
            "client_id": cfg["client_id"],
            "client_secret": client_secret(cfg),
            "code": authorization_code,
            "grant_type": "authorization_code",
        },
        timeout=15,
    )
    if resp.status_code >= 400:
        raise AppleError(resp.status_code, resp.text)
    return resp.json().get("refresh_token")


def revoke_refresh_token(refresh_token: str) -> bool:
    """Revoke a stored refresh token. Never raises: returns True on success,
    False (after logging) if Apple isn't configured or the call fails."""
    cfg = _config()
    if cfg is None:
        logger.error("Cannot revoke Apple token: APPLE_* env vars are unset")
        return False
    try:
        resp = httpx.post(
            APPLE_REVOKE_URL,
            data={
                "client_id": cfg["client_id"],
                "client_secret": client_secret(cfg),
                "token": refresh_token,
                "token_type_hint": "refresh_token",
            },
            timeout=15,
        )
    except Exception as exc:  # network, bad key, etc.
        logger.error("Revoking Apple token failed: %s", exc)
        return False
    if resp.status_code >= 400:
        logger.error("Revoking Apple token failed: %s %s", resp.status_code, resp.text)
        return False
    return True
