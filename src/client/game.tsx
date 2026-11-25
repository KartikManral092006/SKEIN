import './index.css';

import { StrictMode, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { FlightResponse, InitResponse } from '../shared/skein/api';
import { botPolicy } from '../shared/skein/bots';
import { buildGhosts } from '../shared/skein/flock';
import { DT, LENGTH, START_X, msToNextDay, ordinal } from '../shared/skein/rules';
import { GLIDE, inputFor, posAt, startBird, step, type Bird, type Ghost } from '../shared/skein/sim';
import { makeSky, type Sky } from '../shared/skein/sky';
import { loadInit, sendFlight, shareComment, subscribe } from './sky/api';
import * as sfx from './sky/audio';
import { Painter, type DrawBird, type Kind } from './sky/render';
import { Close, HelpIcon, SoundOff, SoundOn, Stars, WakeDiagram, legDate } from './sky/ui';

type Phase = 'ready' | 'flying' | 'landing' | 'result' | 'dark';

type Hud = { t: number; s: number; lift: number; riding: string | null; storm: boolean; thermal: boolean; progress: number };

const TICK_MS = DT * 1000;

const seen = (k: string) => {
  try {
    return localStorage.getItem(k) === '1';
  } catch {
    return false;
  }
};

const mark = (k: string) => {
  try {
    localStorage.setItem(k, '1');
  } catch {
    /* private mode */
  }
};

const until = () => {
  const ms = msToNextDay(Date.now());
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const kindOf = (g: Ghost, user: string | null): Kind => (!g.name ? 'wild' : g.key.startsWith('mine#') || g.name === user ? 'mine' : 'player');

const phaseOf = (key: string) => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 1000;
  return h / 159;
};

const Pill = ({ children, tone }: { children: string; tone: 'gold' | 'slate' | 'warm' | 'rust' }) => {
  const cls = {
    gold: 'bg-gold text-ink',
    slate: 'bg-slate text-ink',
    warm: 'bg-[#f0c58f] text-ink',
    rust: 'bg-rust text-paper',
  }[tone];
  return <span className={`fade max-w-[52vw] truncate rounded-full px-2.5 py-1 text-[11px] font-medium sm:max-w-[260px] ${cls}`}>{children}</span>;
};

const HelpCard = ({ onClose }: { onClose: () => void }) => (
  <div className="fade absolute inset-0 z-40 flex items-end justify-center bg-dusk/60 p-3 sm:items-center" onClick={onClose}>
    <section className="card rise w-full max-w-[380px] p-5" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start justify-between">
        <h2 className="serif text-[26px]">How to fly</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="btn-line p-1.5">
          <Close />
        </button>
      </div>
      <WakeDiagram className="mx-auto my-2 h-[84px] w-[150px]" />
      <ul className="space-y-2 text-[12.5px] leading-snug text-ink-2">
        <li>
          <b className="text-ink">Hold</b> to flap toward your finger. <b className="text-ink">Let go</b> to glide. Flapping is fast but tiring.
        </li>
        <li>
          A goose’s <b className="text-ink">wingtip wake</b> lifts you: glide there and you stay fast and get your strength back. Straight behind
          it is rough air.
        </li>
        <li>
          Every goose in your sky is <b className="text-ink">someone who flew this leg earlier today</b>. The grey V is the wild skein. Your flight
          joins the sky for everyone after you, and each goose that rides your wake is credited to you.
        </li>
        <li>
          Storm clouds drain you. Warm thermals restore you. Reach the lake before dark.
        </li>
        <li className="text-[11.5px]">Keys: ← → to steer, ↑ or Space to flap straight.</li>
      </ul>
    </section>
  </div>
);

const ReadyCard = ({ init, sky, onFly, compact }: { init: InitResponse; sky: Sky; onFly: () => void; compact: boolean }) => (
  <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
    <section className="card rise pointer-events-auto w-full max-w-[400px] p-4">
      <p className="label text-ink-2">
        Leg {init.day} · {legDate(init.day)}
      </p>
      <h2 className="serif mt-1 text-[24px] leading-[1.05]">
        {sky.region.replace(/^the /, 'The ')} <span className="text-ink-2">to</span> {sky.lake}
      </h2>
      {compact ? (
        <p className="mt-2 text-[12.5px] text-ink-2">
          {init.me.best ? `Your best ${init.me.best.time.toFixed(1)}s · par ${init.par.toFixed(1)}` : `Par ${init.par.toFixed(1)}s`} ·{' '}
          {init.ghosts.length ? `${init.ghosts.length} flyers in your sky` : 'the wild skein is in your sky'}
        </p>
      ) : (
        <div className="mt-2 flex items-center gap-3">
          <ul className="flex-1 space-y-1.5 text-[12.5px] leading-snug text-ink-2">
            <li>
              Reach the lake <b className="text-ink">before dark</b>.
            </li>
            <li>
              <b className="text-ink">Hold</b> to flap. <b className="text-ink">Let go</b> to glide.
            </li>
            <li>
              Ride a goose’s <b className="text-ink">wingtip</b>. Its wake carries you.
            </li>
          </ul>
          <WakeDiagram className="h-[70px] w-[124px] shrink-0" />
        </div>
      )}
      <button type="button" onClick={onFly} className="btn-rust mt-3 w-full py-3 text-[15px] font-medium">
        Take off
      </button>
      <p className="mt-2 text-center text-[11px] text-ink-2">or hold anywhere on the sky</p>
    </section>
  </div>
);

const ResultCard = ({
  init,
  sky,
  res,
  onAgain,
}: {
  init: InitResponse;
  sky: Sky;
  res: Extract<FlightResponse, { ok: true }>;
  onAgain: () => void;
}) => {
  const [share, setShare] = useState<string | null>(null);
  const [joined, setJoined] = useState<string | null>(null);
  const best = res.best;
  const carriers = [
    ...(res.wildSecs >= 0.5 ? [{ name: 'the wild skein', secs: res.wildSecs, wild: true }] : []),
    ...res.rodeWith.map((r) => ({ ...r, wild: false })),
  ].slice(0, 4);
  const leader = init.leaders[0];
  return (
    <div className="fade absolute inset-0 z-30 flex items-end justify-center bg-dusk/35 p-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:items-center">
      <section className="card rise max-h-full w-full max-w-[400px] overflow-y-auto p-5">
        <p className="label text-ink-2">
          Leg {init.day} · {sky.lake}
        </p>
        <div className="mt-1 flex items-end justify-between gap-2">
          <div>
            <p className="serif text-[20px] text-ink-2">{res.improved ? 'Landed in' : 'This flight'}</p>
            <p className="serif text-[50px] leading-none">
              {res.time.toFixed(1)}
              <span className="text-[24px] text-ink-2">s</span>
            </p>
          </div>
          <Stars n={res.stars} className="pb-2" />
        </div>
        <p className="mt-2 text-[12px] text-ink-2">
          {best && !res.improved ? `Best ${best.time.toFixed(1)}s · ` : ''}par {init.par.toFixed(1)}s
          {res.rank ? ` · ${ordinal(res.rank)} of ${Math.max(res.total, res.rank)} today` : init.offline ? '' : ' · log in to be ranked'}
          {res.streak >= 2 ? ` · ${res.streak}-leg streak` : ''}
        </p>

        <div className="mt-4 border-t border-ink/10 pt-3">
          <p className="label text-ink-2">Carried by</p>
          {carriers.length ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {carriers.map((c) => (
                <span key={c.name} className={`rounded-full px-2.5 py-1 text-[11.5px] ${c.wild ? 'bg-ink/8 text-ink' : 'bg-gold/35 text-ink'}`}>
                  {c.wild ? c.name : `u/${c.name}`} · {c.secs.toFixed(1)}s
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-[12px] text-ink-2">Nobody. You flew it alone. Next time, try a wingtip.</p>
          )}
          <p className="label mt-3 text-ink-2">Your wake</p>
          <p className="mt-1 text-[12.5px] leading-snug">
            {res.carried > 0
              ? `Your wake has carried ${res.carried} ${res.carried === 1 ? 'goose' : 'geese'} today. They fly faster because you flew.`
              : 'Your flight now flies in today’s sky. Every goose that rides your wake is credited to you. Check back later.'}
          </p>
        </div>

        <button type="button" onClick={onAgain} className="btn-rust mt-4 w-full py-3 text-[15px] font-medium">
          {best ? `Fly again · beat ${best.time.toFixed(1)}s` : 'Fly again'}
        </button>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="btn-line flex-1 py-2 text-[12.5px]"
            disabled={Boolean(share) || !best}
            onClick={() => void shareComment(init.offline).then((r) => setShare(r.message))}
          >
            {share ?? 'Share in comments'}
          </button>
          <button
            type="button"
            className="btn-line flex-1 py-2 text-[12.5px]"
            disabled={Boolean(joined)}
            onClick={() => void subscribe(init.offline).then((r) => setJoined(r.message))}
          >
            {joined ?? 'Join the flock'}
          </button>
        </div>
        <p className="mt-3 text-center text-[11px] text-ink-2">
          Next leg in {until()}
          {leader ? ` · fastest today u/${leader.name} ${leader.time.toFixed(1)}s` : ''}
        </p>
      </section>
    </div>
  );
};

const DarkCard = ({ progress, sky, onAgain, wild }: { progress: number; sky: Sky; onAgain: () => void; wild: number }) => (
  <div className="fade absolute inset-0 z-30 flex items-end justify-center bg-[#101226]/50 p-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:items-center">
    <section className="card rise w-full max-w-[380px] p-5">
      <p className="label text-ink-2">Dark fell</p>
      <p className="serif mt-1 text-[28px] leading-tight">
        {Math.min(99, Math.round(progress * 100))}% of the way to {sky.lake}
      </p>
      <p className="mt-2 text-[12.5px] leading-snug text-ink-2">
        {wild < 5
          ? 'Tip: tuck in at a wingtip of the grey V. Glide there and it carries you nearly for free.'
          : 'Tip: save your strength in a wake, then flap hard for the last stretch.'}
      </p>
      <button type="button" onClick={onAgain} className="btn-rust mt-4 w-full py-3 text-[15px] font-medium">
        Try again
      </button>
    </section>
  </div>
);

const Flight = ({ first, onInit }: { first: InitResponse; onInit: (i: InitResponse) => void }) => {
  const [init, setInit] = useState(first);
  const sky = useMemo(() => makeSky(init.day), [init.day]);
  const ghosts = useMemo(() => buildGhosts(sky, init.ghosts), [sky, init.ghosts]);
  const kinds = useMemo(() => ghosts.map((g) => kindOf(g, init.user)), [ghosts, init.user]);
  const tutorial = useRef(!seen('skein-tut'));
  const [newcomer, setNewcomer] = useState(() => !seen('skein-tut'));
  const [darkInfo, setDarkInfo] = useState({ progress: 0, wild: 0 });
  const [phase, setPhase] = useState<Phase>('ready');
  const [hud, setHud] = useState<Hud>({ t: 0, s: 1, lift: 0, riding: null, storm: false, thermal: false, progress: 0 });
  const [hint, setHint] = useState<string | null>(null);
  const [res, setRes] = useState<Extract<FlightResponse, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [muted, setMutedState] = useState(sfx.isMuted());
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const painter = useRef<Painter | null>(null);
  const bird = useRef<Bird>(startBird(ghosts.length));
  const prev = useRef({ x: START_X, y: 0 });
  const inputs = useRef<number[]>([]);
  const ctl = useRef({ down: false, target: START_X, keys: 0, left: false, right: false, up: false });
  const phaseRef = useRef<Phase>('ready');
  const acc = useRef(0);
  const last = useRef(0);
  const cam = useRef(0);
  const landAt = useRef(0);
  const hints = useRef({ touched: false, wake: false, tired: false, storm: false, rough: 0, shownAt: 0 });
  const fx = useRef({ beat: 0, honk: 0, wasLift: false });
  const pending = useRef<Promise<FlightResponse> | null>(null);
  const debug = useMemo(() => {
    const q = new URLSearchParams(window.location.search);
    const speed = Number(q.get('speed'));
    return {
      speed: init.offline && speed > 0 && speed <= 8 ? speed : 1,
      autopilot: init.offline && q.get('autopilot') === '1' ? botPolicy(sky, ghosts, { lane: 20, flapAbove: 0.9, seek: true, sprintAt: 260 }) : null,
    };
  }, [init.offline, sky, ghosts]);

  const setP = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const showHint = useCallback((text: string | null) => {
    hints.current.shownAt = performance.now();
    setHint(text);
  }, []);

  const reset = useCallback(() => {
    bird.current = startBird(ghosts.length);
    prev.current = { x: START_X, y: 0 };
    inputs.current = [];
    acc.current = 0;
    cam.current = 0;
    ctl.current.down = false;
    setHud({ t: 0, s: 1, lift: 0, riding: null, storm: false, thermal: false, progress: 0 });
    setRes(null);
    setError(null);
    setHint(null);
    if (timeRef.current) timeRef.current.textContent = '0.0';
  }, [ghosts.length]);

  const takeOff = useCallback(() => {
    if (phaseRef.current !== 'ready') return;
    sfx.unlock();
    sfx.startWind();
    reset();
    last.current = performance.now();
    setP('flying');
    if (tutorial.current) showHint('Hold to flap toward your finger. Let go to glide.');
  }, [reset, showHint]);

  const finish = useCallback(
    (b: Bird) => {
      const flown = [...inputs.current];
      if (timeRef.current) timeRef.current.textContent = b.arrived ? b.time.toFixed(1) : (b.tick * DT).toFixed(1);
      pending.current = sendFlight(init, flown);
      if (b.arrived) {
        sfx.splash();
        landAt.current = performance.now();
        setP('landing');
        mark('skein-tut');
        tutorial.current = false;
        setNewcomer(false);
      } else {
        setDarkInfo({
          progress: b.y / LENGTH,
          wild: ghosts.reduce((a, g, i) => a + (g.name ? 0 : (b.liftBy[i] ?? 0)), 0),
        });
        sfx.dusk();
        sfx.stopWind();
        setP('dark');
      }
      setHint(null);
      void pending.current.then((r) => {
        if (!r.ok) {
          setError(r.message);
          return;
        }
        setRes(r);
        void loadInit().then((next) => {
          setInit(next);
          onInit(next);
        });
      });
    },
    [init, onInit, ghosts]
  );

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const p = new Painter(canvas, sky, 'game');
    painter.current = p;
    const fit = () => {
      const r = wrap.getBoundingClientRect();
      p.resize(Math.max(40, r.width), Math.max(40, r.height), Math.min(2, window.devicePixelRatio || 1));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    let raf = 0;
    let lastHud = 0;
    const pos = { x: 0, y: 0 };
    const ahead = { x: 0, y: 0 };
    const loop = (now: number) => {
      const b = bird.current;
      const ph = phaseRef.current;
      if (ph === 'flying') {
        acc.current += Math.min(250, now - last.current) * debug.speed;
        last.current = now;
        while (acc.current >= TICK_MS && !b.done) {
          const c = ctl.current;
          let input = GLIDE;
          if (debug.autopilot) input = debug.autopilot(b, b.tick);
          else if (c.down) input = inputFor(c.target);
          else if (c.left || c.right || c.up) input = inputFor(b.x + (c.left ? -6 : 0) + (c.right ? 6 : 0));
          inputs.current.push(input);
          prev.current = { x: b.x, y: b.y };
          step(sky, ghosts, b, input);
          acc.current -= TICK_MS;
        }
        if (b.done) finish(b);
      } else {
        last.current = now;
      }
      const alpha = ph === 'flying' ? acc.current / TICK_MS : 1;
      const tickF = Math.max(0, b.tick - 1 + alpha);
      const yx = prev.current.x + (b.x - prev.current.x) * alpha;
      const yy = prev.current.y + (b.y - prev.current.y) * alpha;
      const landing = ph === 'landing' || ph === 'result';
      const camTarget = landing ? LENGTH + 4 : yy;
      cam.current += (camTarget - cam.current) * (landing ? 0.04 : 1);

      const birds: DrawBird[] = ghosts.map((g, i) => {
        posAt(g.track, tickF, pos);
        posAt(g.track, tickF + 2, ahead);
        const dx = ahead.x - pos.x;
        const dy = ahead.y - pos.y;
        const speed = dy / (2 * DT);
        const kind = kinds[i]!;
        const ph2 = phaseOf(g.key);
        const flap = kind === 'wild' ? Math.sin(now / 2600 + ph2 * 3) > 0.55 : speed > 17.5;
        const landed = pos.y >= LENGTH - 0.5;
        return {
          key: g.key,
          kind,
          x: landed ? pos.x + Math.sin(now / 3000 + ph2 * 5) * 0.4 : pos.x,
          y: landed ? LENGTH + 3 + ((ph2 * 37) % 9) + Math.cos(now / 3500 + ph2) * 0.3 : pos.y,
          hx: landed ? Math.sin(ph2 * 9) : dx,
          hy: landed ? Math.cos(ph2 * 9) : Math.max(0.2, dy),
          flap: !landed && flap,
          phase: ph2,
          name: g.name ?? undefined,
          alpha: kind === 'mine' ? 0.55 : 1,
          rest: landed,
        };
      });
      const settle = landing ? Math.min(1, (now - landAt.current) / 1400) : 0;
      const you: DrawBird = {
        key: 'you',
        kind: 'you',
        x: yx,
        y: landing ? Math.min(b.y, LENGTH) + settle * 4 : yy,
        hx: landing ? 0 : b.vx,
        hy: landing ? 1 : b.v,
        flap: ph === 'flying' && b.flapping,
        phase: 0,
        rest: settle > 0.7,
      };
      const riding = b.lift > 0.15 && b.by >= 0 ? (ghosts[b.by]?.key ?? null) : null;
      const wantAnchor = ph === 'ready' ? 0.4 : landing ? 0.3 : 0.7;
      p.anchor += (wantAnchor - p.anchor) * (ph === 'ready' ? 1 : 0.04);
      p.draw({
        camY: cam.current,
        t: tickF * DT,
        now,
        birds,
        you,
        riding: ph === 'flying' ? riding : null,
        lift: b.lift,
        labels: 3,
        rail: ph === 'flying',
        landed: settle,
      });

      if (ph === 'flying' && phaseRef.current === 'flying') {
        if (timeRef.current) timeRef.current.textContent = (tickF * DT).toFixed(1);
        if (b.flapping && now - fx.current.beat > 300) {
          fx.current.beat = now;
          sfx.wingbeat();
        }
        const inWake = b.lift > 0.45;
        if (inWake && !fx.current.wasLift && now - fx.current.honk > 2500) {
          fx.current.honk = now;
          sfx.honk(riding?.startsWith('wild') ? 0.9 : 1.1);
          try {
            navigator.vibrate?.(12);
          } catch {
            /* unsupported */
          }
        }
        fx.current.wasLift = inWake;
        if (now - lastHud > 90) {
          lastHud = now;
          sfx.setWind(b.v, b.lift, b.storm);
          setHud({
            t: tickF * DT,
            s: b.s,
            lift: b.lift,
            riding: riding ? (ghosts[b.by]?.name ?? 'wild') : null,
            storm: b.storm,
            thermal: b.thermal,
            progress: b.y / LENGTH,
          });
          const h = hints.current;
          if (tutorial.current) {
            const since = now - h.shownAt;
            if (!h.wake && b.lift > 0.4) {
              h.wake = true;
              showHint('That’s a wake. Let go and glide. It carries you.');
            } else if (!h.storm && b.storm) {
              h.storm = true;
              showHint('Storm cloud. It drains you. Fly round it.');
            } else if (!h.tired && b.s < 0.3) {
              h.tired = true;
              showHint('Tired. Glide in a wake or a warm thermal to recover.');
            } else if (!h.wake && b.down > 0.3) {
              h.rough += 1;
              if (h.rough === 12) showHint('Straight behind a goose is rough air. Slide out to its wingtip.');
            } else if (since > 4200) {
              setHint(null);
            }
          }
        }
      }
      if (ph === 'landing' && now - landAt.current > 1500 && pending.current) {
        sfx.stopWind();
        setP('result');
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      painter.current = null;
    };
  }, [sky, ghosts, kinds, finish, showHint, debug]);

  useEffect(() => {
    const map: Record<string, 'left' | 'right' | 'up'> = {
      ArrowLeft: 'left',
      KeyA: 'left',
      ArrowRight: 'right',
      KeyD: 'right',
      ArrowUp: 'up',
      KeyW: 'up',
      Space: 'up',
    };
    const down = (e: KeyboardEvent) => {
      const k = map[e.code];
      if (!k || help) return;
      e.preventDefault();
      if (phaseRef.current === 'ready') takeOff();
      ctl.current[k] = true;
      hints.current.touched = true;
    };
    const up = (e: KeyboardEvent) => {
      const k = map[e.code];
      if (k) ctl.current[k] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [takeOff, help]);

  const onDown = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (help) return;
    if (phaseRef.current === 'ready') takeOff();
    if (phaseRef.current !== 'flying') return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic or unsupported pointer */
    }
    ctl.current.down = true;
    ctl.current.target = painter.current?.worldX(e.clientX) ?? START_X;
    if (tutorial.current && !hints.current.touched) {
      hints.current.touched = true;
      showHint('Find the grey V ahead and tuck in behind a wingtip.');
    }
  };
  const onMove = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (ctl.current.down) ctl.current.target = painter.current?.worldX(e.clientX) ?? ctl.current.target;
  };
  const onUp = () => {
    ctl.current.down = false;
  };

  const again = () => {
    reset();
    setP('ready');
  };

  const toggleMute = () => {
    sfx.setMuted(!muted);
    setMutedState(!muted);
  };

  const low = hud.s < 0.25;
  const chip =
    phase !== 'flying'
      ? null
      : hud.s <= 0
        ? { text: 'Exhausted · glide in a wake', tone: 'rust' as const }
        : hud.storm
          ? { text: 'In the storm', tone: 'slate' as const }
          : hud.riding
            ? { text: hud.riding === 'wild' ? 'Riding the wild skein' : hud.riding === 'mine' ? 'Riding your best' : `Riding u/${hud.riding}`, tone: 'gold' as const }
            : hud.thermal
              ? { text: 'Thermal · rising air', tone: 'warm' as const }
              : null;

  return (
    <main className="relative h-full w-full overflow-hidden bg-dusk">
      <div ref={wrapRef} className="absolute inset-0">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 touch-none"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          aria-label="The sky. Hold to flap toward your finger, let go to glide. Arrow keys also work."
        />
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 bg-gradient-to-b from-dusk/80 to-transparent px-3 pt-[max(10px,env(safe-area-inset-top))] pb-6">
        <div className="min-w-0">
          <h1 className="serif text-[22px] text-paper">Skein</h1>
          <p className="label truncate text-paper/70">
            Leg {init.day} · {sky.region}
          </p>
        </div>
        <div className="pointer-events-auto flex items-start gap-2">
          <div className="pr-1 text-right">
            <p className="serif text-[24px] leading-none text-paper">
              <span ref={timeRef}>0.0</span>
            </p>
            <p className="text-[10.5px] text-paper/70">par {init.par.toFixed(1)}</p>
          </div>
          <button type="button" onClick={() => setHelp(true)} className="btn-glass p-2" aria-label="How to fly">
            <HelpIcon />
          </button>
          <button type="button" onClick={toggleMute} className="btn-glass p-2" aria-label={muted ? 'Turn sound on' : 'Turn sound off'}>
            {muted ? <SoundOff /> : <SoundOn />}
          </button>
        </div>
      </header>

      {phase === 'flying' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-dusk/85 to-transparent px-3 pt-10 pb-[max(12px,env(safe-area-inset-bottom))]">
          <div className="mb-2 flex h-10 items-end justify-center">
            {hint && (
              <p key={hint} className="rise max-w-[340px] rounded-2xl bg-paper px-3.5 py-1.5 text-center text-[12px] leading-snug text-ink shadow-lg">
                {hint}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="label shrink-0 text-paper/75">Strength</span>
            <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-paper/15" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hud.s * 100)} aria-label="Strength">
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-100 ${low ? 'pulse-soft bg-rust' : 'bg-paper'}`}
                style={{ width: `${Math.max(0, hud.s) * 100}%` }}
              />
              {hud.lift > 0.15 && <div className="absolute inset-0 rounded-full ring-2 ring-gold/80" />}
            </div>
            <div className="flex h-6 shrink-0 justify-end">{chip && <Pill tone={chip.tone}>{chip.text}</Pill>}</div>
          </div>
        </div>
      )}

      {phase === 'ready' && <ReadyCard init={init} sky={sky} onFly={takeOff} compact={!newcomer || init.me.tries > 0} />}
      {phase === 'result' && res && <ResultCard init={init} sky={sky} res={res} onAgain={again} />}
      {phase === 'result' && !res && !error && (
        <div className="absolute inset-x-0 bottom-6 z-30 text-center text-[12px] text-paper/80">Logging your flight…</div>
      )}
      {phase === 'dark' && (
        <DarkCard progress={darkInfo.progress} sky={sky} onAgain={again} wild={darkInfo.wild} />
      )}
      {error && (phase === 'result' || phase === 'dark') && (
        <div className="absolute inset-x-3 top-20 z-40 mx-auto max-w-[380px] rounded-xl bg-rust px-3 py-2 text-center text-[12.5px] text-paper" role="alert">
          {error}
        </div>
      )}
      {help && <HelpCard onClose={() => setHelp(false)} />}
    </main>
  );
};

const Game = () => {
  const [init, setInit] = useState<InitResponse | null>(null);
  useEffect(() => {
    void loadInit().then(setInit);
  }, []);
  if (!init)
    return (
      <main className="flex h-full items-center justify-center bg-dusk">
        <p className="serif pulse-soft text-[28px] text-paper/80">Skein</p>
      </main>
    );
  return <Flight first={init} onInit={() => {}} />;
};

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Game />
    </StrictMode>
  );
}
