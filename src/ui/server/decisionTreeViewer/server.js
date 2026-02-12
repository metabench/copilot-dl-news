"use strict";

/**
 * @server Decision Tree Viewer
 * @description Interactive decision tree visualization with expandable nodes and SVG connections.
 * @ui true
 * @port 3030
 */

/**
 * Decision Tree Viewer Server
 * 
 * Express server for the Decision Tree Viewer UI.
 * Serves the Luxury Industrial Obsidian themed viewer.
 * 
 * Uses jsgui3's standard SSR + client activation pattern:
 * 1. Server renders HTML with data-jsgui-id attributes
 * 2. Client bundle reconstructs controls from DOM
 * 3. Controls are activated (events bound)
 * 4. Connections are drawn after layout
 */

const express = require("express");
const path = require("path");
const fs = require("fs");

// jsgui context
const jsgui = require("jsgui3-html");
const Page_Context = jsgui.Page_Context;

// Controls
const { DecisionTreeViewerControl } = require("./isomorphic/controls");
const { createExampleTree } = require("./isomorphic/model/DecisionTree");
const { loadAllTrees, loadFromConfigSet } = require("./isomorphic/model/DecisionTreeLoader");
const {
  loadActiveDecisionConfigSet,
  setActiveDecisionConfigSlug
} = require("../../../core/crawler/observatory/DecisionConfigSetState");

// Optional repository for loading config sets
let configSetRepository = null;
try {
  const { createDefaultDecisionConfigSetRepository } = require("../../../core/crawler/observatory/DecisionConfigSetRepository");
  configSetRepository = createDefaultDecisionConfigSetRepository();
} catch (e) {
  // Repository not available; routes depending on it will 501
}

const DB_PATH = process.env.DECISION_DB_PATH || path.join(process.cwd(), "data", "news.db");

// Server configuration
const PORT = process.env.DECISION_TREE_VIEWER_PORT || 3030;
const app = express();

// JSON body parser (for active config set updates)
app.use(express.json({ limit: "1mb" }));

// Static files
app.use("/public", express.static(path.join(__dirname, "public")));

// Suppress favicon 404 (no icon served by this standalone viewer)
app.get("/favicon.ico", (req, res) => res.status(204).end());

// Check if client bundle exists, build if not
const clientBundlePath = path.join(__dirname, "public", "decision-tree-client.js");
if (!fs.existsSync(clientBundlePath)) {
  console.log("Building client bundle...");
  try {
    require("./build-client").build();
  } catch (e) {
    console.warn("Could not build client bundle:", e.message);
  }
}

/**
 * Create a page context for rendering.
 */
function createContext() {
  return new Page_Context();
}

/**
 * Render the full HTML page with embedded controls.
 */
