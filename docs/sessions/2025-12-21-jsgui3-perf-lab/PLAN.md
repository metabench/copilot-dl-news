# Plan – jsgui3 Live Update Performance Lab

## Objective
Build a lab + measurement harness for jsgui3 SSR + client activation + high-rate incremental updates (e.g., 1000 nodes/sec) without UI crashes.

## Done When
- [ ] Lab 041 exists and runs locally without manual steps.
- [ ] Check script produces a PERF_SUMMARY (JSON) and asserts no crashes.
- [ ] Scenario explicitly covers 1000 nodes in 1 second (or tighter) with client-side batching.
- [ ] Session summary includes at least one captured PERF_SUMMARY result.

## Change Set (initial sketch)
- `src/ui/lab/experiments/041-jsgui3-live-graph-perf/` (server/client/check)
- `.github/agents/🕷️ Crawler Singularity 🕷️.agent.md` (methodology update)
- `docs/sessions/2025-12-21-jsgui3-perf-lab/*` (evidence + notes)

## Risks & Mitigations
- Risk: 1000 individual messages/sec overwhelms UI → Mitigation: batch mode + rAF draining + hard caps.
- Risk: Puppeteer flake/hang → Mitigation: strict timeouts + window flags + console capture.
- Risk: Canvas redraw costs too high later → Mitigation: add LOD + incremental draw; consider WebGL for scale.

## Tests / Validation
- `node src/ui/lab/experiments/041-jsgui3-live-graph-perf/check.js`
