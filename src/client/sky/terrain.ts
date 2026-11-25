import { hash, mulberry32 } from '../../shared/skein/rng';
import { LENGTH } from '../../shared/skein/rules';
import type { Biome, Sky } from '../../shared/skein/sky';

type Palette = {
  base: string;
  parcels: string[];
  mark: string;
  hedge: string;
  tree: string;
  treeLight: string;
  water: string;
  waterLight: string;
  bank: string;
  road: string;
  roofs: string[];
};

const PALETTES: Record<Biome, Palette> = {
  fields: {
    base: '#6d6a3c',
    parcels: ['#b08a4f', '#c4a564', '#8f8a4e', '#a26c3f', '#7a8250', '#c9b27a', '#93703f', '#b99a5c'],
    mark: 'rgba(40,26,12,0.17)',
    hedge: '#36401f',
    tree: '#2f3b1f',
    treeLight: '#56683a',
    water: '#3f5d66',
    waterLight: '#9cbab5',
    bank: '#5e5f36',
    road: '#d2bf95',
    roofs: ['#8e3b25', '#6b5444', '#a39684'],
  },
  marsh: {
    base: '#5c6646',
    parcels: ['#7d8455', '#8f8a5c', '#a39a68', '#6f7a52', '#5f6b48', '#b3a777', '#86906a'],
    mark: 'rgba(28,36,18,0.18)',
    hedge: '#3a4529',
    tree: '#34432a',
    treeLight: '#5e7044',
    water: '#3a5862',
    waterLight: '#a8c3bd',
    bank: '#7f7c56',
    road: '#c5b88f',
    roofs: ['#5d4a3a', '#7d6a58'],
  },
  moor: {
    base: '#5d4c43',
    parcels: ['#7c5d5a', '#8a6b4f', '#6f5a64', '#9a7a55', '#5f5047', '#a08463', '#7f6a52'],
    mark: 'rgba(30,18,22,0.18)',
    hedge: '#9b917f',
    tree: '#2f3624',
    treeLight: '#4f5a3a',
    water: '#3b4f5e',
    waterLight: '#a3b4bb',
    bank: '#6d5c4c',
    road: '#bfae8e',
    roofs: ['#6e6258', '#4e4640'],
  },
  delta: {
    base: '#7a7d52',
    parcels: ['#a59a66', '#c3b07a', '#8d8f5c', '#b7a06a', '#7b8a5a', '#d0bd88'],
    mark: 'rgba(48,40,18,0.15)',
    hedge: '#3c4824',
    tree: '#344423',
    treeLight: '#5b7140',
    water: '#45666e',
    waterLight: '#a9c6c0',
    bank: '#d6c79c',
    road: '#d9c9a0',
    roofs: ['#8a4a2e', '#6c5a48'],
  },
  orchard: {
    base: '#5f6b3a',
    parcels: ['#8a9450', '#a9a35c', '#c0a868', '#7c8a4a', '#9d7f4a', '#b0b06a'],
    mark: 'rgba(34,40,14,0.16)',
    hedge: '#334019',
    tree: '#2e4220',
    treeLight: '#5f7c3c',
    water: '#3f5e64',
    waterLight: '#9dbbb3',
    bank: '#6b6c3a',
    road: '#d0bd8f',
    roofs: ['#93432a', '#74604c', '#a89a86'],
  },
};

export const paletteFor = (biome: Biome) => PALETTES[biome];

export const CHUNK = 60;
const ROW = 22;

export const riverX = (sky: Sky, y: number, k = 0) => {
  const a = (hash(sky.day, 3 + k) % 1000) / 159;
  const b = (hash(sky.day, 5 + k) % 1000) / 211;
  const side = k === 0 ? 0 : k === 1 ? 9 : -10;
  return 20 + side + 12 * Math.sin(y / 97 + a) + 5 * Math.sin(y / 33 + b);
};

export const shoreY = (x: number) => LENGTH - 3 + 1.3 * Math.sin(x * 0.31 + 1.7) + 0.6 * Math.sin(x * 1.07);

const blob = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
};

const tree = (ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, r: number) => {
  ctx.fillStyle = 'rgba(20,14,6,0.3)';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.9, y - r * 0.35, r * 1.15, r * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = p.tree;
  blob(ctx, x, y, r);
  ctx.fillStyle = p.treeLight;
  blob(ctx, x - r * 0.3, y + r * 0.25, r * 0.5);
};

