# UI Screenshot Feedback Methodology

This methodology defines the standard for UI apps in this repository: every operator-facing UI surface should be easy for an agent to screenshot, inspect, save into the control centre, receive user comments, and improve in a later pass.

It sits above the lower-level Puppeteer and Playwright guides. Use this when designing or modifying a UI app, dashboard, jsgui3 control, Electron shell, or operational workflow.

## Core Principle

Treat screenshots as part of the UI contract, not as a debugging afterthought.

A UI change is not complete until the agent can answer four questions from saved artifacts:

1. What user journey was this screen built to support?
2. What did the UI look like at the important journey moments?
3. What numeric/browser evidence says the screenshot is trustworthy?
4. Where can the user review the image, leave comments, and expect the next agent to read them?

## Artifact Contract

For active work, save screenshot evidence under the current session folder so it is visible in the docs/control-centre surface and survives handoff:

```text
docs/sessions/<yyyy-mm-dd>-<slug>/
  USER_JOURNEYS.md
  SCREENSHOT_REVIEW.md
  SCREENSHOT_COMMENTS.md
  screenshots/
    analysis.json
    <journey-key>.png
    <journey-key>.html          optional DOM snapshot
    <journey-key>.metrics.json  optional layout metrics
```

If the screenshots are reusable product documentation rather than session evidence, a stable set may also live under `screenshots/<app>/<run-id>/`, but the session should still link to it from `SCREENSHOT_REVIEW.md`.

Required `analysis.json` fields for custom capture rigs:

- `ok`: boolean summary.
- `capturedAt`, `baseUrl`, `outputDir`.
- one entry per route/journey with `key`, `url`, `screenshotPath`, `screenshotBytes`, `viewport`, and readiness state.
- browser events: console errors, page errors, failed requests, and 4xx/5xx responses.
- layout checks: horizontal overflow, stuck loading text, empty-state count, and any app-specific stats that prove the screen is showing the intended data.

## Shared Screenshot Helper

New Puppeteer route captures should start with `scripts/ui/lib/screenshotCapture.js` rather than copying browser/server boilerplate. The helper provides:

- `parseCaptureArgs(argv, defaults)` for `--output`, `--db`, `--base-url`, `--headful`, `--save-screenshots`, and `--no-screenshots`.
- `parseCaptureArgs(argv, defaults)` also supports `--save-dom-snapshots` and `--no-dom-snapshots`.
- `captureRouteSet({ routes, outputDir, serverOptions, saveScreenshots, saveDomSnapshots, viewports })` for one-server/one-browser route sweeps with PNGs plus `analysis.json`.
- `maybeCaptureScreenshot(page, { enabled, outputPath })` so checks can opt out of PNG writes while preserving metrics.
- `maybeCaptureDomSnapshot(page, { enabled, outputPath })` for rendered DOM snapshots next to PNGs.
- `collectBrowserEvents(page)`, `waitForFrameText(page, needles)`, and `startNodeServer(options)` for the common capture lifecycle.

Route records should include `key`, `path`, `appId`, `waitSelector`, optional `readySelector`, and optional `inspect(page, route)` for feature metrics. When multiple viewports are configured, the helper writes route entries such as `cloud-crawl-desktop` and `cloud-crawl-mobile` while preserving `routeKey` and `viewportKey`. Use `--no-screenshots` when a CI or quick check should avoid image churn; use `--save-screenshots --save-dom-snapshots` for reviewable artifacts that can be debugged without reopening a browser.

The first consumer is `scripts/ui/capture-unified-crawl-display.js`, which captures `cloud-crawl`, `downloads`, `crawl-status`, and `screenshot-review` with the same helper.

## Control Center Screenshot Viewer

The unified Control Center includes a screenshot review panel at:

```text
/?app=screenshot-review
```

The panel discovers `analysis.json` files under `docs/sessions/**/screenshots/` and `screenshots/**`, filters by session/app key, displays saved images when present, links saved DOM snapshots, shows placeholders for deliberately skipped screenshots, and writes durable comments to the associated `SCREENSHOT_COMMENTS.md`.

