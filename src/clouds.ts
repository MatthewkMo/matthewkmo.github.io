import { mulberry32, fbm } from './rng';

/** A volume is one episode's scanned scene: positions, per-point scatter
 *  (where the point sits before it resolves), size and seed jitter. */
export interface Volume {
  key: string;
  count: number;
  position: Float32Array;
  scatter: Float32Array;
  size: Float32Array;
  seed: Float32Array;
  ann: Float32Array;      // 1 = point belongs to an annotation bounding box
  radius: number;         // rough extent, for framing / free look
}

interface Ctx { push(x: number, y: number, z: number, size?: number, ann?: number): void; rand(): number }

function build(key: string, seedNum: number, count: number, radius: number, fill: (c: Ctx) => void): Volume {
  const position = new Float32Array(count * 3);
  const scatter = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const seed = new Float32Array(count);
  const ann = new Float32Array(count);
  const rand = mulberry32(seedNum);
  let i = 0;

  const ctx: Ctx = {
    rand,
    push(x, y, z, s = 1, a = 0) {
      if (i >= count) return;
      const o = i * 3;
      position[o] = x; position[o + 1] = y; position[o + 2] = z;
      // pre-resolve scatter: a wide, biased-outward cloud of sensor noise
      const m = 0.9 + rand() * 2.1;
      scatter[o] = (rand() - 0.5) * radius * m;
      scatter[o + 1] = (rand() - 0.5) * radius * m * 0.7;
      scatter[o + 2] = (rand() - 0.5) * radius * m;
      size[i] = s * (0.72 + rand() * 0.7);
      seed[i] = rand();
      ann[i] = a;
      i++;
    },
  };

  fill(ctx);
  // any unfilled tail becomes far-field noise rather than a degenerate cluster
  while (i < count) ctx.push((rand() - 0.5) * radius * 3, (rand() - 0.5) * radius * 2, (rand() - 0.5) * radius * 3, 0.6);

  return { key, count, position, scatter, size, seed, ann, radius };
}

/** Wireframe bounding box, sampled as points. This is the annotation mark —
 *  the same thing you draw on capture data when you label an object in it. */
