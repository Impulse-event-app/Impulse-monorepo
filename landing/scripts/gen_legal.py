"""Generate landing/{privacy,terms,support}/index.html from one template.
Run from the repo root: python3 landing/scripts/gen_legal.py landing
Text mirrors mobile-sdk54/app/(user)/legal/[doc].tsx (plus a website section)."""
import html
import pathlib
import sys

OUT = pathlib.Path(sys.argv[1])

MARK = ("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23C80815'/%3E"
        "%3Ccircle cx='16' cy='16' r='10.8' fill='none' stroke='%23fff' stroke-width='.8'/%3E%3Ccircle cx='16' cy='16' r='6.1' fill='none' stroke='%23fff' stroke-width='1.4'/%3E"
        "%3Ccircle cx='16' cy='16' r='2.1' fill='%23fff'/%3E%3C/svg%3E")

E_SUPPORT = '<a href="mailto:support@impulseapp.au">support@impulseapp.au</a>'
E_PRIVACY = '<a href="mailto:privacy@impulseapp.au">privacy@impulseapp.au</a>'
OAIC = '<a href="https://www.oaic.gov.au">oaic.gov.au</a>'


def t(s):  # plain text → escaped
    return html.escape(s, quote=False)


PAGES = {
    "privacy": {
        "title": "Privacy policy",
        "desc": "What Impulse collects, why, who sees it, and how to delete it.",
        "updated": "Last updated 16 November 2026",
        "intro": "This policy explains what we collect, why, and the choices you have. It covers the Impulse app, the venue portal and this website. We aim to collect only what we need to run Impulse.",
        "sections": [
            ("Who we are", [
                "Impulse (“we”, “us”) runs the Impulse app, the venue portal and impulseapp.au from Sydney, Australia. We handle personal information under the Australian Privacy Principles in the Privacy Act 1988 (Cth).",
                f"Questions or requests: {E_PRIVACY}.",
            ]),
            ("What we collect in the app", [
                "Account details: your name, your mobile number (required, and verified by a text message code), your email address if you sign in with one, and which sign-in method you use (Apple, Google, email or SMS code).",
                "What you tell us during setup: that you are 18 or over, your home suburb, favourite activities, usual party size and any access needs you choose to share. Access needs can be health-related, so we only use them to point out venues that support them, and you can leave them blank.",
                "Bookings: the deals you book, times, party size, who you split a booking with, door codes and payment status.",
                "Payments: your card is entered into, and stored by, our payment processor Stripe. We keep only a reference to your card (such as brand and last four digits) and never see or store the full number.",
                "Activity in the app: which venues you open, used to put more relevant deals first.",
                "Device: a push notification token if you allow notifications.",
                "Contacts, only if you choose “Find friends in contacts” and allow access: the phone numbers and email addresses in your contacts are scrambled (hashed) on your phone, and only those scrambled values are sent to check which of your contacts are on Impulse. We do not store them, and your contacts’ names never leave your phone.",
                "We do not use advertising or analytics trackers, and we do not track you across other companies’ apps or websites.",
            ]),
            ("What we collect on this website", [
                "If you join the waitlist: your name, email address, area, the activities you’re interested in and any referral code. We use it to let you know when Impulse opens near you, and you can ask us to remove it at any time.",
                "If you send a venue enquiry: the details you put in the form, used only to reply to you.",
                "This website sets no advertising or analytics cookies.",
            ]),
            ("How we use it", [
                "To run your account, show you relevant deals, process and confirm bookings and split payments, send booking updates and invites, prevent fraud, and provide support. We do not sell your personal information.",
            ]),
            ("Location", [
                "If you allow location access, the app uses it once, on your phone, to suggest your home suburb. Your precise location is not sent to or stored by Impulse, and it is never used in the background. Only the suburb you choose is saved.",
            ]),
            ("Who can see your information", [
                "Venues you book with see your name, party size, booking time and door code.",
                "People in a split booking or huddle with you see your display name and your share. Someone who has your mobile number (or your Google or Apple email) saved in their contacts can find you to invite you to a booking; they see your display name, never your number. There is no public search of Impulse users.",
                "Service providers that help us run Impulse: Stripe (payments), Supabase (accounts and database), Render (servers), Vercel (websites), Expo and Apple (push notifications), Apple and Google (sign-in) and our SMS provider (sign-in and verification codes). Some of them store data outside Australia, including in the United States, under their own security and privacy commitments.",
                "We may disclose information where the law requires it.",
            ]),
            ("How long we keep it", [
                "We keep your account information until you delete your account. Booking and payment records are kept without your name or contact details for up to 7 years, as required for tax and accounting. Waitlist details are kept until Impulse launches in your area or you ask us to remove them.",
            ]),
            ("Your rights", [
                "You can delete your account at any time in the app: open You, then Delete account. That removes your profile, preferences, activity, saved cards and sign-in straight away, and revokes Sign in with Apple.",
                f"If you can’t get into the app, email {E_PRIVACY} from the address or with the phone number on your account and we’ll delete it for you. You can also ask us to access or correct your information.",
                f"If you are unhappy with how we have handled your information, email us first. You can also complain to the Office of the Australian Information Commissioner ({OAIC}).",
            ]),
        ],
    },
    "terms": {
        "title": "Terms of service",
        "desc": "The terms for using Impulse and booking deals at venues.",
        "updated": "Last updated 16 November 2026",
        "intro": "These terms govern your use of Impulse. By creating an account or booking a deal, you agree to them. Please read them carefully.",
        "sections": [
            ("1. Your account", [
                "You must be 18 or over to hold an account and to book deals at venues that serve alcohol. Each account needs a mobile number verified by a text message code. You are responsible for activity on your account and for keeping your login secure.",
            ]),
            ("2. Bookings & payments", [
                "Impulse is a marketplace connecting you with venues; the venue provides the experience. When you book a deal, you enter an agreement with that venue, and we process payment on their behalf at the price shown.",
                "When you book, we place a hold on your card for your share of the price. The hold is charged when the venue checks you in. If your booking is more than six days away, we save your card when you book and place the hold closer to the date.",
                "In a split booking, each person’s share is held on their own card. If a share is still unpaid at the deadline, the person who made the booking agreed to cover it, and it is held on their card.",
                "You authorise us to save the card you use and to place holds and charge it for your bookings as described in these terms. If a hold can’t be placed, we’ll ask you to update your card; if it still can’t be charged, the venue may ask you to pay at the door.",
            ]),
            ("3. Cancellations", [
                "The 10% deposit on each booking is non-refundable. If you cancel a plan before it is checked in, the deposit is charged and the rest of the hold is released. The same applies if nobody from your booking shows up.",
                "Venues may cancel where a deal can no longer be honoured, in which case your hold is released in full and nothing is charged.",
            ]),
            ("4. Conduct", [
                "Venues may refuse service consistent with the law and their own policies, including for intoxication or unsafe behaviour. Refused entry for such reasons is treated as a no-show.",
            ]),
            ("5. Liability", [
                "To the extent permitted by law, Impulse is not liable for the acts of venues or for indirect loss. Nothing in these terms excludes rights you have under the Australian Consumer Law.",
            ]),
            ("6. Changes & governing law", [
                "We may update these terms; continued use means you accept the changes. These terms are governed by the laws of New South Wales, Australia.",
            ]),
            ("7. Contact", [
                f"Questions about these terms: {E_SUPPORT}.",
            ]),
        ],
    },
    "support": {
        "title": "Help & support",
        "desc": "Get help with Impulse bookings, payments and your account.",
        "updated": "Support hours: 9am–9pm Sydney time, 7 days",
        "intro": f"Stuck on something? Most answers are below. If you still need a hand, email {E_SUPPORT} and we’ll get back to you within one business day.",
        "sections": [
            ("Contact us", [
                f"Email {E_SUPPORT} with your account email or mobile number and the venue name, and we’ll sort it. For anything urgent at a venue, speak to their staff first.",
                f"Privacy questions or data requests: {E_PRIVACY}.",
                "Venues: sign in to the venue portal at <a href=\"https://venues.impulseapp.au\">venues.impulseapp.au</a>, or use “Talk to us” on our <a href=\"/#venues\">home page</a>.",
            ]),
            ("Booking a drop", [
                "When you find a deal you like, tap “Book now” and pick a time. Your spot is yours the moment your card is held, and a door code appears under Plans.",
                "Show that code at the venue to redeem. Codes are single-use and tied to your account.",
            ]),
            ("Payments & refunds", [
                "When you book, we hold the discounted price on your card. Nothing is charged until the venue checks you in with your door code, and then the hold is charged. No surprises at the door.",
                "Your card is saved securely with our payment provider, Stripe, so you can book again in one tap. You can remove it any time in the You tab.",
                "If you cancel, or nobody from your booking shows up, the 10% deposit is kept and the rest of the hold is released. If the venue cancels, the whole hold is released. Released holds can take a few days to disappear from your bank statement.",
            ]),
            ("Managing your bookings", [
                "Every booking lives under the Plans tab, with its status, time and code. Tap one to view it, or to cancel a booking you made. Huddles are cancelled from the huddle screen.",
            ]),
            ("Inviting friends", [
                "In a booking, tap to add people. You can pick people you’ve booked with before, find friends from your phone’s contacts, or send a link to anyone who isn’t on Impulse yet.",
            ]),
            ("Signing in", [
                "You can sign in with Apple, Google, email or a text message code. Every account needs a verified mobile number.",
                "Forgot your password? On the email sign-in screen, enter your email and tap “Forgot password?”. We’ll email you a six-digit code to set a new one.",
            ]),
            ("Deleting your account", [
                f"In the app, open You, then Delete account. It happens straight away. If you can’t get into the app, email {E_PRIVACY} and we’ll do it for you.",
            ]),
        ],
    },
}

