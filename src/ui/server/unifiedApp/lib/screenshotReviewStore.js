"use strict";

const fs = require("fs");
const path = require("path");

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const DOM_EXTENSIONS = new Set([".html", ".htm"]);
const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");

function toPosix(value) {
  return String(value || "").replace(/\\/g, "/");
}

function isSafeRelativePath(value) {
  const text = String(value || "");
  return text && !path.isAbsolute(text) && !text.split(/[\\/]+/).includes("..");
}

function encodeRunId(relativeDir) {
  return Buffer.from(toPosix(relativeDir), "utf8").toString("base64url");
}

function decodeRunId(runId) {
  try {
    const decoded = Buffer.from(String(runId || ""), "base64url").toString("utf8");
    return isSafeRelativePath(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

function safeStat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function walkForAnalysisFiles(rootDir, options = {}) {
  const files = [];
  const maxDepth = Number.isFinite(options.maxDepth) ? options.maxDepth : 6;
  const ignored = new Set(["node_modules", ".git", "data", "tmp"]);

  function visit(dirPath, depth) {
    if (depth > maxDepth) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (ignored.has(entry.name)) continue;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath, depth + 1);
      } else if (entry.isFile() && entry.name === "analysis.json") {
        files.push(fullPath);
      }
    }
  }

  if (safeStat(rootDir)?.isDirectory()) visit(rootDir, 0);
  return files;
}

function inferCommentFile(repoRoot, outputDir) {
  const relative = toPosix(path.relative(repoRoot, outputDir));
  const parts = relative.split("/");
  const sessionsIndex = parts.indexOf("sessions");
  if (parts[0] === "docs" && sessionsIndex >= 0 && parts.includes("screenshots")) {
    const screenshotIndex = parts.indexOf("screenshots");
    const sessionDir = path.join(repoRoot, ...parts.slice(0, screenshotIndex));
    return path.join(sessionDir, "SCREENSHOT_COMMENTS.md");
  }
  return path.join(outputDir, "SCREENSHOT_COMMENTS.md");
}

function countComments(filePath) {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    return (text.match(/^- Status:/gm) || []).length;
  } catch {
    return 0;
  }
}

function inferSessionId(relativeOutputDir) {
  const parts = toPosix(relativeOutputDir).split("/").filter(Boolean);
  const sessionsIndex = parts.indexOf("sessions");
  if (parts[0] === "docs" && sessionsIndex >= 0 && parts[sessionsIndex + 1]) {
    return parts[sessionsIndex + 1];
  }
  if (parts[0] === "screenshots") return "root-screenshots";
  return "other";
}

function normalizeRouteKey(route, fileName) {
  const raw = String(route.routeKey || route.key || fileName || "screenshot");
  return raw.replace(/-(desktop|mobile|tablet|viewport-\d+)$/i, "");
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
}

function createRunFromAnalysis(repoRoot, analysisPath) {
  const analysis = readJson(analysisPath) || {};
  const outputDir = path.dirname(analysisPath);
  const relativeOutputDir = toPosix(path.relative(repoRoot, outputDir));
  if (!isSafeRelativePath(relativeOutputDir)) return null;

  const runId = encodeRunId(relativeOutputDir);
  const sessionId = inferSessionId(relativeOutputDir);
  const commentFile = inferCommentFile(repoRoot, outputDir);
  const analysisStat = safeStat(analysisPath);
  const routes = Array.isArray(analysis.routes) ? analysis.routes.map((route) => {
    const candidate = route.screenshotPath ? path.basename(route.screenshotPath) : `${route.key || "screenshot"}.png`;
    const ext = path.extname(candidate).toLowerCase();
    const fileName = IMAGE_EXTENSIONS.has(ext) ? candidate : `${route.key || "screenshot"}.png`;
    const assetExists = safeStat(path.join(outputDir, fileName))?.isFile() || false;
    const domCandidate = route.domSnapshotPath ? path.basename(route.domSnapshotPath) : `${route.key || fileName.replace(/\.[^.]+$/, "")}.html`;
    const domExt = path.extname(domCandidate).toLowerCase();
    const domFileName = DOM_EXTENSIONS.has(domExt) ? domCandidate : `${route.key || fileName.replace(/\.[^.]+$/, "")}.html`;
    const domAssetExists = safeStat(path.join(outputDir, domFileName))?.isFile() || false;
    const routeKey = normalizeRouteKey(route, fileName);
    return {
      key: route.key || fileName.replace(/\.[^.]+$/, ""),
      routeKey,
      viewportKey: route.viewportKey || null,
      url: route.url || null,
      screenshotBytes: Number(route.screenshotBytes) || 0,
      screenshotSkipped: Boolean(route.screenshotSkipped),
      fileName,
      imageUrl: assetExists ? `/api/screenshot-review/assets/${encodeURIComponent(runId)}/${encodeURIComponent(fileName)}` : null,
      assetExists,
      domSnapshotBytes: Number(route.domSnapshotBytes) || 0,
      domSnapshotSkipped: Boolean(route.domSnapshotSkipped),
      domFileName,
      domSnapshotUrl: domAssetExists ? `/api/screenshot-review/dom/${encodeURIComponent(runId)}/${encodeURIComponent(domFileName)}` : null,
      domAssetExists,
      metrics: route.metrics || {}
    };
  }) : [];
  const appKeys = uniqueSorted(routes.map((route) => route.routeKey));

  return {
    runId,
    title: relativeOutputDir,
    sessionId,
    appKeys,
    relativeOutputDir,
    ok: Boolean(analysis.ok),
    capturedAt: analysis.capturedAt || (analysisStat ? analysisStat.mtime.toISOString() : null),
    routeCount: routes.length,
    commentCount: countComments(commentFile),
    commentsPath: toPosix(path.relative(repoRoot, commentFile)),
    analysisPath: toPosix(path.relative(repoRoot, analysisPath)),
    routes
  };
}

