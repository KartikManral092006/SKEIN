import { hash, mulberry32, pick } from './rng.ts';
import { LENGTH, W } from './rules.ts';

export type Disc = { x: number; y: number; r: number };

export type Biome = 'fields' | 'marsh' | 'moor' | 'delta' | 'orchard';

export type Sky = {
  day: number;
  storms: Disc[];
  thermals: Disc[];
  wind: number[];
  biome: Biome;
  region: string;
  lake: string;
};

export const BAND = 150;

const BIOMES: Biome[] = ['fields', 'marsh', 'moor', 'delta', 'orchard'];

const REGIONS: Record<Biome, readonly string[]> = {
  fields: ['Barley Country', 'Hedgerow Vale', 'the Mill Fields', 'Long Furrow'],
  marsh: ['the Salt Marsh', 'the Reedbeds', 'Heron Flats', 'the Fen'],
  moor: ['the High Moor', 'Heather Downs', 'Cairn Ridge', 'the Peat Hags'],
  delta: ['the Willow Delta', 'Oxbow Reach', 'the Braided River', 'Silt Bend'],
  orchard: ['Cider Valley', 'the Pear Rows', 'Quince Hollow', 'the Old Orchards'],
};

const LAKES = ['Coldwater Mere', 'Lantern Lake', 'Stillwater', 'the Grey Loch', 'Mirror Mere', 'Ferry Pool', 'Whitethroat Water'];

const dist = (a: Disc, b: Disc) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};

export const makeSky = (day: number): Sky => {
  const rnd = mulberry32(hash(day, 7331));
  const biome = BIOMES[(day - 1) % BIOMES.length]!;
  const storms: Disc[] = [];
  const target = 7 + Math.floor(rnd() * 3);
  for (let tries = 0; storms.length < target && tries < 400; tries++) {
    const d = { x: 4 + rnd() * (W - 8), y: 140 + rnd() * (LENGTH - 240), r: 3 + rnd() * 2.5 };
    if (storms.every((s) => dist(s, d) > s.r + d.r + 5)) storms.push(d);
  }
  const thermals: Disc[] = [];
  for (let tries = 0; thermals.length < 5 && tries < 400; tries++) {
    const d = { x: 5 + rnd() * (W - 10), y: 160 + rnd() * (LENGTH - 260), r: 2.4 + rnd() * 1.1 };
    if (storms.every((s) => dist(s, d) > s.r + d.r + 3) && thermals.every((t) => dist(t, d) > 60)) thermals.push(d);
  }
  storms.sort((a, b) => a.y - b.y);
  thermals.sort((a, b) => a.y - b.y);
  const wind: number[] = [];
  for (let i = 0; i <= Math.ceil(LENGTH / BAND) + 1; i++) wind.push(Math.round((rnd() * 2 - 1) * 12) / 10);
  return { day, storms, thermals, wind, biome, region: pick(rnd, REGIONS[biome]), lake: pick(rnd, LAKES) };
};

export const windAt = (sky: Sky, y: number) => {
  const f = Math.max(0, y) / BAND;
  const i = Math.min(sky.wind.length - 2, Math.floor(f));
  const a = sky.wind[i]!;
  const b = sky.wind[i + 1]!;
  return a + (b - a) * (f - i);
};