NAV = [("support", "Help"), ("terms", "Terms"), ("privacy", "Privacy")]

CSS = """
:root{color-scheme:light;--paper:#EBEBEB;--ink:#0A0A0A;--red:#C80815;--red-deep:#A50611;--muted:#5F5F63;--hairline:rgba(10,10,10,.14);
--sans:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",Helvetica,Arial,sans-serif;--pad:clamp(18px,2.2vw,28px)}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:var(--paper);color:var(--ink);font-family:var(--sans);font-size:17px;line-height:1.55;letter-spacing:-.01em;-webkit-font-smoothing:antialiased;text-size-adjust:100%}
a{color:var(--red);text-underline-offset:2px}
a:hover{color:var(--red-deep)}
a:focus-visible{outline:2px solid var(--red);outline-offset:3px;border-radius:4px}
.wrap{max-width:720px;margin:0 auto;padding:0 var(--pad)}
.bar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 0;border-bottom:1px solid var(--hairline)}
.brand{display:inline-flex;align-items:center;gap:10px;color:var(--ink);text-decoration:none;font-weight:600;font-size:17px}
.brand img{width:28px;height:28px}
.bar nav{display:flex;gap:18px;flex-wrap:wrap}
.bar nav a{color:var(--muted);text-decoration:none;font-size:15px}
.bar nav a[aria-current=page]{color:var(--ink);font-weight:500}
.bar nav a:hover{color:var(--ink)}
header.doc{padding:clamp(36px,7vw,64px) 0 8px}
h1{font-size:clamp(34px,6vw,48px);line-height:1.05;letter-spacing:-.035em;font-weight:600;margin:0 0 12px}
.updated{color:var(--muted);font-size:14px;margin:0}
.intro{font-size:19px;line-height:1.5;margin:22px 0 0}
section{padding:26px 0 2px;border-top:1px solid var(--hairline);margin-top:30px}
h2{font-size:21px;letter-spacing:-.02em;font-weight:600;margin:0 0 10px}
section p{margin:0 0 12px}
footer{margin:56px 0 0;padding:20px 0 40px;border-top:1px solid var(--hairline);color:var(--muted);font-size:13px;display:flex;flex-wrap:wrap;gap:8px 18px;justify-content:space-between}
footer a{color:var(--muted)}
"""


