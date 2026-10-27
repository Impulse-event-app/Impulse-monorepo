# Impulse Venue Portal: design brief for a visual refresh

> **Goal:** make the venue portal look polished and demo-ready for a client meeting. Keep every screen, field, state and piece of logic described below. This is a visual pass, not a feature change.

## 1. The product

**Impulse** is a Sydney consumer app for last-minute plans. Venues post "drops": discounted openings for tonight. Guests book in one tap and get a **6-digit door code**. Groups book together through the **Huddle** (friends vote on a drop, then split the cost with **Huddle Pay**).

The **Venue Portal** (`venue-web/`) is the desktop web app for venue owners and staff. They use it to:

1. Set up their venue profile (what guests see in the app).
2. Get verified for payments by **Pinch**, the payments provider, so takings settle to their bank account.
3. Publish and manage deals.
4. Watch bookings come in.
5. **Redeem** guest codes at the door. This charges each guest's card.
6. Track payouts to their bank.

- **Audience:** venue owners and managers of bars, restaurants, bowling alleys, karaoke rooms, escape rooms and similar. They aren't designers or finance people. The front-of-house redeem screen is used under pressure, at the door, often on a laptop or tablet.
- **Tone:** confident, calm and operational, in the style of Stripe Dashboard or Linear rather than a marketing site. Copy is short, sentence case and plain-spoken ("Money on its way to your bank account.", "Valid — enjoy!").
- **The pitch on the sign-in screen:** "Fill the room. On impulse."

## 2. Stack and constraints (please design within these)

- **Next.js 16 (App Router), React 19.** Every screen is a client component.
- **Styling:** almost everything is **inline `style={{}}` objects**, built from shared primitives in `src/lib/ui.ts` and CSS variables in `src/app/globals.css`. Tailwind v4 is installed but barely used. Proposals should map onto CSS variables plus a small set of shared style objects, not a new component library.
- **Icons:** `lucide-react` is installed but **unused**. The UI currently uses Unicode glyphs (☰ ✎ ✕ ⏻ ⚿ ↑ › ▼ →). Swapping to Lucide icons is welcome.
- **Fonts:** the **system font only** (SF Pro / Segoe UI / Roboto), weights **400, 500 and 600**. Numbers use tabular figures. There's no mono face. Labels that look "mono" are the system font in uppercase with wide tracking.
- **Themes:** dark (the default) and light, switched by `<html data-theme>` and saved in localStorage. **Both must work.**
- **Desktop-first:** the app shell is a fixed 250px sidebar plus scrolling main content, with **no mobile layout** for the dashboard yet. Only the auth screens collapse below 820px. A tablet-friendly redeem screen would be a bonus.
- **Motion:** CSS only. The existing keyframes are `pm-ring` (logo pulse), `pm-glow` (skeleton shimmer) and `fade-up` (auth form entrance).

## 3. Brand (v2, shared with the mobile app)

- **Impulse Red `#C80815`.** The logo's ground is always exactly this red in both themes. The UI accent in dark mode is the brighter **`#E8202C`**.
- **PulseMark:** a red rounded square (radius 22.5% of its size) with a white outer ring, a thicker white middle ring and a white core dot. SVG viewBox 512: outer ring r172 with stroke 13, middle ring r98 with stroke 22, core dot r34.
- **PulseMarkAnimated:** the same mark with two accent-coloured rings expanding outwards (`pm-ring` 3s, staggered by 1.5s). It's used on the sign-in brand panel.
- **Wordmark:** the mark plus a lowercase **"impulse"** at weight 600 with −0.02em tracking, an 11px gap and 20–24px text.
- **Direction:** neutral greys with red as the **only** brand colour. The status colours (good, warn, bad, info) appear only on badges and alerts.

## 4. Design tokens (`src/app/globals.css`)

