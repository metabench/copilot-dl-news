# Plan: Fix Fetched URLs Display Bug

## Objective
Investigate and fix the issue where the "Fetched URLs" view in the Data Explorer only shows 404s, despite successful fetches existing in the database.

## Done when
- [ ] Database verified to contain successful fetches (HTTP 200s).
- [ ] Root cause of the UI filtering/querying issue identified.
- [ ] Fix applied to the query or UI logic.
- [ ] Verification script confirms successful fetches are displayed.

## Investigation Steps
1.  **Verify Data**: Query the database directly to confirm the existence of successful fetches (HTTP 200).
2.  **Analyze Query Logic**: Examine `src/db/sqlite/v1/queries/ui/urlListingNormalized.js` and `selectFetchedUrlPage`.
3.  **Analyze UI Logic**: Check how `dataExplorerServer.js` calls the query and if any filters are applied incorrectly.
4.  **Reproduce**: Create a reproduction script or use existing check scripts to demonstrate the issue.

## Risks/Assumptions
- Assumption: The user is correct that successful fetches exist.
- Risk: The issue might be in the normalized view definition in the DB schema, not just the JS query.

## Docs to Update
- `docs/sessions/2025-11-18-ui-fetched-urls-bug/SESSION_SUMMARY.md`