const river = (ctx: CanvasRenderingContext2D, sky: Sky, p: Palette, y0: number, y1: number, k: number, width: number) => {
  const pts: [number, number][] = [];
  for (let y = y0 - 4; y <= y1 + 4; y += 1) pts.push([riverX(sky, y, k), y]);
  const stroke = (color: string, w: number, dx = 0) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x + dx, y) : ctx.moveTo(x + dx, y)));
    ctx.stroke();
  };
  stroke(p.bank, width + 1.3);
  stroke(p.water, width);
  ctx.globalAlpha = 0.35;
  stroke(p.waterLight, width * 0.12, -width * 0.22);
  ctx.globalAlpha = 1;
};

export const paintChunk = (ctx: CanvasRenderingContext2D, sky: Sky, index: number, x0: number, x1: number) => {
  const p = PALETTES[sky.biome];
  const y0 = index * CHUNK;
  const y1 = y0 + CHUNK;
  ctx.fillStyle = p.base;
  ctx.fillRect(x0 - 1, y0 - 1, x1 - x0 + 2, y1 - y0 + 2);

  const rowsFrom = Math.floor((y0 - 2) / ROW);
  const rowsTo = Math.floor((y1 + 2) / ROW);
  const hedgeTrees: [number, number, number][] = [];
  for (let r = rowsFrom; r <= rowsTo; r++) {
    const rnd = mulberry32(hash(sky.day, r + 5000, 17));
    const top = (r + 1) * ROW;
    const bottom = r * ROW;
    let a = -60 - rnd() * 12;
    while (a < 100) {
      const w = 6 + rnd() * 15;
      const b = a + w;
      const color = p.parcels[Math.floor(rnd() * p.parcels.length)]!;
      const style = rnd();
      const angle = rnd() < 0.5 ? 0 : rnd() < 0.5 ? Math.PI / 2 : (rnd() - 0.5) * 1.2;
      if (b > x0 - 2 && a < x1 + 2) {
        const gap = sky.biome === 'moor' ? 0.12 : 0.28;
        ctx.fillStyle = color;
        ctx.fillRect(a + gap, bottom + gap, w - gap * 2, ROW - gap * 2);
        ctx.save();
        ctx.beginPath();
        ctx.rect(a + gap, bottom + gap, w - gap * 2, ROW - gap * 2);
        ctx.clip();
        const cx = (a + b) / 2;
        const cy = (top + bottom) / 2;
        if (sky.biome === 'orchard' && style < 0.45) {
          for (let ty = bottom + 1.2; ty < top - 0.6; ty += 1.7)
            for (let tx = a + 1.1 + ((ty / 1.7) % 2) * 0.4; tx < b - 0.6; tx += 1.6) tree(ctx, p, tx, ty, 0.42);
        } else if ((sky.biome === 'moor' || sky.biome === 'marsh') && style < 0.6) {
          const speck = mulberry32(hash(sky.day, r, Math.floor(a * 10)));
          for (let i = 0; i < w * ROW * 0.6; i++) {
            ctx.fillStyle = speck() < 0.5 ? 'rgba(255,240,220,0.07)' : 'rgba(20,10,20,0.12)';
            blob(ctx, a + speck() * w, bottom + speck() * ROW, 0.12 + speck() * 0.35);
          }
        } else {
          ctx.translate(cx, cy);
          ctx.rotate(angle);
          ctx.strokeStyle = p.mark;
          ctx.lineWidth = 0.11;
          const span = Math.max(w, ROW) * 1.5;
          ctx.beginPath();
          for (let s = -span; s < span; s += 0.55) {
            ctx.moveTo(-span, s);
            ctx.lineTo(span, s);
          }
          ctx.stroke();
        }
        ctx.restore();
        if (sky.biome !== 'moor' && rnd() < 0.55) {
          const n = Math.floor(w / 2.2);
          for (let i = 0; i < n; i++) if (rnd() < 0.55) hedgeTrees.push([a + i * 2.2 + rnd(), top - 0.1 + (rnd() - 0.5) * 0.6, 0.45 + rnd() * 0.45]);
        }
        if (sky.biome !== 'marsh' && rnd() < 0.05 && w > 9) {
          const fx = a + 2 + rnd() * (w - 5);
          const fy = bottom + 3 + rnd() * (ROW - 8);
          for (let i = 0; i < 3; i++) {
            const bx = fx + i * 1.6 * (rnd() < 0.5 ? 1 : 0.6);
            const by = fy + (i === 1 ? 1.4 : 0);
            const bw = 1.1 + rnd() * 0.9;
            const bh = 0.8 + rnd() * 0.5;
            ctx.fillStyle = 'rgba(20,12,6,0.35)';
            ctx.fillRect(bx + 0.35, by - 0.35, bw, bh);
            ctx.fillStyle = p.roofs[Math.floor(rnd() * p.roofs.length)]!;
            ctx.fillRect(bx, by, bw, bh);
            ctx.fillStyle = 'rgba(255,240,220,0.18)';
            ctx.fillRect(bx, by + bh / 2, bw, bh / 2);
          }
        }
      } else {
        for (let i = 0; i < 8; i++) rnd();
      }
      a = b;
    }
    ctx.strokeStyle = p.hedge;
    ctx.lineWidth = sky.biome === 'moor' ? 0.16 : 0.32;
    ctx.beginPath();
    ctx.moveTo(x0 - 1, top);
    ctx.lineTo(x1 + 1, top);
    ctx.stroke();
  }

  if (sky.biome === 'delta') {
    river(ctx, sky, p, y0, y1, 1, 1.6);
    river(ctx, sky, p, y0, y1, 2, 1.3);
    river(ctx, sky, p, y0, y1, 0, 3.6);
  } else if (sky.biome === 'marsh') {
    river(ctx, sky, p, y0, y1, 0, 2.2);
    const rnd = mulberry32(hash(sky.day, index, 99));
    for (let i = 0; i < 5; i++) {
      const px = x0 + rnd() * (x1 - x0);
      const py = y0 + 4.5 + rnd() * (CHUNK - 9);
      const rx = 1.2 + rnd() * 2.5;
      ctx.fillStyle = p.bank;
      ctx.beginPath();
      ctx.ellipse(px, py, rx + 0.4, rx * 0.6 + 0.4, rnd(), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.water;
      ctx.beginPath();
      ctx.ellipse(px, py, rx, rx * 0.6, rnd(), 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    river(ctx, sky, p, y0, y1, 0, sky.biome === 'moor' ? 1.1 : 1.9);
  }

  for (const [x, y, r] of hedgeTrees) if (x > x0 - 2 && x < x1 + 2) tree(ctx, p, x, y, r);

  const rnd = mulberry32(hash(sky.day, index, 41));
  const copses = sky.biome === 'moor' ? 1 : 2;
  for (let c = 0; c < copses; c++) {
    if (rnd() < 0.4) continue;
    const cx = x0 + rnd() * (x1 - x0);
    const cy = y0 + 4.5 + rnd() * (CHUNK - 9);
    const rx = riverX(sky, cy);
    if (Math.abs(cx - rx) < 3) continue;
    for (let i = 0; i < 14; i++) tree(ctx, p, cx + (rnd() - 0.5) * 6, cy + (rnd() - 0.5) * 5, 0.5 + rnd() * 0.6);
  }

  if (y1 > LENGTH - 8) {
    ctx.fillStyle = p.bank;
    ctx.beginPath();
    ctx.moveTo(x0 - 1, y1 + 1);
    for (let x = x0 - 1; x <= x1 + 1; x += 0.5) ctx.lineTo(x, shoreY(x) - 0.9);
    ctx.lineTo(x1 + 1, y1 + 1);
    ctx.fill();
    ctx.fillStyle = p.water;
    ctx.beginPath();
    ctx.moveTo(x0 - 1, y1 + 40);
    for (let x = x0 - 1; x <= x1 + 1; x += 0.5) ctx.lineTo(x, shoreY(x));
    ctx.lineTo(x1 + 1, y1 + 40);
    ctx.fill();
    const reeds = mulberry32(hash(sky.day, 777));
    ctx.strokeStyle = '#4c5530';
    ctx.lineWidth = 0.09;
    ctx.beginPath();
    for (let x = x0; x < x1; x += 0.35) {
      if (reeds() < 0.45) continue;
      const sy = shoreY(x) - 0.6 + reeds() * 0.9;
      ctx.moveTo(x, sy);
      ctx.lineTo(x + (reeds() - 0.5) * 0.3, sy + 0.4 + reeds() * 0.6);
    }
    ctx.stroke();
  }
};
