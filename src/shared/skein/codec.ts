import { MAX_TICKS, W } from './rules.ts';
import { MAX_INPUT, type Track } from './sim.ts';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const LOOKUP = new Map([...B64].map((c, i) => [c, i]));

export const toB64 = (bytes: number[]) => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63]!;
    if (i + 2 < bytes.length) out += B64[n & 63]!;
  }
  return out;
};

export const fromB64 = (s: string): number[] | null => {
  const out: number[] = [];
  for (let i = 0; i < s.length; i += 4) {
    const chunk = s.slice(i, i + 4);
    if (chunk.length < 2) return null;
    let n = 0;
    for (let j = 0; j < 4; j++) {
      const v = j < chunk.length ? LOOKUP.get(chunk[j]!) : 0;
      if (v === undefined) return null;
      n = (n << 6) | v;
    }
    out.push((n >> 16) & 255);
    if (chunk.length > 2) out.push((n >> 8) & 255);
    if (chunk.length > 3) out.push(n & 255);
  }
  return out;
};

const MAX_SAMPLES = MAX_TICKS / 2 + 4;

export const encodeTrack = (track: Track) => {
  const bytes: number[] = [];
  let acc = Math.round(track.y[0]! * 100);
  const y0 = acc + 32768;
  bytes.push((y0 >> 8) & 255, y0 & 255);
  for (let i = 0; i < track.x.length; i++) {
    const xq = Math.max(0, Math.min(W * 5, Math.round(track.x[i]! * 5)));
    let dq = 0;
    if (i > 0) {
      dq = Math.max(0, Math.min(255, Math.round(track.y[i]! * 100) - acc));
      acc += dq;
    }
    bytes.push(xq, dq);
  }
  return toB64(bytes);
};

export const decodeTrack = (s: string): Track | null => {
  if (typeof s !== 'string' || s.length > 8000) return null;
  const bytes = fromB64(s);
  if (!bytes || bytes.length < 4 || bytes.length % 2 !== 0) return null;
  const n = (bytes.length - 2) / 2;
  if (n > MAX_SAMPLES) return null;
  let acc = ((bytes[0]! << 8) | bytes[1]!) - 32768;
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < n; i++) {
    const xq = bytes[2 + i * 2]!;
    if (xq > W * 5) return null;
    if (i > 0) acc += bytes[3 + i * 2]!;
    x.push(xq / 5);
    y.push(acc / 100);
  }
  return { x, y };
};

export const quantize = (track: Track): Track => decodeTrack(encodeTrack(track))!;

export const encodeInputs = (inputs: number[]): [number, number][] => {
  const out: [number, number][] = [];
  for (const v of inputs) {
    const last = out[out.length - 1];
    if (last && last[0] === v) last[1]++;
    else out.push([v, 1]);
  }
  return out;
};

export const decodeInputs = (raw: unknown): number[] | null => {
  if (!Array.isArray(raw) || raw.length > MAX_TICKS) return null;
  const out: number[] = [];
  for (const pair of raw) {
    if (!Array.isArray(pair) || pair.length !== 2) return null;
    const [v, n] = pair as unknown[];
    if (typeof v !== 'number' || typeof n !== 'number') return null;
    if (!Number.isInteger(v) || v < 0 || v > MAX_INPUT || !Number.isInteger(n) || n < 1) return null;
    if (out.length + n > MAX_TICKS) return null;
    for (let i = 0; i < n; i++) out.push(v);
  }
  return out;
};
