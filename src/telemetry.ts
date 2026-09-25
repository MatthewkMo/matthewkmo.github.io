/** Everything here is measured, not decorated. It also never leaves the tab , 
 *  no storage, no network, no analytics. That claim is the point of the readout. */

const pad = (n: number) => String(n).padStart(2, '0');

export class Telemetry {
  private t0 = performance.now();
  private pointerPx = 0;
  private last: { x: number; y: number } | null = null;
  private seen = new Set<number>();
  private scrub = 0;
  private el: Record<string, HTMLElement> = {};

  constructor(private episodes: number, points: number) {
    for (const k of ['session', 'scrub', 'pointer', 'eps', 'points']) {
      this.el[k] = document.getElementById(`t-${k}`)!;
    }
    this.el.points.textContent = points.toLocaleString('en-US');
  }

  pointer(x: number, y: number) {
    if (this.last) this.pointerPx += Math.hypot(x - this.last.x, y - this.last.y);
    this.last = { x, y };
  }

  setScrub(v: number) { this.scrub = Math.max(0, Math.min(1, v)); }
  markEpisode(i: number) { this.seen.add(i); }
  get episodesSeen() { return this.seen.size; }

  render() {
    const s = Math.floor((performance.now() - this.t0) / 1000);
    this.el.session.textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
    this.el.scrub.textContent = `${(this.scrub * 100).toFixed(1).padStart(5, '0')}%`;
    this.el.pointer.textContent = `${Math.round(this.pointerPx).toLocaleString('en-US')} PX`;
    this.el.eps.textContent = `${this.seen.size} / ${this.episodes}`;
  }
}
