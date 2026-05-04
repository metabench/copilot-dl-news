---
type: workflow
id: ui-screenshot-feedback-loop
status: canonical
audience: agents
tags:
  - ui
  - screenshots
  - electron
  - puppeteer
  - feedback
last-reviewed: 2026-05-04
---

# UI Screenshot Feedback Loop

Use this workflow for any UI app, dashboard, control-centre surface, or jsgui3 control that needs automatic screenshots and user-review comments.

## Goal

Build UI work so the agent can capture screenshots automatically, save them where the user can view them in the control centre, read later comments, and make iterative improvements from those comments.

## Required Inputs

- UI surface name and route.
- Main user/operator journeys.
- Whether the UI is browser-only, Electron-backed, or both.
- Stable readiness selectors or the files where they should be added.
- Current session folder.

## Workflow

### 1. Start With A Session And Journey Map

Create or continue `docs/sessions/<yyyy-mm-dd>-<slug>/`.

Add `USER_JOURNEYS.md` for substantial UI work. Keep it concrete: one row per operator task, not one row per route.

Minimum columns:

- journey key.
- user goal.
- start data/state.
- steps.
- visible success criteria.
- screenshot/readiness selectors.

### 2. Add Screenshot-Ready UI Markers

For each surface under test, add stable markers:

- `data-screenshot-subject="<feature>"`
- `data-screenshot-route="/<route>"`
- readiness marker such as `data-<feature>-ready="true"`
- metric selectors such as `data-<feature>-stat="<name>"`

For jsgui3 controls, put these markers on the reusable control, not only on the shell container, so nested panel activation can find them.

### 3. Choose The Capture Rig

Use this decision path:

1. If the goal is deterministic route capture, layout metrics, console/network logs, or CI-style verification, use Puppeteer.
2. If the goal is persistent operator review, desktop shell fidelity, or long-running operations, use Electron and keep the app open when required.
3. If no custom script exists and the agent needs immediate visual inspection, use Playwright/MCP or a one-shot Puppeteer capture, then promote the useful parts into a script.

### 4. Build Efficient Capture Scripts

Capture scripts should:

- live under `scripts/ui/`.
- reuse `scripts/ui/lib/screenshotCapture.js` for standard route-set captures.
- accept `--output`, `--base-url`, and any needed fixture/database options.
- support `--save-screenshots` and `--no-screenshots`.
- support `--save-dom-snapshots` when a rendered DOM snapshot will make later debugging faster.
- start a temporary server on a random port when no base URL is supplied.
- reuse a single browser for all routes and journeys.
- include desktop and mobile viewport passes when responsiveness is part of the requirement.
- wait on route-specific selectors and readiness markers.
- capture PNGs plus `analysis.json`.
- include browser events, failed requests, layout overflow checks, loading-state checks, and app-specific stats.
- close all resources in `finally`.

Recommended output directory during active work:

```text
docs/sessions/<session>/screenshots/
```

### 5. Capture Baseline, Improve, Recapture

For existing UI, capture before major edits. After edits, recapture the same journey keys and compare:

- machine evidence: `ok`, browser events, overflow, loading states, metric values.
- subjective evidence: visual hierarchy, density, labeling, scannability, text fit, stale or misleading default scopes.

Record judgement and changes in `WORKING_NOTES.md`.

### 6. Publish Review Artifacts To The Control Centre

Create or update:

- `SCREENSHOT_REVIEW.md` with image embeds and short evidence notes.
- `SCREENSHOT_COMMENTS.md` for user comments.
- session hub links when the screenshot set is a meaningful milestone.

The control centre/docs viewer should be able to render the Markdown gallery directly from the session folder. If the UI supports SVG annotations, keep the annotated SVG near the review file and use `agent-comment` groups.

The unified app also provides `/?app=screenshot-review`, which discovers screenshot `analysis.json` files, filters by session/app, shows saved PNGs, links DOM snapshots, and writes comments to the matching `SCREENSHOT_COMMENTS.md`. Use it as the primary in-app review surface for saved screenshot runs.

### 7. Read Comments Before The Next UI Pass

Before modifying a UI with screenshot evidence, read:

- `SCREENSHOT_COMMENTS.md` in the active or linked session.
- `.agent/pending_comments.md` if present.
- SVG `agent-comment` groups in linked review diagrams.
- relevant comments noted in `WORKING_NOTES.md`.

Treat comments as user requirements. When a comment is fixed, mark it done and link the new screenshot or validation command.

## Electron Guidance

Use Electron when the user is evaluating the real control-centre shell, persistent windows, or long-running crawl/status operations.

Recommended patterns:

- `npm run electron:unified -- --url-path "/?app=<app>"` for manual/persistent review when supported by the Electron entry point.
- Avoid `--smoke` or one-shot screenshot modes when persistence is required.
- For automated Electron checks, prefer existing smoke checks under `src/ui/electron/**/checks/` and record whether the Electron process stays alive or exits intentionally.

If Electron screenshot automation is missing for a surface, first build Puppeteer capture for deterministic evidence, then add Electron-specific capture only when desktop shell behavior changes the result.

## Puppeteer Guidance

Use Puppeteer for fast, custom, repeatable screenshot rigging.

Good custom rig traits:

- route array with `key`, `path`, `waitSelector`, `readySelector`, and metrics extractor.
- one browser launch per run.
- fixed viewport set such as desktop `1440x1000` and optional mobile `390x844`.
- viewport screenshots or subject clips instead of unbounded full-page captures.
- `analysis.json` as the pass/fail source.

Use scenario suites when journeys require multiple interactions but should keep one warm browser.

## Validation Checklist

- `USER_JOURNEYS.md` exists for substantial UI work.
- UI exposes stable screenshot and readiness markers.
- screenshot script exits cleanly and writes PNGs plus `analysis.json`.
- `analysis.json` has `ok=true` or documents exact blockers.
- `SCREENSHOT_REVIEW.md` embeds the images.
- `SCREENSHOT_COMMENTS.md` exists and is linked.
- session `WORKING_NOTES.md` records commands, result, and visual judgement.

## References

- Methodology: `docs/guides/UI_SCREENSHOT_FEEDBACK_METHODOLOGY.md`
- Visual/numeric inspection: `docs/workflows/ui-inspection-workflow.md`
- Puppeteer one-shot workflow: `docs/guides/PUPPETEER_UI_WORKFLOW.md`
- Puppeteer scenario suites: `docs/guides/PUPPETEER_SCENARIO_SUITES.md`
- Agent SVG comment platform: `docs/design/agent_interaction_platform.md`