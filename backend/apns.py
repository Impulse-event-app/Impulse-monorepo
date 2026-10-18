"""
Apple Push Notification service, direct — for Live Activity updates only.

Expo's push service doesn't carry Live Activity pushes, so these go straight
to APNs with token-based auth (an ES256 JWT signed with the team's .p8 key).
Fire-and-forget like push.py: failures are logged, never raised.

Env (all four, or nothing is sent):
  APNS_KEY_ID     the key's 10-character ID
  APNS_TEAM_ID    the Apple Developer team ID
  APNS_KEY        the .p8 file's contents (literal "\\n" is accepted)
  APNS_BUNDLE_ID  the app's bundle ID, e.g. au.impulseapp.impulse
"""
import logging
import os
import threading
import time
from typing import Optional, Tuple

import httpx
from jose import jwt

logger = logging.getLogger("impulse.apns")

HOSTS = {
    "production": "https://api.push.apple.com",
    "sandbox": "https://api.sandbox.push.apple.com",
}
# APNs rejects a token older than an hour and throttles minting new ones
# more than every 20 minutes, so reuse one for 50.
TOKEN_TTL = 50 * 60

# Sent, the token is gone (activity ended / app deleted), or anything else.
OK, DEAD, FAILED = "ok", "dead", "failed"

_lock = threading.Lock()
_jwt: Optional[Tuple[str, float]] = None
_client: Optional[httpx.Client] = None


def _env(name: str) -> str:
    return os.environ.get(name, "").strip()


def configured() -> bool:
    return all(_env(n) for n in ("APNS_KEY_ID", "APNS_TEAM_ID", "APNS_KEY", "APNS_BUNDLE_ID"))


def auth_token() -> str:
    global _jwt
    with _lock:
        if _jwt and time.time() - _jwt[1] < TOKEN_TTL:
            return _jwt[0]
        issued = time.time()
        key = _env("APNS_KEY").replace("\\n", "\n")
        token = jwt.encode({"iss": _env("APNS_TEAM_ID"), "iat": int(issued)}, key,
                           algorithm="ES256", headers={"kid": _env("APNS_KEY_ID")})
        _jwt = (token, issued)
        return token


def _http() -> httpx.Client:
    global _client
    with _lock:
        if _client is None:
            _client = httpx.Client(http2=True, timeout=10)
        return _client


def headers(priority: int) -> dict:
    return {
        "authorization": f"bearer {auth_token()}",
        "apns-push-type": "liveactivity",
        "apns-topic": f"{_env('APNS_BUNDLE_ID')}.push-type.liveactivity",
        "apns-priority": str(priority),
    }


def _post(environment: str, token: str, payload: dict, priority: int) -> Tuple[int, str]:
    resp = _http().post(f"{HOSTS[environment]}/3/device/{token}", json=payload, headers=headers(priority))
    reason = ""
    if resp.status_code != 200:
        try:
            reason = resp.json().get("reason", "")
        except Exception:
            reason = resp.text[:200]
    return resp.status_code, reason


def send_live_activity(token: str, environment: str, payload: dict, priority: int = 5) -> Tuple[str, str]:
    """Send one Live Activity push. Returns (OK | DEAD | FAILED, the
    environment that answered). A production BadDeviceToken is retried on
    sandbox, since development builds get sandbox tokens. Never raises."""
    if not configured():
        return FAILED, environment
    try:
        status, reason = _post(environment, token, payload, priority)
        if status == 400 and reason == "BadDeviceToken" and environment == "production":
            environment = "sandbox"
            status, reason = _post(environment, token, payload, priority)
        if status == 200:
            return OK, environment
        if status == 410 or reason in ("BadDeviceToken", "Unregistered"):
            return DEAD, environment
        logger.warning("APNs live activity push rejected for %s…: %s %s", token[:12], status, reason)
        return FAILED, environment
    except Exception as e:
        logger.warning("APNs live activity push failed for %s…: %s", token[:12], e)
        return FAILED, environment
