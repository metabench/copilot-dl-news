# Plan: client-activation

Objective: Ensure the UI client bundle properly activates custom controls (UrlListingTable, UrlFilterToggle, PagerButton) so the `/urls` page hydrates and responds to filter toggles without a reload.

Done when:
- Client activation hook registers our controls within `Client_Page_Context` so server markup hydrates reliably.
- `src/ui/client/index.js` seeds `context.map_Controls` before `pre_activate` and preserves vendor hooks.
- The bundle builds without errors and the plan documents where to verify activation (Puppeteer or manual smoke test).

Change set:
- `src/ui/client/index.js`
- `docs/sessions/2025-11-20-client-activation/PLAN.md` (this file)
- `docs/sessions/2025-11-20-client-activation/WORKING_NOTES.md`
- `docs/sessions/SESSIONS_HUB.md`

Risks/assumptions:
- Assumes vendor `jsgui3-client` lifecycle is unchanged from previous inspection.
- Must avoid mutating `jsguiClient` globals before it initializes `Client_Page_Context` internally.
- Bundled output may be cached; remember to rebuild `public/assets/ui-client.js` after edits if tests rely on static asset.

Tests:
- Manual check: run `npm run build:ui-client` followed by `node server.js` and toggle the filter (documented in notes).
- Future follow-up: hook Puppeteer coverage (not in scope for this pass).

Docs to update:
- Session PLAN/WORKING_NOTES
- `docs/sessions/SESSIONS_HUB.md` entry describing this activation pass.
