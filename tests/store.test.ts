import { test } from 'node:test';
import assert from 'node:assert/strict';
import { K, initFor, splashFor, submitFlight, type Redis } from '../src/server/store.ts';
import { botPolicy } from '../src/shared/skein/bots.ts';
import { encodeInputs } from '../src/shared/skein/codec.ts';
import { buildGhosts } from '../src/shared/skein/flock.ts';
import { EPOCH, DAY_MS } from '../src/shared/skein/rules.ts';
import { flyWith, inputFor } from '../src/shared/skein/sim.ts';
import { makeSky } from '../src/shared/skein/sky.ts';

const fakeRedis = (): Redis => {
  const kv = new Map<string, string>();
  const h = new Map<string, Map<string, string>>();
  const z = new Map<string, Map<string, number>>();
  const hash = (k: string) => h.get(k) ?? h.set(k, new Map()).get(k)!;
  const zset = (k: string) => z.get(k) ?? z.set(k, new Map()).get(k)!;
  const sorted = (k: string) => [...zset(k).entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  return {
    get: async (k) => kv.get(k),
    set: async (k, v) => (kv.set(k, v), 'OK'),
    expire: async () => {},
    hGet: async (k, f) => hash(k).get(f),
    hMGet: async (k, fs) => fs.map((f) => hash(k).get(f) ?? null),
    hSet: async (k, vals) => {
      for (const [f, v] of Object.entries(vals)) hash(k).set(f, v);
      return Object.keys(vals).length;
    },
    hSetNX: async (k, f, v) => (hash(k).has(f) ? 0 : (hash(k).set(f, v), 1)),
    hGetAll: async (k) => Object.fromEntries(hash(k)),
    hIncrBy: async (k, f, by) => {
      const n = Number(hash(k).get(f) ?? 0) + by;
      hash(k).set(f, String(n));
      return n;
    },
    zAdd: async (k, ...ms) => {
      for (const m of ms) zset(k).set(m.member, m.score);
      return ms.length;
    },
    zIncrBy: async (k, m, by) => {
      const n = (zset(k).get(m) ?? 0) + by;
      zset(k).set(m, n);
      return n;
    },
    zScore: async (k, m) => zset(k).get(m),
    zCard: async (k) => zset(k).size,
    zRank: async (k, m) => {
      const i = sorted(k).findIndex(([name]) => name === m);
      return i < 0 ? undefined : i;
    },
    zRange: async (k, start, stop, { reverse }) => {
      const list = sorted(k);
      if (reverse) list.reverse();
      return list.slice(start, stop + 1).map(([member, score]) => ({ member, score }));
    },
  };
};

const day = 3;
const now = EPOCH + (day - 1) * DAY_MS + 3600_000;

const flyAs = async (redis: Redis, name: string, seekWakes: boolean, at: number) => {
  const init = await initFor(redis, day, name, at);
  const sky = makeSky(day);
  const ghosts = buildGhosts(sky, init.ghosts.map((g) => ({ name: g.name, key: g.key, track: g.track })));
  const policy = botPolicy(sky, ghosts, { lane: 20, flapAbove: seekWakes ? 0.9 : 0.3, seek: seekWakes, sprintAt: 260 });
  const live = flyWith(sky, ghosts, policy);
  const res = await submitFlight(redis, day, name, { wave: init.wave, inputs: encodeInputs(live.inputs) }, at);
  return { init, live, res };
};

test('a flight is replayed server side and recorded', async () => {
  const redis = fakeRedis();
  const { live, res } = await flyAs(redis, 'alice', true, now);
  assert.ok(res.ok);
  if (!res.ok) return;
  assert.equal(res.arrived, true);
  assert.equal(res.time, live.bird.time);
  assert.equal(res.rank, 1);
  assert.ok(res.wildSecs > 3);
  assert.equal(res.streak, 1);
  const splash = await splashFor(redis, day, 'alice', now + 10 * 60_000);
  assert.equal(splash.stats.landed, 1);
  assert.equal(splash.ghosts[0]?.name, 'alice');
});

test('riding a player wake credits that player once', async () => {
  const redis = fakeRedis();
  await flyAs(redis, 'alice', false, now);
  const later = now + 10 * 60_000;
  const init = await initFor(redis, day, 'bob', later);
  assert.equal(init.ghosts.length, 1);
  const sky = makeSky(day);
  const ghosts = buildGhosts(sky, init.ghosts.map((g) => ({ name: g.name, key: g.key, track: g.track })));
  const alice = ghosts[ghosts.length - 1]!.track;
  const p = { x: 0, y: 0 };
  const live = flyWith(sky, ghosts, (b, tick) => {
    const i = Math.min(alice.x.length - 1, Math.floor(tick / 2) + 1);
    p.x = alice.x[i]!;
    p.y = alice.y[i]!;
    const off = Math.abs(p.x + 1.8 - b.x) > 0.3;
    return p.y - b.y > 3 || (off && b.lift < 0.5) ? inputFor(p.x + 1.8) : 0;
  });
  const res = await submitFlight(redis, day, 'bob', { wave: init.wave, inputs: encodeInputs(live.inputs) }, later);
  assert.ok(res.ok);
  if (!res.ok) return;
  const rode = res.rodeWith.find((r) => r.name === 'alice');
  assert.ok(rode && rode.secs >= 1.5, JSON.stringify(res.rodeWith));
  if (res.arrived) {
    assert.equal(await redis.zScore(K.carried(day), 'alice'), 1);
    await submitFlight(redis, day, 'bob', { wave: init.wave, inputs: encodeInputs(live.inputs) }, later + 1000);
    assert.equal(await redis.zScore(K.carried(day), 'alice'), 1);
  }
});

test('junk and stale waves are rejected', async () => {
  const redis = fakeRedis();
  assert.equal((await submitFlight(redis, day, 'eve', { wave: 1, inputs: [[999, 1]] }, now)).ok, false);
  assert.equal((await submitFlight(redis, day, 'eve', { wave: 42, inputs: [[0, 10]] }, now)).ok, false);
  assert.equal((await submitFlight(redis, day, 'eve', null, now)).ok, false);
});

test('a slower flight keeps the best and does not change the ghost', async () => {
  const redis = fakeRedis();
  const first = await flyAs(redis, 'carol', true, now);
  assert.ok(first.res.ok && first.res.arrived);
  const keyBefore = await redis.hGet(K.cur(day), 'carol');
  const init = await initFor(redis, day, 'carol', now + 1000);
  const slow = await submitFlight(redis, day, 'carol', { wave: init.wave, inputs: [[inputFor(20), 2000]] }, now + 2000);
  assert.ok(slow.ok);
  if (!slow.ok || !first.res.ok) return;
  assert.equal(slow.improved, false);
  assert.equal(slow.best?.time, first.res.time);
  assert.equal(slow.best?.tries, 1);
  assert.equal(await redis.hGet(K.cur(day), 'carol'), keyBefore);
});