function bbox(c: Ctx, cx: number, cy: number, cz: number, w: number, h: number, d: number, per = 26) {
  const hx = w / 2, hy = h / 2, hz = d / 2;
  const corners: [number, number, number][] = [
    [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
    [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz],
  ];
  const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  for (const [a, b] of edges) {
    for (let s = 0; s < per; s++) {
      const t = s / (per - 1);
      c.push(
        cx + corners[a][0] + (corners[b][0] - corners[a][0]) * t,
        cy + corners[a][1] + (corners[b][1] - corners[a][1]) * t,
        cz + corners[a][2] + (corners[b][2] - corners[a][2]) * t,
        1.25, 1,
      );
    }
  }
}

/* ── EPISODE 01 · Mo Luxury Goods — a lattice of stacked crates ───────── */
function crates(count: number): Volume {
  return build('ep01', 1042, count, 9, (c) => {
    const stacks = 14;
    const boxes: [number, number, number, number][] = [];
    for (let s = 0; s < stacks; s++) {
      const bx = (c.rand() - 0.5) * 9.5;
      const bz = (c.rand() - 0.5) * 9.5;
      const high = 1 + Math.floor(c.rand() * 4);
      for (let k = 0; k < high; k++) boxes.push([bx + (c.rand() - 0.5) * 0.3, -4 + k * 1.5, bz, 1.35]);
    }
    const per = Math.floor((count * 0.9) / boxes.length);
    for (const [bx, by, bz, e] of boxes) {
      for (let p = 0; p < per; p++) {
        // sample the shell of the crate, not its interior — depth sensors see surfaces
        const face = Math.floor(c.rand() * 6);
        let x = (c.rand() - 0.5) * e, y = (c.rand() - 0.5) * e, z = (c.rand() - 0.5) * e;
        if (face === 0) x = e / 2; else if (face === 1) x = -e / 2;
        else if (face === 2) y = e / 2; else if (face === 3) y = -e / 2;
        else if (face === 4) z = e / 2; else z = -e / 2;
        c.push(bx + x, by + y, bz + z, 1);
      }
    }
    bbox(c, 0, -1.2, 0, 11.5, 8.5, 11.5, 22);
  });
}

/* ── EPISODE 02 · Community Butler — lawn plane with rooftops ─────────── */
function lawn(count: number): Volume {
  return build('ep02', 2277, count, 11, (c) => {
    const ground = Math.floor(count * 0.34);
    for (let p = 0; p < ground; p++) {
      const x = (c.rand() - 0.5) * 24, z = (c.rand() - 0.5) * 24;
      const h = -4 + (fbm(x * 0.11, z * 0.11, 7) - 0.5) * 1.1;
      c.push(x, h, z, 0.85);
    }
    const houses = 6;
    const rest = count - ground;
    const per = Math.floor((rest * 0.85) / houses);
    for (let hI = 0; hI < houses; hI++) {
      const hx = (c.rand() - 0.5) * 11, hz = (c.rand() - 0.5) * 12;
      const w = 4.2 + c.rand() * 2.0, dep = 3.8 + c.rand() * 1.8;
      for (let p = 0; p < per; p++) {
        const t = c.rand();
        const u = c.rand() - 0.5, v = c.rand() - 0.5;
        if (t < 0.42) {           // gabled roof, two sloped planes
          const side = c.rand() < 0.5 ? 1 : -1;
          const a = c.rand();
          c.push(hx + side * (w / 2) * (1 - a), -1.0 + a * 1.9, hz + v * dep, 1.1);
        } else if (t < 0.86) {    // walls, sampled on the four faces
          const face = c.rand() < 0.5;
          c.push(
            hx + (face ? u * w : (c.rand() < 0.5 ? w / 2 : -w / 2)),
            -3.9 + c.rand() * 2.9,
            hz + (face ? (c.rand() < 0.5 ? dep / 2 : -dep / 2) : v * dep),
            1.0,
          );
        } else {                  // trimmed lawn edge around the footprint
          const a2 = c.rand() * Math.PI * 2, r2 = w * 0.8 + c.rand() * 1.4;
          c.push(hx + Math.cos(a2) * r2, -3.95, hz + Math.sin(a2) * r2, 0.8);
        }
      }
    }
    bbox(c, 0, -3.0, 0, 20, 3.6, 20, 22);
  });
}

/* ── EPISODE 03 · Simplify Tech — a room of desks, scanned in rows ────── */
function classroom(count: number): Volume {
  return build('ep03', 3388, count, 10, (c) => {
    const cols = 6, rows = 5;
    const per = Math.floor((count * 0.82) / (cols * rows));
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const dx = (col - (cols - 1) / 2) * 3.4;
        const dz = (r - (rows - 1) / 2) * 3.2;
        for (let p = 0; p < per; p++) {
          const t = c.rand();
          if (t < 0.55) {          // desk top
            c.push(dx + (c.rand() - 0.5) * 2.2, -1.6 + (c.rand() - 0.5) * 0.08, dz + (c.rand() - 0.5) * 1.2, 1);
          } else if (t < 0.8) {    // legs
            const lx = c.rand() < 0.5 ? -0.95 : 0.95, lz = c.rand() < 0.5 ? -0.5 : 0.5;
            c.push(dx + lx, -1.6 - c.rand() * 2.2, dz + lz, 0.8);
          } else {                 // chair back
            c.push(dx + (c.rand() - 0.5) * 1.4, -1.2 + c.rand() * 1.1, dz + 1.5, 0.85);
          }
        }
      }
    }
    // floor sparse return
    for (let p = 0; p < count * 0.1; p++) c.push((c.rand() - 0.5) * 26, -3.9, (c.rand() - 0.5) * 26, 0.7);
    bbox(c, 0, -1.9, 0, 21, 4.6, 18, 20);
  });
}

