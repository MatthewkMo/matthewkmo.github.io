import { prepare, resolve } from './resolve';
import { Telemetry } from './telemetry';

const doc = document.documentElement;
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const forced = new URLSearchParams(location.search).has('doc');
const mobile = window.matchMedia('(max-width: 700px)').matches
  || (navigator.hardwareConcurrency ?? 8) <= 4;

/* the character resolve is kept for the name alone: it is the calibration
   moment, not something that fires again on every heading scrolled past */
const nameHeading = document.querySelector<HTMLElement>('#boot [data-resolve]');
const episodeStages = Array.from(document.querySelectorAll<HTMLElement>('.stage--ep'));
const tel = new Telemetry(episodeStages.length);

function staticDocument() {
  doc.classList.add('static');
  document.getElementById('scene')?.remove();
  document.querySelectorAll<HTMLElement>('.stage').forEach((s) => s.classList.add('is-active'));
  wireTelemetry();
  const seen = new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) tel.markEpisode(episodeStages.indexOf(e.target as HTMLElement)); });
  }, { threshold: 0.35 });
  episodeStages.forEach((s) => seen.observe(s));
}

if (forced || reduced) {
  staticDocument();
} else {
  boot().catch(staticDocument);   // no WebGL, or the surface failed: serve the document
}

async function boot() {
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const [{ MetalSurface }, { SHAPES }] = await Promise.all([import('./metal'), import('./shapes')]);
  const metal = new MetalSurface(canvas, { mobile }, SHAPES[0]);

  if (nameHeading) prepare(nameHeading);

  /* calibration: three lines, then the name resolves */
  const lines = Array.from(document.querySelectorAll<HTMLElement>('.calib__line'));
  lines.forEach((l, i) => setTimeout(() => l.classList.add('on'), 90 + i * 165));
  const bootStage = document.getElementById('boot')!;
  setTimeout(() => {
    bootStage.classList.add('is-active');
    if (nameHeading) resolve(nameHeading);
  }, 620);

  const stages = Array.from(document.querySelectorAll<HTMLElement>('.stage'));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const stage = e.target as HTMLElement;
      stage.classList.add('is-active');
      const idx = episodeStages.indexOf(stage);
      if (idx >= 0) tel.markEpisode(idx);
    });
  }, { threshold: 0, rootMargin: '0px' });
  stages.forEach((s) => io.observe(s));

  /* belt and braces: anything already on screen is revealed outright, so a
     deep link can never land on unrevealed copy */
  const sweep = () => {
    const vh = window.innerHeight;
    for (const st of stages) {
      const r = st.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh) st.classList.add('is-active');
    }
  };

  /* which segment holds the viewport: the metal flows toward its shape */
  const anchors = [document.getElementById('boot')!, ...episodeStages,
                   document.getElementById('req')!, document.getElementById('contact')!];
  const activeIndex = () => {
    const mid = window.innerHeight / 2;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < anchors.length; i++) {
      const r = anchors[i].getBoundingClientRect();
      if (r.top <= mid && r.bottom >= mid) return i;
      const d = Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  };

  window.addEventListener('resize', () => metal.resize());
  const settle = () => {
    metal.resize();
    const id = location.hash.slice(1);
    const el = id && document.getElementById(id);
    if (el) el.scrollIntoView();
    sweep();
  };
  if (document.fonts?.ready) document.fonts.ready.then(() => requestAnimationFrame(settle));
  else window.addEventListener('load', settle);
  window.setTimeout(sweep, 1400);

  window.addEventListener('pointermove', (e) => {
    metal.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  }, { passive: true });

  /* in-page links travel with the page rather than teleporting past it */
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement)?.closest?.('a[href^="#"]') as HTMLAnchorElement | null;
    if (!a) return;
    const id = a.getAttribute('href')!.slice(1);
    const el = id && document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: 'smooth' });
    el.focus({ preventScroll: true });
    history.replaceState(null, '', `#${id}`);
  });

  /* keyboard traversal of the segments */
  const jump = [...anchors.slice(0, -1), document.getElementById('index')!, anchors[anchors.length - 1]];
  window.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const cur = jump.reduce((best, s, i) => {
      const d = Math.abs(s.getBoundingClientRect().top - window.innerHeight * 0.3);
      return d < best.d ? { i, d } : best;
    }, { i: 0, d: Infinity }).i;
    const next = Math.max(0, Math.min(jump.length - 1, cur + (e.key === 'ArrowRight' ? 1 : -1)));
    jump[next].scrollIntoView({ behavior: 'smooth' });
    jump[next].focus({ preventScroll: true });
  });

  document.addEventListener('focusin', (e) => {
    const t = e.target as HTMLElement;
    if (!t.closest || t.closest('.hud')) return;
    const stage = t.closest('.stage') as HTMLElement | null;
    if (stage && Math.abs(stage.getBoundingClientRect().top) > window.innerHeight * 0.6) {
      stage.scrollIntoView({ behavior: 'smooth' });
    }
  });

  wireTelemetry();

  let raf = 0, running = true, shape = -1;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const a = activeIndex();
    if (a !== shape) { shape = a; metal.setTarget(SHAPES[a]); }
    document.body.classList.toggle('at-intro', window.scrollY < window.innerHeight * 0.3);
    metal.render(now);
    if (import.meta.env.DEV) (window as any).__cap = { shape, y: Math.round(window.scrollY) };
  };
  raf = requestAnimationFrame(frame);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && running) { cancelAnimationFrame(raf); running = false; }
    else if (!document.hidden && !running) { running = true; raf = requestAnimationFrame(frame); }
  });
}

function wireTelemetry() {
  let last = 0;
  const tick = (now: number) => {
    requestAnimationFrame(tick);
    if (now - last < 200) return;          // the readout is quiet, not frantic
    last = now;
    tel.setScrub(window.scrollY / Math.max(1, document.body.scrollHeight - window.innerHeight));
    tel.render();
  };
  requestAnimationFrame(tick);
  window.addEventListener('pointermove', (e) => tel.pointer(e.clientX, e.clientY), { passive: true });
}
