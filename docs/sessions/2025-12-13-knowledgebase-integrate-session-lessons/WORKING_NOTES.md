# Working Notes – Integrate session lessons into knowledgebase

## Inputs (what we consolidated)
- `docs/sessions/2025-11-15-control-map-registration/CONTROL_MAP.md` for constructor registration (`map_Controls`) and the lowercasing rule.
- `docs/sessions/2025-11-19-client-control-hydration/` + `docs/sessions/2025-11-20-client-activation/` for the real failure mode behind `Missing context.map_Controls` warnings.
- Current implementation reference: `src/ui/client/index.js` exports readiness globals (notably `window.__COPILOT_REGISTERED_CONTROLS__`).

## Edits applied
- Centralized guidance in `docs/guides/JSGUI3_UI_ARCHITECTURE_GUIDE.md` under “Client-Side Activation Flow (CRITICAL)”.
- Added routing pointers from `AGENTS.md` + `docs/INDEX.md`.
- Added canonical-doc pointers to the key historical sessions to reduce future duplication.
- Added a canonical Puppeteer E2E “wait for activation” snippet to `docs/TESTING_QUICK_REFERENCE.md` (links back to the activation guide section).

- 2025-12-13 — Session created via CLI. Add incremental notes here.
