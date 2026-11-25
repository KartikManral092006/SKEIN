import {
  DT,
  EDGE,
  LENGTH,
  MAX_TICKS,
  SAMPLE,
  START_V,
  START_X,
  V_FLAP,
  V_GLIDE,
  V_MIN,
  W,
  WAKE_FAR,
  WAKE_HALF,
  WAKE_NEAR,
  WAKE_SIDE,
} from './rules.ts';
import { windAt, type Sky } from './sky.ts';

export type Track = { x: number[]; y: number[] };

export type Ghost = { name: string | null; key: string; track: Track };

export type Bird = {
  x: number;
  y: number;
  vx: number;
  v: number;
  s: number;
  tick: number;
  done: boolean;
  arrived: boolean;
  time: number;
  lift: number;
  down: number;
  by: number;
  flapping: boolean;
  storm: boolean;
  thermal: boolean;
  liftBy: number[];
};

export const GLIDE = 0;
export const MAX_INPUT = 201;

export const inputFor = (targetX: number) => 1 + Math.max(0, Math.min(200, Math.round(targetX * 5)));
export const targetOf = (input: number) => (input - 1) / 5;

export const startBird = (ghosts: number): Bird => ({
  x: START_X,
  y: 0,
  vx: 0,
  v: START_V,
  s: 1,
  tick: 0,
  done: false,
  arrived: false,
  time: 0,
  lift: 0,
  down: 0,
  by: -1,
  flapping: false,
  storm: false,
  thermal: false,
  liftBy: new Array<number>(ghosts).fill(0),
});

export const posAt = (track: Track, tick: number, out: { x: number; y: number }) => {
  const n = track.x.length;
  const i = Math.floor(tick / SAMPLE);
  if (i >= n - 1) {
    out.x = track.x[n - 1]!;
    out.y = track.y[n - 1]!;
    return out;
  }
  const f = (tick - i * SAMPLE) / SAMPLE;
  const x0 = track.x[i]!;
  const y0 = track.y[i]!;
  out.x = x0 + (track.x[i + 1]! - x0) * f;
  out.y = y0 + (track.y[i + 1]! - y0) * f;
  return out;
};

const p = { x: 0, y: 0 };

export const sense = (b: Bird, ghosts: Ghost[], tick: number) => {
  let lift = 0;
  let down = 0;
  let by = -1;
  let pull = 0;
  for (let i = 0; i < ghosts.length; i++) {
    posAt(ghosts[i]!.track, tick, p);
    const dy = p.y - b.y;
    if (dy < WAKE_NEAR || dy > WAKE_FAR) continue;
    const dx = b.x - p.x;
    const adx = dx < 0 ? -dx : dx;
    const lon = dy < 1.6 ? dy - WAKE_NEAR : dy < 4 ? 1 : (WAKE_FAR - dy) / 3;
    if (adx < WAKE_HALF) {
      const d = (1 - adx / WAKE_HALF) * lon;
      if (d > down) down = d;
      continue;
    }
    const e = (adx - WAKE_SIDE) / WAKE_HALF;
    const lat = 1 - e * e;
    if (lat <= 0) continue;
    const l = lat * lon;
    if (l > lift) {
      lift = l;
      by = i;
      pull = (dx > 0 ? 1 : -1) * (WAKE_SIDE - adx);
    }
  }
  return { lift, down, by, pull };
};

export const step = (sky: Sky, ghosts: Ghost[], b: Bird, input: number) => {
  if (b.done) return;
  const { lift, down, by, pull } = sense(b, ghosts, b.tick);
  b.lift = lift;
  b.down = down;
  b.by = by;
  if (by >= 0) b.liftBy[by] = b.liftBy[by]! + lift * DT;

  let storm = false;
  let push = 0;
  for (const s of sky.storms) {
    const dx = b.x - s.x;
    const dy = b.y - s.y;
    if (dx * dx + dy * dy < s.r * s.r) {
      storm = true;
      push = dx >= 0 ? 2 : -2;
      break;
    }
  }
  let thermal = false;
  for (const t of sky.thermals) {
    const dx = b.x - t.x;
    const dy = b.y - t.y;
    if (dx * dx + dy * dy < t.r * t.r) {
      thermal = true;
      break;
    }
  }
  b.storm = storm;
  b.thermal = thermal;

  const flap = input > GLIDE && input <= MAX_INPUT && b.s > 0;
  b.flapping = flap;
  if (flap) {
    let want = (targetOf(input) - b.x) * 2.2;
    if (want > 7) want = 7;
    if (want < -7) want = -7;
    b.vx += (want - b.vx) * 0.3;
  } else {
    b.vx -= b.vx * 0.125;
  }
  const capture = lift > 0 ? pull * 1.6 * lift : 0;
  b.x += (b.vx + windAt(sky, b.y) + capture + push) * DT;
  if (b.x < EDGE) {
    b.x = EDGE;
    if (b.vx < 0) b.vx = 0;
  }
  if (b.x > W - EDGE) {
    b.x = W - EDGE;
    if (b.vx > 0) b.vx = 0;
  }

  let target = flap ? V_FLAP : V_GLIDE + 7 * lift + (thermal ? 4 : 0);
  if (storm) target -= 5;
  if (down > 0) target -= 3 * down;
  b.v += (target - b.v) * (flap ? 0.045 : 0.025);
  if (b.v < V_MIN) b.v = V_MIN;

  const cost = flap ? 0.03 * (1 - 0.7 * lift) : 0;
  const regen = (flap ? 0 : 0.045 * lift) + (thermal ? 0.08 : 0);
  const drain = (storm ? 0.05 : 0) + 0.02 * down;
  b.s -= (cost + drain - regen) * DT;
  if (b.s < 0) b.s = 0;
  if (b.s > 1) b.s = 1;

  const prev = b.y;
  b.y += b.v * DT;
  b.tick++;
  if (b.y >= LENGTH) {
    b.done = true;
    b.arrived = true;
    b.time = Math.round(((b.tick - 1 + (LENGTH - prev) / (b.y - prev)) * DT) * 100) / 100;
  } else if (b.tick >= MAX_TICKS) {
    b.done = true;
  }
};

export type Flight = { bird: Bird; track: Track };

export const fly = (sky: Sky, ghosts: Ghost[], inputs: number[]): Flight => {
  const b = startBird(ghosts.length);
  const track: Track = { x: [b.x], y: [b.y] };
  let i = 0;
  while (!b.done) {
    step(sky, ghosts, b, inputs[i] ?? GLIDE);
    i++;
    if (b.tick % SAMPLE === 0 || b.done) {
      track.x.push(b.x);
      track.y.push(b.y);
    }
  }
  return { bird: b, track };
};

export type Policy = (b: Bird, tick: number) => number;

export const flyWith = (sky: Sky, ghosts: Ghost[], policy: Policy) => {
  const inputs: number[] = [];
  const b = startBird(ghosts.length);
  while (!b.done) {
    const input = policy(b, b.tick);
    inputs.push(input);
    step(sky, ghosts, b, input);
  }
  return { inputs, ...fly(sky, ghosts, inputs) };
};