### Colour

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | `#0A0A0A` | `#F1F1F4` | page background |
| `--surface` | `#161617` | `#FFFFFF` | cards, sidebar |
| `--surface2` | `#1F1F21` | `#E7E7EC` | table header rows, card headers and footers, venue chip |
| `--sunken` | `#0A0A0A` | `#F1F1F4` | inputs, inset panels, progress-bar tracks |
| `--text` | `#F5F5F7` | `#0A0A0A` | primary text |
| `--muted` | `#98989D` | `#6A6A6F` | secondary text |
| `--faint` | `rgba(245,245,247,.44)` | `#A1A1A6` | labels, placeholders, meta |
| `--line` | text @ .13 | ink @ .10 | hairlines, card borders |
| `--line2` | text @ .24 | ink @ .17 | input and button borders |
| `--accent` | `#E8202C` | `#C80815` | primary buttons, active nav, links, errors |
| `--accent-ink` | `#FFFFFF` | `#FFFFFF` | text on accent |
| `--accent-soft` | red @ .16 | red @ .10 | active nav background, category tags, soft alerts |
| `--good` | `oklch(.74 .13 152)` | `oklch(.62 .13 152)` | paid, approved, success |
| `--warn` | `oklch(.79 .13 74)` | `oklch(.66 .14 66)` | already redeemed, partial success |
| `--bad` | `oklch(.66 .17 28)` | `oklch(.58 .18 28)` | declined, failed, delete |
| `--info` | `oklch(.70 .12 265)` | `oklch(.58 .12 265)` | in review, processing |
| `--shadow` | `0 24px 70px rgba(0,0,0,.55)` | `0 24px 60px rgba(10,10,10,.13)` | (defined, rarely used) |
| `--shadow-sm` | `0 8px 24px rgba(0,0,0,.4)` | `0 8px 24px rgba(10,10,10,.08)` | redeem result cards |

Legacy tokens still in the file: `--chip-bg` and `--ph`.

### Type in use (there's no formal scale yet; these are the sizes actually used)

| Role | Size | Weight | Tracking | Where |
|---|---|---|---|---|
| Hero headline | 52 / lh 1.02 | 600 | −.03em | sign-in brand panel |
| Page title (onboarding) | 38 | 600 | −.02em | onboarding |
| Page title | 32–34 | 600 | −.02em | every dashboard page |
| Big stat number | 30–32 / lh 1 | 600 | −.02em | stat cards, deal price preview |
| Redeem digit | 34 | 600 | tabular | code boxes |
| Auth heading | 28 | 600 | −.02em | sign-in and password screens |
| Section heading | 22 | 600 | −.02em | "Deal performance" |
| Card title | 16–19 | 600 | — | form sections, redeem cards |
| Body | 14–15 | 400–600 | — | rows, descriptions |
| Small / meta | 12–13 | 400 | — | sub-labels, hints |
| **Eyebrow / field label** | **10–12, UPPERCASE** | 400 | **.08–.16em** | above titles, above inputs, table headers |

## 5. Shared primitives (`src/lib/ui.ts`)

| Primitive | Spec |
|---|---|
| `card` | `--surface` background, 1px `--line` border, **radius 18** (many places override this to 16) |
| `fieldLabel` | 11px uppercase, .1em tracking, `--faint`, 9px bottom margin |
| `fieldInput` | padding 12/14, **radius 11**, 1px `--line2` border, `--sunken` background, 14.5px. The border turns `--accent` on a validation error. There's **no focus style**: outlines are removed globally. |
| Placeholder | `--faint` and **italic**, so an empty form doesn't read as filled in |
| `requiredMark` | an accent-coloured `*` after the label, plus a "* Required" legend above the form. Optional fields add "(optional)" in sentence case. |
| `eyebrow` | 11px uppercase, .14em tracking, `--faint` |
| `btnPrimary` | padding 14/26, **radius 12**, accent fill, 600 weight at 14px, glow shadow `0 10px 30px var(--accent-soft)`. Often overridden to padding 12/18 and radius 11. |
| `btnGhost` | padding 14/22, radius 12, 1px `--line2` border, `--surface` fill, 600 weight at 14px |
| `iconBtn` | a 32×32 square, radius 8, `--line2` border, `--muted` glyph |
| `iconBtnDanger` | the same button with a `--bad` glyph and a border tinted 35% `--bad` |
| `switchTrack/Knob` | a 42×24 pill (36×20 compact). On is accent, off is `--line2`. The knob is white with a small shadow; .18s transition. |
| `toneBadge(tone)` | a pill with 5/11 padding, 12px 600 text, capitalised, and a 6px dot. Tones: **soft** (accent-soft), **solid** (accent fill), **neutral**, **danger**, **good** and **info**. The tinted tones use a 12% background and a 30% border via `color-mix`. |
| Category tag | 10px uppercase, .08em tracking, accent text on `--accent-soft`, padding 3/8, radius 6 |
| Progress bar | 5px high, radius 5, `--sunken` track |
| Skeleton | a card-shaped block with `pm-glow` 1.4s infinite. There's no shimmer, just an opacity pulse. |
| Alert, error | radius 12, padding 12/16, 13px, `--accent-soft` background, accent text |
| Alert, success | the same alert with a 12% `--good` background and `--good` text |
| Table | a card with `overflow:hidden`, a header row on `--surface2` (10.5px uppercase `--faint`, padding 14/22) and body rows with a 1px `--line` top border (padding 16–18/22). The grid columns are set per page. |

