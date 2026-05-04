#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const {
  maybeCaptureDomSnapshot,
  maybeCaptureScreenshot,
  normalizeViewports,
  parseCaptureArgs
} = require("../scripts/ui/lib/screenshotCapture");
const { ROUTES, VIEWPORTS } = require("../scripts/ui/capture-unified-crawl-display");
const {
  appendRunComment,
  encodeRunId,
  filterScreenshotRuns,
  getScreenshotRunFilters,
  getRunComments,
  listScreenshotRuns,
  resolveDomSnapshotAsset,
  resolveScreenshotAsset
} = require("../src/ui/server/unifiedApp/lib/screenshotReviewStore");

async function main() {
  const parsed = parseCaptureArgs([
    "--output", "tmp/screenshots/check",
    "--db", "tmp/check.db",
    "--base-url", "http://127.0.0.1:3999",
    "--no-screenshots",
    "--save-dom-snapshots",
    "--headful"
  ], { outputDir: "screenshots/default" });
  assert(parsed.outputDir === "tmp/screenshots/check", "--output should override default");
  assert(parsed.dbPath === "tmp/check.db", "--db should parse");
  assert(parsed.baseUrl === "http://127.0.0.1:3999", "--base-url should parse");
  assert(parsed.saveScreenshots === false, "--no-screenshots should disable writes");
  assert(parsed.saveDomSnapshots === true, "--save-dom-snapshots should enable DOM output");
  assert(parsed.headful === true, "--headful should parse");

  const viewports = normalizeViewports({ viewports: VIEWPORTS });
  assert(viewports.some((viewport) => viewport.key === "mobile" && viewport.isMobile), "mobile viewport should normalize");
  const skipped = await maybeCaptureScreenshot(null, { enabled: false });
  assert(skipped.skipped === true, "disabled screenshot capture should be marked skipped");
  assert(skipped.screenshotBytes === 0, "disabled screenshot capture should report zero bytes");
  const domOutput = path.join(__dirname, "..", "tmp", "screenshot-review-store-check", "dom-output.html");
  const domSnapshot = await maybeCaptureDomSnapshot({ content: async () => "<html><body>ok</body></html>" }, {
    enabled: true,
    outputPath: domOutput
  });
  assert(domSnapshot.domSnapshotBytes > 0, "DOM snapshot helper should write HTML content");
  assert(Array.isArray(ROUTES) && ROUTES.length >= 3, "unified crawl capture should export route definitions");

  const repoRoot = path.resolve(__dirname, "..");
  const runDir = path.join(repoRoot, "tmp", "screenshot-review-store-check", "screenshots", "run-a");
  fs.rmSync(path.join(repoRoot, "tmp", "screenshot-review-store-check"), { recursive: true, force: true });
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, "screen.png"), Buffer.from("89504e470d0a1a0a", "hex"));
  fs.writeFileSync(path.join(runDir, "screen.html"), "<!doctype html><html><body>screen</body></html>", "utf8");
  fs.writeFileSync(path.join(runDir, "analysis.json"), JSON.stringify({
    ok: true,
    capturedAt: "2026-05-04T00:00:00.000Z",
    routes: [
      {
        key: "screen-desktop",
        routeKey: "screen",
        viewportKey: "desktop",
        screenshotPath: path.join(runDir, "screen.png"),
        screenshotBytes: 8,
        domSnapshotPath: path.join(runDir, "screen.html"),
        domSnapshotBytes: 45,
        metrics: { horizontalOverflow: false }
      }
    ]
  }, null, 2), "utf8");

  const runId = encodeRunId("tmp/screenshot-review-store-check/screenshots/run-a");
  const runs = listScreenshotRuns({ repoRoot, roots: [path.join(repoRoot, "tmp", "screenshot-review-store-check")], limit: 10 }).filter((run) => run.runId === runId);
  assert(runs.length === 1, "screenshot store should discover fixture run");
  assert(runs[0].appKeys.includes("screen"), "screenshot store should expose app keys");
  assert(filterScreenshotRuns(runs, { app: "screen" }).length === 1, "app filter should keep matching runs");
  assert(filterScreenshotRuns(runs, { app: "missing" }).length === 0, "app filter should drop non-matching runs");
  assert(getScreenshotRunFilters(runs).apps.some((entry) => entry.value === "screen"), "filter metadata should include app key");
  assert(resolveScreenshotAsset({ repoRoot, runId, fileName: "screen.png" }), "screenshot asset should resolve safely");
  assert(resolveDomSnapshotAsset({ repoRoot, runId, fileName: "screen.html" }), "DOM snapshot asset should resolve safely");
  const comments = appendRunComment({ repoRoot, runId, target: "screen", comment: "Check comment" });
  assert(comments && comments.content.includes("Check comment"), "comment append should persist content");
  const reread = getRunComments({ repoRoot, runId });
  assert(reread && reread.commentCount >= 1, "comment read should include saved entry");

  console.log("screenshot capture helper/store check ok");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});