The backing APIs are:

- `GET /api/screenshot-review/runs`
- `GET /api/screenshot-review/comments?run=<runId>`
- `POST /api/screenshot-review/comments`
- `GET /api/screenshot-review/assets/<runId>/<fileName>`
- `GET /api/screenshot-review/dom/<runId>/<fileName>`

Use this panel for user-visible review of saved screenshot sets. Follow-up agents must read comments from the same `SCREENSHOT_COMMENTS.md` before changing the related UI.

## Screenshot Review Files

Create or update `SCREENSHOT_REVIEW.md` whenever a UI screenshot set is produced. It should be short and visual:

```markdown
# Screenshot Review: <feature>

## Journey: <name>

Goal: <operator/user goal>

![<journey key>](screenshots/<journey-key>.png)

Evidence: `analysis.json` route `<journey-key>` reports `ok=true`, no horizontal overflow, and `<important metric>`.

Comment target: add comments in `SCREENSHOT_COMMENTS.md` under `<journey-key>`.
```

Create `SCREENSHOT_COMMENTS.md` even if it starts empty. Future agents must read it before changing the related UI.

Recommended comment format:

```markdown
# Screenshot Comments: <feature>

## <journey-key>

- Status: pending
  Target: screenshots/<journey-key>.png
  Comment: <user comment>
  Agent notes: <filled in when addressed>
```

If the control centre supports SVG comments, agents must also inspect SVG files for `<g class="agent-comment">` and check `.agent/pending_comments.md` before making UI changes.

## User Journey Planning

Plan journeys before building or testing. A journey is the minimum meaningful operator path, not a generic route list.

Use `USER_JOURNEYS.md` in the session folder for substantial UI work:

```markdown
# User Journeys: <feature>

| Key | User goal | Start state | Steps | Expected visible outcome | Screenshot selectors |
| --- | --- | --- | --- | --- | --- |
| crawl-complete | Confirm a five-site crawl completed | Remote results synced locally | Open `/?app=cloud-crawl` | 25/25 downloads, 5/5 sites complete, 0 errors | `[data-cloud-crawl-root]`, `[data-cloud-crawl-ready]` |
```

Every journey should define:

- the user/operator goal.
- the route and starting data state.
- the actions to perform.
- the visible success criteria.
- the readiness selectors or markers the capture rig should wait for.
- the screenshots and metrics that prove the journey worked.

## UI Markers Required For New Surfaces

Any new UI surface that should be screenshot-capable must expose stable markers:

- `data-screenshot-subject="<feature>"` on the subject container.
- `data-screenshot-route="/<route>"` when the route is not obvious.
- a readiness marker such as `data-<feature>-ready="true"` after async data and activation finish.
- stable app-specific metric selectors such as `data-cloud-crawl-stat="downloaded"`.
- stable target selectors for repeated items where comments may refer to a particular card, row, or chart.

Do not rely on generated jsgui3 IDs for screenshot scripts or comments.

## Choosing Puppeteer, Electron, Or Playwright/MCP

Use the smallest tool that gives reliable evidence.

| Tool | Use when | Output |
| --- | --- | --- |
| Puppeteer | Deterministic browser capture, CI-friendly screenshots, route sweeps, JSON metrics, console/network capture | PNG, HTML snapshot, `analysis.json` |
| Electron | The real operator app matters, long-lived crawl/status workflows are being evaluated, desktop shell state matters, or the user will keep the control centre open | persistent window, optional screenshot artifacts, lifecycle evidence |
| Playwright/MCP | The agent needs an immediate visual look, accessibility snapshot, or interactive exploration without building a custom script yet | screenshot plus snapshot, usually promoted later into Puppeteer rigging |

Electron is especially suitable when validating the unified app as a control centre during long operations. Do not use Electron `--smoke` or one-shot screenshot flags when the requirement is a persistent operator window; those modes intentionally close the app.