## 6. App shell

### Sidebar (`components/Sidebar.tsx`): 250px wide, full height

- `--surface` background with a 1px `--line` right border and 24/18 padding.
- **Logo row:** a 30px PulseMark plus "impulse" at 20px/600.
- **Venue chip:** `--surface2`, radius 12, padding 12. It shows a 34px rounded-square initial (accent-soft background, accent letter), the venue name (13px/600, truncated) and the suburb (10px uppercase `--faint`).
  - With **2+ venues** it becomes a dropdown: a ▼ chevron that rotates, an accent border when open, and a floating panel (radius 12, `--line2` border, shadow `0 16px 40px rgba(0,0,0,.28)`, max height 320).
  - The panel has a "Switch venue" eyebrow. Each option shows a 6px dot, the name and the suburb, and the selected option is accent-soft.
- **Nav (7 items):** Dashboard, Venue details, Deals, Bookings, Payouts, Payments setup, Redeem.
  - Each item has 11/12 padding, radius 11 and 14px text.
  - **Active:** `--accent-soft` background, accent text at 600 and an 8×8 accent square marker.
  - **Inactive:** `--muted` text at 500 with a `--faint` marker.
  - There are no icons, only the square markers.
- **Footer** (pinned to the bottom, with a top hairline): a theme toggle ("Dark mode" / "Light mode" with a 16px circle glyph), "⚿ Change password" and "⏻ Sign out", all 13px `--muted`.

### Main area
It scrolls independently with a custom 10px scrollbar (`--line2` thumb). Page padding is **38/44**.

### Full-bleed exception
**Onboarding** hides the sidebar. It shows a centred 840px column with a floating theme pill at the top right.

## 7. Screens

### 7.1 Sign in: `/login` (`AuthShell` + `login/page.tsx`)

**Layout:** a split screen with columns of **1.05fr / .95fr**. The left brand panel is hidden below 820px.

**Left brand panel:** padding 56/60. The background is a radial accent glow from the top left (accent at 16% mixed into `--sunken`), plus a second soft glow at the bottom right. From top to bottom it holds:
- the animated Wordmark (44px mark, 24px text);
- an eyebrow, "VENUE PARTNER PORTAL", in accent at 12px with .16em tracking;
- the headline "Fill the room.<br>On impulse." at 52px;
- the subcopy "Publish a last-minute deal in under a minute and watch bookings land in real time. Your empty tables, discovered." at 16px/1.6 in `--muted`;
- a footer stat line, "2,400+ SEATS FILLED / WK · 340 VENUES", at 12px in `--faint`.

> ⚠️ Those stats are **hard-coded placeholders**. Confirm or remove them before the client sees the screen.

**Right form panel:** content is centred with a max width of 380 and a `fade-up` entrance.
- Heading "Welcome back" at 28px; subtitle "Sign in to your venue dashboard." at 14px in `--muted`.
- **Email** and **Password** inputs: radius 12, padding 14/16, 15px, on `--surface`. A "Forgot password?" link sits to the right of the Password label.
- A full-width submit button, "Sign in →" (15px padding, radius 12, accent glow). While busy it reads "Signing in…" at opacity .6.
- Footer: "Need a venue account? Talk to our team" (the link is currently `#`).

