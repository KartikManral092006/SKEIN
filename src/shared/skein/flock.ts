import { decodeTrack, quantize } from './codec.ts';
import { DT, HOUSE_V, LENGTH, SAMPLE, START_X, W } from './rules.ts';
import type { Ghost, Track } from './sim.ts';
import type { Sky } from './sky.ts';

export const HOUSE_COUNT = 7;
export const HOUSE_LEAD = 10;
const STEP = 20;
const V_BACK = 2.6;

export const leaderPath = (sky: Sky): number[] => {
  const steps = Math.ceil((LENGTH + 40) / STEP) + 1;
  const xs: number[] = [];
  for (let x = 8; x <= W - 8; x++) xs.push(x);
  const cost: number[][] = [];
  const from: number[][] = [];
  const hazard = (x: number, y: number) => {
    let c = 0;
    for (const s of sky.storms) {
      const dx = x - s.x;
      const dy = y - s.y;
      const reach = s.r + 7;
      if (dx * dx + dy * dy < reach * reach) c += 100;
    }
    for (const t of sky.thermals) {
      const dx = x - t.x;
      const dy = y - t.y;
      if (dx * dx + dy * dy < t.r * t.r * 4) c -= 3;
    }
    return c;
  };
  for (let i = 0; i < steps; i++) {
    const y = HOUSE_LEAD + i * STEP;
    cost.push([]);
    from.push([]);
    for (let j = 0; j < xs.length; j++) {
      const x = xs[j]!;
      const h = hazard(x, y) + hazard(x, y - STEP / 2);
      if (i === 0) {
        cost[i]!.push(Math.abs(x - START_X) * 50 + h);
        from[i]!.push(-1);
        continue;
      }
      let best = Infinity;
      let arg = -1;
      for (let k = Math.max(0, j - 4); k <= Math.min(xs.length - 1, j + 4); k++) {
        const c = cost[i - 1]![k]! + Math.abs(xs[k]! - x) * 0.6;
        if (c < best) {
          best = c;
          arg = k;
        }
      }
      cost[i]!.push(best + h);
      from[i]!.push(arg);
    }
  }
  let j = 0;
  const last = cost[steps - 1]!;
  for (let k = 1; k < last.length; k++) if (last[k]! < last[j]!) j = k;
  const path = new Array<number>(steps).fill(0);
  for (let i = steps - 1; i >= 0; i--) {
    path[i] = xs[j]!;
    j = from[i]![j]!;
  }
  return path;
};

const pathX = (path: number[], y: number) => {
  const f = (y - HOUSE_LEAD) / STEP;
  if (f <= 0) return path[0]!;
  const i = Math.floor(f);
  if (i >= path.length - 1) return path[path.length - 1]!;
  const a = path[i]!;
  return a + (path[i + 1]! - a) * (f - i);
};

export const houseTracks = (sky: Sky): Track[] => {
  const path = leaderPath(sky);
  const tracks: Track[] = [];
  for (let k = 0; k < HOUSE_COUNT; k++) {
    const rank = Math.ceil(k / 2);
    const side = k === 0 ? 0 : k % 2 === 1 ? 1 : -1;
    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; ; i++) {
      const t = i * SAMPLE * DT;
      const yy = HOUSE_LEAD - rank * V_BACK + HOUSE_V * t;
      const xx = pathX(path, yy) + side * 1.8 * rank;
      x.push(Math.max(1, Math.min(W - 1, xx)));
      y.push(yy);
      if (yy >= LENGTH + 2) break;
    }
    tracks.push(quantize({ x, y }));
  }
  return tracks;
};

export type GhostSource = { name: string; key: string; track: string };

export const buildGhosts = (sky: Sky, players: GhostSource[]): Ghost[] => {
  const ghosts: Ghost[] = houseTracks(sky).map((track, i) => ({ name: null, key: `wild-${i}`, track }));
  for (const p of players) {
    const track = decodeTrack(p.track);
    if (track) ghosts.push({ name: p.name, key: p.key, track });
  }
  return ghosts;
};
