# Working Notes – Connect crawler to decision tree viewer

## Known facts (verified)
- Decision Tree Viewer server: `src/ui/server/decisionTreeViewer/server.js`
	- Default port: `3030` (env: `DECISION_TREE_VIEWER_PORT`).
	- Supports `/` and `/set/:slug` (with optional `?persist=1` to persist active slug).
	- Loads trees from `config/decision-trees/*.json` (and config sets via `DecisionConfigSetRepository`).
- Decision tree config currently present in repo: `config/decision-trees/page-categories.json`.
- Crawler config set plumbing exists:
	- Loader/state: `src/crawler/observatory/DecisionConfigSetState.js`
	- Repository: `src/crawler/observatory/DecisionConfigSetRepository.js`
	- API routes: `src/api/routes/decisionConfigSetRoutes.js` (mount: `/api/decision-config-sets`).
	- Crawler wiring: `src/crawler/CrawlerServiceWiring.js` best-effort loads the active slug and applies `articleSignals`.
- “Simple crawler interface” appears to be deprecated UI:
	- `src/deprecated-ui/public/index/crawlControls.js` calls `fetch('/api/crawl', ...)`.

## Key observation
The viewer currently visualizes *decision tree configurations* (policy). The crawler decision flow that most directly affects “why did this URL fetch/skip/cache” is currently implemented procedurally (e.g., `src/crawler/decisions/UrlDecisionOrchestrator.js`) and is not expressed as a tree.

This suggests a good phased approach:
1) Make the active decision tree config visible from the crawl UI (policy visibility).
2) Only then decide whether to build a per-URL trace format + UI.

## Candidate MVP UX
- Add a “Decision Trees” link/button near crawl controls that opens:
	- `http://localhost:3030/set/<activeSlug>?persist=1` if there is an active slug, else
	- `http://localhost:3030/`.
- Optional: add a server-side redirect route under the crawler UI server, e.g. `/decision-trees`, so users don’t care about ports.

## Experiments / Proof steps
- Confirm where `/api/decision-config-sets` is mounted in the running UI server.
- Fetch `/api/decision-config-sets/active` from the crawl UI and confirm it returns a slug when a config set is active.
- Confirm Decision Tree Viewer is running (or add a friendly message if it isn’t).

## Risks / gotchas
- Viewer header says `@port 4960` but code default is `3030`.
- Cross-port linking: local dev is fine; in “single server” deployments we likely want a redirect/proxy.
