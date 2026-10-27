# Impulse: design brief for a visual refresh

## 1. The product

**Impulse** is a consumer iOS/Android app for Sydney. Venues post last-minute openings ("drops") at a set discount for tonight. Venue types include bowling, karaoke, escape rooms, mini golf, pool, comedy, live music, darts, bars and arcades. Users browse the drops, book in one tap and get a **door code** to show at the venue.

The group feature is the **Huddle**:

1. Friends join through a link or QR code.
2. Each person votes for their top 3 drops.
3. The winner becomes one booking.
4. The group splits the cost with **Huddle Pay** (each person pays a deposit now and the rest at the venue).
5. Everyone shares one code.

- **Audience:** 18–35 year olds in Sydney making plans for tonight, on the go and often in a group chat.
- **Tone:** confident, minimal and native-feeling, like an Apple first-party app with one loud brand colour. The copy is short, sentence case and a little warm ("One nudge, not a daily blast", "It's decided.").

## 2. Platform and constraints (please design within these)

- **Stack:** React Native 0.81 / Expo SDK 54 / expo-router, on iPhone (primary), Android and web. iPad uses a readable column capped at **672pt**.
- **Fonts:** **system font only** (SF Pro / Roboto), weights **400, 500 and 600** (nothing heavier). Numbers use tabular figures. No custom fonts, so please don't propose one unless the change is worth adding a font asset.
- **Glass:** "liquid glass" is an `expo-blur` BlurView plus a tint and a 0.5pt specular edge. Android has no blur and uses a solid tint. iOS Reduce Transparency also makes glass solid.
- **Sheets:** native iOS formSheets with detents, corner radius 16 and a grabber. Android and web use a custom bottom sheet.
- **Map:** native Apple/Google Maps (react-native-maps). Pins are custom views.
- **Images:** venues *may* have photos. Many don't, so the placeholder state matters.
- **Accessibility:** Dynamic Type (minHeight rather than fixed heights), 44pt minimum hit targets, Reduce Motion and Reduce Transparency support, 4.5:1 contrast for `muted` text.
- **Motion:** RN Animated only (no Reanimated or Lottie). Springs and timing curves are fine. The standard curve is `EASE = cubic-bezier(.32,.72,0,1)`.
- **Haptics:** selection haptics on chips, tabs and pins.

## 3. Brand v2 (current)

- **Impulse Red `#C80815`.** The mark's background is always exactly this red. In dark mode the UI accent is a brighter `#E8202C`.
- **Radar mark:** a red rounded square (radius 22.5%) with a white core dot and two white rings. Variants: compact (one ring) and sweep (open arcs). The wordmark "Impulse" is the system font at 600 with tight tracking.
- **HuddleMark:** the red square with the outer ring and three white "member" dots.
- **Design direction:** neutral greys with red as the only colour. Cards were meant to be flat, but the feed cards later became blurred glass, so the two approaches now sit side by side.
- **History:** the original Claude Design handoff (`impulse-ui/project/Impulse App.html`, `Impulse Identity.html`) used a warm palette: cream `#F6F3ED` / espresso `#0F0E0D`, a coral accent `#FF5A4D` and dark-ink chips when selected. Brand v2 replaced it with cool neutrals, Impulse Red and red selected chips.

### Colour tokens (`mobile-sdk54/src/theme.tsx`)

