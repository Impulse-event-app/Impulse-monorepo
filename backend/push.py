"""
Expo push notifications. Fire-and-forget: failures are logged, never raised —
a dead push must not break a payment or resolution flow.

Tokens are Expo push tokens (ExponentPushToken[...]) registered by the mobile
app after the user grants notification permission. Web sessions have no push
token; they get the same information live via realtime/polling screens.
"""
import logging
from typing import List, Optional

import httpx

logger = logging.getLogger("impulse.push")

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

# For pushes that ask someone to pay before a deadline. iOS lets them through
# Focus and keeps them on the Lock Screen (needs the app's time-sensitive
# entitlement; without it iOS quietly treats them as normal). Android shows
# them as a heads-up banner.
URGENT = {"interruptionLevel": "time-sensitive", "priority": "high"}


def send_push(token: str, title: str, body: str, data: Optional[dict] = None) -> None:
    """Send one notification to one Expo push token. Never raises."""
    send_push_many([{"to": token, "title": title, "body": body, "data": data or {}}])


def send_push_many(messages: List[dict]) -> Optional[str]:
    """Send a batch of Expo push messages. Never raises. Returns Expo's raw
    response (or the transport error) for callers that want to show it."""
    messages = [m for m in messages if m.get("to")]
    if not messages:
        return None
    try:
        resp = httpx.post(EXPO_PUSH_URL, json=messages, timeout=10)
        logger.info("Expo push: sent %d message(s), status %s: %s",
                    len(messages), resp.status_code, resp.text[:500])
        _log_ticket_errors(messages, resp)
        return f"{resp.status_code} {resp.text[:500]}"
    except Exception as e:
        logger.warning("Expo push failed (%d message(s)): %s", len(messages), e)
        return f"request failed: {e}"


def _log_ticket_errors(messages: List[dict], resp: httpx.Response) -> None:
    """Expo answers 200 even when a message is rejected — the reason is in the
    per-message ticket. Surface those (e.g. InvalidCredentials when the iOS
    APNs key isn't on EAS, DeviceNotRegistered for an uninstalled app) so a
    push that never arrives isn't silent."""
    try:
        tickets = resp.json().get("data") or []
    except Exception:
        return
    for msg, ticket in zip(messages, tickets):
        if ticket.get("status") == "error":
            logger.warning("Expo push rejected for %s…: %s (%s)",
                           str(msg.get("to"))[:30], ticket.get("message"),
                           (ticket.get("details") or {}).get("error"))
