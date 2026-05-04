# Follow-Ups: UI Screenshot Feedback Methodology

1. Build a reusable screenshot gallery helper for `SCREENSHOT_REVIEW.md`.
   - Acceptance: capture scripts can emit a Markdown gallery from `analysis.json` without hand-writing image links.
   - Validation: run it against `docs/sessions/2026-05-04-five-site-cloud-crawl-ui/screenshots/analysis.json` and confirm image links render from the session folder.

2. Add mobile viewport support to the unified crawl display screenshot script.
   - Acceptance: `analysis.json` contains desktop and mobile entries for `cloud-crawl`.
   - Validation: no horizontal overflow in either viewport.

3. Connect docs/control-centre comments to `SCREENSHOT_COMMENTS.md`.
   - Acceptance: comments written in the control-centre review surface are saved to a predictable Markdown or JSON file that future agents can read.
   - Validation: create a sample comment, reload the review surface, and confirm the agent can locate it from session docs.

4. Add Electron-specific screenshot capture only where desktop shell behavior changes the result.
   - Acceptance: Electron capture is available for at least one persistent unified-app journey without closing the long-lived operator window unexpectedly.
   - Validation: Electron process lifecycle is recorded and screenshots are linked from `SCREENSHOT_REVIEW.md`.