| Token | Light | Dark | Use |
|---|---|---|---|
| bg | `#F1F1F4` | `#0A0A0A` | screen background |
| surface | `#FFFFFF` | `#161617` | cards, groups, sheets |
| surface2 | `#E7E7EC` | `#1F1F21` | avatars, inner cards |
| text | `#0A0A0A` | `#F5F5F7` | primary text |
| muted | `#6A6A6F` | `#98989D` | secondary text |
| faint | `#A1A1A6` | `rgba(245,245,247,.44)` | placeholders, chevrons, disabled |
| line / line2 | ink @ .10 / .17 | ink @ .13 / .24 | hairlines, outline borders |
| fill | ink @ .06 | ink @ .09 | quiet control fill (chips, inputs, steppers) |
| accent | `#C80815` | `#E8202C` | primary buttons, selected chips, links |
| accentDeep | `#A50611` | `#C80815` | pressed primary |
| accentSoft | red @ .10 | red @ .16 | discount chip, soft banners |
| glassTint / glassSolid | `rgba(255,255,255,.55)` / `.96` | `rgba(46,46,48,.45)` / `rgba(36,36,38,.94)` | glass |
| glassEdge | `rgba(255,255,255,.75)` | `rgba(255,255,255,.16)` | 0.5pt specular edge |
| floatShadow | black .10, r15, y8 | black .45, r15, y8 | tab bar and sheets only |

### Type scale

| Style | Size / line height | Tracking | Weight |
|---|---|---|---|
| LargeTitle | 34/40 | −1.02 | 600 |
| ScreenTitle | 30/34 | −0.66 | 600 |
| Sheet title | 22 | −0.48 | 600 |
| Section heading | 20 | −0.36 | 600 |
| Body | 17/25 | −0.19 | 400 |
| Label | 13 | −0.05 | 400, muted |
| Tab label | 10.5 | — | 500, or 600 when active |
| Prices | mono 26 (card) / 34 (detail) | — | 600 |

Tracking curve: 13pt −0.05, 15pt −0.12, 17pt −0.19, and −2% of the size from 20pt up.

## 4. Component library (`mobile-sdk54/src/components.tsx`)

**Controls**
- **Btn:** a pill 52 high (44 when small) with a 17pt/500 label.
  - Primary: red fill. Secondary: 1pt line2 outline. Ghost: `fill`.
  - Pressed: scale .985. Disabled: opacity .35.
- **TextBtn:** a quiet text action, 17pt, muted or red.
- **Chip:** 34 high (30 small), radius 10. Off: `fill`. On: red with white text.
- **Field:** minimum height 52, radius 12, `fill` background; the border turns red on focus.
- **CodeInput:** 6 cells.
- **Stepper:** 44×44 buttons with radius 10; value in mono 24.
- **Switch, Radio:** iOS-style.
- **Segmented control** (Filters): `fill` track, radius 11.
- **Slider:** 6pt track, 26pt white thumb.

**Lists, navigation and layout**
- **Group / Row:** an iOS inset grouped list. Groups have radius 12, a 13pt header above and an optional footer. Rows are at least 44 high with an 18pt icon column, a value and a chevron.
- **NavBar:** floating and transparent at first; once you scroll past the large title it turns to glass and shows a centred inline title.
- **Tab bar:** a floating glass pill (54 high, radius 27, 14pt side margins) with 4 tabs: What's on / Map / Plans / You. A brighter "lens" pill springs between tabs with a squash-and-stretch.
- **FloatingFooter:** a pinned CTA area over a progressive bg scrim.
- **SheetFrame:** a sheet header (title, subtitle, action) with a body and a footer.

**Cards and badges**
- **DropCardEditorial** (feed card):
  - A glass card with radius 22. The backdrop is the venue's own photo, heavily blurred, under a tint and a top sheen.
  - The photo is inset 8pt, 162 high, with radius 15.
  - On the photo: a glass category badge (top left), an "Ends in mm:ss" countdown badge, and a solid red "−30%" badge (top right).
  - Body: venue name 22/600 with the rating beside it; a meta line "Category · Suburb · 1.2 km"; the price in mono 26 with "a lane, usually $40"; and a live time-window row.