**Floating theme pill:** fixed at top right, a 9px glowing accent dot plus "Dark"/"Light".

### 7.2 Forgot password: `/forgot-password`
- Uses the same shell.
- Heading: "Reset your password". Subtitle: "Enter the email you sign in with and we'll send you a link…"
- Contains an Email field and a "Send reset link →" button.
- **Sent state:** a green success alert reads "If there's an account for **x**, a reset link is on its way…". The wording deliberately doesn't confirm whether the account exists.
- Footer: "← Back to sign in".

### 7.3 Reset / change password: `/reset-password`
- **Loading:** "Loading…" in `--faint`.
- **Expired link:** heading "This link has expired", explanatory copy, and a full-width "Send a new link →" button.
- **Form:**
  - Heading "Set a new password". Subtitle: "For **email**. Pick something you don't use anywhere else."
  - Fields: New password (placeholder "At least 8 characters") and Confirm new password.
  - Button: "Save password →".
  - Errors: "Use at least 8 characters." and "The two passwords don't match."
- Footer: "← Back to dashboard".

### 7.4 Onboarding: `/dashboard/onboarding` (full bleed)
- Eyebrow, in accent: "STEP 1 OF 2 · SET UP YOUR VENUE".
- Title "Tell us about your venue" at 38px, with intro copy at 15px in `--muted`.
- Below that is the **VenueForm** (§7.6) with the submit label "Create venue →". On success it goes straight to Payments setup (step 2).
- **Error state:** a centred card (max width 460) titled "Can't confirm your venue", with copy explaining that setup is paused to avoid creating a duplicate, an "Error 500 · message" line in small `--faint`, and a "Try again" button.

### 7.5 Dashboard home: `/dashboard`

**Header** (bottom-aligned, space-between):
- Left: a date eyebrow such as "TUESDAY · 27 OCT" and a title, "Good evening, Manoj" (34px). The greeting depends on the time of day, and the name is derived from the email.
- Right: a ghost "Redeem ticket" button and a primary "+ New deal" button.

**Payments banner.** It's hidden once Pinch has approved the venue. Otherwise it's a card with padding 20 containing a badge, a heading, detail text and a button. It has three variants:

| Variant | Badge | Heading | Button |
|---|---|---|---|
| Not started | soft, "Not started" | "Set up payments to get paid directly" | "Start setup" |
| Pending | info, "Pending" | "Verification in progress" | "View status" |
| Rejected | danger, "Action needed", plus a red-tinted border | "Pinch needs something corrected" | — |

If there are outstanding items it also shows a meta line such as "3 items outstanding".

**Stat cards:** a 4-column grid (2 columns below 1000px) with a 16px gap. Each card has radius 16, padding 22, a **3px accent bar along the top edge**, an 8px accent dot with an 11px uppercase label, the value at 32px, and a sub-label at 12px in `--faint`.

| Card | Example value | Sub-label |
|---|---|---|
| Bookings today | 12 | "Across all deals" |
| Revenue today | $1,240.00 | "Confirmed today" |
| Spots filled | 34/60 | "57% of capacity" |
| Active deals | 3 | "Live right now" |

While loading, it shows four 128px skeletons.

**Second row:** a two-column grid at **1.5fr / 1fr**.
- **Recent bookings card** (radius 16, padding 24):
  - Title "Recent bookings" (17px) with an accent "View all →" link.
  - Up to 4 rows, each with the code (accent, tabular, 64px wide), the deal title (truncated), "7:30pm · 4p" in `--muted` and the amount in 600.
  - Empty state: "No bookings yet."
- **Quick actions card:** a diagonal gradient from accent at 14% into `--surface`, with a `--line2` border. Title "Quick actions", subtitle "Publish a deal or check in a guest." It holds two stacked tiles (padding 16, radius 12):
  - "+ New deal" / "Fill empty tables tonight"
  - "Redeem ticket" / "Enter a 6-digit code"

