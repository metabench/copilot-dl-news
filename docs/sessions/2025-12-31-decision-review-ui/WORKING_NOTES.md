# Working Notes – Decision Review UI (Pause-on-decision crawl)

- 2025-12-31 — Session created via CLI. Add incremental notes here.

## Known facts (repo inventory)
- Crawl Observer already exists and is task_events-backed: `src/ui/server/crawlObserver/server.js` (port 3007).
- Decision Tree Viewer already exists as its own server: `src/ui/server/decisionTreeViewer/server.js` (configured to run on port 3030).
	- It can also be mounted under Data Explorer at `/decision-tree-viewer`.
	- It can load trees from `config/decision-trees/*.json` and from a `DecisionConfigSet`.
- Decision tree viewer model format is `branch` (yes/no) + `result` (boolean), with condition metadata: `src/ui/server/decisionTreeViewer/isomorphic/model/DecisionTree.js`.
- There is a separate decision-tree execution engine with an audit trail (`path[]`, `encodedPath`) at `src/analysis/decisionTreeEngine.js`.
- There is a versioned “Decision Config Set” model intended to represent decision-making rules and feature flags: `src/crawler/observatory/DecisionConfigSet.js`.
- The “active decision config set” is persisted in DB settings key `decisionConfigSet.activeSlug` via `src/crawler/observatory/DecisionConfigSetState.js`.

## Brainstorm: “Pause on every decision” UX

Goal: During a crawl run, pause at each decision point and show:
- What the decision was (name/id)
- The input context
- The premises / evaluated facts / rule path
- The chosen outcome

### Options (ranked)

| Option | Impact | Effort | Risk | Domains |
| --- | --- | --- | --- | --- |
| A) Extend Crawl Observer into a Decision Review UI (events + detail pane) | Very high | M | Medium | UI + Data + Ops |
| B) New “Decision Review” sub-app (Unified App) combining decision stream + embedded Decision Tree Viewer | Very high | L | Medium–High | UI + Data + Ops |
| C) Explainability-on-demand in Data Explorer (URL → classifications → facts → decision paths) | High | S–M | Low–Medium | UI + Data |
| D) Dev-only in-memory stepper (WebSocket + single-process crawl) | Medium | M | High | UI + Ops |

### Recommended MVP (lowest risk path)
- Start with Option A using `task_events` as the decision trace log.
- Add a small “interactive mode” contract for the crawler: when enabled, write a `decision` event to `task_events` and then block on a “continue” signal.

### Event schema strawman (for `task_events.payload_json`)
```json
{
	"eventType": "decision",
	"decision": {
		"system": "decisionTreeEngine|hubGuessing|queuePriority|...",
		"decisionId": "...",
		"treeId": "...",
		"nodeId": "...",
		"label": "...",
		"outcome": true,
		"reason": "..."
	},
	"context": {
		"url": "...",
		"host": "...",
		"inputs": { "...": "..." }
	},
	"premises": [
		{ "kind": "field", "field": "article_links_count", "operator": ">=", "value": 12, "target": 10, "result": true },
		{ "kind": "pattern", "field": "url", "pattern": "article", "matchType": "segment", "result": false }
	],
	"path": [
		{ "nodeId": "root", "condition": "...", "result": true, "branch": "yes" }
	]
}
```

### Domain coverage checklist
- [x] UI — detail pane + step controls inside Crawl Observer / Unified App
- [x] Data — decision event payload schema; optional persistence of control commands
- [x] Tooling — reuse `tools/dev/task-events.js` for inspection; add a tiny check script once implemented
- [x] Operations — avoid hangs; explicit timeouts; safe stop/continue semantics

