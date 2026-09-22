# Capture Session — Matthew K. Mo

A single-page personal site built as a working artifact of what Matthew does: a
capture session. The world is a sparse point cloud, the career is the recording,
scrolling scrubs the timeline, and the visitor's own session is logged in the
corner readout — in the tab, and nowhere else.

## Run

```bash
npm install
npm run dev        # http://localhost:5183
npm run build      # dist/
npm run preview
npm run typecheck
```

## Structure

| File | Role |
| --- | --- |
| `index.html` | All content as real DOM text. This file *is* the fallback document. |
| `src/styles.css` | Tokens, type scale, stages, HUD, static/reduced-motion document. |
| `src/main.ts` | Mode detection, scroll rail, free look, keyboard, boot sequence. |
| `src/scene.ts` | Three.js renderer, camera anchors, GLSL point material. |
| `src/clouds.ts` | Procedural volumes — one scanned scene per episode. |
| `src/rng.ts` | Seeded PRNG + value noise. The whole world is generated from these. |
| `src/resolve.ts` | The signature effect: headings resolving out of noise. |
| `src/telemetry.ts` | Measured session values. No storage, no network. |

## Decisions worth knowing

- **Three and Lenis load only when the flythrough will actually run.** Reduced
  motion, no WebGL, or `?doc` gets the static document at ~11KB gzipped; the full
  session is ~145KB gzipped, well under the 500KB budget. No point data ships —
  every volume is generated at load from a seed.
- **Point count** is 46,000 on desktop, 16,000 on mobile (`max-width: 700px` or
  ≤4 logical cores), with `devicePixelRatio` capped at 2 / 1.5. Size attenuation
  and the depth colour ramp are in the vertex/fragment shaders, not on the CPU.
  The render loop stops when the tab is hidden and the ambient layer mutes.
- **`?doc`** forces the static document — the same thing a locked-down machine or
  a reduced-motion visitor sees. Useful for checking that fallback directly.
- **Green (`--annotation`) only marks things the system has annotated**: outcome
  metrics, bounding boxes around each volume, active state. **Orange (`--flag`)
  appears exactly twice**, both on Episode 04's quality-flag work.
- **Camera** never binds to raw scroll. Lenis smooths the page; the scene follows
  a separately damped value (lerp 0.08) along six anchors measured from the real
  DOM, so the rail survives any layout change.
