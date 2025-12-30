# Plan – Connect crawler to decision tree viewer

## Objective
Make the “simple crawler interface” and/or crawl UX provide a few-click path into the Decision Tree Viewer, starting with “what rules are active” and then evolving to “what decisions were made for this crawl/URL”.

## Known Facts (ground truth)
- Decision Tree Viewer runs as its own Express + jsgui3 SSR server at `src/ui/server/decisionTreeViewer/server.js` (default port is `3030`).
- The viewer currently renders decision tree configs (from `config/decision-trees/*.json`) and config sets (via `/set/:slug`). It does not (yet) render per-crawl decision traces.
- The crawler can load an “active decision config set” from DB and/or a specific slug via `src/crawler/CrawlerServiceWiring.js`.
- The API exposes config-set routes at `/api/decision-config-sets/*` via `src/api/routes/decisionConfigSetRoutes.js` (including `/active`).
- The “simple crawler interface” appears to be the deprecated UI controls under `src/deprecated-ui/public/index/*` (e.g. `crawlControls.js` posts to `/api/crawl`).

## Done When
- [ ] Crawler UI has a clear “Decision Trees” entrypoint (link or button) that opens the Decision Tree Viewer.
- [ ] The link is contextual (opens the active config set if known; falls back to viewer root otherwise).
- [ ] A short decision is captured in `DECISIONS.md` describing the integration strategy.
- [ ] Follow-ups capture the “real decision traces” phase (if desired), including ownership.

## Options (ranked)

| Option | Impact | Effort | Risk | Domains |
| --- | --- | --- | --- | --- |
| A. Deep-link to config set (MVP) | “Few clicks” to see active decision trees/rules driving crawler behavior | S | Low | UI, Ops |
| B. Add trace capture + highlight path | True “why did this URL do X” trace visualization | M–L | Medium–High (schema + mapping) | UI, Data, Tooling |
| C. Serve viewer under same server (proxy/sub-app) | Cleaner navigation (no separate port), easier sharing | M | Medium (routing, assets) | Ops, UI |
| D. Data Explorer panel for config set / traces | Consolidates configuration + explanations in main UI | L | Medium | UI, Data |

## Recommended Path
1) Implement Option A first (link + contextual deep-link to `/set/:slug`).
2) Capture evidence from real crawls about what traces are valuable.
3) If needed, implement Option B as a second phase, using a stable “DecisionTrace” JSON format and minimal viewer augmentation (show trace list + encodedPath; highlight later).

## Change Set (candidate files)
- Deprecated crawler UI: `src/deprecated-ui/public/index/*` (likely `crawlControls.js` and/or the HTML that defines the controls).
- Optional server redirect: deprecated UI Express server (`src/deprecated-ui/express/server.js` or routes) for `/decision-trees` redirect.
- Decision Tree Viewer: `src/ui/server/decisionTreeViewer/server.js` only if we add a new trace endpoint.
- Docs: this session folder.

## Risks & Mitigations
- Port mismatch: viewer JSDoc says `@port 4960` but runtime default is `3030` → document and (later) fix for correctness.
- “Connected” vs “explained”: config trees show policy, not per-URL reasoning → ship MVP link first, then evaluate trace needs.
- Cross-origin/port friction → prefer redirect/proxy route under crawler server if users don’t want a second port.

## Tests / Validation
- If we touch deprecated UI JS: run the existing unit test `src/deprecated-ui/__tests__/crawlControls.start-button.test.js` (and any nearby ones).
- If we add/modify Express routes: add a small `checks/*.check.js` (or reuse existing route tests if present).
