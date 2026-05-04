# Session: Electron jsgui3 Crawl Display

## Objective
Make sure the project is set up to use jsgui3 and Electron for displaying crawls, then run and visually verify a small crawl through screenshots and iterative fixes.

## Done When
- The relevant Electron, unified jsgui3 UI, crawl, and screenshot commands are identified and documented.
- A small crawl is run successfully or a blocker is captured with evidence.
- Crawl data is visible through the jsgui3 UI surface intended for Electron display.
- Screenshots are captured and inspected for layout/content quality.
- Fixes are implemented for errors or quality issues found during the loop.
- Final checks, artifacts, and residual follow-ups are documented.

## Change Set
- Expected code: `src/ui/**`, `scripts/ui/**`, focused crawl/UI helpers if needed.
- Expected docs: this session folder, `docs/sessions/SESSIONS_HUB.md`, and relevant UI docs if commands/checks change.

## Risks And Assumptions
- The worktree already contains unrelated churn; avoid reverting unrelated changes.
- Electron should act as a shell around the system Node-hosted jsgui3/unified UI where possible to avoid native/module mismatch issues.
- Prefer existing small crawl profiles and existing screenshot tooling before adding new scripts.
- Do not leave long-running servers or Electron processes behind.

## Tests And Checks
- `node src/ui/server/unifiedApp/checks/unified.server.check.js`
- Small crawl command selected from `tools/crawl/AGENT.md` / crawl profiles.
- Puppeteer/Electron screenshot capture and visual/DOM analysis.

## Strategic Context
Supports LT-001 Advanced Crawler + Advanced UI by proving a real crawl can be shown through the jsgui3-first UI and Electron shell at high quality.