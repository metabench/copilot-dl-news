# Plan: url-filter-debug

**Objective**: Restore the `/urls` view so the bundle loads without transform errors and the "fetched URLs only" toggle refreshes data via `/api/urls`.

## Done When
- Bundle no longer throws `each_source_dest_pixels_resized_limited_further_info` reference errors in the browser.
- Toggle switches update the URL list + metadata using live `/api/urls` responses.
- Manual smoke (browser / lightweight harness) confirms state flips correctly.
- Documentation + follow-ups are captured in this session folder and `SESSIONS_HUB`.

## Change Set (anticipated)
- `src/vendor/jsgui3/**` or wherever `ta-math/transform.js` is bundled from.
- `public/assets/ui-client.js` (bundled artifact) via rebuild.
- `src/ui/controls/UrlFilterToggle.js` and related client wiring.
- Possibly `src/ui/server/dataExplorerServer.js` if query snapshot needs fixes.
- Docs under `docs/sessions/2025-11-15-url-filter-debug/` and `docs/sessions/SESSIONS_HUB.md`.

## Risks / Assumptions
- Bundle runtime error likely due to missing export binding; need to avoid editing generated file manually.
- Toggle bug might stem from query snapshot metadata or binding plugin order.
- No automated Playwright harness exists yet; verification will be manual/server logs.

## Tests / Verification
- `npm run build:ui-client` (or equivalent) to rebuild bundle.
- Browser smoke test (or `npm run start:data-explorer` + manual check) to verify toggle.
- No automated Playwright tests available; document gap.

## Docs To Update
- This session folder (INDEX/PLAN/WORKING_NOTES/FOLLOW_UPS/SESSION_SUMMARY).
- `docs/sessions/SESSIONS_HUB.md` entry for this session.
- Reference prior session documents when noting context.
