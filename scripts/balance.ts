import { botCrowd, botPolicy, randomStyle } from '../src/shared/skein/bots.ts';
import { buildGhosts } from '../src/shared/skein/flock.ts';
import { parFor } from '../src/shared/skein/rules.ts';
import { GLIDE, flyWith, inputFor } from '../src/shared/skein/sim.ts';
import { makeSky } from '../src/shared/skein/sky.ts';

const days = Number(process.argv[2] ?? 6);
const par = parFor();
console.log(`par ${par}`);
for (let day = 1; day <= days; day++) {
  const sky = makeSky(day);
  const wild = buildGhosts(sky, []);
  const glide = flyWith(sky, wild, () => GLIDE);
  const flapAll = flyWith(sky, [], (b) => inputFor(b.x));
  const solo = flyWith(sky, [], botPolicy(sky, [], { lane: 20, flapAbove: 0.3, seek: false, sprintAt: 300 })).bird;
  const rider = flyWith(sky, wild, botPolicy(sky, wild, { lane: 20, flapAbove: 0.9, seek: true, sprintAt: 260 })).bird;
  const crowd = botCrowd(sky, 30, day);
  const late = buildGhosts(sky, crowd);
  const times: number[] = [];
  for (let i = 0; i < 10; i++) {
    const b = flyWith(sky, late, botPolicy(sky, late, randomStyle(day * 31 + i))).bird;
    if (b.arrived) times.push(b.time);
  }
  const f = (b: { arrived: boolean; time: number; y: number }) => (b.arrived ? `${b.time.toFixed(1)}s` : `dark@${Math.round(b.y)}`);
  console.log(
    `day ${day} ${sky.region.padEnd(18)} storms ${sky.storms.length} glide-only ${f(glide.bird)} flap-only ${f(flapAll.bird)} solo ${f(solo)} rider ${f(rider)} crowd ${crowd.length}/30 late best ${times.length ? Math.min(...times).toFixed(1) : '-'} median ${times.length ? times.sort((a, b) => a - b)[Math.floor(times.length / 2)]!.toFixed(1) : '-'}`
  );
}
