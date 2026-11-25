import {
  emptyStats,
  isObject,
  type Carrier,
  type FlightRecord,
  type FlightResponse,
  type GhostWire,
  type InitResponse,
  type Leader,
  type Me,
  type RideCredit,
  type SplashResponse,
  type Stats,
} from '../shared/skein/api.ts';
import { decodeInputs, encodeTrack } from '../shared/skein/codec.ts';
import { buildGhosts, type GhostSource } from '../shared/skein/flock.ts';
import { CREDIT_SECS, LENGTH, MAX_GHOSTS, dayFor, ordinal, parFor, starsFor } from '../shared/skein/rules.ts';
import { fly } from '../shared/skein/sim.ts';
import { makeSky } from '../shared/skein/sky.ts';

export type Redis = {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<string>;
  expire(key: string, seconds: number): Promise<void>;
  hGet(key: string, field: string): Promise<string | undefined>;
  hMGet(key: string, fields: string[]): Promise<(string | null)[]>;
  hSet(key: string, values: Record<string, string>): Promise<number>;
  hSetNX(key: string, field: string, value: string): Promise<number>;
  hGetAll(key: string): Promise<Record<string, string>>;
  hIncrBy(key: string, field: string, by: number): Promise<number>;
  zAdd(key: string, ...members: { member: string; score: number }[]): Promise<number>;
  zIncrBy(key: string, member: string, by: number): Promise<number>;
  zScore(key: string, member: string): Promise<number | undefined>;
  zCard(key: string): Promise<number>;
  zRank(key: string, member: string): Promise<number | undefined>;
  zRange(key: string, start: number, stop: number, options: { reverse: boolean; by: 'rank' }): Promise<{ member: string; score: number }[]>;
};

const KEEP = 60 * 60 * 24 * 30;
const WAVE_MS = 5 * 60 * 1000;

export const K = {
  tracks: (day: number) => `d:${day}:track`,
  cur: (day: number) => `d:${day}:cur`,
  n: (day: number) => `d:${day}:n`,
  best: (day: number) => `d:${day}:best`,
  times: (day: number) => `d:${day}:times`,
  tries: (day: number) => `d:${day}:tries`,
  flyers: (day: number) => `d:${day}:flyers`,
  stats: (day: number) => `d:${day}:stats`,
  carried: (day: number) => `d:${day}:carried`,
  rode: (day: number, name: string) => `d:${day}:rode:${name}`,
  recent: (day: number) => `d:${day}:recent`,
  wave: (day: number) => `d:${day}:wave`,
  waveKeys: (day: number, id: number) => `d:${day}:w:${id}`,
  commented: (day: number) => `d:${day}:commented`,
  user: (name: string) => `u:${name}`,
  post: (postId: string) => `post:${postId}`,
  posted: (day: number) => `posted:${day}`,
};

const num = (v: string | null | undefined) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const keep = async (redis: Redis, ...keys: string[]) => {
  for (const k of keys) await redis.expire(k, KEEP);
};

const parseRecord = (raw: string | undefined): FlightRecord | null => {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (isObject(v) && typeof v.time === 'number' && typeof v.tries === 'number' && typeof v.stars === 'number')
      return { time: v.time, tries: v.tries, stars: v.stars };
  } catch {
    /* falls through */
  }
  return null;
};

const nameOfKey = (key: string) => key.slice(0, key.lastIndexOf('#'));

export const statsFor = async (redis: Redis, day: number): Promise<Stats> => {
  const h = await redis.hGetAll(K.stats(day));
  return { ...emptyStats(), flyers: num(h.flyers), landed: num(h.landed), best: num(h.best), bestBy: h.bestBy ?? null };
};

const pickNames = async (redis: Redis, day: number): Promise<string[]> => {
  const [fast, carriers, recent] = await Promise.all([
    redis.zRange(K.times(day), 0, 7, { reverse: false, by: 'rank' }),
    redis.zRange(K.carried(day), 0, 7, { reverse: true, by: 'rank' }),
    redis.zRange(K.recent(day), 0, MAX_GHOSTS - 1, { reverse: true, by: 'rank' }),
  ]);
  const out: string[] = [];
  for (const { member } of [...carriers, ...fast, ...recent]) {
    if (out.length >= MAX_GHOSTS) break;
    if (!out.includes(member)) out.push(member);
  }
  return out;
};

export const currentWave = async (redis: Redis, day: number, now: number): Promise<{ id: number; keys: string[] }> => {
  const [w, stats] = await Promise.all([redis.hGetAll(K.wave(day)), statsFor(redis, day)]);
  const id = num(w.id);
  if (id > 0 && (now - num(w.at) < WAVE_MS || num(w.landed) === stats.landed)) {
    const raw = await redis.get(K.waveKeys(day, id));
    if (raw) {
      try {
        const keys: unknown = JSON.parse(raw);
        if (Array.isArray(keys) && keys.every((k) => typeof k === 'string')) return { id, keys: keys as string[] };
      } catch {
        /* rebuild */
      }
    }
  }
  const names = await pickNames(redis, day);
  const cur = names.length ? await redis.hMGet(K.cur(day), names) : [];
  const keys = cur.filter((k): k is string => typeof k === 'string' && k.length > 0);
  const next = await redis.hIncrBy(K.wave(day), 'id', 1);
  await redis.set(K.waveKeys(day, next), JSON.stringify(keys));
  await redis.hSet(K.wave(day), { at: String(now), landed: String(stats.landed) });
  await keep(redis, K.waveKeys(day, next), K.wave(day));
  return { id: next, keys };
};

