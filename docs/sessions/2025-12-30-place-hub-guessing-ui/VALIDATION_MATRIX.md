# Validation Matrix — Place Hub Guessing UI

| Layer | What it validates | Command | Expected |
|---|---|---|---|
| Jest (existing) | core guessing persistence invariants | `npm run test:by-path src/tools/__tests__/guess-place-hubs.test.js` | PASS |
| Jest (API) | place hubs HTTP router contract | `npm run test:by-path tests/server/api/place-hubs.test.js` | PASS |
| UI check (new) | matrix HTML renders + legend present | `node src/ui/server/placeHubGuessing/checks/placeHubGuessing.matrix.check.js` | exits 0 |
| Unified app check | server mounts route + shell loads | `node src/ui/server/unifiedApp/checks/unified.server.check.js` | exits 0 |

Notes:
- Prefer the UI check script for quick iteration; it should not require a running server.