/* ── EPISODE 04 · Trace AI Labs — egocentric: a figure and two hands ──── */
function figure(count: number): Volume {
  return build('ep04', 4416, count, 8, (c) => {
    const n = count;
    const torso = Math.floor(n * 0.3), head = Math.floor(n * 0.12), hands = Math.floor(n * 0.34);
    // torso: capsule shell
    for (let p = 0; p < torso; p++) {
      const a = c.rand() * Math.PI * 2, y = -2.4 + c.rand() * 3.6;
      const r = 1.15 - Math.abs(y + 0.6) * 0.06;
      c.push(Math.cos(a) * r, y, Math.sin(a) * r * 0.62, 1);
    }
    // head: sphere shell
    for (let p = 0; p < head; p++) {
      const u = c.rand() * 2 - 1, a = c.rand() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      c.push(Math.cos(a) * s * 0.66, 1.85 + u * 0.72, Math.sin(a) * s * 0.66, 0.95);
    }
    // arms + hands reaching toward the viewer — the egocentric frame
    for (let p = 0; p < hands; p++) {
      const side = c.rand() < 0.5 ? -1 : 1;
      const t = c.rand();
      if (t < 0.55) {              // forearm
        const k = c.rand();
        c.push(side * (1.05 + k * 0.55), 0.5 - k * 0.5, k * 3.1, 0.9);
      } else {                     // hand: five short finger segments
        const f = Math.floor(c.rand() * 5);
        const k = c.rand();
        c.push(
          side * (1.6 + (f - 2) * 0.13) + side * k * 0.12,
          0.0 - k * 0.42 + (f - 2) * 0.05,
          3.1 + k * 0.72,
          1.15,
        );
      }
    }
    // ambient room return, unresolved
    for (let p = 0; p < n * 0.18; p++) {
      const a = c.rand() * Math.PI * 2, r = 5 + c.rand() * 7;
      c.push(Math.cos(a) * r, -4 + c.rand() * 8, Math.sin(a) * r, 0.6);
    }
    bbox(c, 0, 0.2, 0.3, 3.2, 6.4, 3.4, 24);            // subject
    bbox(c, 0, -0.2, 3.2, 4.6, 1.6, 1.6, 18);           // hands
  });
}

/* ── ANNOTATION PASS · a board of labelled boxes, one per label ───────── */
function checklist(count: number): Volume {
  return build('req', 7724, count, 9, (c) => {
    const cols = 4, rows = 2, bw = 3.1, bh = 1.7, bd = 0.5;
    const gapX = 4.1, gapY = 2.7;
    const cells: [number, number][] = [];
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        cells.push([(col - (cols - 1) / 2) * gapX, ((rows - 1) / 2 - r) * gapY]);
      }
    }
    // interior returns stay grey; only the box that marks the match is green
    const per = Math.floor((count * 0.55) / cells.length);
    for (const [cx, cy] of cells) {
      for (let p = 0; p < per; p++) {
        c.push(cx + (c.rand() - 0.5) * bw * 0.92, cy + (c.rand() - 0.5) * bh * 0.86, (c.rand() - 0.5) * bd, 0.85);
      }
      bbox(c, cx, cy, 0, bw, bh, bd, 16);
    }
    // the frame the whole pass sits in
    bbox(c, 0, 0, 0, cols * gapX + 1.4, rows * gapY + 1.4, 1.6, 24);
    for (let p = 0; p < count * 0.12; p++) {
      c.push((c.rand() - 0.5) * 26, (c.rand() - 0.5) * 15, -4 - c.rand() * 12, 0.6);
    }
  });
}

/* ── CONTACT · the cloud finally closes into a solid slab ─────────────── */
function slab(count: number): Volume {
  return build('contact', 5510, count, 12, (c) => {
    const w = 16.5, h = 9;
    const cols = 132, rows = 72;
    // a regular lattice, not a scatter: the one surface in the session that the
    // sensor returns completely
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        c.push(
          (gx / (cols - 1) - 0.5) * w + (c.rand() - 0.5) * 0.02,
          (gy / (rows - 1) - 0.5) * h - 0.5 + (c.rand() - 0.5) * 0.02,
          (c.rand() - 0.5) * 0.08,
          1.0,
        );
      }
    }
    bbox(c, 0, -0.5, 0, w + 1.4, h + 1.2, 1.2, 26);
  });
}

/** Boot: pure sensor noise, resolving into nothing but itself. */
function field(count: number): Volume {
  return build('boot', 6604, count, 14, (c) => {
    for (let p = 0; p < count; p++) {
      const a = c.rand() * Math.PI * 2, r = 2.5 + c.rand() * 11;
      const y = (c.rand() - 0.5) * 11;
      const w = fbm(Math.cos(a) * r * 0.08, Math.sin(a) * r * 0.08, 3) - 0.5;
      c.push(Math.cos(a) * r, y + w * 3, Math.sin(a) * r, 0.9);
    }
  });
}

export function buildVolumes(budget: number): Volume[] {
  const b = (f: number) => Math.max(600, Math.floor(budget * f));
  return [
    field(b(0.15)),
    crates(b(0.12)),
    lawn(b(0.14)),
    classroom(b(0.14)),
    figure(b(0.14)),
    checklist(b(0.11)),
    slab(b(0.22)),
  ];
}
