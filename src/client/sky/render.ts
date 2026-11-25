import { LENGTH, TMAX, W } from '../../shared/skein/rules';
import type { Sky } from '../../shared/skein/sky';
import { CHUNK, paintChunk, paletteFor, shoreY } from './terrain';

export type Kind = 'you' | 'wild' | 'player' | 'mine';

export type DrawBird = {
  key: string;
  kind: Kind;
  x: number;
  y: number;
  hx: number;
  hy: number;
  flap: boolean;
  phase: number;
  name?: string | undefined;
  alpha?: number;
  rest?: boolean;
};

export type Frame = {
  camY: number;
  t: number;
  now: number;
  birds: DrawBird[];
  you: DrawBird | null;
  riding: string | null;
  lift: number;
  labels: number;
  rail: boolean;
  landed: number;
};

export type Fit = 'game' | 'splash';

const GOOSE: Record<Kind, { body: string; wing: string; band: string; neck: string }> = {
  you: { body: '#f6ecd6', wing: '#eadbb9', band: '#d9c79f', neck: '#c2562c' },
  wild: { body: '#57514a', wing: '#67615a', band: '#8a8278', neck: '#3a3530' },
  player: { body: '#2e2823', wing: '#3d352d', band: '#7a6d5d', neck: '#1b1612' },
  mine: { body: '#a99b86', wing: '#b8ab95', band: '#d6cab4', neck: '#c2562c' },
};

export class Painter {
  private ctx: CanvasRenderingContext2D;
  private chunks = new Map<number, HTMLCanvasElement>();
  private w = 1;
  private h = 1;
  private dpr = 1;
  scale = 10;
  x0 = 0;
  anchor = 0.7;

  constructor(
    private canvas: HTMLCanvasElement,
    private sky: Sky,
    private fit: Fit
  ) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  resize(w: number, h: number, dpr: number) {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    const wide = w >= 560;
    this.scale = this.fit === 'game' ? Math.min(w / W, h / 56) : wide ? Math.min(w / 34, h / 22) : Math.min(w / 26, h / 26);
    this.x0 = W / 2 - (this.fit === 'splash' && wide ? w * 0.7 : w / 2) / this.scale;
    if (this.fit === 'splash') this.anchor = wide ? 0.55 : 0.36;
    this.chunks.clear();
  }

  worldX(clientX: number) {
    const r = this.canvas.getBoundingClientRect();
    return this.x0 + (clientX - r.left) / this.scale;
  }

  private chunk(i: number) {
    let c = this.chunks.get(i);
    if (c) return c;
    const res = Math.min(this.dpr, 1.5) * this.scale;
    const x1 = this.x0 + this.w / this.scale;
    c = document.createElement('canvas');
    c.width = Math.ceil((x1 - this.x0) * res);
    c.height = Math.ceil(CHUNK * res);
    const g = c.getContext('2d')!;
    g.setTransform(res, 0, 0, -res, -this.x0 * res, (i + 1) * CHUNK * res);
    paintChunk(g, this.sky, i, this.x0, x1);
    this.chunks.set(i, c);
    if (this.chunks.size > 6) {
      for (const k of this.chunks.keys()) {
        if (Math.abs(k - i) > 2) this.chunks.delete(k);
      }
    }
    return c;
  }

  private world(camY: number) {
    const s = this.scale * this.dpr;
    this.ctx.setTransform(s, 0, 0, -s, -this.x0 * s, (this.h * this.anchor + camY * this.scale) * this.dpr);
  }

