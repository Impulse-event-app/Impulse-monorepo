// app-data.jsx — Impulse app: theme tokens, dataset, helpers
// Exports (window): ThemeCtx, useT, tokens, DROPS, CATEGORIES, money, pct, useCountdown, fmtCountdown

const ThemeCtx = React.createContext(null);
function useT() { return React.useContext(ThemeCtx); }

// ── theme tokens ─────────────────────────────────────────────
function hexA(hex, a) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
function tokens(dark, accent = "#FF5A4D") {
  return dark
    ? {
        dark: true,
        bg: "#0F0E0D", surface: "#1A1817", surface2: "#232120", sunken: "#0A0908",
        text: "#F4F1EA", muted: "rgba(244,241,234,0.60)", faint: "rgba(244,241,234,0.38)",
        line: "rgba(244,241,234,0.10)", line2: "rgba(244,241,234,0.16)",
        accent, accentInk: "#1A0B08", accentSoft: hexA(accent, 0.17),
        chipBg: "rgba(244,241,234,0.07)", chipOn: "#F4F1EA", chipOnInk: "#0F0E0D",
        mapBg: "#15110F", mapLine: "rgba(244,241,234,0.055)", mapBlock: "rgba(244,241,234,0.03)",
        ph: "#211E1C", phLine: "rgba(244,241,234,0.05)", phText: "rgba(244,241,234,0.34)",
        shadow: "0 12px 34px rgba(0,0,0,0.5)",
      }
    : {
        dark: false,
        bg: "#F6F3ED", surface: "#FFFFFF", surface2: "#F0ECE4", sunken: "#EEEAE2",
        text: "#17120F", muted: "rgba(23,18,15,0.60)", faint: "rgba(23,18,15,0.42)",
        line: "rgba(23,18,15,0.10)", line2: "rgba(23,18,15,0.16)",
        accent, accentInk: "#1A0B08", accentSoft: hexA(accent, 0.13),
        chipBg: "rgba(23,18,15,0.05)", chipOn: "#17120F", chipOnInk: "#F6F3ED",
        mapBg: "#E9E3D8", mapLine: "rgba(23,18,15,0.06)", mapBlock: "rgba(23,18,15,0.035)",
        ph: "#EAE5DC", phLine: "rgba(23,18,15,0.05)", phText: "rgba(23,18,15,0.34)",
        shadow: "0 12px 30px rgba(40,30,20,0.12)",
      };
}

// ── categories (filter rail) ─────────────────────────────────
const CATEGORIES = ["All", "Bowling", "Karaoke", "Escape rooms", "Mini golf", "Pool", "Comedy", "Live music", "Darts"];

// ── helpers ──────────────────────────────────────────────────
const money = (n) => "$" + n;
const pct = (now, usual) => Math.round((1 - now / usual) * 100);