- **DropCardCompact** (map card): a horizontal glass card with radius 20 holding an 80pt photo, the venue, the price, the live indicator and the discount chip.
- **Placeholder** (no photo): grey with diagonal hatching and the literal label "{Category} · venue photo".
- **DiscountBadge / DiscountChip:** the badge is solid red with radius 12. The chip has an `accentSoft` fill, radius 6 and red text.
- **CodeDisplay:** the door code shown as separate cells, either small (26×34) or large (42×58, mono 32).
- **Pin** (map): a red pill holding a white category icon and the price, with a pointer triangle below. When active it gets a halo ring.
- **Avatar:** initials in a circle (there are currently 4 different styles; see §7).
- **EmptyState:** an optional Radar mark, a title, a body and one action.

**Motion**
- **HeroMotion** (sign-in): three tilted columns of 3:4 tiles with category emblems that drift slowly. Some tiles are red, some neutral.
- **HeroWord:** a red word in "Tonight, it's ___." that cycles through bowling, karaoke, mini golf…
- **FadeIn:** list items stagger in 55ms apart.
- **LiveDot:** a blinking dot shown when there's a countdown.
- **LiveMeter:** paid avatars fill in, and the "$X still to come in" amount counts down.
- **Confirm:** the radar pops in.

**Icons:** custom SVG line icons for the tabs, rows, the onboarding glyphs (pin, bell, access, card) and the category glyphs.

## 5. Screens

### Tabs

**1. What's on (home)**
- NavBar: Radar mark and wordmark on the left; the avatar or "Sign in" on the right.
- LargeTitle "What's on" with an area pill below it ("All Sydney ⌄").
- A Huddle card. It says "Start a huddle" by default, shows live status when a huddle is active, and becomes a red-tinted "Pick your top 3" banner in voting mode.
- A horizontal rail: the Filters button, then category chips.
- Sections "On now" and "Later tonight" with counts, each a stack of DropCardEditorial cards.
- **Voting mode:** cards that aren't candidates dim to 40%, rank badges (1/2/3) sit on the photos, and a floating "Submit N picks" button carries progress pills.
- Empty after filtering: "Nothing matches." with "Clear filters".

**2. Map**
- A full-bleed native map with red price pins and a glass filter button at top right. There is no search.
- Tapping a pin shows a compact card above the tab bar.

**3. Plans**
- A list of bookings. Each card has the venue, "7:30pm · 2 people", a status tag and a small door-code display.
- Guest and empty states each use an EmptyState with the Radar mark.

**4. You**
- An identity row (60pt initials circle, name, email) and two stat tiles (plans booked, home base).
- Grouped lists:
  - Going out: suburb, favourites, party size.
  - Notifications.
  - App: appearance, payment.
  - Support.
  - Account: sign out, delete.
- A version footer.

### Flows

**Sign-in**
- **Hero:** HeroMotion tiles behind "Tonight, it's *bowling.*" with "Get started" and "Look around first".
- **Sign-in panel:** Apple, Google, an "or" divider, phone and email. Then phone entry, OTP and email sub-views.

**Onboarding** (7 steps with page dots; each step has a glass glyph plate, a title, a body and a CTA plus "Not now"):
1. Location
2. Notifications
3. 18+
4. Home suburb (search plus chips)
5. Access needs
6. Interests
7. Save a card

**Event detail**
- A 300pt full-bleed hero photo with a glass back button and countdown.
- Venue title, meta line, a big price block, the blurb, "What you get" and "Where", and a mini map.
- Floating footer: the price and "Book now".

**Claim** (booking)
- Party stepper and time chips.
- Then "How are you paying?" (pay for everyone or Huddle Pay).
- Then card entry or the saved card, a price breakdown and "Pay $X deposit".

**Confirm**
- The radar pops in, then "You're booked." with the door code card and "Show this at the door".

**Huddle**
- **New-huddle sheet:** a stepper for the group size, then "Create huddle".
- **Huddle status sheet:**
  - A Vote → Pay → Code progress stepper.
  - Avatar slots: joined, voted (red ring and check) or open (dashed).
  - "Vote your top 3".
  - QR code plus a share link.
  - Once decided: the venue, the split selector, the user's share and pay, and the live meter.
  - At the end: "You're all set" with a large code.
