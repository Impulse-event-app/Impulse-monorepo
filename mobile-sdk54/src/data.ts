// data.ts — Impulse: dataset, filters, money/countdown helpers.
// Ported from the Impulse design handoff (app-data.jsx).
import { useEffect, useState } from 'react';

// ── categories (filter rail) ─────────────────────────────────
export const CATEGORIES = [
  'All',
  'Bowling',
  'Karaoke',
  'Escape rooms',
  'Mini golf',
  'Pool',
  'Comedy',
  'Live music',
  'Darts',
];

// ── helpers ──────────────────────────────────────────────────
export const money = (n: number) => '$' + n;
export const pct = (now: number, usual: number) => Math.round((1 - now / usual) * 100);

// live countdown to a target timestamp
export function useCountdown(target: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  if (!target) return 0;
  return Math.max(0, target - now);
}

export function fmtCountdown(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(ss)}` : `${m}:${p(ss)}`;
}

// ── dataset: Sydney drops ────────────────────────────────────
export type Drop = {
  id: string;
  venue: string;
  cat: string;
  suburb: string;
  km: number;
  now: number;
  usual: number;
  unit: string;
  status: 'now' | 'later';
  window: string;
  hotMin: number | null;
  rating: number;
  blurb: string;
  gets: string;
  addr: string;
  target: number | null;
  cap: number;
};

// max party each venue fits (drives the party-size filter)
const CAPS: Record<string, number> = {
  pins: 6, lockup: 8, sidepocket: 8, puttlane: 8,
  echoroom: 8, frontroom: 10, frequency: 10, bullseye: 6,
};

// hotMin → minutes from load until the slot ends (drives the live countdown
// on the most time-critical drops). window → human label for the rest.
const T0 = Date.now();

type RawDrop = Omit<Drop, 'target' | 'cap'>;

const RAW: RawDrop[] = [
  {
    id: 'pins', venue: 'Pins & Needles', cat: 'Bowling', suburb: 'Moore Park',
    km: 1.2, now: 18, usual: 24, unit: '/lane', status: 'now',
    window: 'On now · ends 9:00pm', hotMin: null, rating: 4.6,
    blurb: 'Six lanes held back for tonight. Neon, a decent jukebox, and a kitchen that does the job after a few frames.',
    gets: 'One lane, up to 6 players, 1 hour.',
    addr: '2 Lang Rd, Moore Park',
  },
  {
    id: 'lockup', venue: 'The Lockup', cat: 'Escape rooms', suburb: 'Newtown',
    km: 3.4, now: 28, usual: 39, unit: 'pp', status: 'now',
    window: 'On now · last room 8:00pm', hotMin: 128, rating: 4.8,
    blurb: "Two new rooms, one very old building. The 'Tax Office' room has the best twist in the inner west.",
    gets: '60-minute room for your group.',
    addr: '14 Wilson St, Newtown',
  },
  {
    id: 'sidepocket', venue: 'Side Pocket', cat: 'Pool', suburb: 'Enmore',
    km: 4.0, now: 12, usual: 18, unit: '/table·hr', status: 'now',
    window: 'On now · ends 6:00pm', hotMin: 47, rating: 4.4,
    blurb: "Eight tables, cheap before six, loud after. Arvo rates while the felt's still quiet.",
    gets: 'One table, per hour.',
    addr: '118 Enmore Rd, Enmore',
  },
  {
    id: 'puttlane', venue: 'Putt Lane', cat: 'Mini golf', suburb: 'Darlinghurst',
    km: 1.8, now: 15, usual: 21, unit: 'pp', status: 'now',
    window: 'On now · ends 10:00pm', hotMin: null, rating: 4.3,
    blurb: 'Nine holes in the dark, blacklight everywhere, a bar at the ninth. More fun than it has any right to be.',
    gets: 'Nine holes, one round.',
    addr: '33 Oxford St, Darlinghurst',
  },
  {
    id: 'echoroom', venue: 'Echo Room', cat: 'Karaoke', suburb: 'CBD',
    km: 2.1, now: 22, usual: 30, unit: '/room·hr', status: 'later',
    window: 'From 7:00pm tonight', hotMin: null, rating: 4.7,
    blurb: 'Private rooms, no minimum spend, a song book that actually has the good stuff. Bring your worst.',
    gets: 'Private room, up to 8, per hour.',
    addr: 'Level 2, 401 Sussex St, CBD',
  },
  {
    id: 'frontroom', venue: 'The Front Room', cat: 'Comedy', suburb: 'Newtown',
    km: 3.5, now: 16, usual: 25, unit: 'pp', status: 'later',
    window: 'Doors 8:00pm tonight', hotMin: null, rating: 4.5,
    blurb: "A tight five from six comics, hosted by someone who's almost famous. Back room of a pub, exactly as it should be.",
    gets: "One ticket, tonight's lineup.",
    addr: '91 King St, Newtown',
  },
  {
    id: 'frequency', venue: 'Frequency', cat: 'Live music', suburb: 'Marrickville',
    km: 5.2, now: 20, usual: 32, unit: 'pp', status: 'later',
    window: '8:30pm tonight', hotMin: null, rating: 4.6,
    blurb: "Three local bands, one good room, a sound guy who cares. The kind of night you'll claim you discovered first.",
    gets: 'One ticket, three sets.',
    addr: '7 Sydenham Rd, Marrickville',
  },
  {
    id: 'bullseye', venue: 'Bullseye Social', cat: 'Darts', suburb: 'Chippendale',
    km: 2.4, now: 19, usual: 28, unit: '/oche·hr', status: 'now',
    window: 'On now · ends 11:00pm', hotMin: null, rating: 4.5,
    blurb: "Digital oches, frozen margs, a leaderboard that'll ruin friendships. Built for a group that can't decide.",
    gets: 'One oche, up to 6, per hour.',
    addr: '5 Kensington St, Chippendale',
  },
];

export const DROPS: Drop[] = RAW.map((d) => ({
  ...d,
  target: d.hotMin ? T0 + d.hotMin * 60000 : null,
  cap: CAPS[d.id],
}));

// pin coordinates (% of map) for the Map screen
export const PIN_POS: Record<string, [number, number]> = {
  pins: [38, 30], lockup: [70, 22], sidepocket: [22, 58], puttlane: [55, 44],
  echoroom: [48, 64], frontroom: [78, 52], frequency: [30, 78], bullseye: [62, 70],
};

// areas present in the dataset (for the filter sheet)
export const AREAS = Array.from(new Set(DROPS.map((d) => d.suburb)));

// ── filters ──────────────────────────────────────────────────
export type Filters = {
  cats: string[];
  areas: string[];
  when: 'all' | 'now' | 'later';
  party: number;
  maxPrice: number;
  sort: 'closest' | 'price' | 'rating';
};

export const DEFAULT_FILTERS: Filters = {
  cats: [], areas: [], when: 'all', party: 1, maxPrice: 40, sort: 'closest',
};

export function applyFilters(list: Drop[], f: Filters): Drop[] {
  let out = list.filter(
    (d) =>
      (f.cats.length === 0 || f.cats.includes(d.cat)) &&
      (f.areas.length === 0 || f.areas.includes(d.suburb)) &&
      (f.when === 'all' || d.status === f.when) &&
      d.cap >= f.party &&
      d.now <= f.maxPrice,
  );
  if (f.sort === 'closest') out = [...out].sort((a, b) => a.km - b.km);
  else if (f.sort === 'price') out = [...out].sort((a, b) => a.now - b.now);
  else if (f.sort === 'rating') out = [...out].sort((a, b) => b.rating - a.rating);
  return out;
}

export function activeFilterCount(f: Filters): number {
  let n = 0;
  n += f.cats.length ? 1 : 0;
  n += f.areas.length ? 1 : 0;
  n += f.when !== 'all' ? 1 : 0;
  n += f.party > 1 ? 1 : 0;
  n += f.maxPrice < 40 ? 1 : 0;
  n += f.sort !== 'closest' ? 1 : 0;
  return n;
}

// ── plan (claimed slot) ──────────────────────────────────────
export type Plan = {
  code: string;
  dropId: string;
  venue: string;
  cat: string;
  party: number;
  time: string;
  total: number;
};

export const genCode = () => 'IMP-' + Math.floor(1000 + Math.random() * 9000);
