"""
Outbound email over SMTP.

Provider-agnostic on purpose: the same handful of settings work for a Google
Workspace app password, Resend, Postmark, Mailgun and SES, so changing provider
is a config change rather than a code one.

    SMTP_HOST       smtp.gmail.com / smtp.resend.com / …
    SMTP_PORT       587 (STARTTLS, default) or 465 (implicit TLS)
    SMTP_USER       login
    SMTP_PASSWORD   app password or API key
    SMTP_FROM       optional; defaults to SMTP_USER

Unlike push.py this does NOT swallow failures. A push that goes missing costs a
notification; a venue enquiry that goes missing costs a venue. So send_email
raises, and the caller decides what to tell the person who filled the form in.
"""
import logging
import os
import smtplib
from email.message import EmailMessage
from typing import List, Optional

logger = logging.getLogger("impulse.mailer")


class MailNotConfigured(RuntimeError):
    """No SMTP credentials in the environment."""


class MailSendFailed(RuntimeError):
    """Credentials are present but the SMTP conversation failed."""


def _setting(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


def is_configured() -> bool:
    """True when there is enough in the environment to attempt a send."""
    return bool(
        _setting("SMTP_HOST") and _setting("SMTP_USER") and _setting("SMTP_PASSWORD")
    )


def send_email(
    to: List[str],
    subject: str,
    body: str,
    reply_to: Optional[str] = None,
) -> None:
    """Send one plain-text message. Raises MailNotConfigured or MailSendFailed."""
    recipients = [a.strip() for a in (to or []) if a and a.strip()]
    if not recipients:
        raise ValueError("send_email needs at least one recipient")

    if not is_configured():
        raise MailNotConfigured(
            "SMTP_HOST, SMTP_USER and SMTP_PASSWORD must all be set"
        )

    host = _setting("SMTP_HOST")
    port = int(_setting("SMTP_PORT", "587"))
    user = _setting("SMTP_USER")
    password = _setting("SMTP_PASSWORD")
    sender = _setting("SMTP_FROM") or user

    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = ", ".join(recipients)
    msg["Subject"] = subject
    if reply_to:
        # So hitting reply in the inbox answers the venue, not ourselves.
        msg["Reply-To"] = reply_to
    msg.set_content(body)

    try:
        # 465 is implicit TLS, everything else negotiates STARTTLS. Both end up
        # encrypted; the difference is only when the handshake happens.
        if port == 465:
            with smtplib.SMTP_SSL(host, port, timeout=15) as server:
                server.login(user, password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=15) as server:
                server.starttls()
                server.login(user, password)
                server.send_message(msg)
    except Exception as e:
        raise MailSendFailed(str(e)) from e

    logger.info("Sent %r to %s", subject, ", ".join(recipients))
