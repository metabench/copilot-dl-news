# Plan – Streaming SSR + Virtual Scrolling

## Objective
Investigate coupling between streaming SSR and virtual scrolling performance, and prototype a 1MB fractal → hex-view virtual scroller with random access validation.

## Done When
- [ ] Doc landscape reviewed (performance patterns, queues streaming SSR) and distilled into hypotheses linking streaming SSR + virtual scrolling.
- [ ] Proposed validation plan drafted (SSR chunking + viewport-only rendering) with target metrics (TTFB/TTI, DOM node counts).
- [ ] Fractal harness exists: server generates 1MB fractal bytes, client renders a virtual-scrolling hex table with random access reads.
- [ ] Validation proves client hex matches server bytes (spot checks/random sampling) across streaming vs non-streaming and virtual vs full render modes.
- [ ] Follow-ups recorded (experiments to run, code paths to probe) in `FOLLOW_UPS.md` and outline captured in `SESSION_SUMMARY.md`.

## Change Set (initial sketch)
- `docs/sessions/2025-12-11-streaming-ssr-virtual-scroll/PLAN.md` (this plan)
- `docs/sessions/2025-12-11-streaming-ssr-virtual-scroll/WORKING_NOTES.md` (findings + doc excerpts)
- `docs/sessions/2025-12-11-streaming-ssr-virtual-scroll/SESSION_SUMMARY.md` (final synthesis)
- `src/ui/lab/experiments/015-streaming-virtual-harness/` (existing matrix) and new fractal hex-view harness + checks under the same experiment or a sibling
- Optionally update `src/ui/lab/manifest.json` if adding a new experiment entry

## Risks & Mitigations
- **Over-optimizing without data** → Define metrics first (TTFB, first contentful chunk, activation time, total controls rendered).
- **DOM/activation mismatch** → Keep isomorphic render/activate parity; prototype in lab before touching production routes.
- **Scope creep into adapters** → If data/adapter changes seem necessary, log follow-ups for backend-focused agents.

## Tests / Validation
- Design a benchmark matrix: streaming on/off vs virtual scrolling on/off on large lists (>=1k items); record DOM node counts and timings.
- Reuse Puppeteer harness (single browser) for client-side timing; consider server-side timers around streaming chunk emits.
- If implementing a lab harness, ship a `check.js` that reports metrics for quick comparisons.