**Deal performance:**
- Eyebrow "DEAL INSIGHTS — HELPING YOU FIND YOUR BEST WINDOW", then the section title "Deal performance" (22px).
- Cards sit in a 2-column grid (1 column below 1000px). Each card has radius 16 and padding 20.
  - **Top:** the deal title (15px/600) with a category tag on the left. On the right: "50% off" (17px/600) and a time window such as "Mon 10am — 1pm".
  - **Metrics** (below a hairline, in a 3-column grid of 1fr / 1fr / 1.3fr). Each metric has a 10px uppercase label and a 19px/600 value:
    - "SPOTS FILLED" — 14 / 20, with "/ 20" in `--faint`
    - "FILL RATE" — 70%
    - "LIVE → LAST BOOKING" — "2h 15m", or "—"
  - **Fill bar:** 5px. It's `--good` at 80% or above, accent at 40% or above, and `--muted` below 40%.
- Empty state: "No completed deals yet — insights appear once a deal has run."

**Venue load error:** a centred card titled "Couldn't load your venue". The copy depends on the cause: if the session can't be verified it asks the owner to sign out and back in; on a connection problem it says the venue is safe. It shows an error code line and a "Try again" button.

### 7.6 Venue details: `/dashboard/venue` (also used inside onboarding)
- Max width 840, bottom padding 80.
- Title "Venue details", intro "This is what guests see when your deals surface…", and a green "Venue details saved." alert after saving.

**VenueForm sections:**
1. **"* Required" legend.**
2. **Hero photo:** 220px tall, radius 18.
   - Empty: a dashed 1.5px `--line2` border over a **diagonal-stripe background** (surface/surface2, 12px bands), with a 46px accent-soft circle showing "↑", the line "Drop a photo or click to upload" and "JPG / PNG · max 5MB". While uploading the line reads "Uploading…".
   - Filled: the image with `object-fit: cover` and a dark translucent "Remove" pill at the top right.
3. **Card "The basics"** (padding 28, 2-column grid):
   - Venue name* (full width; placeholder "e.g. The Lantern Room")
   - Category* (select)
   - Phone (optional)
   - Description (optional; textarea of 3 rows, full width)
4. **Card "Location & contact"** (grid 2fr / 1fr): Street address* ("e.g. 112 Crown Street"), Suburb* ("e.g. Surry Hills"), Email (optional) and Website (optional).
5. **Card "Opening hours"** (sub-copy: "Toggle a day off to mark it closed."):
   - Seven rows, Mon–Sun, each with a compact switch and the day name in a 150px column.
   - Open days show two 130px time inputs with "to" between them. Closed days show "CLOSED" in uppercase `--faint`.
   - If the stored hours couldn't be parsed, an accent alert appears above the rows.
6. **Card "Accessibility features":**
   - Sub-copy: "Guests filter on these to match their access needs. Select all that apply."
   - A grid of toggle tiles (auto-fill, minimum 230px). Each tile has padding 14/16, radius 12 and an 18px checkbox square.
   - Selected tiles get an accent border, an accent-soft background and a filled accent checkbox with ✓.
   - The 7 options are: Wheelchair access, Step-free entry, Accessible bathroom, Hearing assistance, Vision assistance, Low-sensory / quiet space and Service animal friendly.
7. **Submit button,** right-aligned: "Save changes" (onboarding uses "Create venue →").

**Validation messages** (12px/600 accent text below the field): "Venue name is required", "Include a street number, e.g. 123 Main St", "Suburb is required", "Enter a valid phone number" and "Enter a valid email address".

**Categories:** Bar, Restaurant, Cafe, Bowling, Mini Golf, Escape Room, Arcade, Pool / Billiards, Karaoke and Other.

### 7.7 Deals list: `/dashboard/deals`
- Eyebrow "YOUR DEALS", title "Deals", and a "+ New deal" primary button on the right.
- **Table** columns `2.4fr 1.2fr 1.2fr 1.4fr .8fr 1fr`: **Deal · Date · Price · Spots · Active · Actions**.
  - **Deal:** the title (14.5px/600) with a category tag below it.
  - **Date:** free text such as "Tonight · 6–9pm", 13px in `--muted`.
  - **Price:** the deal price (15px/600) next to the original price, struck through, 12px in `--faint`. The unit ("pp") appears below.
  - **Spots:** "**8** / 20 left" above a 5px bar showing the share filled. The bar is accent, or `--bad` when the deal is sold out.
  - **Active:** a switch that toggles immediately.
  - **Actions:** three icon buttons: ☰ bookings, ✎ edit and ✕ delete (danger). Delete uses the browser's native `confirm()`.
