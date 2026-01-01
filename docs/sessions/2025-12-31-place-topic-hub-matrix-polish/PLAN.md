# Plan – Place + Topic Hub Guessing Matrix Polish

## Objective
Brainstorm improvements to Place Hub Guessing matrix and design a parallel Topic Hub Guessing matrix feature, then pick a narrow first implementation slice.

## Done When
- [ ] Place Hub Guessing polish backlog is ranked (quick wins vs later).
- [ ] Topic Hub Guessing matrix has a clear data contract (rows/cols/cell state).
- [ ] A “first vertical slice” is selected (router + SSR + minimal check).
- [ ] Evidence/commands are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md` with owners.

## Change Set (initial sketch)
- Place matrix polish (likely):
	- `src/ui/server/placeHubGuessing/controls/PlaceHubGuessingMatrixControl.js`
	- `src/ui/server/placeHubGuessing/server.js`
	- `src/ui/server/placeHubGuessing/checks/placeHubGuessing.matrix.screenshot.check.js`
	- `src/db/sqlite/v1/queries/placeHubGuessingUiQueries.js`
- Topic matrix (new):
	- `src/ui/server/topicHubGuessing/server.js` (or a unified hubGuessing server)
	- `src/ui/server/topicHubGuessing/controls/TopicHubGuessingMatrixControl.js`
	- `src/ui/server/topicHubGuessing/checks/topicHubGuessing.matrix.screenshot.check.js`
	- `src/db/sqlite/v1/queries/topicHubGuessingUiQueries.js` (or reuse/extend an existing queries module)

## Risks & Mitigations
- **DB shape ambiguity for “topic hubs”** (where status/verification lives) → confirm by reading the SQLite queries + schema definitions; keep UI contract narrow and explicit.
- **Matrix can become “too wide”** (many hosts/topics) → keep limits + virtual mode default; add a “state filter” to reduce noise.
- **UI churn vs value** → pick 1–2 quick wins first; avoid re-theming.

## Tests / Validation
- Place matrix:
	- Existing screenshot check stays green; add assertions for any new filters (if added).
- Topic matrix:
	- New SSR check (fast) + screenshot check mirroring PlaceHubGuessing’s flows.
	- If new DB query module is added, add a focused unit test against a tiny fixture DB.
