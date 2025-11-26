# Plan: Domains Page Performance + EventSource Fix

## Objective
Speed up `/domains` page initial load by deferring slow per-host queries, and fix EventSource client errors.

## Done when:
- `/domains` page loads in < 100ms (currently seconds)
- Per-host article/fetch counts show `[loading]` placeholders initially
- EventSource endpoint exists and doesn't cause client errors
- No console errors on page load

## Change set:
- `src/ui/server/dataExplorerServer.js` - Modify `renderDomainSummaryView` to skip slow queries
- `src/ui/controls/DomainSummaryTable.js` - Update row building to handle placeholder values
- `src/ui/server/dataExplorerServer.js` - Add `/api/events` SSE endpoint (stub)

## Risks/assumptions:
- Deferring data means users see partial info initially
- SSE endpoint is a stub - no actual events will be pushed yet

## Tests:
- Verify `/domains` renders quickly with placeholders
- Verify no EventSource errors in console

## Benchmark:
- Before: `/domains` takes several seconds
- After: `/domains` loads in < 100ms

## Docs to update:
- Session WORKING_NOTES.md with findings