- Loading: three 72px skeletons.
- Empty state: "No deals yet." with an accent "Create your first deal →" link.

### 7.8 New deal / Edit deal: `/dashboard/deals/new` and `/dashboard/deals/[id]/edit`
- Max width 760, with a "← Back to deals" text link, the title "New deal" or "Edit deal", and the **DealForm**.

**DealForm cards** (each has padding 28 and a 22px gap):
1. **Basics** (no title; grid 2fr / 1fr):
   - Title ("Two-for-one cocktails")
   - Category (select)
   - Date (full width, **free text**, "Tonight · 6–9pm")
   - Description (textarea)
2. **Pricing** (grid 1fr 1fr 1fr auto):
   - Original price ($)
   - Discount (%)
   - Unit ("pp")
   - A **live "DEAL PRICE" readout** at 30px/600 in accent (for example $18.00), or "—".
3. **Time slots:**
   - Sub-copy: "Type a slot and press Enter to add."
   - Added slots show as accent-soft pills (8/12 padding, tabular) with a × to remove them.
   - Input placeholder: "e.g. 6:30pm".
   - Error if empty: "Add at least one time slot".
4. **Capacity** (two columns): Total spots and Max group size (default 6).
5. **Deal active row:** "Deal active" with the sub-copy "Visible to guests immediately." and a switch on the right.
6. **Actions,** right-aligned: a ghost "Cancel" and a primary "Save deal" (which reads "Saving…" while busy).

### 7.9 Bookings: `/dashboard/bookings?deal_id=…`
- Eyebrow "BOOKINGS" and the title "Bookings".
- **Deal filter pills:** one pill per deal, wrapping (padding 9/15, radius 999, 13px/600).
  - Selected: accent fill with white text.
  - Unselected: `--surface` with a `--line2` border and `--muted` text.
- **Table** with 6 equal columns: **Code · Slot · Party · Paid · Status · Redeemed**.
  - **Code:** tabular, 14px/600, .05em tracking, e.g. "482913", or "—" until the group finishes paying.
  - **Party:** "4 guests".
  - **Status badge:**

    | Booking status | Tone | Label |
    |---|---|---|
    | voting | neutral | voting |
    | collecting | neutral | filling |
    | confirmed | soft | confirmed |
    | redeemed | solid | redeemed |
    | cancelled | danger | cancelled |
    | expired | neutral | expired |
    | collapsed | neutral | didn't go ahead |

    An optional red **"Follow up"** badge appears next to it when a card declined (tooltip: "collect at the till").
  - **Redeemed:** a date and time such as "27 Oct 2026, 8:14 pm", or "—".
- Empty state: "No bookings for this deal yet."

### 7.10 Redeem (front of house): `/dashboard/redeem`. **This is the most important screen to make shine.**

- Centred column, max width 900.
- **Header** (centred): eyebrow "FRONT OF HOUSE", title "Redeem a code" (34px), sub-copy "Enter the guest's 6-digit code. You'll see everyone in the booking before you charge."
- **Code entry:** **six boxes**, each 64×80 with radius 14 and a 12px gap, sitting over a hidden numeric input. Digits are 34px/600 tabular. The next empty box has a 1.5px accent border; the others use `--line2`. The lookup runs automatically when the 6th digit is typed.
- **Status line** under the boxes:
  - "● CHECKING…" while looking up the code.
  - "● GROUP CODE · 4 people" in accent for a group booking.

**State 1, Preview** (no money has moved yet). It's a card with a `--line2` border and `--shadow-sm`.
- **Header strip** (`--surface2`): on the left, the deal title plus " · 4 people" (18px/600) and "Venue · 7:30pm slot". On the right, "TOTAL TO CHARGE" over **$96.00** at 26px in accent.
- **Member rows:**
  - A 40px circle with the initial, then the name (15px/600) over a note: "Card on file", "Paid in app" or "Card declined · retry at till".
  - On the right, the amount (16px/600 tabular) and a badge: "Ready" (soft) or "Declined" (danger).