## Efficient Custom Screenshot Rigging

When adding a custom capture script, prefer this shape:

1. Start the target server on a random port unless `--base-url` is provided.
2. Launch one browser process and reuse one page or context for all routes.
3. Define route records with `key`, `path`, `waitSelector`, optional `readySelector`, viewport, and metric extractor.
4. Wait for deterministic readiness; avoid fixed sleeps except short stabilization delays after readiness.
5. Capture viewport-sized screenshots by default; clip to the subject container when the page is huge or the review target is a panel.
6. Save `analysis.json` with browser events, layout metrics, app-specific stats, and pass/fail summary.
7. Exit cleanly: close browser, server, DB handles, intervals, and timers.

Keep capture scripts under `scripts/ui/` and name them `capture-<surface>-screenshots.js` when they capture multiple routes or states.

Prefer the shared helper for this shape:

```js
const { captureRouteSet, parseCaptureArgs } = require("./lib/screenshotCapture");

const routes = [
  { key: "my-panel", appId: "my-panel", path: "/?app=my-panel", waitSelector: "[data-my-panel-root]", readySelector: "[data-my-panel-ready]" }
];

const args = parseCaptureArgs(process.argv.slice(2), { outputDir: "screenshots/my-panel" });
await captureRouteSet({
  routes,
  outputDir: args.outputDir,
  saveScreenshots: args.saveScreenshots,
  saveDomSnapshots: args.saveDomSnapshots,
  viewports: [
    { key: "desktop", width: 1440, height: 1000 },
    { key: "mobile", width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  ]
});
```

Fast-path validation ladder:

1. jsgui3/control render check under `src/**/checks/*.check.js`.
2. server `--check` or focused server smoke.
3. Puppeteer capture script with `analysis.json`.
4. Electron smoke or persistent Electron run when desktop shell behavior matters.

## Subjective Review Loop

Agents should use both machine evidence and subjective judgement:

1. Capture baseline screenshots before major UI edits when a UI already exists.
2. Read the image and `analysis.json` together.
3. Name concrete visual issues: density, hierarchy, cramped text, wrong default scope, hidden loading state, overflow, stale numbers, confusing grouping.
4. Make the smallest focused improvement.
5. Recapture the same journeys.
6. Record the before/after judgement in `WORKING_NOTES.md` and link the new screenshots from `SCREENSHOT_REVIEW.md`.

Do not claim visual quality from a non-empty PNG alone. The screenshot must be paired with readiness and browser-event evidence.

## Comment Intake For Later Agents

Before modifying a UI that has screenshot artifacts, agents must check for comments in this order:

1. Current session `SCREENSHOT_COMMENTS.md`.
2. Any linked screenshot review files from `docs/sessions/SESSIONS_HUB.md`.
3. `.agent/pending_comments.md` if present.
4. SVG files in the relevant docs/control-centre area containing `<g class="agent-comment">`.

When a comment is addressed, update its status and cite the validation command or screenshot that proves the change.

## Done Criteria For UI Apps

A UI app or significant UI feature is done only when:

- its main user journeys are listed.
- it has stable screenshot/readiness selectors.
- an automatic capture path exists or an explicit blocker is documented.
- screenshots and `analysis.json` are saved in a session-visible location.
- the user has a place to comment on the screenshots.
- future agents know where to read those comments.

## References

- Workflow: `docs/workflows/ui-screenshot-feedback-loop.md`
- Existing visual/numeric inspection: `docs/workflows/ui-inspection-workflow.md`
- Puppeteer one-shot debugging: `docs/guides/PUPPETEER_UI_WORKFLOW.md`
- Puppeteer scenario suites: `docs/guides/PUPPETEER_SCENARIO_SUITES.md`
- Screenshot-capable crawl panel example: `scripts/ui/capture-unified-crawl-display.js`
- Visual command/comment design: `docs/design/agent_interaction_platform.md`