  private screen() {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  sy(y: number, camY: number) {
    return this.h * this.anchor - (y - camY) * this.scale;
  }

  sx(x: number) {
    return (x - this.x0) * this.scale;
  }

  private goose(b: DrawBird, now: number, shadow: boolean) {
    const ctx = this.ctx;
    const c = GOOSE[b.kind];
    const ang = Math.atan2(b.hx, b.hy);
    const beat = b.flap ? Math.sin(now / 95 + b.phase) : Math.sin(now / 900 + b.phase) * 0.06;
    const span = 1.32 * (b.flap ? 0.8 + 0.2 * beat : 1);
    const lift = b.flap ? 0.14 * beat : 0;
    ctx.save();
    if (shadow) {
      if (b.rest) {
        ctx.restore();
        return;
      }
      ctx.translate(b.x + 2.2, b.y - 1.3);
      ctx.rotate(-ang);
      ctx.globalAlpha = (b.alpha ?? 1) * 0.16;
      ctx.fillStyle = '#140c05';
      ctx.beginPath();
      ctx.ellipse(0, 0.05, span * 0.95, 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.translate(b.x, b.y);
    ctx.rotate(-ang);
    ctx.scale(1.22, 1.22);
    ctx.globalAlpha = b.alpha ?? 1;
    if (b.rest) {
      const r = (now / 2400 + b.phase) % 1;
      ctx.strokeStyle = `rgba(255,236,210,${0.3 * (1 - r)})`;
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.ellipse(0, 0, 0.5 + r * 1.1, 0.8 + r * 1.1, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = c.wing;
      ctx.beginPath();
      ctx.ellipse(0, -0.05, 0.32, 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = c.body;
      ctx.beginPath();
      ctx.ellipse(0, -0.1, 0.18, 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = c.neck;
      ctx.beginPath();
      ctx.ellipse(0, 0.55, 0.075, 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, 0.8, 0.1, 0.13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.fillStyle = c.wing;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 0.16, 0.2);
      ctx.bezierCurveTo(side * span * 0.45, 0.3 + lift, side * span * 0.8, 0.26 + lift, side * span, 0.06 + lift);
      ctx.lineTo(side * span * 0.97, -0.04 + lift);
      ctx.bezierCurveTo(side * span * 0.75, -0.06 + lift, side * span * 0.4, -0.16 + lift * 0.5, side * 0.16, -0.24);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = c.band;
      ctx.lineWidth = 0.055;
      ctx.beginPath();
      ctx.moveTo(side * 0.22, 0.04);
      ctx.bezierCurveTo(side * span * 0.4, 0.08 + lift, side * span * 0.7, 0.06 + lift, side * span * 0.9, 0.01 + lift);
      ctx.stroke();
    }
    ctx.fillStyle = c.body;
    ctx.beginPath();
    ctx.ellipse(0, -0.08, 0.2, 0.56, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-0.13, -0.52);
    ctx.lineTo(0, -0.82);
    ctx.lineTo(0.13, -0.52);
    ctx.fill();
    ctx.fillStyle = c.neck;
    ctx.beginPath();
    ctx.ellipse(0, 0.6, 0.075, 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 0.9, 0.1, 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = b.kind === 'you' ? '#e2a23c' : '#b8803a';
    ctx.beginPath();
    ctx.moveTo(-0.045, 1.0);
    ctx.lineTo(0, 1.13);
    ctx.lineTo(0.045, 1.0);
    ctx.fill();
    ctx.restore();
  }

  private wake(b: DrawBird, now: number, riding: boolean, lift: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      for (let k = 0; k <= 12; k++) {
        const yy = b.y - 0.5 - k * 0.55;
        const wob = 0.16 * Math.sin(k * 1.25 - now / 140 + side) * (k / 12);
        const xx = b.x + side * (1.6 + Math.min(k, 4) * 0.05 + wob);
        if (k) ctx.lineTo(xx, yy);
        else ctx.moveTo(xx, yy);
      }
      if (riding) {
        ctx.strokeStyle = `rgba(242,184,91,${0.35 + 0.45 * lift})`;
        ctx.lineWidth = 0.22;
        ctx.shadowColor = 'rgba(242,184,91,0.9)';
        ctx.shadowBlur = 8 * this.dpr;
      } else {
        ctx.strokeStyle = b.kind === 'wild' ? 'rgba(255,244,226,0.13)' : 'rgba(255,244,226,0.18)';
        ctx.lineWidth = 0.08;
        ctx.shadowBlur = 0;
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  private thermals(camY: number, now: number) {
    const ctx = this.ctx;
    for (const t of this.sky.thermals) {
      if (Math.abs(t.y - camY) > 60) continue;
      const g = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.r * 1.3);
      g.addColorStop(0, 'rgba(255,196,120,0.38)');
      g.addColorStop(1, 'rgba(255,196,120,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r * 1.3, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 3; i++) {
        const f = (now / 2200 + i / 3) % 1;
        ctx.strokeStyle = `rgba(255,226,170,${0.45 * (1 - f)})`;
        ctx.lineWidth = 0.09;
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.r * (0.25 + 0.8 * f), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  private storms(camY: number, now: number, shadow: boolean) {
    const ctx = this.ctx;
    this.sky.storms.forEach((s, i) => {
      if (Math.abs(s.y - camY) > 70) return;
      const puffs = 7;
      if (shadow) {
        ctx.fillStyle = 'rgba(14,12,22,0.32)';
        for (let k = 0; k < puffs; k++) {
          const a = (k / puffs) * Math.PI * 2 + i;
          ctx.beginPath();
          ctx.arc(s.x + 2.4 + Math.cos(a) * s.r * 0.5, s.y - 1.3 + Math.sin(a) * s.r * 0.45, s.r * 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
        return;
      }
      const flash = (now / 1000 + i * 0.73) % 6.5 < 0.09;
      for (let k = 0; k < puffs; k++) {
        const a = (k / puffs) * Math.PI * 2 + i;
        const px = s.x + Math.cos(a) * s.r * 0.5;
        const py = s.y + Math.sin(a) * s.r * 0.45;
        const r = s.r * (0.52 + 0.12 * Math.sin(k * 2.1 + i));
        const g = ctx.createRadialGradient(px - r * 0.35, py + r * 0.35, r * 0.1, px, py, r);
        g.addColorStop(0, flash ? '#d8dcf0' : '#8a90a6');
        g.addColorStop(1, flash ? '#8f95b5' : '#3f4456');
        ctx.fillStyle = g;
        ctx.globalAlpha = 0.93;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(190,205,235,0.45)';
      ctx.lineWidth = 0.06;
      ctx.beginPath();
      for (let k = 0; k < 26; k++) {
        const f = (now / 600 + k * 0.137) % 1;
        const a = k * 2.399;
        const rr = s.r * 0.95 * Math.sqrt((k + 0.5) / 26);
        const x = s.x + Math.cos(a) * rr;
        const y = s.y + Math.sin(a) * rr * 0.9 - f * 0.8;
        ctx.moveTo(x, y);
        ctx.lineTo(x - 0.12, y - 0.45);
      }
      ctx.stroke();
    });
  }

  private lake(camY: number, now: number) {
    if (LENGTH - camY > 80) return;
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255,226,190,0.22)';
    ctx.lineWidth = 0.08;
    ctx.beginPath();
    for (let i = 0; i < 40; i++) {
      const x = this.x0 + ((i * 7.31) % (this.w / this.scale));
      const y = LENGTH + 2 + ((i * 3.7) % 40);
      const d = 0.6 + 0.4 * Math.sin(now / 700 + i);
      if (y > shoreY(x) + 0.5) {
        ctx.moveTo(x - d, y);
        ctx.lineTo(x + d, y);
      }
    }
    ctx.stroke();
  }

  draw(f: Frame) {
    const ctx = this.ctx;
    this.screen();
    ctx.fillStyle = paletteFor(this.sky.biome).base;
    ctx.fillRect(0, 0, this.w, this.h);
    const top = f.camY + (this.h * this.anchor) / this.scale;
    const bottom = f.camY - (this.h * (1 - this.anchor)) / this.scale;
    for (let i = Math.floor(bottom / CHUNK); i <= Math.floor(top / CHUNK); i++) {
      const c = this.chunk(i);
      const y = this.sy((i + 1) * CHUNK, f.camY);
      ctx.drawImage(c, 0, y, c.width / (c.width / this.w), CHUNK * this.scale);
    }

    this.world(f.camY);
    this.lake(f.camY, f.now);
    this.thermals(f.camY, f.now);
    this.storms(f.camY, f.now, true);
    const visible = f.birds.filter((b) => b.y > bottom - 4 && b.y < top + 4);
    for (const b of visible) this.goose(b, f.now, true);
    if (f.you) this.goose(f.you, f.now, true);
    if (f.you) {
      for (const b of visible) {
        const dy = b.y - f.you.y;
        if (dy > -2 && dy < 26) this.wake(b, f.now, b.key === f.riding, f.lift);
      }
    } else {
      for (const b of visible) if (b.kind !== 'wild' || b.key === 'wild-0') this.wake(b, f.now, false, 0);
    }
    for (const b of visible) this.goose(b, f.now, false);
    if (f.you) {
      ctx.fillStyle = 'rgba(255,240,214,0.13)';
      ctx.beginPath();
      ctx.arc(f.you.x, f.you.y, 2.1, 0, Math.PI * 2);
      ctx.fill();
      this.goose(f.you, f.now, false);
    }
    this.storms(f.camY, f.now, false);

    this.screen();
    const dusk = Math.max(0, Math.min(1, (f.t / TMAX - 0.35) / 0.65));
    const dark = dusk * dusk * 0.78;
    const warm = ctx.createLinearGradient(0, 0, this.w * 0.8, this.h);
    warm.addColorStop(0, `rgba(255,150,70,${0.2 * (1 - dusk)})`);
    warm.addColorStop(0.6, 'rgba(255,150,70,0)');
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, this.w, this.h);
    if (dark > 0) {
      ctx.fillStyle = `rgba(16,18,42,${dark})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    const vg = ctx.createRadialGradient(this.w / 2, this.h * 0.55, Math.min(this.w, this.h) * 0.35, this.w / 2, this.h * 0.55, Math.max(this.w, this.h) * 0.8);
    vg.addColorStop(0, 'rgba(10,6,8,0)');
    vg.addColorStop(1, 'rgba(10,6,8,0.42)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, this.w, this.h);

    const left = this.sx(0);
    const right = this.sx(W);
    if (left > 1) {
      ctx.fillStyle = 'rgba(14,10,12,0.45)';
      ctx.fillRect(0, 0, left, this.h);
      ctx.fillRect(right, 0, this.w - right, this.h);
    }

    if (f.labels > 0 && f.you) {
      const you = f.you;
      const named = visible
        .filter((b) => b.name && Math.abs(b.y - you.y) < 22 && Math.hypot(b.x - you.x, b.y - you.y) > 3)
        .sort((a, b) => Math.abs(a.y - you.y) + Math.abs(a.x - you.x) - (Math.abs(b.y - you.y) + Math.abs(b.x - you.x)))
        .slice(0, f.labels);
      ctx.font = '500 10px "DM Mono", ui-monospace, monospace';
      ctx.textAlign = 'center';
      const placed: [number, number, number][] = [[this.sx(you.x), this.sy(you.y, f.camY), 3.2 * this.scale]];
      for (const b of named) {
        const x = this.sx(b.x);
        const y = this.sy(b.y, f.camY) - 1.9 * this.scale;
        const text = b.kind === 'mine' ? 'your best' : `u/${b.name}`;
        const tw = ctx.measureText(text).width + 10;
        if (placed.some(([px, py, pw]) => Math.abs(px - x) < (pw + tw) / 2 && Math.abs(py - y) < Math.max(17, pw / 2))) continue;
        placed.push([x, y, tw]);
        ctx.fillStyle = b.key === f.riding ? 'rgba(242,184,91,0.92)' : 'rgba(28,23,25,0.62)';
        ctx.beginPath();
        ctx.roundRect(x - tw / 2, y - 9, tw, 15, 7.5);
        ctx.fill();
        ctx.fillStyle = b.key === f.riding ? '#1f1a15' : '#f3e8d2';
        ctx.fillText(text, x, y + 2);
      }
    }

    if (f.rail) this.rail(f);
  }

  private rail(f: Frame) {
    const ctx = this.ctx;
    const x = this.w - 12;
    const t = 64;
    const b = this.h - 92;
    const yOf = (y: number) => b - (Math.max(0, Math.min(LENGTH, y)) / LENGTH) * (b - t);
    ctx.strokeStyle = 'rgba(243,232,210,0.28)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, t);
    ctx.lineTo(x, b);
    ctx.stroke();
    ctx.fillStyle = '#6e9aa3';
    ctx.beginPath();
    ctx.ellipse(x, t - 6, 6, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const bird of f.birds) {
      if (bird.kind === 'wild' && bird.key !== 'wild-0') continue;
      ctx.fillStyle = bird.kind === 'wild' ? 'rgba(200,195,185,0.75)' : 'rgba(243,232,210,0.45)';
      ctx.fillRect(x - 3, yOf(bird.y) - 0.75, 6, 1.5);
    }
    if (f.you) {
      ctx.fillStyle = '#f6ecd6';
      ctx.strokeStyle = '#c2562c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, yOf(f.you.y), 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}
