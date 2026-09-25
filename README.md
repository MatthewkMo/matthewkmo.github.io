# Capture Session, Matthew K. Mo

A single-page personal site built as a working artifact of what Matthew does: a
capture session. The world is a sparse point cloud, the career is the recording,
scrolling scrubs the timeline, and the visitor's own session is logged in the
corner readout, in the tab and nowhere else.

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
| `src/styles.css` | Tokens, type scale, segments, HUD, static/reduced-motion document. |
| `src/main.ts` | Mode detection, segment tracking, keyboard, boot sequence. |
| `src/metal.ts` | The liquid metal surface: one fullscreen WebGL pass, no library. |
| `src/shapes.ts` | The object each segment's metal flows into. |
| `src/resolve.ts` | The name resolving out of noise. |
| `src/telemetry.ts` | Measured session values. No storage, no network. |

## Decisions worth knowing

- **No dependencies and no framework.** The whole site is about 15KB gzipped,
  including the metal. It previously carried Three.js for a point cloud; when the
  cloud went, so did the library, because a fullscreen shader needs no scene graph.
- **The metal is a real surface, not shaded points.** Six blobs define a field and
  the metal is whatever that field encloses. The normal comes from the field's
  slope, and the colour is a procedural room read through the reflected direction,
  which is what makes chrome read as chrome rather than as grey plastic.
- **The liquid wobble is sampled inside the field, not added to it.** Added from
  outside it cancels out of the gradient, and the surface renders flat, lit only
  at its rim. That bug cost a round; the comment in `metal.ts` says so.
- **Each segment owns a shape** in `shapes.ts`, and the blobs lerp toward the
  incoming set, so the metal runs out of one object and into the next instead of
  cutting between them.
- **Nothing is driven by scroll position.** Copy does not reveal on scroll, and
  the metal only changes target when a new segment takes the viewport.
- **Reduced motion, no WebGL, or `?doc`** gets the static document, which is the
  same content set as a plain vertical page.
