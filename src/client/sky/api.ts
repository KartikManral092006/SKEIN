import {
  emptyStats,
  isObject,
  type FlightRecord,
  type FlightResponse,
  type GhostWire,
  type InitResponse,
  type MessageResponse,
  type SplashResponse,
} from '../../shared/skein/api';
import { botCrowd } from '../../shared/skein/bots';
import { encodeInputs, encodeTrack } from '../../shared/skein/codec';
import { buildGhosts } from '../../shared/skein/flock';
import { CREDIT_SECS, LENGTH, dayFor, parFor, starsFor } from '../../shared/skein/rules';
import { fly } from '../../shared/skein/sim';
import { makeSky } from '../../shared/skein/sky';

const params = () => new URLSearchParams(window.location.search);

const previewDay = () => {
  const n = Number(params().get('day'));
  return Number.isInteger(n) && n > 0 ? n : dayFor(Date.now());
};

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};

const parseJson = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

let offlineCache: InitResponse | null = null;

const offlineInit = (): InitResponse => {
  if (offlineCache) return offlineCache;
  const day = previewDay();
  const sky = makeSky(day);
  const crowd = params().get('crowd');
  const count = crowd === '1' ? 14 : Math.min(24, Math.max(0, Number(crowd) || 0));
  const bots = count ? botCrowd(sky, count, day, 'preview') : [];
  const ghosts: GhostWire[] = bots.map((b, i) => ({ ...b, time: 0, carried: (i * 7) % 13 }));
  const mine = parseJson<{ track: string; best: FlightRecord }>(store.get(`skein-best-${day}`));
  if (mine) ghosts.push({ key: 'mine#1', name: 'mine', track: mine.track, time: mine.best.time, carried: 0 });
  const tries = Number(store.get(`skein-tries-${day}`) ?? 0);
  offlineCache = {
    day,
    today: day,
    par: parFor(),
    wave: 0,
    ghosts,
    me: { best: mine?.best ?? null, tries, streak: mine ? 1 : 0, rank: mine ? 1 : null, carried: 0 },
    stats: { ...emptyStats(), flyers: bots.length, landed: bots.length },
    leaders: [],
    carriers: ghosts
      .filter((g) => g.carried > 0)
      .sort((a, b) => b.carried - a.carried)
      .slice(0, 3)
      .map((g) => ({ name: g.name, carried: g.carried })),
    user: null,
    offline: true,
  };
  return offlineCache;
};

const isGhosts = (v: unknown): v is GhostWire[] =>
  Array.isArray(v) && v.every((g) => isObject(g) && typeof g.key === 'string' && typeof g.name === 'string' && typeof g.track === 'string');

const isInit = (v: unknown): v is InitResponse =>
  isObject(v) && typeof v.day === 'number' && typeof v.wave === 'number' && isGhosts(v.ghosts) && isObject(v.me) && isObject(v.stats);

const post = async (url: string, body: unknown): Promise<unknown> => {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.json();
};

export const loadInit = async (): Promise<InitResponse> => {
  try {
    const res = await fetch('/api/init');
    if (!res.ok) return offlineInit();
    const data: unknown = await res.json();
    return isInit(data) ? data : offlineInit();
  } catch {
    return offlineInit();
  }
};

export const loadSplash = async (): Promise<SplashResponse> => {
  try {
    const res = await fetch('/api/splash');
    if (res.ok) {
      const data: unknown = await res.json();
      if (isObject(data) && typeof data.day === 'number' && isGhosts(data.ghosts) && isObject(data.stats)) return data as SplashResponse;
    }
  } catch {
    /* falls through */
  }
  const o = offlineInit();
  return { day: o.day, par: o.par, ghosts: o.ghosts, stats: o.stats, carriers: o.carriers, me: { best: o.me.best, carried: 0 } };
};

const offlineFlight = (inputs: number[]): FlightResponse => {
  const init = offlineInit();
  const sky = makeSky(init.day);
  const ghosts = buildGhosts(sky, init.ghosts);
  const { bird, track } = fly(sky, ghosts, inputs);
  const tries = Number(store.get(`skein-tries-${init.day}`) ?? 0) + 1;
  store.set(`skein-tries-${init.day}`, String(tries));
  let wildSecs = 0;
  const rides: { name: string; secs: number }[] = [];
  ghosts.forEach((g, i) => {
    const secs = bird.liftBy[i] ?? 0;
    if (!g.name) wildSecs += secs;
    else if (g.name !== 'mine' && secs >= 0.5) rides.push({ name: g.name, secs: Math.round(secs * 10) / 10 });
  });
  const key = `skein-best-${init.day}`;
  let best = parseJson<{ track: string; best: FlightRecord }>(store.get(key))?.best ?? null;
  let improved = false;
  if (bird.arrived && (!best || bird.time < best.time - 0.005)) {
    improved = true;
    best = { time: bird.time, tries, stars: starsFor(bird.time, init.par) };
    store.set(key, JSON.stringify({ track: encodeTrack(track), best }));
  }
  return {
    ok: true,
    arrived: bird.arrived,
    time: bird.time,
    progress: Math.min(1, bird.y / LENGTH),
    stars: bird.arrived ? starsFor(bird.time, init.par) : 0,
    best,
    improved,
    rank: best ? 1 : null,
    total: init.stats.landed + (best ? 1 : 0),
    streak: best ? 1 : 0,
    rodeWith: rides.sort((a, b) => b.secs - a.secs).slice(0, 5),
    wildSecs: Math.round(wildSecs * 10) / 10,
    carried: 0,
  };
};

export const sendFlight = async (init: InitResponse, inputs: number[]): Promise<FlightResponse> => {
  if (init.offline) return offlineFlight(inputs);
  try {
    const data = await post('/api/flight', { wave: init.wave, inputs: encodeInputs(inputs) });
    if (isObject(data) && typeof data.ok === 'boolean') return data as FlightResponse;
  } catch {
    /* falls through */
  }
  return { ok: false, message: 'Could not reach Reddit. That flight was not recorded.' };
};

const message = async (url: string, offline: boolean, offlineText: string): Promise<MessageResponse> => {
  if (offline) return { ok: false, message: offlineText };
  try {
    const data = await post(url, {});
    if (isObject(data) && typeof data.ok === 'boolean' && typeof data.message === 'string') return { ok: data.ok, message: data.message };
  } catch {
    /* falls through */
  }
  return { ok: false, message: 'Could not reach Reddit.' };
};

export const shareComment = (offline: boolean) => message('/api/comment', offline, 'Sharing works inside Reddit.');

export const subscribe = (offline: boolean) => message('/api/subscribe', offline, 'Joining works inside Reddit.');

export const creditWorthy = (secs: number) => secs >= CREDIT_SECS;
