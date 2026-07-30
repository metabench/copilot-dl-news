# projectStatus — code guide for AI agents

This app is the owner's first-class project interface. The PROTOCOL (roles,
signal loop, proposal rules, honesty duties) lives in
[docs/agi/TECH_TREE_INTERFACE.md](../../../../docs/agi/TECH_TREE_INTERFACE.md)
— read that first. This file is the code-level map and the gotchas that each
cost a real debugging pass.

## File map

| File | Owns | Notes |
| --- | --- | --- |
| `server.js` | routes | `/` hub · `/tech/{agi,tree,crawler,factory}` · `/tech/node?id=` · `/api/status` · POST `/api/research-signal` · `/progress.svg` (read from disk INSIDE the handler — regenerated pictures appear without a redeploy) |
| `statusData.js` | data assembly | `buildStatus`, `buildTechTree` (THROWS on phantom edge / 3rd prereq / unknown branch / dateless done — the throws ARE the schema), `ledgerMentions(nodeId)` (30s-cached ledger slicing), `shortTitle` |
| `techPages.js` | the four branch pages + node datalinks pages | per-request HTML strings; modal, tree SVG (`renderTreeSvg`), settings dialog (`SETTINGS_RANGE` is THE range constant — c146 was a one-constant change because of it), signal buttons, both footers |
| `controls.js` | the HUB ONLY | isomorphic jsgui3 bundle (SSR + client activation) |
| `signals.js` | the owner-click queue (owner→agent) | append-only JSONL: `raise/ack/pending/effective/readAll`; ack appends a superseding record, never mutates |
| `activity.js` | the agent-progress channel (agent→owner) | append-only JSONL; `report()` DROPS records <20s apart (flow protection is enforced here, so every caller shares one rule), `current()` returns idle rather than presenting a stale phase as live. Write via `tools/agi/report-progress.js` at phase boundaries |
| `techArt.js` | inline SVG art + icons | `iceBulb`, `treeMonitor`, `spiderWeb`, `factorySpanner`, `headerScape`, `faviconSvg`, `gearIcon`; ICONS map |
| `checks/` + `__tests__/` | verification | `npx jest src/ui/server/projectStatus` (fast); `tools/dev/checks/tech-tree-schema.check.js` after ANY config/tech-tree.json edit; `project-status-live` probe for real-browser truth |

## The two render models — do not mix them up

- **The hub (`/`)** uses the jsgui3 `Server({Ctrl})` recipe: SSR is published
  ONCE at server start (a boot snapshot). The client therefore fetches
  `/api/status` IMMEDIATELY on activate — that one line is the c128.5 fix and
  the `progress-surface` probe (P2) guards it. Never remove it; never "verify"
  the hub by restarting the server (a restart hides the bug class).
- **The tech pages** are rendered PER REQUEST — they cannot go stale, and a
  new node needs no route registration (the id travels as a query param).
  Keep new surfaces on this model unless there is a measured reason not to.

## Gotchas (each is a real incident)

- **`String_Control` does NOT escape text.** Escape at the point a dynamic
  string enters markup (`esc(...)` in techPages, `escapeHtml` in the dash
  core). A stored title is a stored-XSS vector (c72 contract; regression
  tests prove `<script>` inert).
- **Export what you add.** `gearIcon` existed but wasn't in techArt's
  module.exports — first smoke failed with "not a function" (c145). Smokes
  run before browsers.
- **Modal open handler must ignore interactive children**: `button.tp-signal`,
  `button.tp-signal-mini`, `.tp-prelim` — otherwise a request click also opens
  the modal.
- **JSON island**: node data is embedded as JSON with `<`-escaped `<`.
  Keep it that way — it is what makes island content injection-proof.
- **Font sizing is rem-based** on purpose: the settings dialog scales the root
  (80–250%, `SETTINGS_RANGE`). New CSS uses rem for anything that should
  scale; px only for hairlines/borders.
- **Palette is computed, not eyeballed** (dataviz validator, dark surface):
  AGI ice `#4d9ec8` · tree green `#55a377` · crawler gold `#b8862e` · factory
  violet `#a678c8`. Icons are the secondary encoding — never color alone.
- **Server boot takes ~15s.** Readiness-wait (curl-loop to 200) before
  pointing a browser at it; "page loaded before server ready" produced
  all-false DOM checks once (c147).
- **Ledger edits change pages.** Datalinks trails derive from
  IMPROVEMENT_LEDGER.md via `ledgerMentions` (30s cache) — after appending a
  ledger row, a running server shows the new trail within ~30s; a restart is
  NOT required (but `require` cache means CODE edits do need one).

## Definition of done for changes here

1. Suites green: `npx jest src/ui/server/projectStatus` (+ the deploy/dash
   suites if shared code moved).
2. `tech-tree-schema` probe green after any tech-tree.json edit.
3. Real-browser verification for anything user-visible (live server, DOM
   measurement; geometry over screenshots when the pane isn't compositing).
4. Ledger row mentions every touched node ID (that IS the documentation).
5. The standard close ritual (row + stanza → repo-activity + progress-svg →
   commit + push → regenerate prompt).
