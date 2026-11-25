import { test } from 'node:test';
import assert from 'node:assert/strict';
import { botCrowd, botPolicy, randomStyle } from '../src/shared/skein/bots.ts';
import { decodeInputs, decodeTrack, encodeInputs, encodeTrack, fromB64, toB64 } from '../src/shared/skein/codec.ts';
import { buildGhosts, houseTracks, HOUSE_COUNT } from '../src/shared/skein/flock.ts';
import { LENGTH, MAX_TICKS, W, parFor } from '../src/shared/skein/rules.ts';
import { GLIDE, fly, flyWith, inputFor, sense, startBird, step } from '../src/shared/skein/sim.ts';
import { makeSky } from '../src/shared/skein/sky.ts';

test('sky is deterministic and storms keep their distance', () => {
  const a = makeSky(9);
  const b = makeSky(9);
  assert.deepEqual(a, b);
  assert.notDeepEqual(makeSky(10).storms, a.storms);
  for (const s of a.storms) {
    assert.ok(s.x >= 0 && s.x <= W && s.y > 100 && s.y < LENGTH);
    for (const t of a.storms) if (s !== t) assert.ok(Math.hypot(s.x - t.x, s.y - t.y) > s.r + t.r + 4);
  }
});

test('base64 and track codec round trip', () => {
  const bytes = [0, 1, 2, 250, 255, 128, 7];
  for (let n = 1; n <= bytes.length; n++) assert.deepEqual(fromB64(toB64(bytes.slice(0, n))), bytes.slice(0, n));
  const sky = makeSky(3);
  const f = flyWith(sky, [], (b) => inputFor(b.x + 1));
  const back = decodeTrack(encodeTrack(f.track))!;
  assert.equal(back.x.length, f.track.x.length);
  for (let i = 0; i < back.x.length; i++) {
    assert.ok(Math.abs(back.x[i]! - f.track.x[i]!) <= 0.1 + 1e-9);
    assert.ok(Math.abs(back.y[i]! - f.track.y[i]!) <= 0.01 + 1e-9);
  }
  assert.equal(decodeTrack('!!'), null);
});

test('inputs codec rejects junk', () => {
  const inputs = [0, 0, 5, 5, 5, 201, 0];
  assert.deepEqual(decodeInputs(encodeInputs(inputs)), inputs);
  assert.equal(decodeInputs([[202, 1]]), null);
  assert.equal(decodeInputs([[1, MAX_TICKS + 1]]), null);
  assert.equal(decodeInputs([[1.5, 1]]), null);
  assert.equal(decodeInputs('nope'), null);
});

test('replaying recorded inputs reproduces the flight exactly', () => {
  const sky = makeSky(4);
  const crowd = botCrowd(sky, 6, 4);
  const ghosts = buildGhosts(sky, crowd);
  const live = flyWith(sky, ghosts, botPolicy(sky, ghosts, randomStyle(99)));
  const again = fly(sky, ghosts, decodeInputs(encodeInputs(live.inputs))!);
  assert.equal(again.bird.arrived, live.bird.arrived);
  assert.equal(again.bird.time, live.bird.time);
  assert.deepEqual(again.bird.liftBy, live.bird.liftBy);
  assert.deepEqual(again.track, live.track);
});

test('gliding alone does not make it before dark', () => {
  const sky = makeSky(2);
  const f = fly(sky, [], []);
  assert.equal(f.bird.arrived, false);
  assert.ok(f.bird.y > LENGTH * 0.8);
});

test('the wild skein forms a V with wakes at its wingtips', () => {
  const sky = makeSky(5);
  const tracks = houseTracks(sky);
  assert.equal(tracks.length, HOUSE_COUNT);
  const ghosts = buildGhosts(sky, []);
  const b = startBird(ghosts.length);
  const lead = tracks[0]!;
  const i = 200;
  b.x = lead.x[i]! + 1.8;
  b.y = lead.y[i]! - 3;
  const s = sense(b, ghosts, i * 2);
  assert.ok(s.lift > 0.8, `lift ${s.lift}`);
  b.x = lead.x[i]!;
  assert.ok(sense(b, ghosts, i * 2).down > 0.5);
});

test('riding the skein beats flying solo, and both land', () => {
  for (const day of [1, 2, 3]) {
    const sky = makeSky(day);
    const wild = buildGhosts(sky, []);
    const solo = flyWith(sky, [], botPolicy(sky, [], { lane: 20, flapAbove: 0.3, seek: false, sprintAt: 300 })).bird;
    const rider = flyWith(sky, wild, botPolicy(sky, wild, { lane: 20, flapAbove: 0.9, seek: true, sprintAt: 260 })).bird;
    assert.ok(solo.arrived && rider.arrived);
    assert.ok(rider.time < solo.time, `day ${day}: rider ${rider.time} solo ${solo.time}`);
    assert.ok(rider.time < parFor() + 2);
    const credited = rider.liftBy.slice(0, HOUSE_COUNT).reduce((a, v) => a + v, 0);
    assert.ok(credited > 5);
  }
});

test('storms drain strength and thermals restore it', () => {
  const sky = makeSky(1);
  const s = sky.storms[0]!;
  const t = sky.thermals[0]!;
  const stormSky = { ...sky, storms: [s], thermals: [], wind: sky.wind.map(() => 0) };
  const b = startBird(0);
  b.x = s.x;
  b.y = s.y - 2;
  step(stormSky, [], b, GLIDE);
  assert.ok(b.storm);
  assert.ok(b.s < 1);
  const warm = { ...sky, storms: [], thermals: [t], wind: sky.wind.map(() => 0) };
  const c = startBird(0);
  c.s = 0.5;
  c.x = t.x;
  c.y = t.y - 1;
  step(warm, [], c, GLIDE);
  assert.ok(c.thermal);
  assert.ok(c.s > 0.5);
});