const sourcesFor = async (redis: Redis, day: number, keys: string[]): Promise<GhostSource[]> => {
  if (!keys.length) return [];
  const tracks = await redis.hMGet(K.tracks(day), keys);
  const out: GhostSource[] = [];
  keys.forEach((key, i) => {
    const track = tracks[i];
    if (track) out.push({ key, name: nameOfKey(key), track });
  });
  return out;
};

const ghostsWire = async (redis: Redis, day: number, sources: GhostSource[]): Promise<GhostWire[]> => {
  if (!sources.length) return [];
  const names = sources.map((s) => s.name);
  const [bests, carried] = await Promise.all([redis.hMGet(K.best(day), names), Promise.all(names.map((n) => redis.zScore(K.carried(day), n)))]);
  return sources.map((s, i) => ({
    key: s.key,
    name: s.name,
    track: s.track,
    time: parseRecord(bests[i] ?? undefined)?.time ?? 0,
    carried: carried[i] ?? 0,
  }));
};

export const leadersFor = async (redis: Redis, day: number, count = 5): Promise<Leader[]> =>
  (await redis.zRange(K.times(day), 0, count - 1, { reverse: false, by: 'rank' })).map(({ member, score }) => ({ name: member, time: score }));

export const carriersFor = async (redis: Redis, day: number, count = 3): Promise<Carrier[]> =>
  (await redis.zRange(K.carried(day), 0, count - 1, { reverse: true, by: 'rank' }))
    .filter((c) => c.score > 0)
    .map(({ member, score }) => ({ name: member, carried: score }));

const streakOf = (u: Record<string, string>, today: number) => (num(u.last) >= today - 1 ? num(u.streak) : 0);

export const meFor = async (redis: Redis, day: number, today: number, name: string | null): Promise<Me> => {
  if (!name) return { best: null, tries: 0, streak: 0, rank: null, carried: 0 };
  const [best, tries, u, carried] = await Promise.all([
    redis.hGet(K.best(day), name).then(parseRecord),
    redis.hGet(K.tries(day), name).then(num),
    redis.hGetAll(K.user(name)),
    redis.zScore(K.carried(day), name),
  ]);
  const r = best ? await redis.zRank(K.times(day), name) : undefined;
  return { best, tries, streak: streakOf(u, today), rank: r === undefined ? null : r + 1, carried: carried ?? 0 };
};

export const initFor = async (redis: Redis, day: number, name: string | null, now: number): Promise<InitResponse> => {
  const wave = await currentWave(redis, day, now);
  const sources = await sourcesFor(redis, day, wave.keys);
  const [ghosts, me, stats, leaders, carriers] = await Promise.all([
    ghostsWire(redis, day, sources),
    meFor(redis, day, dayFor(now), name),
    statsFor(redis, day),
    leadersFor(redis, day),
    carriersFor(redis, day),
  ]);
  return { day, today: dayFor(now), par: parFor(), wave: wave.id, ghosts, me, stats, leaders, carriers, user: name, offline: false };
};

export const splashFor = async (redis: Redis, day: number, name: string | null, now: number): Promise<SplashResponse> => {
  const wave = await currentWave(redis, day, now);
  const sources = await sourcesFor(redis, day, wave.keys);
  const [ghosts, stats, carriers, best, carried] = await Promise.all([
    ghostsWire(redis, day, sources),
    statsFor(redis, day),
    carriersFor(redis, day),
    name ? redis.hGet(K.best(day), name).then(parseRecord) : Promise.resolve(null),
    name ? redis.zScore(K.carried(day), name) : Promise.resolve(undefined),
  ]);
  return { day, par: parFor(), ghosts, stats, carriers, me: { best, carried: carried ?? 0 } };
};

