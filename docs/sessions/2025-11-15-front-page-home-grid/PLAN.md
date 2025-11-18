# Plan: front-page-home-grid

**Objective**: Surface every explorer view (URLs, domains, crawls, errors) on the `/urls` landing page with actionable cards backed by live stats.

**Done when**
- Landing page renders a prominent grid of cards that link to the four explorer routes.
- Cards show live counts / freshness sourced from the existing server queries without breaking pagination.
- Styles, markup, and helper controls live in `render-url-table.js` with CSS + server wiring updated via the Tier 1 tooling.
- Session docs + hub capture this front-page change for future agents.

**Change set**
- `src/ui/render-url-table.js` for CSS + card markup helpers and render wiring.
- `src/ui/server/dataExplorerServer.js` for card data plumbing.
- `docs/sessions/*` for plan/notes + SESSIONS_HUB entry.

**Risks / assumptions**
- Re-using domain/crawl/error queries on the `/urls` route is fast enough (limits already small).
- Cached metrics might be missing; card builders must fail soft and still render URLs card.
- Need to keep instructions satisfied (Tier 1 tool usage, bilingual CLI optional, session docs required).

**Tests / verification**
- Manual render of `/urls` in dev server once cards wired.
- Spot-check `/domains` etc. to ensure cards don’t mutate shared data.

**Docs to update**
- `docs/sessions/SESSIONS_HUB.md` with the new folder.
- Session folder working notes summarizing commands + decisions.
