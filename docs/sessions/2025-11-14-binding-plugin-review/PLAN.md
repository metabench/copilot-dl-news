# Plan: binding-plugin-review
Objective: Diagnose and fix the Data_Model_View_Model_Control runtime failure by correcting the binding plugin/model wiring so the UI can activate cleanly.

Done when:
- Puppeteer console capture runs without the `Data_Model_View_Model_Control` model `.on` TypeError
- Underlying cause is documented along with the applied fix (code + notes in this session folder)
- Data/model binding path has smoke validation (manual or automated) using the updated bundle
- Session hub links to this plan and any new docs touched

Change set:
- `src/ui/...` or related binding plugin files once identified (potentially under `vendor/jsgui3-client` or custom plugin code)
- `scripts/ui/puppeteer-console.js` only if more diagnostics are needed
- `docs/sessions/2025-11-14-binding-plugin-review/*`
- `docs/sessions/SESSIONS_HUB.md`

Risks/assumptions:
- Binding plugin structure might be shared elsewhere; need to confirm ripple effects via `js-scan`
- Vendored code edits could complicate future upstream syncs; prefer encapsulated helpers if possible
- Current runtime context is strict/esbuild bundled; ensure globals are defined explicitly

Tests:
- `node scripts/ui/puppeteer-console.js` (captures console + page errors)
- Targeted unit tests if applicable (TBD once affected module located)

Docs to update:
- This session folder (findings + summary)
- `docs/sessions/SESSIONS_HUB.md`
- Any binding workflow guide if changes are substantial (e.g., `docs/AGENT_REFACTORING_PLAYBOOK.md` or binding-specific doc)