export const submitFlight = async (redis: Redis, day: number, name: string | null, body: unknown, now: number): Promise<FlightResponse> => {
  if (!isObject(body) || typeof body.wave !== 'number') return { ok: false, message: 'That flight makes no sense.' };
  const inputs = decodeInputs(body.inputs);
  if (!inputs) return { ok: false, message: 'That flight makes no sense.' };
  const raw = await redis.get(K.waveKeys(day, body.wave));
  if (!raw) return { ok: false, message: 'The flock moved on. Fly again.' };
  let keys: string[] = [];
  try {
    const v: unknown = JSON.parse(raw);
    if (Array.isArray(v)) keys = v.filter((k): k is string => typeof k === 'string');
  } catch {
    return { ok: false, message: 'The flock moved on. Fly again.' };
  }
  const sky = makeSky(day);
  const ghosts = buildGhosts(sky, await sourcesFor(redis, day, keys));
  const { bird, track } = fly(sky, ghosts, inputs);
  const par = parFor();
  const today = dayFor(now);

  const rides = new Map<string, number>();
  let wildSecs = 0;
  ghosts.forEach((g, i) => {
    const secs = bird.liftBy[i] ?? 0;
    if (!g.name) wildSecs += secs;
    else if (g.name !== name) rides.set(g.name, Math.max(rides.get(g.name) ?? 0, secs));
  });
  const rodeWith: RideCredit[] = [...rides.entries()]
    .filter(([, secs]) => secs >= 0.5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([n, secs]) => ({ name: n, secs: Math.round(secs * 10) / 10 }));
  wildSecs = Math.round(wildSecs * 10) / 10;

  if (!name) {
    return {
      ok: true,
      arrived: bird.arrived,
      time: bird.time,
      progress: Math.min(1, bird.y / LENGTH),
      stars: bird.arrived ? starsFor(bird.time, par) : 0,
      best: null,
      improved: false,
      rank: null,
      total: await redis.zCard(K.times(day)),
      streak: 0,
      rodeWith,
      wildSecs,
      carried: 0,
    };
  }

  if (await redis.hSetNX(K.flyers(day), name, '1')) await redis.hIncrBy(K.stats(day), 'flyers', 1);
  const tries = await redis.hIncrBy(K.tries(day), name, 1);
  await keep(redis, K.flyers(day), K.tries(day), K.stats(day));

  const u = await redis.hGetAll(K.user(name));
  let streak = streakOf(u, today);
  let best = parseRecord(await redis.hGet(K.best(day), name));
  let improved = false;

  if (bird.arrived) {
    for (const [ghost, secs] of rides) {
      if (secs < CREDIT_SECS) continue;
      if (await redis.hSetNX(K.rode(day, ghost), name, '1')) {
        await redis.zIncrBy(K.carried(day), ghost, 1);
        await redis.hIncrBy(K.user(ghost), 'carried', 1);
        await keep(redis, K.rode(day, ghost), K.carried(day));
      }
    }
    const first = !best;
    if (!best || bird.time < best.time - 0.005) {
      improved = true;
      best = { time: bird.time, tries, stars: starsFor(bird.time, par) };
      const n = await redis.hIncrBy(K.n(day), name, 1);
      const key = `${name}#${n}`;
      await redis.hSet(K.tracks(day), { [key]: encodeTrack(track) });
      await redis.hSet(K.cur(day), { [name]: key });
      await redis.hSet(K.best(day), { [name]: JSON.stringify(best) });
      await redis.zAdd(K.times(day), { member: name, score: bird.time });
      const stats = await statsFor(redis, day);
      if (!stats.best || bird.time < stats.best) await redis.hSet(K.stats(day), { best: String(bird.time), bestBy: name });
    }
    await redis.zAdd(K.recent(day), { member: name, score: now });
    if (first) {
      await redis.hIncrBy(K.stats(day), 'landed', 1);
      await redis.hIncrBy(K.user(name), 'flights', 1);
      if (day === today && num(u.last) !== today) {
        streak = num(u.last) === today - 1 ? num(u.streak) + 1 : 1;
        await redis.hSet(K.user(name), { last: String(today), streak: String(streak), bestStreak: String(Math.max(streak, num(u.bestStreak))) });
      }
    }
    await keep(redis, K.tracks(day), K.cur(day), K.n(day), K.best(day), K.times(day), K.recent(day));
  }

  const r = best ? await redis.zRank(K.times(day), name) : undefined;
  return {
    ok: true,
    arrived: bird.arrived,
    time: bird.time,
    progress: Math.min(1, bird.y / LENGTH),
    stars: bird.arrived ? starsFor(bird.time, par) : 0,
    best,
    improved,
    rank: r === undefined ? null : r + 1,
    total: await redis.zCard(K.times(day)),
    streak,
    rodeWith,
    wildSecs,
    carried: (await redis.zScore(K.carried(day), name)) ?? 0,
  };
};

export const flairFor = (streak: number, carried: number) =>
  carried >= 10 ? `Skein · carried ${carried}` : streak >= 2 ? `Skein · ${streak}-leg streak` : 'Skein · Flew a leg';

export const commentFor = (day: number, region: string, lake: string, best: FlightRecord, par: number, carried: number, rode: string[]) => {
  const stars = '★'.repeat(best.stars) + '☆'.repeat(3 - best.stars);
  const tries = best.tries === 1 ? 'first flight' : `${ordinal(best.tries)} flight`;
  const lines = [`**Skein · Leg ${day} · ${region} to ${lake}**`, '', `Landed in ${best.time.toFixed(1)}s (par ${par.toFixed(1)}) on my ${tries}. ${stars}`];
  if (rode.length) lines.push('', `Rode the wakes of ${rode.map((r) => `u/${r}`).join(', ')}.`);
  if (carried > 0) lines.push('', `My wake carried ${carried} ${carried === 1 ? 'goose' : 'geese'} today.`);
  return lines.join('\n');
};
