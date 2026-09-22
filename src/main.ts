import { prepare, resolve } from './resolve';
import { Telemetry } from './telemetry';

const doc = document.documentElement;
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function webglOK(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

const mobile = window.matchMedia('(max-width: 700px)').matches
  || (navigator.hardwareConcurrency ?? 8) <= 4;
// ?doc forces the plain document — the same thing reduced-motion and no-WebGL get
const forced = new URLSearchParams(location.search).has('doc');
const STATIC = forced || reduced || !webglOK();

/* ── fade-in staging for body copy ─────────────────────────────────────── */
const FADE_SEL = '.lede,.pitch,.proof__cell,.tags--intro,.meta,.reach,.ep__tc,.ep__role,.tags,.ep__notes li,.ep__ann,.req__lede,.req__band,.req__row,.elig,.idx__col,.contact li,.foot';
document.querySelectorAll<HTMLElement>('.stage').forEach((stage) => {
  stage.querySelectorAll<HTMLElement>(FADE_SEL).forEach((el, i) => {
    el.setAttribute('data-fade', '');
    el.style.transitionDelay = `${Math.min(i * 55, 440)}ms`;
  });
});

const headings = Array.from(document.querySelectorAll<HTMLElement>('[data-resolve]'));
if (!STATIC) headings.forEach(prepare);

/* ── telemetry (measured in this tab, kept in this tab) ────────────────── */
const episodeStages = Array.from(document.querySelectorAll<HTMLElement>('.stage--ep'));
const tel = new Telemetry(episodeStages.length, 0);

/* ── static document: reduced motion, or no WebGL ──────────────────────── */
if (STATIC) {
  doc.classList.add('static');
  document.getElementById('scene')?.remove();
  document.getElementById('btn-look')?.remove();
  document.querySelectorAll<HTMLElement>('.stage').forEach((s) => s.classList.add('is-active'));
  const pointsCell = document.getElementById('t-points');
  if (pointsCell) pointsCell.textContent = 'STATIC';
  const calib = document.getElementById('calib');
  if (calib) calib.querySelectorAll('.calib__line').forEach((l) => l.classList.add('on'));
  wireTelemetry(() => window.scrollY / Math.max(1, document.body.scrollHeight - window.innerHeight));
  const seen = new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) tel.markEpisode(episodeStages.indexOf(e.target as HTMLElement)); });
  }, { threshold: 0.35 });
  episodeStages.forEach((s) => seen.observe(s));
} else {
  boot();
}

/* ── the capture session ───────────────────────────────────────────────── */
/* Three and Lenis load only when we are actually going to render. A recruiter on
   a locked-down machine, or anyone with reduced motion on, never downloads them. */