- **Join landing:** "You're invited." with a name field and "Join huddle".

**Huddle Pay** (split)
- "Who's coming" list with an invite row for each open spot.
- "Split evenly / Not even" selector with per-person amounts (drag track and $ inputs) and a balance bar ("Adds up" / "Left to split").
- Pay the user's share. A live meter shows who has paid.

**Seat landing:** "You're invited. {Name} booked {Venue}, your share is $X."

**Sheets**
- Filters: What, When (segmented), Where, Party size, Price slider, Sort, and a "Show N" footer.
- Area picker.
- Profile field editors.
- Invite-a-friend search.

## 6. What I want from this pass

Improve the visuals while keeping the brand: Impulse Red, the system font and a native iOS feel. Please prioritise the following.

1. **Home feed and drop card.** Make it feel exciting and "tonight". Rethink the hierarchy of price, discount and urgency, and make the card hold up **without a venue photo**. The current hatched placeholder with its literal "venue photo" text is a weak point.
2. **One coherent card language.** Choose between flat cards and glass cards, and use the choice everywhere.
3. **A radius and spacing scale** to replace the current ad-hoc values (see §7).
4. **The Huddle flow** (status sheet, voting mode, split): make the group and social state more visible and celebratory.
5. **Empty, guest and loading states.** Right now they are mostly a spinner or plain text.
6. **The map** (pins, selected card, the missing search) and **Plans** (door code presentation).

Please deliver mockups for light **and** dark mode, with any new tokens stated explicitly (hex values, radii, sizes) so they can be ported directly to React Native.

## 7. Known visual inconsistencies to fix

**Radii**
- Values in use: 6, 7, 8, 10, 11, 12, 15, 16, 20 and 22.
- Cards alone use 22 (feed), 20 (map), 16 (huddle card) and 12 (plans, groups, stat tiles).
- Small circles are given radii larger than half their size.

**Hardcoded colours**
- The tab bar lens, glass-card tints and sheen, sheet scrim, vote-progress dots, slider and switch thumbs and the QR plate hardcode their colours instead of using tokens.

**Spacing**
- Side padding is 16 on the main screens, 22 on sign-in and onboarding, and 24 on confirm.
- The top content offset varies (+36, +44, +52, +60).

**Headings**
- Similar headings use 20, 21 and 22pt with differing tracking.
- Off-scale sizes appear: 12.5, 13.5 and 10.5.

**Components**
- There are four or five different avatar styles: the glass nav avatar, the 60pt profile avatar, the 48pt huddle slot, the split avatar and the 22pt invite initial.
- InviteSheet uses its own header style (20pt title, grey "Done"), while the other sheets use a 22pt title with a red "Done".
- The Plans tab icon has no filled/active variant; the other three do.
- The voting rank badge is positioned at a fixed offset on the photo.

**Copy**
- The tab is "What's on" but buttons say "Back to tonight".
- "top 3" vs "top three".
- "Start a huddle" vs "Huddle Pay".
- Mixed curly and straight apostrophes.

**Placeholder or debug content in the UI**
- The legal copy is placeholder.
- "Send a test notification" is a diagnostic row in the You tab.
- Venues without a photo show placeholder text.

## 8. Sample data (for mockups)

| Venue | Category | Suburb |
|---|---|---|
| Pins & Needles | Bowling | Moore Park |
| The Lockup | Escape rooms | Newtown |
| Side Pocket | Pool | Enmore |
| Putt Lane | Mini golf | Darlinghurst |
| Echo Room | Karaoke | CBD |
| The Front Room | Comedy | Newtown |

- Example price: "$28 a lane, usually $40 · −30%".
- Example time window: "On now · until 10pm" or "Ends in 18:42".
- Example door code: `482913`.
