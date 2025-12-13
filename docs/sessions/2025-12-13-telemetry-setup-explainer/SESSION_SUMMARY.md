# Session Summary – Telemetry Setup Explainer + WLILO Diagram

## Accomplishments
- Wrote a detailed explainer clarifying the two telemetry families and where drift can happen.
- Produced an information-dense diagram and a WLILO-styled version for presentation.
- Reduced silent drift risk by aligning server telemetry helper behavior to the documented standard (and keeping it under test).

## Metrics / Evidence
- Jest: `npm run test:by-path tests/ui/server/serverTelemetryStandard.test.js`
- SVG collisions: `node tools/dev/svg-collisions.js docs/sessions/2025-12-13-telemetry-setup-explainer/telemetry-systems-and-drift.wlilo.svg --strict`

## Decisions
- Keep both telemetry families, but document boundaries explicitly and treat drift as a testable contract problem.

## Next Steps
- Decide whether to implement richer `/api/status` blocks from the spec (build + stats) or amend the spec to match the lean helper.
- Consider an adapter that re-emits crawler milestones/progress as server telemetry JSONL events when crawlers run inside UI servers.