async function boot() {
  const [{ CaptureScene }, { default: Lenis }] = await Promise.all([
    import('./scene'),
    import('lenis'),
  ]);
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const scene = new CaptureScene(canvas, { mobile });
  const pointsCell = document.getElementById('t-points');
  if (pointsCell) pointsCell.textContent = scene.pointTotal.toLocaleString('en-US');

  const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 0.9, touchMultiplier: 1.4 });

  /* calibration: three lines, then the name resolves. Under 1.5s, no progress bar. */
  const lines = Array.from(document.querySelectorAll<HTMLElement>('.calib__line'));
  lines.forEach((l, i) => setTimeout(() => l.classList.add('on'), 90 + i * 165));
  const bootStage = document.getElementById('boot')!;
  setTimeout(() => {
    bootStage.classList.add('is-active');
    resolve(document.querySelector<HTMLElement>('#boot [data-resolve]')!);
  }, 620);

  /* headings resolve on arrival */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const stage = e.target as HTMLElement;
      stage.classList.add('is-active');
      const h = stage.querySelector<HTMLElement>('[data-resolve]');
      if (h && stage.id !== 'boot') resolve(h);
      const idx = episodeStages.indexOf(stage);
      if (idx >= 0) tel.markEpisode(idx);
    });
  }, { threshold: 0, rootMargin: '0px' });
  const stages = Array.from(document.querySelectorAll<HTMLElement>('.stage'));
  stages.forEach((s) => io.observe(s));

  /* belt and braces: anything already on screen is activated outright, so a
     deep link (/#req) can never land on unrevealed copy */
  const sweep = () => {
    const vh = window.innerHeight;
    for (const st of stages) {
      const r = st.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh && !st.classList.contains('is-active')) {
        st.classList.add('is-active');
        const h = st.querySelector<HTMLElement>('[data-resolve]');
        if (h) resolve(h);
      }
    }
  };

  /* scroll → camera rail. Anchors are measured from the real document. */
  const anchorStages = [
    document.getElementById('boot')!,
    ...episodeStages,
    document.getElementById('req')!,
    document.getElementById('contact')!,
  ];
  let marks: number[] = [];
  const measure = () => {
    const vh = window.innerHeight;
    marks = anchorStages.map((s) => {
      const r = s.getBoundingClientRect();
      return r.top + window.scrollY + r.height / 2 - vh / 2;
    });
    scene.resize();
  };
  measure();
  window.addEventListener('resize', measure);
  /* webfonts change every heading's height, so the rail is re-measured once
     they land — and a hash link is re-seated against the settled layout */
  const settle = () => {
    measure();
    const id = location.hash.slice(1);
    const el = id && document.getElementById(id);
    if (el) lenis.scrollTo(el, { immediate: true });
    sweep();
  };
  if (document.fonts?.ready) document.fonts.ready.then(() => requestAnimationFrame(settle));
  else window.addEventListener('load', settle);
  window.setTimeout(sweep, 1400);
  window.addEventListener('orientationchange', () => setTimeout(measure, 240));

  const progressAt = (y: number) => {
    if (y <= marks[0]) return 0;
    for (let i = 0; i < marks.length - 1; i++) {
      if (y < marks[i + 1]) return i + (y - marks[i]) / Math.max(1, marks[i + 1] - marks[i]);
    }
    return marks.length - 1;
  };

  /* damped scroll — scene state never binds to raw scroll position */
  let damped = 0;
  let targetY = 0;
  lenis.on('scroll', ({ targetScroll }: any) => {
    // any real scroll re-captures the camera, exactly as the label promises
    if (Math.abs(targetScroll - targetY) > 4) setLook(false);
    targetY = targetScroll;
  });

  /* free look */
  const btnLook = document.getElementById('btn-look') as HTMLButtonElement;
  const grab = document.getElementById('grab') as HTMLElement;
  let looking = false;
  const setLook = (on: boolean) => {
    if (looking === on) return;
    looking = on;
    scene.setFreeLook(on);
    btnLook.setAttribute('aria-pressed', String(on));
    document.body.classList.toggle('looking', on);
    if (!on) grab.classList.remove('dragging');
  };
  btnLook.addEventListener('click', () => setLook(!looking));

  let dragging = false, px = 0, py = 0;
  grab.addEventListener('pointerdown', (e) => {
    if (!looking) return;
    dragging = true; px = e.clientX; py = e.clientY;
    grab.setPointerCapture(e.pointerId); grab.classList.add('dragging');
  });
  grab.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    scene.orbit(e.clientX - px, e.clientY - py);
    px = e.clientX; py = e.clientY;
  });
  const endDrag = () => { dragging = false; grab.classList.remove('dragging'); };
  grab.addEventListener('pointerup', endDrag);
  grab.addEventListener('pointercancel', endDrag);
  // scroll re-captures the camera, as promised on the label
  window.addEventListener('wheel', () => setLook(false), { passive: true });
  window.addEventListener('keydown', (e) => { if (e.key.startsWith('Arrow') || e.key === ' ') setLook(false); });

  /* pointer: parallax + telemetry */
  window.addEventListener('pointermove', (e) => {
    scene.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  }, { passive: true });

  /* keyboard traversal of episodes */
  const jumpTargets = [
    document.getElementById('boot')!,
    ...episodeStages,
    document.getElementById('req')!,
    document.getElementById('index')!,
    document.getElementById('contact')!,
  ];
  window.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const cur = jumpTargets.reduce((best, s, i) => {
      const d = Math.abs(s.getBoundingClientRect().top - window.innerHeight * 0.3);
      return d < best.d ? { i, d } : best;
    }, { i: 0, d: Infinity }).i;
    const next = Math.max(0, Math.min(jumpTargets.length - 1, cur + (e.key === 'ArrowRight' ? 1 : -1)));
    lenis.scrollTo(jumpTargets[next], { offset: 0 });
    jumpTargets[next].focus({ preventScroll: true });
  });

  /* in-page links (the jump, and every EP reference in the annotation pass)
     travel along the rail rather than teleporting past it */
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement)?.closest?.('a[href^="#"]') as HTMLAnchorElement | null;
    if (!a) return;
    const id = a.getAttribute('href')!.slice(1);
    const el = id && document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    setLook(false);
    lenis.scrollTo(el, { offset: 0 });
    el.focus({ preventScroll: true });
    history.replaceState(null, '', `#${id}`);
  });

  /* focus follows tab order without fighting smooth scroll */
  document.addEventListener('focusin', (e) => {
    const t = e.target as HTMLElement;
    if (!t.closest || t.closest('.hud')) return;
    const stage = t.closest('.stage') as HTMLElement | null;
    if (stage && Math.abs(stage.getBoundingClientRect().top) > window.innerHeight * 0.6) lenis.scrollTo(stage);
  });

  if (import.meta.env.DEV) (window as any).__lenis = lenis;

  wireTelemetry(() => targetY / Math.max(1, document.body.scrollHeight - window.innerHeight));

  /* ── loop ──────────────────────────────────────────────────────────── */
  let raf = 0, prev = performance.now(), running = true;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    lenis.raf(now);
    damped += (progressAt(targetY) - damped) * 0.08;   // inertia, lerp ~0.08
    scene.update(damped, dt);
    if (import.meta.env.DEV) (window as any).__cap = { damped, targetY, marks, cam: scene.camera.position.toArray(), vols: scene.debugVolumes() };
  };
  raf = requestAnimationFrame(frame);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && running) { cancelAnimationFrame(raf); running = false; }
    else if (!document.hidden && !running) { running = true; prev = performance.now(); raf = requestAnimationFrame(frame); }
  });
}

/* ── telemetry wiring shared by both modes ─────────────────────────────── */
function wireTelemetry(scrub: () => number) {
  let last = 0;
  const tick = (now: number) => {
    requestAnimationFrame(tick);
    if (now - last < 200) return;                       // the readout is quiet, not frantic
    last = now;
    tel.setScrub(scrub());
    tel.render();
  };
  requestAnimationFrame(tick);
  window.addEventListener('pointermove', (e) => tel.pointer(e.clientX, e.clientY), { passive: true });
}