def render(key, page):
    nav = "".join(
        f'<a href="/{k}/"{" aria-current=page" if k == key else ""}>{label}</a>' for k, label in NAV
    )
    secs = "\n".join(
        f'    <section>\n      <h2>{t(h)}</h2>\n' + "".join(f"      <p>{p}</p>\n" for p in body) + "    </section>"
        for h, body in page["sections"]
    )
    return f"""<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{t(page['title'])} · Impulse</title>
  <meta name="description" content="{html.escape(page['desc'])}">
  <meta name="theme-color" content="#EBEBEB">
  <meta name="color-scheme" content="light">
  <link rel="canonical" href="https://impulseapp.au/{key}/">
  <link rel="icon" href="{MARK}">
  <!-- Generated from one template; keep in step with the in-app text in
       mobile-sdk54/app/(user)/legal/[doc].tsx. -->
  <style>{CSS}</style>
</head>
<body>
  <div class="wrap">
    <div class="bar">
      <a class="brand" href="/"><img src="{MARK}" alt="" width="28" height="28">Impulse</a>
      <nav aria-label="Legal and support">{nav}</nav>
    </div>
    <main>
    <header class="doc">
      <h1>{t(page['title'])}</h1>
      <p class="updated">{t(page['updated'])}</p>
      <p class="intro">{page['intro']}</p>
    </header>
{secs}
    </main>
    <footer>
      <span>Impulse · Made in Sydney</span>
      <span><a href="/support/">Help</a> · <a href="/terms/">Terms</a> · <a href="/privacy/">Privacy</a></span>
    </footer>
  </div>
</body>
</html>
"""


for key, page in PAGES.items():
    d = OUT / key
    d.mkdir(parents=True, exist_ok=True)
    (d / "index.html").write_text(render(key, page))
    print("wrote", d / "index.html")
