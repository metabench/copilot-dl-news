# Plan: URL Listing Fetch Filter

## Objective
Enable the Data Explorer's URLs view to filter for entries that have at least one recorded fetch, exposing the filter through both server-rendered HTML and the client-side UI without regressing existing pagination/performance guarantees.

## Done When
- A durable `fetched_urls` SQLite view (or equivalent materialized table) exists and surfaces `fetch_count` plus timestamp metadata for each URL with recorded fetches.
- `selectUrlPage`/`countUrls` equivalents support the `hasFetches` constraint so the server can page through filtered results efficiently.
- `/urls` HTML responses and the new `/api/urls` JSON endpoint understand the `hasFetches=1` query parameter and return the corresponding records + pagination metadata.
- The browser UI exposes a toggle that initiates an in-place refresh (no full reload) by calling the JSON endpoint and re-rendering table rows + metadata.
- Tests/checks cover the new query helpers, server routing, and client hydration logic; docs/session notes capture how to run/extend the feature.

## Change Set
1. **Database layer**
   - Define `fetched_urls` view in the SQLite schema (likely joining `urls` and `fetches`, grouped to compute counts + min/max timestamps).
   - Add helper queries `countFetchedUrls` and `selectFetchedUrlPage` under `src/db/sqlite/v1/queries/ui/urlListingNormalized.js` (or a sibling module) that mirror the existing signature but target the view.
   - Ensure indexes exist to keep the view performant (on `fetches.url_id`, `fetches.fetched_at`).

2. **Server / API routing**
   - Update `renderUrlListingView` in `src/ui/server/dataExplorerServer.js` to accept a `hasFetches` filter derived from `req.query.hasFetches`.
   - Thread the filter into pagination (counts + select calls) and annotate `meta.filters` so the client knows what is active.
   - Add `/api/urls` (JSON) route that reuses the same rendering payload but returns `{ columns, rows, meta }` for client refreshes.

3. **Client bundle**
   - Enhance `public/assets/ui-client.js` (source likely under `src/ui/client`) to:
     - Hydrate filter toggle state based on `URLSearchParams`.
     - On toggle, update the URL (history.replaceState), call `/api/urls?...`, show a loading indicator, then swap the table + meta DOM nodes with the returned payload.
     - Preserve pagination/back-link params when filters are active.

4. **Checks & tests**
   - Create/extend a lightweight Node check under `src/ui/controls/checks/` to render filtered vs unfiltered tables for manual verification.
   - Add Jest tests for the new DB query helpers (mock DB or integration) and for the Express route via SuperTest if feasible (reuses existing UI server tests per docs/TESTING_QUICK_REFERENCE).

5. **Documentation & notes**
   - Capture the implementation steps + verification instructions inside `WORKING_NOTES.md` for this session.
   - Update any relevant docs (e.g., data explorer README, CLI references) if new commands/endpoints are introduced.

## Risks & Mitigations
- **View performance on large datasets**: mitigate by ensuring the view references indexed columns and by validating EXPLAIN output before landing.
- **Pagination drift between filtered/unfiltered totals**: reuse the same pagination builder while swapping count functions; add tests covering both branches.
- **Client/server divergence**: keep JSON payload identical to server-rendered shape so the client can reuse existing render helpers.

## Tests & Verification
- `npm run test:by-path tests/db/sqlite/urlListingNormalized.test.js` (new/updated) for count/select helpers.
- `npm run test:by-path tests/ui/server/dataExplorerServer.test.js` for `/api/urls` responses (if not present, add targeted tests).
- Manual spot-check: `node src/ui/controls/checks/UrlListingHasFetches.check.js` (new) plus loading `/urls?hasFetches=1` in the browser to verify hydration + toggle behavior.

## Tooling / Prep
- Use `node tools/dev/js-scan.js --what-imports src/db/sqlite/v1/queries/ui/urlListingNormalized.js --json` to confirm all consumers before editing.
- Run `node tools/dev/js-edit.js` dry-runs for larger patches per Gap 3 workflow.
- Record timings/observations in `WORKING_NOTES.md` and keep SESSIONS_HUB entry updated.
