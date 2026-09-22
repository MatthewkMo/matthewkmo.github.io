/** The signature effect: headings resolve out of noise in staggered order,
 *  the way a scan fills in. Section headings only — nothing else gets this. */

const GLYPHS = '▚▞░▒▓▖▘▝▗·+*#';
const glyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];

export function prepare(el: HTMLElement) {
  const text = el.textContent ?? '';
  el.setAttribute('aria-label', text);
  el.textContent = '';
  const frag = document.createDocumentFragment();
  // chars are wrapped per word so lines still break like type, not like data
  for (const word of text.split(/(\s+)/)) {
    if (!word) continue;
    const w = document.createElement('span');
    w.className = 'word';
    w.setAttribute('aria-hidden', 'true');
    for (const ch of word) {
      const c = document.createElement('span');
      c.className = 'ch';
      c.textContent = ch;
      c.dataset.final = ch;
      w.appendChild(c);
    }
    frag.appendChild(w);
  }
  el.appendChild(frag);
}

export function resolve(el: HTMLElement) {
  if (el.dataset.resolved === '1') return;
  el.dataset.resolved = '1';

  const chars = Array.from(el.querySelectorAll<HTMLElement>('.ch'));
  const order = chars.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {        // noise has no reading order
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  const STAGGER = 240;
  order.forEach((idx, n) => {
    const c = chars[idx];
    const final = c.dataset.final!;
    const delay = (n / Math.max(1, order.length - 1)) * STAGGER;
    c.style.transitionDelay = `${delay.toFixed(0)}ms`;
    if (!final.trim()) return;
    c.textContent = glyph();
    let ticks = 0;
    const id = window.setInterval(() => {
      c.textContent = glyph();
      if (++ticks > 4) { clearInterval(id); c.textContent = final; }
    }, 45);
    window.setTimeout(() => { clearInterval(id); c.textContent = final; }, delay + 250);
  });

  requestAnimationFrame(() => el.classList.add('is-resolved'));
}
