import './index.css';

import { StrictMode, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { requestExpandedMode } from '@devvit/web/client';
import type { SplashResponse } from '../shared/skein/api';
import { buildGhosts } from '../shared/skein/flock';
import { DT, LENGTH } from '../shared/skein/rules';
import { posAt } from '../shared/skein/sim';
import { makeSky } from '../shared/skein/sky';
import { loadSplash } from './sky/api';
import { Painter, type DrawBird } from './sky/render';
import { legDate } from './sky/ui';

const LOOP_FROM = 6;
const LOOP_SECS = 34;

const Splash = () => {
  const [info, setInfo] = useState<SplashResponse | null>(null);
  const sky = useMemo(() => (info ? makeSky(info.day) : null), [info]);
  const ghosts = useMemo(() => (info && sky ? buildGhosts(sky, info.ghosts) : []), [info, sky]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    void loadSplash().then(setInfo);
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas || !sky) return;
    const p = new Painter(canvas, sky, 'splash');
    const fit = () => {
      const r = wrap.getBoundingClientRect();
      p.resize(Math.max(40, r.width), Math.max(40, r.height), Math.min(2, window.devicePixelRatio || 1));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    const pos = { x: 0, y: 0 };
    const ahead = { x: 0, y: 0 };
    const start = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const secs = LOOP_FROM + (((now - start) / 1000) % LOOP_SECS);
      const tick = secs / DT;
      const birds: DrawBird[] = ghosts.map((g) => {
        posAt(g.track, tick, pos);
        posAt(g.track, tick + 2, ahead);
        const speed = (ahead.y - pos.y) / (2 * DT);
        return {
          key: g.key,
          kind: g.name ? 'player' : 'wild',
          x: pos.x,
          y: pos.y,
          hx: ahead.x - pos.x,
          hy: Math.max(0.2, ahead.y - pos.y),
          flap: g.name ? speed > 17.5 : Math.sin(now / 2600 + g.key.length) > 0.6,
          phase: g.key.charCodeAt(g.key.length - 1),
          name: g.name ?? undefined,
        };
      });
      const lead = ghosts[0];
      if (lead) posAt(lead.track, tick, pos);
      p.draw({ camY: Math.min(LENGTH - 20, pos.y - 4), t: 20, now, birds, you: null, riding: null, lift: 0, labels: 0, rail: false, landed: 0 });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [sky, ghosts]);

  const open = (event: MouseEvent<HTMLButtonElement>) => requestExpandedMode(event.nativeEvent, 'game');
  const stats = info?.stats;
  const carrier = info?.carriers[0];
  const flown = stats?.landed ?? 0;

  return (
    <main className="relative h-full w-full overflow-hidden bg-dusk">
      <div ref={wrapRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="absolute inset-0" aria-hidden="true" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(0deg,rgb(28_23_25/0.92)_8%,rgb(28_23_25/0.55)_42%,transparent_70%)] min-[560px]:bg-[linear-gradient(90deg,rgb(28_23_25/0.92)_20%,rgb(28_23_25/0.5)_50%,transparent_75%)]" />
      <section className="relative z-10 flex h-full max-w-[360px] flex-col justify-end gap-1.5 px-5 pb-5 min-[560px]:justify-center">
        <p className="label h-4 text-paper/75">{info && sky ? `Leg ${info.day} · ${legDate(info.day)} · ${sky.region}` : ''}</p>
        <h1 className="serif text-[56px] text-paper">Skein</h1>
        <p className="text-[13px] leading-snug text-paper/90">
          Fly today’s leg before dark. Every goose in your sky flew it earlier today, and <span className="text-gold">their wakes carry you</span>.
        </p>
        <button type="button" onClick={open} className="btn-rust mt-2 w-fit px-7 py-3 text-[15px] font-medium">
          {info?.me.best ? 'Fly again' : 'Take off'}
        </button>
        <p className="h-4 text-[11.5px] text-paper/70">
          {info?.me.best
            ? `Your best ${info.me.best.time.toFixed(1)}s${info.me.carried ? ` · your wake carried ${info.me.carried}` : ''}`
            : flown
              ? `${flown} ${flown === 1 ? 'goose has' : 'geese have'} flown this leg${carrier ? ` · u/${carrier.name} carried ${carrier.carried}` : ''}`
              : info
                ? 'Be the first goose up. Your wake leads the flock.'
                : ''}
        </p>
      </section>
    </main>
  );
};

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Splash />
    </StrictMode>
  );
}
