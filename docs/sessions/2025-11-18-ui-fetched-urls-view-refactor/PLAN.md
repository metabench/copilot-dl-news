# Plan: Refactor Fetched URLs to use Database View

## Objective
Refactor the "Fetched URLs" query to use a database view (`fetched_urls`) instead of complex inline SQL. This improves code maintainability and ensures consistent logic across the application.

## Done when
- [ ] `src/db/sqlite/v1/migrations/add_fetched_urls_view.sql` is updated to query `http_responses` instead of the stale `fetches` table.
- [ ] The `fetched_urls` view is created/updated in the database.
- [ ] `src/db/sqlite/v1/queries/ui/urlListingNormalized.js` is simplified to query `FROM fetched_urls`.
- [ ] Verification script confirms the UI still shows correct data (including 200s).

## Steps
1.  **Update Migration**: Modify `src/db/sqlite/v1/migrations/add_fetched_urls_view.sql` with the correct logic (joining `http_responses`, `content_storage`, `content_analysis`).
2.  **Apply View**: Execute the SQL to create the view in the database.
3.  **Refactor Code**: Update `urlListingNormalized.js` to select from the view.
4.  **Verify**: Run the verification script `tmp/verify-fix.js`.

## Risks
- Performance: Ensure the view performance is acceptable. The logic is identical to the CTE, so it should be similar, but we should verify.

## Docs to Update
- `docs/sessions/2025-11-18-ui-fetched-urls-view-refactor/SESSION_SUMMARY.md`
