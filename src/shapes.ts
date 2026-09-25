import type { Shape } from './metal';

/* Six blobs per segment: x, y, radius, weight, authored around the object's own
   centre. The metal runs between consecutive sets, so neighbouring shapes are
   written to share a rough mass: the body melts down into the desks, the desks
   gather into the house, and so on. A weight of 0 parks a blob. */
const SCALE = 1.3;          // every object carries the same weight on screen
const b = (...v: number[]): Shape => {
  const out = new Array(24).fill(0);
  for (let i = 0; i < v.length; i++) out[i] = i % 4 === 2 ? v[i] * SCALE : v[i];
  for (let i = Math.floor(v.length / 4); i < 6; i++) out[i * 4 + 2] = 0.02;
  return out;
};

export const SHAPES: Shape[] = [
  // 0 · boot, an unformed mass
  b(0, 0, 0.26, 1.0,   -0.17, 0.11, 0.10, 0.50,   0.16, -0.13, 0.09, 0.45),
  // 1 · Trace, a figure: head, torso, arm, hand
  b(0, 0.20, 0.095, 1.0,   0, -0.04, 0.165, 1.0,   -0.14, -0.10, 0.085, 0.90,   -0.25, -0.15, 0.065, 0.80),
  // 2 · Simplify, a row of desks with one set apart
  b(-0.16, -0.03, 0.085, 0.95,   0, -0.03, 0.085, 0.95,   0.16, -0.03, 0.085, 0.95,   0, 0.12, 0.085, 0.85),
  // 3 · Community Butler, a house on its plot
  b(0, -0.13, 0.20, 1.0,   0, 0.08, 0.115, 0.95),
  // 4 · Mo Luxury, a stack
  b(0, -0.16, 0.125, 1.0,   0, 0.0, 0.115, 1.0,   0, 0.15, 0.095, 0.90),
  // 5 · the annotation pass, a board
  b(-0.16, 0, 0.115, 1.0,   0, 0, 0.115, 1.0,   0.16, 0, 0.115, 1.0),
  // 6 · contact, one solid mass
  b(0, 0, 0.30, 1.15,   -0.19, 0, 0.17, 0.60,   0.19, 0, 0.17, 0.60),
];
