# Working Notes – Art Playground: Fix fill undo/redo E2E

- 2025-12-11 — Session created via CLI. Add incremental notes here.

- 2025-12-11
	- Symptom: Puppeteer E2E "editing fill is undoable/redoable via toolbar" timed out waiting for fill to revert after Undo.
	- Key discovery: the Art Playground client bundle served at `/client.bundle.js` can be stale; E2E may run against an old bundle unless rebuilt.
	- Fix: rebuild the Art Playground client bundle before re-running the E2E.
		- Command: `node scripts/build-art-playground-client.js`
	- Improvement: changed E2E fill editing to simulate real typing (focus + select-all + type + Enter) instead of synthetic change/blur events.
	- Evidence: after rebuilding, the failing test passed.