- **Footer strip** (`--surface2`): a ghost "Cancel" (flex 1) and a primary button (flex 2): **"Charge group · $96.00 →"**, or "Redeem · $24.00 →" for a single guest. It reads "Charging…" while busy.
- **Below the card**, one or two status tiles:
  - "**3 members ready** — cards authorised and will settle instantly." (accent dot)
  - "**1 declined** — collect at the till. You can still charge the rest." (red-tinted tile, `--bad` dot)

**State 2, Result.**
- Title: "Valid — enjoy!" for a single guest or "Group redeemed" for a group, with " — 1 to collect" appended if any card declined.
- Sub-copy: "$96.00 charged at Venue."
- A 12px status dot: `--good` if everyone paid, `--warn` otherwise.
- Rows: name, amount and a badge ("Charged" in good, "Declined" in danger). An optional warning box (14% `--warn` tint) appears under a row.
- A full-width ghost "Check another" button.

**State 3, Message** (nothing was charged). The card is tinted 7% with the tone colour and has a 35% tone border, a 12px tone dot, a title, a body and "Check another".

| Message | Tone | Body |
|---|---|---|
| Already redeemed | warn | "This code was redeemed at {date}." |
| Booking cancelled | warn | "{code} belongs to a cancelled booking." |
| Not ready yet | warn | "{code} isn't confirmed — the group hasn't finished booking." |
| Code not found | bad | "No booking found for {code}." |
| Wrong venue | bad | "{code} belongs to a different venue." |
| Something went wrong | bad | the error message |

### 7.11 Payouts: `/dashboard/payouts`
- Eyebrow "PAYOUTS", title "Payouts", intro copy: "Money on its way to your bank account. A booking being paid isn't the same as the cash arriving — this is the second one."
- **Four stat cards.** They're the same as the dashboard's but **without** the accent top bar and dot: a 30px value and an 11px uppercase label.

  | Card | Sub-label |
  |---|---|
  | Paid out | "Last 3 Oct 2026" or "No payouts yet" |
  | On its way | "Sent, not yet cleared" |
  | Awaiting payout | "Earned, not yet sent" |
  | Payouts | "All time" |

- **Table** columns `1.1fr 1.5fr 1fr 1fr 40px`: **Date · Reference · Status · Amount (right-aligned) · ›**.
  - Rows are **expandable**: click a row and the › chevron rotates 90°. The expanded panel sits on `--surface2` and shows "To **Account Name** · BSB acct" and the Pinch transfer ID.
  - Inside the panel is a sub-table of the bookings in that payout, columns `90px 1fr 100px 90px`: code, deal title, date and amount.
  - **Statuses:**

    | Pinch status | Label | Tone |
    |---|---|---|
    | complete | Paid | good |
    | processing | On its way | info |
    | pending-return | Pending return | neutral |
    | withheld | Withheld | neutral |
    | negative-balance | Negative balance | danger |
    | failed | Failed | danger |
    | failed-return | Failed return | danger |

- **Empty state:** "No payouts yet" (600 weight) over "Once a guest redeems a booking and the funds clear, the transfer shows up here with the bookings it covers."

### 7.12 Payments setup (Pinch verification): `/dashboard/payments-setup`
- Max width 860, centred. Eyebrow "PAYMENTS SETUP", title **"Get paid directly"**, intro copy explaining that Pinch must verify the business, that it's a one-off, and that progress saves as you go. Then the "* Required" legend.

**Status card** (shown once the merchant account exists):
- A badge with the status, next to the Pinch merchant ID in small `--faint`:

  | Status | Label | Tone |
  |---|---|---|
  | in-progress | In progress | info |
  | pending | Pending review | info |
  | in-review | Under review | info |
  | approved | Approved | good |
  | rejected | Needs attention | danger |

- An explanation that depends on the status.
- An optional accent alert with notes from Pinch.
- A "STILL OUTSTANDING" bullet list.

**Step rail:** six pills: **1. Business · 2. Bank · 3. Declarations · 4. People · 5. Documents · 6. Review**. Each pill is 11px uppercase with 7/13 padding and radius 999.
- Current: accent fill.
- Done: accent-soft.
- Not reached: `--surface` with `--faint` text at 50% opacity.

