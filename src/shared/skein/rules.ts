export const EPOCH = Date.UTC(2026, 10, 25);
export const DAY_MS = 86_400_000;

export const HZ = 20;
export const DT = 0.05;
export const W = 40;
export const LENGTH = 1200;
export const TMAX = 100;
export const MAX_TICKS = TMAX * HZ;
export const START_X = 20;
export const START_V = 15;
export const SAMPLE = 2;
export const EDGE = 1.5;

export const V_FLAP = 21;
export const V_GLIDE = 11;
export const V_MIN = 8;
export const HOUSE_V = 17;

export const WAKE_NEAR = 0.6;
export const WAKE_FAR = 7;
export const WAKE_SIDE = 1.8;
export const WAKE_HALF = 0.9;

export const CREDIT_SECS = 1.5;
export const MAX_GHOSTS = 24;

export const dayFor = (now: number) => Math.max(1, Math.floor((now - EPOCH) / DAY_MS) + 1);

export const msToNextDay = (now: number) => DAY_MS - ((((now - EPOCH) % DAY_MS) + DAY_MS) % DAY_MS);

export const parFor = () => Math.round(((LENGTH - 10) / HOUSE_V) * 10) / 10;

export const starsFor = (time: number, par: number) => (time <= par ? 3 : time <= par * 1.1 ? 2 : 1);

export const fmtTime = (secs: number) => secs.toFixed(1);

export const ordinal = (n: number) => {
  const s = n % 100;
  if (s >= 11 && s <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`;
};
