# Plan: Five-Site Cloud Crawl UI

Objective: Run a small parallel cloud crawl across five websites and improve the crawler UI so agents can capture screenshots, judge the UI visually, and iterate without replacing existing layouts.

Done when:
- A simple jsgui3 crawl UI surface exposes concise crawl status, key counts, and screenshot/export affordances.
- Existing crawl layouts are preserved; any radically simpler presentation is added as new controls and mounted in the existing application where appropriate.
- A five-site, five-page crawl path using parallel cloud downloads is executed or the exact blocker is documented with command evidence.
- UI screenshots are captured to session artifacts and used for at least one visual judgement/improvement pass.
- Focused render/check/API validation commands pass or known unrelated failures are documented.

Change set:
- `src/ui/**` crawl-related app/control files, pending discovery.
- `tools/crawl/**` only if an orchestration helper or CLI output path is needed.
- `checks/**` or local `checks/` scripts for focused UI verification.
- `docs/sessions/2026-05-04-five-site-cloud-crawl-ui/**` session evidence.

Risks/assumptions:
- Cloud crawler access may depend on current OCI/SSH state; verify before assuming the crawl can run.
- jsgui3 layout APIs are still evolving, so prefer simple controls and stable CSS over deep framework experimentation.
- Screenshots need a running server/browser path; validation must clean up any started server process.

Tests/validation intent:
- Read crawl/UI quick references before editing.
- Run focused jsgui3 render/check scripts for the new control(s).
- Run the relevant crawl-remote status/start/sync command path with JSON or concise output where available.
- Capture UI screenshots into this session folder and inspect them before finalizing.

Docs to update:
- `docs/sessions/SESSIONS_HUB.md`
- `docs/sessions/long-term/lt-001-advanced-crawler-ui/WORKING_NOTES.md`
- Session summary, validation matrix, next-agent briefing, and prompt.