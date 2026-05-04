# Decisions: Screenshot Tooling Control Centre

## Shared Helper Before More Scripts

Context: Screenshot scripts were starting to duplicate server startup, browser setup, route waiting, and `analysis.json` writing.

Decision: Add `scripts/ui/lib/screenshotCapture.js` and refactor the unified crawl display capture as the first consumer.

Consequence: New route captures need less custom code, and checks can use `--no-screenshots` without losing metrics.

## Markdown Comments As Durable Storage

Context: The screenshot viewer needs comments without adding a database dependency or schema work.

Decision: Store comments in the associated `SCREENSHOT_COMMENTS.md`, preferring the session root for session screenshot artifacts.

Consequence: Comments are reviewable in normal docs, diffable, and easy for future agents to read before UI changes.

## Placeholder For Missing Images

Context: Historical `analysis.json` files may refer to skipped or deleted screenshots.

Decision: The viewer only emits image URLs for files that exist and renders a placeholder otherwise.

Consequence: Browser validation avoids noisy 404s while still showing that a route was part of the run.