// live countdown to a target timestamp
function useCountdown(target) {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return Math.max(0, target - now);
}
function fmtCountdown(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(ss)}` : `${m}:${p(ss)}`;
}

// ── dataset: Sydney drops ────────────────────────────────────
// max party each venue fits (drives the party-size filter)
const CAPS = { pins: 6, lockup: 8, sidepocket: 8, puttlane: 8, echoroom: 8, frontroom: 10, frequency: 10, bullseye: 6 };
// hotMin → minutes from load until the slot ends (drives the live countdown
// on the most time-critical drops). window → human label for the rest.
const T0 = Date.now();
const DROPS = [
  {
    id: "pins", venue: "Pins & Needles", cat: "Bowling", suburb: "Moore Park",
    km: 1.2, now: 18, usual: 24, unit: "/lane", status: "now",
    window: "On now · ends 9:00pm", hotMin: null, rating: 4.6,
    blurb: "Six lanes held back for tonight. Neon, a decent jukebox, and a kitchen that does the job after a few frames.",
    gets: "One lane, up to 6 players, 1 hour.",
    addr: "2 Lang Rd, Moore Park",
  },
  {
    id: "lockup", venue: "The Lockup", cat: "Escape rooms", suburb: "Newtown",
    km: 3.4, now: 28, usual: 39, unit: "pp", status: "now",
    window: "On now · last room 8:00pm", hotMin: 128, rating: 4.8,
    blurb: "Two new rooms, one very old building. The 'Tax Office' room has the best twist in the inner west.",
    gets: "60-minute room for your group.",
    addr: "14 Wilson St, Newtown",
  },
  {
    id: "sidepocket", venue: "Side Pocket", cat: "Pool", suburb: "Enmore",
    km: 4.0, now: 12, usual: 18, unit: "/table·hr", status: "now",
    window: "On now · ends 6:00pm", hotMin: 47, rating: 4.4,
    blurb: "Eight tables, cheap before six, loud after. Arvo rates while the felt's still quiet.",
    gets: "One table, per hour.",
    addr: "118 Enmore Rd, Enmore",
  },
  {
    id: "puttlane", venue: "Putt Lane", cat: "Mini golf", suburb: "Darlinghurst",
    km: 1.8, now: 15, usual: 21, unit: "pp", status: "now",
    window: "On now · ends 10:00pm", hotMin: null, rating: 4.3,
    blurb: "Nine holes in the dark, blacklight everywhere, a bar at the ninth. More fun than it has any right to be.",
    gets: "Nine holes, one round.",
    addr: "33 Oxford St, Darlinghurst",
  },
  {
    id: "echoroom", venue: "Echo Room", cat: "Karaoke", suburb: "CBD",
    km: 2.1, now: 22, usual: 30, unit: "/room·hr", status: "later",
    window: "From 7:00pm tonight", hotMin: null, rating: 4.7,
    blurb: "Private rooms, no minimum spend, a song book that actually has the good stuff. Bring your worst.",
    gets: "Private room, up to 8, per hour.",
    addr: "Level 2, 401 Sussex St, CBD",
  },
  {
    id: "frontroom", venue: "The Front Room", cat: "Comedy", suburb: "Newtown",
    km: 3.5, now: 16, usual: 25, unit: "pp", status: "later",
    window: "Doors 8:00pm tonight", hotMin: null, rating: 4.5,
    blurb: "A tight five from six comics, hosted by someone who's almost famous. Back room of a pub, exactly as it should be.",
    gets: "One ticket, tonight's lineup.",
    addr: "91 King St, Newtown",
  },
  {
    id: "frequency", venue: "Frequency", cat: "Live music", suburb: "Marrickville",
    km: 5.2, now: 20, usual: 32, unit: "pp", status: "later",
    window: "8:30pm tonight", hotMin: null, rating: 4.6,
    blurb: "Three local bands, one good room, a sound guy who cares. The kind of night you'll claim you discovered first.",
    gets: "One ticket, three sets.",
    addr: "7 Sydenham Rd, Marrickville",
  },
  {
    id: "bullseye", venue: "Bullseye Social", cat: "Darts", suburb: "Chippendale",
    km: 2.4, now: 19, usual: 28, unit: "/oche·hr", status: "now",
    window: "On now · ends 11:00pm", hotMin: null, rating: 4.5,
    blurb: "Digital oches, frozen margs, a leaderboard that'll ruin friendships. Built for a group that can't decide.",
    gets: "One oche, up to 6, per hour.",
    addr: "5 Kensington St, Chippendale",
  },
].map((d) => ({ ...d, target: d.hotMin ? T0 + d.hotMin * 60000 : null, cap: CAPS[d.id] }));

// areas present in the dataset (for the filter sheet)
const AREAS = Array.from(new Set(DROPS.map((d) => d.suburb)));

// default filter state
const DEFAULT_FILTERS = { cats: [], areas: [], when: "all", party: 1, maxPrice: 40, sort: "closest" };

// apply a filter object to the dataset
function applyFilters(list, f) {
  let out = list.filter((d) =>
    (f.cats.length === 0 || f.cats.includes(d.cat)) &&
    (f.areas.length === 0 || f.areas.includes(d.suburb)) &&
    (f.when === "all" || d.status === f.when) &&
    (d.cap >= f.party) &&
    (d.now <= f.maxPrice)
  );
  if (f.sort === "closest") out = [...out].sort((a, b) => a.km - b.km);
  else if (f.sort === "price") out = [...out].sort((a, b) => a.now - b.now);
  else if (f.sort === "rating") out = [...out].sort((a, b) => b.rating - a.rating);
  return out;
}

// count of active (non-default) filter facets, for the badge
function activeFilterCount(f) {
  let n = 0;
  n += f.cats.length ? 1 : 0;
  n += f.areas.length ? 1 : 0;
  n += f.when !== "all" ? 1 : 0;
  n += f.party > 1 ? 1 : 0;
  n += f.maxPrice < 40 ? 1 : 0;
  n += f.sort !== "closest" ? 1 : 0;
  return n;
}

Object.assign(window, { ThemeCtx, useT, tokens, hexA, DROPS, CATEGORIES, AREAS, DEFAULT_FILTERS, applyFilters, activeFilterCount, money, pct, useCountdown, fmtCountdown });
