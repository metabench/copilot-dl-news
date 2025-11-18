# Plan: diagram-atlas-async-loading

**Lifecycle phase**: Spark → Spec City → **Thicken** (implementation via Tier 1 tooling is underway)

## Objective
Deliver an asynchronous Diagram Atlas experience: server sends a fast-loading shell, the client fetches diagram data via `/api/diagram-data`, and a pulsing jsgui3 progress control keeps users informed until the atlas renders.

## Done When
- `/diagram-atlas` returns a lightweight shell that mounts a progress/loading control and defers heavy data to the client.
- A reusable `DiagramLoadingControl` (or similar) exists as a jsgui3 control with a pulsing bar animation that reflects fetch state.
- Client activation code fetches data asynchronously, updates the loading control, and renders the atlas once ready without full reloads.
- `/api/diagram-data` fetch path includes error handling surfaced in the UI (retry or failure banner) so UX remains clear when fetch fails.
- Existing Jest e2e suite is updated (or extended) to cover the async path, including asserting the loading shell markup and eventual data render hook.

## Change Set
- `src/ui/server/diagramAtlasServer.js`
- `src/ui/controls/DiagramAtlasControls.js` (plus new loading control module if needed)
- `src/ui/client/index.js` (+ any helper modules)
- `scripts/build-ui-client.js` if bundle entries need adjustments
- `tests/server/diagram-atlas.e2e.test.js`
- Session docs under `docs/sessions/2025-11-16-diagram-atlas-async-loading/`

## Risks / Assumptions
- Assume `/api/diagram-data` remains the canonical fetch endpoint; avoid duplicating data assembly client-side.
- jsgui3 binding/plugin expectations must remain intact; new controls must register via plugin hooks.
- Need to ensure server-side render still works for environments without JS (progress control falls back gracefully).
- Client bundle size increase must stay manageable; watch for accidental inclusion of heavy deps.

## Tests / Verification
- `npm run test:by-path tests/server/diagram-atlas.e2e.test.js`
- Manual smoke: start server via `node src/ui/server/diagramAtlasServer.js --port <p>` and verify browser load/progress.

## Benchmark
- Not DB-heavy; no formal benchmark planned (track perceived load latency qualitatively).

## Docs to Update
- Session docs (plan/notes/summary, follow-ups if needed)
- Add short mention to `docs/AGENT_REFACTORING_PLAYBOOK.md` if the workflow introduces new Tier 1 usage patterns (pending scope).