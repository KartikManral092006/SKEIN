let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let windGain: GainNode | null = null;
let windFilter: BiquadFilterNode | null = null;
let noise: AudioBuffer | null = null;

const read = () => {
  try {
    return localStorage.getItem('skein-mute') === '1';
  } catch {
    return false;
  }
};

let muted = read();

export const isMuted = () => muted;

export const setMuted = (m: boolean) => {
  muted = m;
  try {
    localStorage.setItem('skein-mute', m ? '1' : '0');
  } catch {
    /* private mode */
  }
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.6, ctx.currentTime, 0.05);
};

const audio = () => {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.6;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
};

export const unlock = () => {
  audio();
};

export const startWind = () => {
  const a = audio();
  if (!a || !master || !noise || windGain) return;
  const src = a.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  windFilter = a.createBiquadFilter();
  windFilter.type = 'lowpass';
  windFilter.frequency.value = 500;
  windGain = a.createGain();
  windGain.gain.value = 0;
  src.connect(windFilter).connect(windGain).connect(master);
  src.start();
};

export const setWind = (speed: number, lift: number, storm: boolean) => {
  if (!ctx || !windGain || !windFilter) return;
  const t = ctx.currentTime;
  windGain.gain.setTargetAtTime(0.1 + speed * 0.012 + (storm ? 0.25 : 0), t, 0.2);
  windFilter.frequency.setTargetAtTime(260 + speed * 38 + lift * 500 + (storm ? 900 : 0), t, 0.25);
};

export const stopWind = () => {
  if (!ctx || !windGain) return;
  windGain.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
};

const burst = (at: number, dur: number, freq: number, q: number, vol: number) => {
  const a = audio();
  if (!a || !master || !noise) return;
  const src = a.createBufferSource();
  src.buffer = noise;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(master);
  src.start(at, Math.random());
  src.stop(at + dur + 0.05);
};

export const wingbeat = () => {
  const a = audio();
  if (!a) return;
  burst(a.currentTime, 0.16, 700, 0.9, 0.22);
};

const honkNote = (at: number, f0: number, vol: number) => {
  const a = audio();
  if (!a || !master) return;
  const o = a.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f0 * 0.82, at);
  o.frequency.exponentialRampToValueAtTime(f0, at + 0.05);
  o.frequency.exponentialRampToValueAtTime(f0 * 0.9, at + 0.16);
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = f0 * 3;
  f.Q.value = 3;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
  o.connect(f).connect(g).connect(master);
  o.start(at);
  o.stop(at + 0.22);
};

export const honk = (pitch = 1) => {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  honkNote(t, 330 * pitch, 0.12);
  honkNote(t + 0.17, 392 * pitch, 0.1);
};

export const splash = () => {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  burst(t, 0.6, 900, 0.5, 0.35);
  burst(t + 0.08, 0.9, 380, 0.7, 0.25);
  honkNote(t + 0.5, 392, 0.09);
  honkNote(t + 0.68, 494, 0.08);
  honkNote(t + 0.86, 587, 0.08);
};

export const dusk = () => {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime;
  for (const [f, d] of [
    [220, 0],
    [196, 0.25],
    [165, 0.5],
  ] as const) {
    const o = a.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t + d);
    g.gain.exponentialRampToValueAtTime(0.12, t + d + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.9);
    o.connect(g).connect(master);
    o.start(t + d);
    o.stop(t + d + 1);
  }
};
