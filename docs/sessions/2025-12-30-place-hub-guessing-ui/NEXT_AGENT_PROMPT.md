You are continuing the Place Hub Guessing UI session.

Objective: implement Phase 1 (read-only matrix UI) as described in docs/sessions/2025-12-30-place-hub-guessing-ui/PLACE_HUB_GUESSING_IMPLEMENTATION_PLAN.md.

Constraints:
- Windows + PowerShell.
- No Python.
- Keep changes small and deterministic.
- Do not open DB connections at import time; inject or open inside request handlers.

Tasks:
1) Implement createPlaceHubGuessingRouter() under src/ui/server/placeHubGuessing/server.js.
2) Mount it in src/ui/server/unifiedApp/server.js (and add a sub-app entry in subApps/registry.js).
3) Add a check script under src/ui/server/placeHubGuessing/checks/placeHubGuessing.matrix.check.js that renders HTML and asserts for a legend + table structure.
4) Validate with:
   - npm run test:by-path src/tools/__tests__/guess-place-hubs.test.js
   - node src/ui/server/placeHubGuessing/checks/placeHubGuessing.matrix.check.js

Report back with: files changed, commands run, and results.
