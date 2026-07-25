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


def send_push(token: str, title: str, body: str, data: Optional[dict] = None) -> None:
    """Send one notification to one Expo push token. Never raises."""
    send_push_many([{"to": token, "title": title, "body": body, "data": data or {}}])


def send_push_many(messages: List[dict]) -> None:
    """Send a batch of Expo push messages. Never raises."""
    messages = [m for m in messages if m.get("to")]
    if not messages:
        return
    try:
        resp = httpx.post(EXPO_PUSH_URL, json=messages, timeout=10)
        logger.info("Expo push: sent %d message(s), status %s: %s",
                    len(messages), resp.status_code, resp.text[:500])
    except Exception as e:
        logger.warning("Expo push failed (%d message(s)): %s", len(messages), e)
