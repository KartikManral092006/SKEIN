import { encodeTrack } from './codec.ts';
import { buildGhosts, type GhostSource } from './flock.ts';
import { mulberry32 } from './rng.ts';
import { LENGTH, W } from './rules.ts';
import { GLIDE, flyWith, inputFor, posAt, type Bird, type Ghost, type Policy } from './sim.ts';
import type { Sky } from './sky.ts';

export type BotStyle = { lane: number; flapAbove: number; seek: boolean; sprintAt: number };

const dodge = (sky: Sky, b: Bird, x: number) => {
  for (const s of sky.storms) {
    const ahead = s.y - b.y;
    if (ahead < -s.r || ahead > 30) continue;
    if (Math.abs(x - s.x) < s.r + 2.5) return s.x > W / 2 ? s.x - s.r - 3.5 : s.x + s.r + 3.5;
  }
  return x;
};

export const botPolicy = (sky: Sky, ghosts: Ghost[], style: BotStyle): Policy => {
  const p = { x: 0, y: 0 };
  return (b, tick) => {
    let target = style.lane;
    let slot = false;
    if (style.seek) {
      let best = Infinity;
      for (const g of ghosts) {
        posAt(g.track, tick, p);
        const dy = p.y - b.y;
        if (dy < 0.5 || dy > 14) continue;
        const side = b.x >= p.x ? 1.8 : -1.8;
        const d = Math.abs(p.x + side - b.x) + Math.abs(dy - 3);
        if (d < best) {
          best = d;
          target = p.x + side;
          slot = dy < 5;
        }
      }
    }
    target = dodge(sky, b, target);
    const sprint = b.y > LENGTH - style.sprintAt && b.s > 0.05;
    const off = Math.abs(target - b.x) > 0.4;
    if (sprint) return inputFor(target);
    if (slot && b.lift > 0.3) return off ? inputFor(target) : GLIDE;
    if (b.s > style.flapAbove || b.storm) return inputFor(target);
    return off && b.s > 0.02 ? inputFor(target) : GLIDE;
  };
};

export const randomStyle = (seed: number): BotStyle => {
  const rnd = mulberry32(seed);
  return {
    lane: 8 + rnd() * (W - 16),
    flapAbove: 0.15 + rnd() * 0.55,
    seek: rnd() < 0.8,
    sprintAt: 120 + rnd() * 300,
  };
};

export const botCrowd = (sky: Sky, count: number, seed: number, prefix = 'flyer'): GhostSource[] => {
  const out: GhostSource[] = [];
  for (let i = 0; i < count; i++) {
    const ghosts = buildGhosts(sky, out);
    const f = flyWith(sky, ghosts, botPolicy(sky, ghosts, randomStyle(seed * 977 + i)));
    if (f.bird.arrived) out.push({ name: `${prefix}_${i + 1}`, key: `${prefix}_${i + 1}#1`, track: encodeTrack(f.track) });
  }
  return out;
};
