# Follow Ups – Art Playground: Fix fill undo/redo E2E

- [ ] Decide on a bundle freshness strategy for Art Playground E2E.
	- Option A: rebuild bundle in test setup (fast, deterministic).
	- Option B: embed a build timestamp/hash in `client.bundle.js` and have the server/E2E assert it matches the repo state.
- [ ] If implementing Option A, ensure it doesn’t break CI time budgets (bundle build should stay ~sub-second).
