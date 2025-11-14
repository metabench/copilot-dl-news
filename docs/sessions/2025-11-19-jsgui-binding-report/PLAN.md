# Plan: jsgui-binding-report

Objective: Document a practical data-binding simplification path for jsgui3-html consumers powering the URL table UI.

Done when:
- Static analysis details where bindings currently originate (control class, data-value wrappers, attribute sync)
- Risks and opportunities for simplifying bindings are listed with evidence
- A new `docs/ui/` report captures recommendations and proposed changes to jsgui3-html or adjacent helpers

Change set:
- `docs/sessions/2025-11-19-jsgui-binding-report/*`
- `docs/ui/*` (new report folder + markdown)

Risks/assumptions:
- `node_modules/jsgui3-html` APIs match the inspected version (no unpublished forks)
- Static analysis scripts can traverse dependencies without needing a build step
- Report readers expect actionable guidance, not just raw notes

Tests:
- Manual verification only (documentation task)

Docs to update:
- `docs/ui/<report>` (new)
- `docs/sessions/SESSIONS_HUB.md` (link this session)