function renderPage(context, trees, { baseUrl = "" } = {}) {
  const viewer = new DecisionTreeViewerControl({ context, trees });
  const html = viewer.all_html_render();
  
  // Serialize tree data for client
  const treeDataJSON = JSON.stringify(trees.map(t => t.toJSON()));

  const safeBaseUrl = typeof baseUrl === "string" ? baseUrl : "";
  const assetPrefix = safeBaseUrl.endsWith("/") ? safeBaseUrl.slice(0, -1) : safeBaseUrl;
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Decision Tree Viewer - Luxury Industrial Obsidian</title>
  <link rel="stylesheet" href="${assetPrefix}/public/decision-tree.css">
  <style>
    /* Layout styles */
    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      background: var(--dt-obsidian);
      color: var(--dt-text);
      font-family: var(--dt-font-family);
    }
    
    .dt-viewer {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }
    
    .dt-viewer__header {
      flex-shrink: 0;
      padding: var(--dt-space-md) var(--dt-space-xl);
    }
    
    .dt-viewer__main {
      flex: 1;
      display: flex;
      overflow: hidden;
      gap: var(--dt-space-lg);
      padding: 0 var(--dt-space-xl) var(--dt-space-xl);
    }
    
    .dt-viewer__sidebar {
      width: 280px;
      flex-shrink: 0;
    }
    
    .dt-viewer__canvas-container {
      flex: 1;
      min-width: 0;
    }
    
    /* Tree list panel */
    .dt-tree-list {
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    
    .dt-tree-list .dt-panel__content {
      flex: 1;
      overflow-y: auto;
      padding: var(--dt-space-md);
    }
    
    .dt-tree-list-item {
      display: flex;
      align-items: center;
      gap: var(--dt-space-sm);
      padding: var(--dt-space-sm) var(--dt-space-md);
      border-radius: var(--dt-radius-sm);
      cursor: pointer;
      transition: all 0.2s ease;
      margin-bottom: var(--dt-space-xs);
    }
    
    .dt-tree-list-item:hover {
      background: rgba(201, 162, 39, 0.1);
    }
    
    .dt-tree-list-item--selected {
      background: rgba(201, 162, 39, 0.2);
      border: 1px solid var(--dt-gold);
    }
    
    .dt-tree-list-item__icon {
      font-size: 1.2em;
    }
    
    .dt-tree-list-item__name {
      font-weight: 500;
      color: var(--dt-text);
    }
    
    .dt-tree-list-item__description {
      display: none;
      color: var(--dt-text-dim);
      font-size: var(--dt-font-xs);
    }
    
    /* Canvas panel */
    .dt-canvas-panel {
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    
    .dt-canvas {
      flex: 1;
      overflow: auto;
      position: relative;
    }
    
    /* Tree layout */
    .dt-tree {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--dt-space-xl);
      padding: var(--dt-space-xl);
      min-width: 100%;
      min-height: 100%;
      position: relative;
    }
    
    .dt-level {
      display: flex;
      justify-content: center;
      gap: var(--dt-space-xl);
      width: 100%;
    }
    
    /* Connections container */
    .dt-connections {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1;
    }
    
    /* SVG connection styles */
    .dt-connection {
      fill: none;
      stroke-width: 2;
      stroke-linecap: round;
    }
    
    .dt-connection--yes {
      stroke: var(--dt-success, #22c55e);
    }
    
    .dt-connection--no {
      stroke: var(--dt-error, #ef4444);
    }
    
    .dt-connection__label {
      font-family: var(--dt-font-mono);
      font-size: 10px;
      font-weight: bold;
    }
    
    .dt-connection__label--yes {
      fill: var(--dt-success, #22c55e);
    }
    
    .dt-connection__label--no {
      fill: var(--dt-error, #ef4444);
    }
  </style>
</head>
<body>
  ${html}
  
  <!-- Embed tree data for client -->
  <script>
    window.__DECISION_TREE_DATA__ = ${treeDataJSON};
  </script>
  
  <!-- jsgui3 client activation -->
  <script src="${assetPrefix}/public/decision-tree-client.js"></script>
</body>
</html>`;
}

/**
 * Load decision trees using a three-tier fallback strategy.
 *
 * 1. Active config set from the repository (database-backed)
 * 2. JSON files from `config/decision-trees/` directory
 * 3. Built-in example tree (always available)
 *
 * @returns {Promise<{ trees: DecisionTree[], source: string }>}
 */
async function loadTreesWithFallback() {
  if (configSetRepository) {
    try {
      const { configSet } = await loadActiveDecisionConfigSet({
        repository: configSetRepository,
        dbPath: DB_PATH,
        fallbackToProduction: false
      });

      if (configSet) {
        const treesFromSet = loadFromConfigSet(configSet);
        if (treesFromSet.length) {
          return { trees: treesFromSet, source: "config-set" };
        }
      }
    } catch (err) {
      console.warn("Failed to load active decision config set:", err.message);
    }
  }

  const treesFromDir = loadAllTrees();
  if (treesFromDir.length) {
    return { trees: treesFromDir, source: "config/decision-trees" };
  }

  return { trees: [createExampleTree()], source: "example" };
}

// Routes
app.get("/", async (req, res) => {
  const context = createContext();

  const { trees, source } = await loadTreesWithFallback();
  console.log(`Loaded ${trees.length} decision trees from ${source}`);

  const html = renderPage(context, trees, { baseUrl: req.baseUrl || "" });
  res.type("html").send(html);
});

// Load from a specific config set
app.get("/set/:slug", async (req, res) => {
  if (!configSetRepository) {
    return res.status(501).json({ error: "DecisionConfigSetRepository not available" });
  }
  
  try {
    const configSet = await configSetRepository.load(req.params.slug);
    const trees = loadFromConfigSet(configSet);
    if (req.query.persist === "1") {
      try {
        await setActiveDecisionConfigSlug({ dbPath: DB_PATH, slug: configSet.slug });
      } catch (err) {
        console.warn("Failed to persist active decision config set:", err.message);
      }
    }
    
    if (trees.length === 0) {
      return res.status(404).json({ error: "No decision trees in config set" });
    }
    
    const context = createContext();
    const html = renderPage(context, trees, { baseUrl: req.baseUrl || "" });
    res.type("html").send(html);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// API: List available config sets
app.get("/api/config-sets", async (req, res) => {
  if (!configSetRepository) {
    return res.json({ sets: [], available: false });
  }
  
  try {
    const sets = await configSetRepository.list();
    res.json({ sets, available: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get or set the active config set slug
app.get("/api/active-config-set", async (req, res) => {
  if (!configSetRepository) {
    return res.json({ success: true, available: false, activeSlug: null, summary: null });
  }

  try {
    const { configSet, slug, source } = await loadActiveDecisionConfigSet({
      repository: configSetRepository,
      dbPath: DB_PATH,
      fallbackToProduction: false
    });

    res.json({
      success: true,
      available: true,
      activeSlug: slug,
      source: slug ? source : "none",
      summary: configSet?.getSummary ? configSet.getSummary() : null
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/active-config-set", async (req, res) => {
  if (!configSetRepository) {
    return res.status(501).json({ success: false, error: "DecisionConfigSetRepository not available" });
  }

  if (!DB_PATH) {
    return res.status(503).json({ success: false, error: "Database path not configured" });
  }

  const { slug } = req.body || {};
  if (!slug) {
    return res.status(400).json({ success: false, error: "slug is required" });
  }

  try {
    const configSet = await configSetRepository.load(slug);
    await setActiveDecisionConfigSlug({ dbPath: DB_PATH, slug });
    res.json({
      success: true,
      activeSlug: slug,
      summary: configSet?.getSummary ? configSet.getSummary() : configSet?.toJSON?.()
    });
  } catch (err) {
    if (err.message.includes("not found")) {
      return res.status(404).json({ success: false, error: err.message });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Get decision trees as JSON
app.get("/api/trees", (req, res) => {
  const trees = loadAllTrees();
  res.json({
    count: trees.length,
    trees: trees.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      nodeCount: t.nodeCount,
      depth: t.depth,
      results: t.results.length,
      branches: t.branches.length
    }))
  });
});

// API: Classify a URL and explain the decision path
app.get("/api/classify", async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: "url query parameter required" });
  }
  
  try {
    // Load the URL classification tree
    const urlClassTreePath = path.join(process.cwd(), "config", "decision-trees", "url-classification.json");
    if (!fs.existsSync(urlClassTreePath)) {
      return res.status(404).json({ error: "URL classification tree not found" });
    }
    
    const decisionTree = JSON.parse(fs.readFileSync(urlClassTreePath, "utf8"));
    
    // Compute URL signals
    const signals = computeUrlSignals(url);
    if (signals.error) {
      return res.status(400).json({ error: signals.error });
    }
    
    // Classify through each category tree
    const categories = ["nav", "hub", "article"];
    const traces = {};
    let result = { classification: decisionTree.fallback || "unknown", confidence: 0.5 };
    
    for (const category of categories) {
      const catTree = decisionTree.categories[category];
      if (!catTree || !catTree.tree) continue;
      
      const traceResult = classifyWithTrace(signals, catTree.tree);
      traces[category] = traceResult;
      
      if (traceResult.result === "match") {
        result = {
          classification: category,
          confidence: 1.0,
          reason: traceResult.reason,
          matchedAt: traceResult.trace.find(t => t.type === "result")?.id || "unknown"
        };
        break;
      }
    }
    
    res.json({
      url,
      classification: result.classification,
      confidence: result.confidence,
      reason: result.reason || "no category matched",
      signals,
      traces
    });
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Extract structural signals from a URL for decision tree evaluation.
 *
 * Computes features like path depth, slug characteristics, date patterns,
 * and query parameters. These signals become the input to the decision
 * tree's condition evaluator.
 *
 * @param {string} urlStr - Full URL string to analyze
 * @returns {Object} Signal object with URL features, or { error, url } on parse failure
 */
function computeUrlSignals(urlStr) {
  try {
    const u = new URL(urlStr);
    const urlPath = u.pathname;
    const segments = urlPath.split("/").filter(Boolean);
    const depth = segments.length;
    const lastSegment = segments[depth - 1] || "";
    
    return {
      url: urlStr,
      host: u.hostname,
      path: urlPath,
      pathDepth: depth,
      segments,
      slug: lastSegment,
      slugLength: lastSegment.length,
      hasPage: u.searchParams.has("page"),
      hasDatePath: /\/\d{4}\/(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{2})\/\d{1,2}\//i.test(urlPath),
      hasNumericDate: /\/\d{4}\/\d{2}\/\d{2}\//.test(urlPath),
      hasHyphenatedSlug: lastSegment.includes("-") && lastSegment.length > 10,
      hasSeriesSegment: urlPath.includes("/series/"),
      hasArticleSegment: /\/article[s]?\//.test(urlPath),
      hasLiveSegment: urlPath.includes("/live/"),
      isMediaFile: /\.(jpg|jpeg|png|gif|svg|webp|mp4|mp3|pdf)$/i.test(urlPath),
      fileExtension: urlPath.match(/\.([a-z0-9]+)$/i)?.[1] || null,
      queryParamCount: Array.from(u.searchParams).length,
      hasQueryParams: Array.from(u.searchParams).length > 0
    };
  } catch (e) {
    return { error: e.message, url: urlStr };
  }
}

/**
 * Evaluate a single decision tree condition against URL signals.
 *
 * Supports condition types:
 * - `compare` — Numeric/string comparison (eq, ne, gt, gte, lt, lte)
 *   with support for field-reference values (e.g., { field, multiplier })
 * - `flag` — Boolean flag check
 * - `url_matches` — Pattern matching against URL/path (regex, contains, segment)
 * - `text_contains` — Substring matching against a named text field
 * - `compound` — AND/OR combination of sub-conditions
 *
 * @param {Object} condition - Condition definition from config JSON
 * @param {Object} signals - URL signals from computeUrlSignals()
 * @returns {{ result: boolean, reason: string }} Evaluation result with explanation
 */
function evaluateCondition(condition, signals) {
  if (!condition) return { result: false, reason: "no-condition" };
  
  switch (condition.type) {
    case "compare": {
      const field = condition.field;
      const operator = condition.operator;
      let value = condition.value;
      let actual = signals[field];
      
      // Support field-reference values like { field: "other_signal", multiplier: 1.3 }
      if (typeof value === "object" && value !== null && value.field) {
        const multiplier = value.multiplier || 1;
        value = signals[value.field];
        if (typeof value === "number" && multiplier !== 1) {
          value *= multiplier;
        }
      }
      
      let result;
      switch (operator) {
        case "eq": result = actual === value; break;
        case "ne": result = actual !== value; break;
        case "gt": result = actual > value; break;
        case "gte": result = actual >= value; break;
        case "lt": result = actual < value; break;
        case "lte": result = actual <= value; break;
        default: result = false;
      }
      
      return { result, reason: `${field} (${actual}) ${operator} ${value} = ${result}` };
    }
    
    case "flag": {
      const flag = condition.flag;
      const expected = condition.expected !== false;
      const actual = !!signals[flag];
      return { result: actual === expected, reason: `${flag} is ${actual}` };
    }
    
    case "url_matches": {
      const patterns = condition.patterns || [];
      const urlSignal = signals.url || "";
      const pathSignal = signals.path || "";
      const matchType = condition.matchType || "contains";
      const negate = condition.negate === true;
      
      let matched = false;
      for (const pattern of patterns) {
        if (matchType === "regex") {
          try {
            const regex = new RegExp(pattern, "i");
            if (regex.test(urlSignal) || regex.test(pathSignal)) {
              matched = true;
              break;
            }
          } catch (e) { /* invalid regex */ }
        } else if (matchType === "segment") {
          // Exact match against individual path segments (case-insensitive)
          const segments = signals.segments || pathSignal.split("/").filter(Boolean);
          if (segments.some(seg => seg.toLowerCase() === pattern.toLowerCase())) {
            matched = true;
            break;
          }
        } else {
          // "contains" (default) — substring match
          if (urlSignal.includes(pattern) || pathSignal.includes(pattern)) {
            matched = true;
            break;
          }
        }
      }
      
      const result = negate ? !matched : matched;
      return { result, reason: matched ? `matched pattern` : `no match in ${patterns.length} patterns` };
    }
    
    case "compound": {
      const conditions = condition.conditions || [];
      const operator = (condition.operator || "and").toLowerCase();
      const results = conditions.map(c => evaluateCondition(c, signals));
      
      if (operator === "and") {
        return { result: results.every(r => r.result), reason: `AND of ${results.length} conditions` };
      } else {
        return { result: results.some(r => r.result), reason: `OR of ${results.length} conditions` };
      }
    }
    
    case "text_contains": {
      const field = condition.field;
      const patterns = condition.patterns || [];
      const actual = String(signals[field] || "").toLowerCase();
      
      let matched = false;
      for (const pattern of patterns) {
        if (actual.includes(pattern.toLowerCase())) {
          matched = true;
          break;
        }
      }
      
      return {
        result: matched,
        reason: matched ? `${field} contains match` : `${field}: no match in ${patterns.length} patterns`
      };
    }
    
    default:
      return { result: false, reason: `unknown condition type: ${condition.type}` };
  }
}

/**
 * Walk a decision tree and produce a classification with an audit trace.
 *
 * Starting from the tree root, evaluates each branch condition against the
 * signals, following the yes/no path until a result node is reached. Records
 * every step for debugging and transparency.
 *
 * Includes a depth guard (max 50 levels) to prevent infinite loops in
 * malformed trees.
 *
 * @param {Object} signals - URL signals from computeUrlSignals()
 * @param {Object} tree - Root node of the decision tree (from config JSON)
 * @returns {{ result: string, reason: string, trace: Object[], depth: number }}
 */
function classifyWithTrace(signals, tree) {
  const trace = [];
  let node = tree;
  let depth = 0;
  
  while (node && depth < 50) {
    depth++;
    
    if (node.result !== undefined) {
      const isMatch = node.result === "match" || node.result === true;
      trace.push({ type: "result", id: node.id, result: isMatch ? "match" : "no-match", reason: node.reason });
      return { result: isMatch ? "match" : "no-match", reason: node.reason, trace, depth };
    }
    
    if (node.condition) {
      const evalResult = evaluateCondition(node.condition, signals);
      trace.push({ type: "branch", id: node.id, evaluation: evalResult, branch: evalResult.result ? "yes" : "no" });
      node = evalResult.result ? node.yes : node.no;
    } else {
      break;
    }
  }
  
  return { result: "unknown", reason: "tree traversal ended without result", trace, depth };
}

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "decision-tree-viewer" });
});

// Start server
if (require.main === module) {
  const args = process.argv.slice(2);
  
  // Handle --check flag for AI agent verification
  if (args.includes("--check")) {
    const { runStartupCheck } = require("../utils/serverStartupCheck");
    runStartupCheck(__filename, PORT, {
      serverName: "Decision Tree Viewer",
      healthEndpoint: "/health"
    });
  } else {
    app.listen(PORT, () => {
      console.log(`🌲 Decision Tree Viewer running at http://localhost:${PORT}`);
    });
  }
}

module.exports = { app, renderPage, createContext };