**Steps** (each is one card with padding 28 and a 2-column auto-fit grid of fields at least 220px wide):
1. **Business details:** Registered company name*, ABN* (11 digits), Company email*, Company phone, Street address, Suburb, State and Postcode.
2. **"Where your money goes":** a note that the account name must match the company name, then Account name* (full width), BSB* (6 digits) and Account number* (3–9 digits).
3. **Regulatory declarations:** sub-copy "Most hospitality venues answer no to all of these." Three rows, each a question with a hint and a switch on the right:
   - "Does the business hold an AFSL?" When yes, an AFSL number field appears.
   - "Is the business registered with AUSTRAC?"
   - "Are the company's shares held in a trust?"
4. **"Directors and beneficial owners":**
   - One inset panel per person (`--sunken`, radius 14, padding 20). The header reads "PERSON 1 · MAIN CONTACT" and has a red ✕ remove button.
   - Fields: First name*, Last name*, Email*, Phone, Role (director, owner, shareholder or executive), Date of birth, Shareholding %, and Residential address ("Must match their photo ID").
   - A ghost "+ Add another person" button.
5. **Documents** (`ComplianceDocuments.tsx`):
   - An **accent-soft callout card**, "Before you upload — read this", listing the requirements: in colour, current, both sides of a driver's licence, and a utility bill if using a passport.
   - A card "Photo ID for each person" with one upload row per person.
   - A card "Business documents" with three rows: Bank statement, Business registration and "Anything else Pinch asks for" (optional).
   - **Upload row:** an inset panel with radius 14 and padding 18. It shows the title and hint, a badge ("Outstanding" in neutral, or "2 uploaded" in good) and a small button: "Upload", "Add another" or "Uploading…". Uploaded file names appear as small pills, and errors in accent text.
   - Footer note: "Documents are sent straight to Pinch. Impulse never stores them."
6. **Review:** either "Everything Pinch asked for has been supplied…" or a list of outstanding items with a "Back to documents" button.

**Nav row:** a ghost "Back" button and a primary "Save & continue". On the People step the primary reads **"Create account & continue"**, and on Documents it reads "Review".

## 8. Known rough edges (fair game to fix visually)

1. **No icon system.** The UI mixes Unicode glyphs (☰ ✎ ✕ ⏻ ⚿ ▼ ↑) and has no icons in the nav. Lucide is installed.
2. **No visible focus states** on inputs or buttons, because outlines are stripped globally. This is an accessibility gap, and the fix should look good too.
3. **Inconsistent radii:** cards use 16 or 18, buttons 11 or 12, inputs 11 or 12. Pick one scale.
4. **Inconsistent stat cards:** the dashboard versions have an accent top bar and dot, while the payouts versions don't.
5. **Plain "Loading…" text** on several screens. RequireAuth even uses Tailwind `text-gray-400`, which ignores the theme. Skeletons exist only on some pages.
6. **Native `confirm()`** for deleting a deal. A styled confirm dialog would be better.
7. **Free-text deal Date field** and free-text time slots. A designed date and time picker would help, but must still produce display strings like "Tonight · 6–9pm" and "6:30pm".
8. **Sidebar has no responsive behaviour,** and the tables don't adapt to narrow widths.
9. **Hard-coded marketing stats** on the sign-in panel ("2,400+ seats / 340 venues").
10. **"Talk to our team"** links to `#`.
11. **Empty states are bare text.** They'd benefit from an illustration or icon and a clearer call to action.
12. The **Deal performance** section doesn't show **bookings count** or revenue, though `bookings` is in the data.

## 9. What I'd like back

- A refreshed look for **every screen in §7, in both dark and light**, prioritised for the demo in this order:
  1. **Sign in**
  2. **Dashboard home**
  3. **Redeem** (all three states)
  4. **Deals list and deal form**
  5. Bookings, Payouts, Venue details and Payments setup
- An updated **token table** (§4) and **primitive specs** (§5), so the changes map directly onto `globals.css` and `lib/ui.ts`.
- An icon pick (Lucide names) for each nav item and each icon button.
- Keep all copy as written unless you have a clearly better line. Flag any change you make.
