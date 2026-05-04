# Plan: Screenshot Tooling Control Centre

Objective: add reusable screenshot capture tooling plus a Control Center screenshot viewer/commenting surface so UI apps and checks can opt into screenshots with minimal code.

Done when:
- A shared Node screenshot helper can be reused by UI scripts/checks, with standardized optional screenshot saving.
- At least one existing screenshot script uses the helper rather than hand-rolled capture boilerplate.
- The unified Control Center has a screenshot review panel that lists saved screenshot runs, displays images, and saves comments.
- Focused checks cover the helper and viewer/control rendering.
- Browser/Puppeteer validation opens the Control Center screenshot review route and confirms the viewer works.
- Docs/session notes record commands, artifacts, and any remaining improvements.

Change set:
- `scripts/ui/lib/` reusable screenshot tooling.
- `scripts/ui/capture-unified-crawl-display.js` as the first consumer.
- `src/ui/controls/` screenshot review control and check.
- `src/ui/server/unifiedApp/` registry, activator, API/static routes, check-mode payload, and CSS.
- `docs/guides/UI_SCREENSHOT_FEEDBACK_METHODOLOGY.md` and session docs.

Risks/assumptions:
- The repo already has many uncommitted changes; keep edits focused and do not revert unrelated work.
- Screenshot artifacts are session-oriented and may be gitignored elsewhere; the viewer should list real files from `docs/sessions/**/screenshots` and root `screenshots/**` without needing a DB.
- Comment storage should be simple and durable; use session-local `SCREENSHOT_COMMENTS.md` when a screenshot belongs to a session.

Validation:
- Node helper check.
- jsgui3 control render check.
- unified shell and server smoke checks.
- Puppeteer capture against `/?app=screenshot-review` with `analysis.json` confirming no overflow/loading errors.