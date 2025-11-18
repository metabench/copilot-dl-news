# Plan: client-controls-bundle

Objective: Understand how client controls are registered so esbuild includes them, and align our bundle process with the jsgui3-server examples.

Done when:
- Current build pipeline (`scripts/build-ui-client.js` + entry files) is mapped and gaps noted.
- jsgui3-server sample implementation is documented with specific references.
- Proposed alignment or follow-ups captured in WORKING_NOTES and response summary.

Change set:
- docs/sessions/2025-11-15-client-controls-bundle/WORKING_NOTES.md (analysis notes)
- (informational task; no code changes expected unless blockers identified)

Risks / assumptions:
- jsgui3-server examples available under vendor tree; if not, may need to pull from documentation.
- esbuild config may already include all controls; need to avoid unnecessary churn.

Tests:
- None (analysis).

Docs to update:
- Current session folder WORKING_NOTES + summary.
