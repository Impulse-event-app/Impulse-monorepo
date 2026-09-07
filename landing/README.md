# Impulse — landing page

A single, self-contained landing page with two asks on it:

- **Join the waitlist** → posts to the API (`backend`), red full-bleed band
- **Run a pilot** → venue enquiry dialog, ink full-bleed band

Built as static files — `index.html` plus `assets/` (no build step, no framework, no
runtime dependency). It follows **Impulse Brand & Voice Guidelines v2.0**: Paper ground
with Impulse Red as a signal, the system typeface only, sentence case throughout,
hairlines instead of shadows and tinted fills.

The page is authored in the Claude Design project **Impulse Landing v2**
(`8718453c-8d03-4b71-819f-b028f98597a6`, file `Impulse Landing v2.html`) and imported
here. See [Importing from Claude Design](#importing-from-claude-design) before editing.

## Sections

| | |
| --- | --- |
| Hero | Menubar over one line of display type, phone rising into the lower half |
| How it works (`#how-it-works`) | Four scroll-driven steps sharing one pinned phone |
| Intelligence (`#intelligence`) | "The discount that fills the room" — the pricing story |
| Awards (`#awards`) | Two-entry timeline, August 2026 |
| Categories | Marquee of what Impulse covers |
| Early access (`#waitlist`) | The red band. Waitlist form + live signup count |
| For venues (`#venues`) | The ink band. Pilot pitch + enquiry dialog |

## Assets

`assets/app/*.png` are real screens from the live app, **390x839** — the screen's own
aspect (278:598) at 390 wide. They drive both the hero phone and the scroll-driven reel
in "How it works", and the markup declares `width="390" height="839"`, so if you
recapture, match that size or the reel geometry stops lining up.

These are the **v2-brand** captures (Impulse Red on ink). The earlier set was taken
while the app still ran on the coral / Archivo brand and did not match the page around
it; that is resolved.

`assets/awards/*.webp` are the two award photographs in the timeline. They are WebP
rather than PNG deliberately — the Startmate original is a 2.2 MB PNG, and 79 KB of
WebP is indistinguishable at the size it renders.

## The API

There is no build step, so `API_BASE` is a literal near the top of the page script:

```js
var API_BASE = 'https://impulse-monorepo.onrender.com';
```

It backs four calls:

| Endpoint | Used by |
| --- | --- |
| `GET /api/waitlist/count` | The live "N people on the waitlist" pill |
| `GET /api/waitlist/referrer/:code` | Referral attribution from a `?ref=` link |
| `POST /api/waitlist` | The waitlist form |
| `POST /api/contact/venue` | The venue enquiry dialog |

If the API is unreachable the count pill stays hidden and the venue form hands back the
`mailto:` rather than pretending it sent.

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

## Importing from Claude Design

`index.html` is the design project's `Impulse Landing v2.html` with three production
edits. Re-apply them on every re-import:

1. The two `<image-slot>` elements in the awards timeline become plain `<img>` tags
   pointing at `assets/awards/*.webp`. `<image-slot>` is a design-canvas scaffold
   (drag-to-fill placeholders backed by an `.image-slots.state.json` sidecar) and has no
   place in a deployed page.
2. `.tl-shot image-slot { … }` becomes `.tl-shot img { …; object-fit:cover; display:block }`
   — the slot filled its figure absolutely, so a bare `<img>` needs the cover fit spelled out.
3. Drop `<script src="image-slot.js"></script>`.

> The design API caps file reads at 256 KiB, which the Startmate PNG exceeds. Fetch
> oversized assets through the project's own `GetFile` RPC in the browser instead, and
> re-encode before committing.

## Notes

- **Venue enquiries**: the `#venues` band links to a `mailto:` for `rahul@impulseapp.au`
  and `manoj@impulseapp.au`. The addresses are deliberately not shown as visible text —
  the button just reads "Talk to us" — but they are still in the `href`, so they are
  readable in the page source. Assemble them in JS on click if you want them hidden from
  scrapers too.

- **Theme**: light only. Paper (`#EBEBEB`) ground, Ink (`#0A0A0A`) type, with
  `color-scheme: light` set so the UA renders form controls light. The two full-bleed
  bands are the only surfaces that break the paper.

- **Fonts**: the system stack (`-apple-system, BlinkMacSystemFont, "SF Pro Text", ...`).
  No webfonts are loaded.

- **Motion — the stage**: the hero and "How it works" are wrapped in one `.stage`
  holding a single phone, pinned by a zero-height sticky `.stage-pin`. One
  rAF-throttled scroll listener writes a few numbers per frame and every transform is
  CSS `calc()` off them:

  | | |
  | --- | --- |
  | `--s` | docks the phone — large and low in the hero, then parked in the demo column. Hits 1 exactly as the first step centres. |
  | `--p` | runs the four steps: banks the phone and drives the reel. |
  | `--out` | fades and lifts the phone away over the stage's tail, so it is gone before the awards. |
  | `--reel` | the reel's own offset, written as `ease(s) + i + t`. |

  The reel is five panels — an HTML splash, then the four captures — positioned so the
  screen keeps scrolling through the hero-to-demo handover rather than cutting.

  The splash is drawn, not captured, in three parts: the radar's **sweep** variant at
  room scale across the top, bled well past the panel so the arcs run off every edge,
  then the lockup breaking that from a single line of display type, with the button
  pinned to the bottom.

  Note `.phone-reel .scr--splash` needs that extra class — `.scr` sets `display: block`
  further down the sheet and wins at equal specificity, which silently stops the panel
  being a flex column.

  Two things to leave alone: `.stage-pin` must stay **zero-height** (a height plus a
  negative margin keeps it stuck a whole viewport past the stage, because margins are
  part of the sticky constraint rectangle), and the sticky offset belongs on the
  **pin**, not the phone, so the phone leaves with the content the moment it releases.

  Below 900px the pin is hidden and each step carries its own static phone, cloned in
  JS. The driver and the marquee are skipped entirely under `prefers-reduced-motion`,
  which parks the phone docked on the feed with every step legible.

- **No bloom.** The dark page had two soft radial lobes behind the phone. On paper
  nothing glows, so the ground is flat and the phone is the one dark object on it —
  the hairline sonar rings do the work instead.

- **Alternating sides**: the phone parks right / left / right / left across the four
  steps (`SIDES` in the stage script, interpolated on the same `t` as the reel), and
  `.demo-step:nth-child(even)` takes the opposite side.

- **Dock timing**: `--s` finishes at `demoTop - 30vh`, *not* when the first step
  centres. Tied to the step, the phone was still at hero size — cropped and full width —
  while the section heading scrolled up, and sat on top of it.

- **The awards timeline**: entries reveal on `--r` and the photographs uncover from the
  top (`clip-path: inset(...)`) rather than fading — nothing on this page fades in, and
  a photo that slides its own top edge down reads as the entry opening.
