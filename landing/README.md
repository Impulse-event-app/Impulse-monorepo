# Impulse — landing page

A single, self-contained landing page that routes visitors to the two sides of Impulse:

- **Going out** → the consumer app (`mobile-sdk54`, EAS Hosting)
- **For venues** → the venue dashboard (`venue-web`, Vercel)

Built as static files — `index.html` plus `assets/` (no build step, no framework, no
runtime dependency). It follows **Impulse Brand & Voice Guidelines v2.0**: Impulse Red
on ink, the system typeface only, sentence case throughout, hairlines instead of
shadows and tinted fills.

## Assets

`assets/app/*.png` are real screens captured from the live app at
<https://impulse.expo.app> at a 390x746 phone viewport. They drive both the hero phone
and the scroll-driven reel in the "How it works" section. To refresh them, capture at
the same size so the reel geometry still lines up.

> Note: these were captured while the app still ran on the previous (coral / Archivo)
> brand, so the screens inside the phone do not yet match the page around them. They
> need recapturing once `mobile-sdk54` moves to v2.0 tokens.

## Configure the links

Open [index.html](index.html) and edit the two `href`s under the `LINKS` comment:

| Card        | Points to            | Default                          |
| ----------- | -------------------- | -------------------------------- |
| Going out   | consumer app         | `https://impulseapp.expo.app`    |
| For venues  | venue dashboard      | `https://venue-web.vercel.app`   |

> ⚠️ Confirm these against your actual production URLs — they're best-guess defaults.

## Preview locally

```sh
# from the repo root
cd landing && python3 -m http.server 4000
# → http://localhost:4000
```

Or just open `index.html` in a browser.

## Deploy

It's plain static files, so anything works:

- **Vercel** — `cd landing && vercel` (or point a new Vercel project at this folder; no framework preset).
- **Netlify** — drag the `landing/` folder into the dashboard, or `netlify deploy --dir=landing`.
- **EAS Hosting** — `eas deploy` after exporting, or serve it as static assets.
- **GitHub Pages** — publish the folder.

## Notes

- **Venue enquiries**: the `For venues` section (`#venues`) links to a `mailto:` for
  `rahul@impulseapp.au`. The address is deliberately not shown as visible text — the
  button just reads "Email us" — but it is still in the `href`, so it is readable in the
  page source. Assemble it in JS on click if you want it hidden from scrapers too.

- **Theme**: dark only.
- **Fonts**: the system stack (`-apple-system, BlinkMacSystemFont, "SF Pro Text", ...`).
  No webfonts are loaded.
- **Motion — the stage**: the hero and "How it works" are wrapped in one `.stage`
  holding a single phone, pinned by a zero-height sticky `.stage-pin`. One
  rAF-throttled scroll listener writes three numbers per frame and every transform is
  CSS `calc()` off them:

  | | |
  | --- | --- |
  | `--s` | docks the phone — large and low in the hero, then parked in the demo column. Hits 1 exactly as the first step centres. |
  | `--p` | runs the four steps: banks the phone and drives the reel. |
  | `--out` | fades and lifts the phone away over the stage's tail, so it is gone before the awards. |

  The reel is five panels — an HTML splash, then the four captures — positioned at
  `ease(s) + demoReel`, so the screen keeps scrolling through the hero-to-demo
  handover rather than cutting.

  The splash is drawn, not captured, in three parts like the reference: the radar's
  **sweep** variant at room scale across the top 46% — Impulse Red on Paper, bled well
  past the panel so the arcs run off every edge — then the lockup breaking that from a
  single line of display type, with the button pinned to the bottom.

  Two deliberate choices there. The reversed treatment rather than a red ground: a
  half-screen red fill is decoration, and the guidelines reserve red for live and
  tappable things, with the icon as the only exception. And the sweep rather than the
  closed rings: it is the guidelines' own mark for live states, and whole and centred
  the closed rings read as a bullseye, where cropped arcs read as a signal. Note `.phone-reel .scr--splash` needs that extra class
  — `.scr` sets `display: block` further down the sheet and wins at equal specificity,
  which silently stops the panel being a flex column.

  Two things to leave alone: `.stage-pin` must stay **zero-height** (a height plus a
  negative margin keeps it stuck a whole viewport past the stage, because margins are
  part of the sticky constraint rectangle), and the sticky offset belongs on the
  **pin**, not the phone, so the phone leaves with the content the moment it releases.

  Below 900px the pin is hidden and each step carries its own static phone, cloned in
  JS. The driver and the marquee are skipped entirely under `prefers-reduced-motion`,
  which parks the phone docked on the feed with every step legible.

- **Hero**: a menubar (mark and name left, section links centred, the one CTA right)
  over a single line of display type, with the phone rising into the lower half. The
  supporting line and the "Get started" button live on the phone's own splash screen,
  not on the page — so `.hero-sub` and `.hero-cta` are hidden above 900px and shown
  below it, where the phone is gone. Both rules are scoped to `.hero`, because `.btn`
  sets `display` later in the sheet and would otherwise win on source order.

- **The bloom** (`.stage-glow`): two soft radial lobes behind the phone, warm and
  cool. It takes the dock's travel but none of its rotation or scale, so it stays
  circular, and it thins out as the phone docks. Each lobe needs an explicit tile plus
  `closest-side` — an offset radial sizes to farthest-corner by default, so a
  `transparent` stop short of 100% never reaches the box edge and the lobe clips as a
  visible rectangle.

- **Deliberate brand override.** The display gradient (`--g-warm` → `--g-cool`) and the
  bloom override one explicit rule in Impulse Brand Guidelines v2.0: no gradients. That
  was a decision taken to bring the page closer to its reference, not an oversight.
  Every hue involved is Impulse's own — Paper falling through Red Raised to Red Deep —
  so no colour on the page comes from outside the brand. If v2.0 is reinstated, set the
  gradient to a flat `var(--text)` and `.stage-glow` to a single accent lobe.

- **Alternating sides**: the phone parks right / left / right / left across the four
  steps (`SIDES` in the stage script, interpolated on the same `t` as the reel), and
  `.demo-step:nth-child(even)` takes the opposite side.

- **Dock timing**: `--s` finishes at `demoTop - 30vh`, *not* when the first step
  centres. Tied to the step, the phone was still at hero size — cropped and full width —
  while the section heading scrolled up, and sat on top of it.
