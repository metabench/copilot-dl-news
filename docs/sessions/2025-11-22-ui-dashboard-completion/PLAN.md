# Plan: UI Dashboard Completion

Objective: Finalize the separation of the Dashboard and URL Listing views, ensuring client-side hydration and navigation work seamlessly.

Done when:
- Client-side bundle (`src/ui/client/index.js`) correctly identifies and hydrates controls on the `/urls` route.
- Navigation links between Home and URLs are verified.
- `npm run ui:client-build` produces a valid bundle.
- Manual verification script confirms the HTML structure for both routes.

Change set:
- `src/ui/client/index.js` (if needed for route detection)
- `src/ui/server/dataExplorerServer.js` (polish if needed)
- `src/ui/render-url-table.js` (polish if needed)

Risks/assumptions:
- Client hydration might fail if the DOM structure on `/urls` differs unexpectedly from what the client expects.
- Navigation state (filters, pagination) might be lost if not explicitly preserved in links.

Tests:
- `npm run ui:client-build`
- `node src/ui/server/checks/dataExplorer.check.js` (update to check both routes)
- Manual inspection of generated HTML.
