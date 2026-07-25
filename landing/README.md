# Impulse — landing page

A single, self-contained landing page that routes visitors to the two sides of Impulse:

- **Going out** → the consumer app (`mobile-sdk54`, EAS Hosting)
- **For venues** → the venue dashboard (`venue-web`, Vercel)

Built as one static `index.html` (no build step, no framework, no runtime dependency).
It's a faithful implementation of the `Impulse Landing` Claude Design component — same
palette, fonts, layout, copy, theme toggle, and category marquee.

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

- **Theme**: defaults to dark (matches the design); the "Lights on/off" toggle flips it and
  remembers the choice in `localStorage`.
- **Fonts**: Archivo / Space Grotesk / Space Mono via Google Fonts.
- **Motion**: the marquee and pulse dot respect `prefers-reduced-motion`.
- The footer `Terms` / `Privacy` links are placeholders (`#terms` / `#privacy`) — point them
  at real pages before launch.
