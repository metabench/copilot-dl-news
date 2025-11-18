# Plan: diagram-atlas-isomorphic-client

**Objective**: Ensure the diagram atlas shell fetches `/api/diagram-data`, renders the payload with shared jsgui3 controls, and keeps SSR + hydration output in sync.

**Done when**
- `DiagramAtlasControls` logic is usable on both server (`jsgui3-html`) and client (`jsgui3-client`).
- Client hydration renders sections + diagnostics via jsgui-built controls after fetching server data (or consuming initial SSR snapshot).
- Diagram progress state reflects fetch lifecycle through a jsgui control wrapper.
- Regression coverage (check + Jest e2e) passes using the new shared implementation.

**Change set**
- `src/ui/controls/DiagramAtlasControls.js` → refactor into shared factory + server wrapper.
- `src/ui/client/index.js` → consume shared factory, replace manual DOM builders with jsgui-based flow.
- (New) shared module for diagram atlas controls (client/server).
- Docs/session notes/journal updates; optional helper/check assets if needed for hydration testing.

**Risks & assumptions**
- Bundler needs to include the shared factory without pulling in server-only deps; must avoid requiring `jsgui3-html` on the client path.
- jsgui contexts differ between server/page vs. browser; need a safe client-side `Client_Page_Context` initializer before rendering controls.
- Large payloads could make repeated `all_html_render()` expensive; reuse contexts and minimize DOM churn.

**Tests / verification**
1. `node src/ui/server/checks/diagramAtlas.check.js` — guards SSR regression + shared factory wiring.
2. `npm run test:by-path tests/server/diagram-atlas.e2e.test.js` — end-to-end server routes + payload still work.
3. Add/execute a lightweight hydration/check (e.g., new Jest unit or check script) to ensure jsgui client rendering runs without document errors.

**Docs to update**
- `docs/sessions/2025-11-16-jsgui3-isomorphic-diagram-atlas/` (working notes / summary as progress happens).
- `docs/sessions/SESSIONS_HUB.md` entry for this session.
- `docs/agi/journal/2025-11-16.md` with Sense/Plan/Act/Verify breadcrumbs.

---

## Extension Plan: diagram-atlas-presentation-polish (2025-11-16)

**Objective**: Elevate the Diagram Atlas presentation so the hero header, section framing, tiles, and feature rows read clearly in both SSR and hydrated states.

**Done when**
- Hero stats row + refresh toolbar use the new glass card layout with clear state labels.
- Section wrappers alternate surface treatments and spacing for readability without breaking SSR output.
- Code tiles + directory rows expose richer metadata (popover labels, tone-aware gradients, hover states).
- Feature footprint list renders as modular cards with clearer file progress bars.
- CSS + control factory changes pass the Diagram Atlas check script.

**Change set**
- `src/ui/controls/diagramAtlasControlsFactory.js` → extend hero/toolbar builders, tile creation, directory + feature rows, and the CSS block.
- `src/ui/server/diagramAtlasServer.js` + client bootstrap (if needed) → adopt new hero stats API / layout wrappers.
- `diagram-atlas.check.html` (auto artifact) for quick visual diff if necessary.

**Risks & assumptions**
- Need to keep the isomorphic control tree stable so hydration still matches (avoid ad-hoc DOM nodes outside jsgui controls).
- Larger CSS block must stay inlined without blowing bundle caps; reuse vars/util classes when possible.
- Feature data may omit optional fields; new badges must tolerate missing descriptors.

**Tests / verification**
1. `node src/ui/server/checks/diagramAtlas.check.js` — ensures SSR output renders with new layout.
2. `npm run diagram:screenshot` — smoke-test headless capture to confirm layout + selectors still valid.

**Docs to update**
- Session working notes + journal entry capturing presentation changes and open follow-ups.