function filterScreenshotRuns(runs, filters = {}) {
  const session = String(filters.session || "").trim();
  const app = String(filters.app || "").trim();
  return runs.filter((run) => {
    if (session && session !== "all" && run.sessionId !== session) return false;
    if (app && app !== "all" && !run.appKeys.includes(app)) return false;
    return true;
  }).map((run) => {
    if (!app || app === "all") return run;
    return {
      ...run,
      routes: run.routes.filter((route) => route.routeKey === app),
      routeCount: run.routes.filter((route) => route.routeKey === app).length
    };
  });
}

function getScreenshotRunFilters(runs) {
  return {
    sessions: uniqueSorted(runs.map((run) => run.sessionId)).map((value) => ({
      value,
      label: value
    })),
    apps: uniqueSorted(runs.flatMap((run) => run.appKeys)).map((value) => ({
      value,
      label: value
    }))
  };
}

function listScreenshotRuns(options = {}) {
  const repoRoot = options.repoRoot || PROJECT_ROOT;
  const roots = Array.isArray(options.roots) && options.roots.length ? options.roots : [
    path.join(repoRoot, "docs", "sessions"),
    path.join(repoRoot, "screenshots")
  ];
  const seen = new Set();
  const runs = [];
  for (const root of roots) {
    for (const analysisPath of walkForAnalysisFiles(root, { maxDepth: root.endsWith("screenshots") ? 5 : 6 })) {
      const realPath = path.resolve(analysisPath);
      if (seen.has(realPath)) continue;
      seen.add(realPath);
      const run = createRunFromAnalysis(repoRoot, realPath);
      if (run) runs.push(run);
    }
  }
  runs.sort((a, b) => String(b.capturedAt || "").localeCompare(String(a.capturedAt || "")));
  return runs.slice(0, options.limit || 50);
}

function resolveRunDir(repoRoot, runId) {
  const relativeDir = decodeRunId(runId);
  if (!relativeDir) return null;
  const outputDir = path.resolve(repoRoot, relativeDir);
  if (!outputDir.startsWith(path.resolve(repoRoot))) return null;
  if (!safeStat(path.join(outputDir, "analysis.json"))?.isFile()) return null;
  return outputDir;
}

function getRunComments(options = {}) {
  const repoRoot = options.repoRoot || PROJECT_ROOT;
  const outputDir = resolveRunDir(repoRoot, options.runId);
  if (!outputDir) return null;
  const commentFile = inferCommentFile(repoRoot, outputDir);
  const content = fs.existsSync(commentFile)
    ? fs.readFileSync(commentFile, "utf8")
    : `# Screenshot Comments: ${toPosix(path.relative(repoRoot, outputDir))}\n\n`;
  return {
    runId: options.runId,
    commentsPath: toPosix(path.relative(repoRoot, commentFile)),
    content,
    commentCount: countComments(commentFile)
  };
}

function appendRunComment(options = {}) {
  const repoRoot = options.repoRoot || PROJECT_ROOT;
  const outputDir = resolveRunDir(repoRoot, options.runId);
  if (!outputDir) return null;
  const target = String(options.target || "run").trim().slice(0, 200) || "run";
  const comment = String(options.comment || "").trim().slice(0, 4000);
  if (!comment) throw new Error("Comment is required");

  const commentFile = inferCommentFile(repoRoot, outputDir);
  fs.mkdirSync(path.dirname(commentFile), { recursive: true });
  if (!fs.existsSync(commentFile)) {
    fs.writeFileSync(commentFile, `# Screenshot Comments: ${toPosix(path.relative(repoRoot, outputDir))}\n\n`, "utf8");
  }

  const indented = comment.split(/\r?\n/).map((line) => `  ${line}`).join("\n");
  const block = [
    `## ${new Date().toISOString()}`,
    "",
    "- Status: pending",
    `  Target: ${target}`,
    "  Comment:",
    indented,
    "  Agent notes: pending",
    ""
  ].join("\n");
  fs.appendFileSync(commentFile, block, "utf8");
  return getRunComments({ repoRoot, runId: options.runId });
}

function resolveScreenshotAsset(options = {}) {
  const repoRoot = options.repoRoot || PROJECT_ROOT;
  const outputDir = resolveRunDir(repoRoot, options.runId);
  if (!outputDir) return null;
  const fileName = path.basename(String(options.fileName || ""));
  if (!IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase())) return null;
  const assetPath = path.join(outputDir, fileName);
  return safeStat(assetPath)?.isFile() ? assetPath : null;
}

function resolveDomSnapshotAsset(options = {}) {
  const repoRoot = options.repoRoot || PROJECT_ROOT;
  const outputDir = resolveRunDir(repoRoot, options.runId);
  if (!outputDir) return null;
  const fileName = path.basename(String(options.fileName || ""));
  if (!DOM_EXTENSIONS.has(path.extname(fileName).toLowerCase())) return null;
  const assetPath = path.join(outputDir, fileName);
  return safeStat(assetPath)?.isFile() ? assetPath : null;
}

module.exports = {
  appendRunComment,
  encodeRunId,
  filterScreenshotRuns,
  getScreenshotRunFilters,
  getRunComments,
  listScreenshotRuns,
  resolveDomSnapshotAsset,
  resolveScreenshotAsset
};