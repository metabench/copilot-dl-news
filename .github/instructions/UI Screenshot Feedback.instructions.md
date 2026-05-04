---
description: "Use when working on UI apps, jsgui3 controls, screenshot tooling, Electron surfaces, Puppeteer captures, control-centre screenshot reviews, or screenshot comments. Requires user journeys, automatic screenshots, review artifacts, and comment intake."
applyTo: "{src/ui/**,scripts/ui/**,docs/workflows/**,docs/guides/**,docs/agi/skills/**}"
---

# UI Screenshot Feedback Instructions

When working on UI apps or UI tooling, follow the screenshot feedback loop in `docs/workflows/ui-screenshot-feedback-loop.md` and the methodology in `docs/guides/UI_SCREENSHOT_FEEDBACK_METHODOLOGY.md`.

## Always Do This For UI Work

- Plan the main user/operator journeys before implementation when the work is more than a tiny visual fix.
- Add stable screenshot markers to new UI surfaces: `data-screenshot-subject`, `data-screenshot-route`, a deterministic readiness marker, and app-specific metric selectors.
- Preserve existing layouts unless the user explicitly asks to replace them; add or swap reusable jsgui3 controls for alternate layouts.
- Provide an automatic screenshot path using Puppeteer by default; use Electron when desktop shell fidelity, persistent control-centre review, or long-running operations matter.
- Reuse `scripts/ui/lib/screenshotCapture.js` for new Puppeteer route captures unless a surface needs genuinely custom browser orchestration.
- Support optional screenshot persistence with the standard flags `--save-screenshots` and `--no-screenshots`; still write `analysis.json` when screenshots are skipped.
- For responsive surfaces, include the helper's desktop and mobile viewport pass and keep per-viewport route keys in `analysis.json`.
- Use `--save-dom-snapshots` when the next debugging pass may need the rendered DOM next to each PNG.
- Save active-work screenshots under `docs/sessions/<session>/screenshots/` with `analysis.json`.
- Create or update `SCREENSHOT_REVIEW.md` and `SCREENSHOT_COMMENTS.md` so the user can view screenshots in the control centre and leave comments for later agents.

## Before Improving An Existing UI Screenshot Surface

Read user comments first:

- current or linked `SCREENSHOT_COMMENTS.md`.
- `.agent/pending_comments.md` if present.
- SVG files with `<g class="agent-comment">` groups.
- session `WORKING_NOTES.md` entries that mention screenshot feedback.

Treat unresolved screenshot comments as requirements. When you address one, mark it done and link the new screenshot or validation evidence.

## Capture Rig Standard

Custom scripts under `scripts/ui/` should start a temporary server when needed, reuse one browser, wait for deterministic selectors, capture PNGs, and write `analysis.json` with browser events, layout overflow, loading-state checks, screenshot sizes, and feature-specific metrics.

The Control Center screenshot viewer is mounted at `/?app=screenshot-review`. It discovers `analysis.json` files under `docs/sessions/**/screenshots/` and `screenshots/**`, filters by session/app, serves existing image and DOM snapshot assets safely, and writes comments to the associated `SCREENSHOT_COMMENTS.md`.

Do not call a UI visually verified from a non-empty PNG alone. Pair screenshots with readiness and browser-event evidence.