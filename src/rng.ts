/** Deterministic, tiny PRNG + value noise. Nothing here ships as data — the
 *  entire world is regenerated from these seeds at load. */

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash2 = (x: number, y: number, s: number) => {
  const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return n - Math.floor(n);
};

const fade = (t: number) => t * t * (3 - 2 * t);

/** 2D value noise in [0,1]. Used for terrain-ish jitter, never for looks alone. */
export function noise2(x: number, y: number, seed = 1): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = fade(x - xi), yf = fade(y - yi);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return (a + (b - a) * xf) + ((c + (d - c) * xf) - (a + (b - a) * xf)) * yf;
}

export function fbm(x: number, y: number, seed = 1, octaves = 4): number {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < octaves; i++) { v += amp * noise2(x * f, y * f, seed + i); amp *= 0.5; f *= 2; }
  return v;
}
