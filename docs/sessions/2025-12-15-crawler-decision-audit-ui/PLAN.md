# Plan – Decision audit persistence + Data Explorer decisions

## Objective
Persist decision traces/milestones reliably and surface them via Data Explorer /decisions.

## Done When
- [ ] Decision traces can be persisted without requiring unrelated feature flags.
- [ ] Data Explorer `/decisions` can read persisted milestones (existing UI).
- [ ] Focused Jest tests pass and evidence is captured in `WORKING_NOTES.md`.
- [ ] Follow-ups (expanding decision kinds, pagination, drill-down) are recorded.

## Change Set (initial sketch)
- src/crawler/EnhancedFeaturesManager.js
- src/crawler/__tests__/EnhancedFeaturesManager.test.js
- docs/sessions/2025-12-15-crawler-decision-audit-ui/*

## Risks & Mitigations
- Risk: enabling the enhanced DB adapter too eagerly could have side-effects.
	- Mitigation: gate initialization behind an explicit existing config toggle (`hubFreshness.persistDecisionTraces === true`) or existing feature flags.
- Risk: decision traces still not visible if no milestones are emitted/persisted.
	- Mitigation: keep relying on the existing `CrawlerEvents.emitMilestone({ persist:true })` path and validate via unit tests.

## Tests / Validation
- `npm run test:by-path src/crawler/__tests__/EnhancedFeaturesManager.test.js`
- Optional sanity: run Data Explorer and visit `/decisions` after a crawl with `hubFreshness.persistDecisionTraces:true`.
