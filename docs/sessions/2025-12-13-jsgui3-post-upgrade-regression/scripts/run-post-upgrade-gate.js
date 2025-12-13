"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const workspaceRoot = path.resolve(__dirname, "..", "..", "..", "..");
const logsDir = path.join(__dirname, "logs");

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeText(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
}

function runStep(step) {
  const startedAt = Date.now();
  const result = spawnSync(step.command, step.args || [], {
    cwd: workspaceRoot,
    shell: true,
    env: { ...process.env, ...(step.env || {}) },
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50
  });
  const durationMs = Date.now() - startedAt;

  const prefix = `${step.id}-${step.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  writeText(path.join(logsDir, `${prefix}.stdout.log`), result.stdout || "");
  writeText(path.join(logsDir, `${prefix}.stderr.log`), result.stderr || "");

  return {
    id: step.id,
    name: step.name,
    commandLine: [step.command, ...(step.args || [])].join(" "),
    status: result.status,
    signal: result.signal,
    durationMs
  };
}

function main() {
  ensureDir(logsDir);

  const steps = [
    { id: 1, name: "ui client build", command: "npm", args: ["run", "ui:client-build"] },

    { id: 10, name: "SSR diagram atlas", command: "npm", args: ["run", "diagram:check"] },
    { id: 11, name: "SSR decision tree", command: "npm", args: ["run", "ui:decision-tree:check"] },
    { id: 12, name: "SSR data explorer", command: "node", args: ["src/ui/server/checks/dataExplorer.check.js"] },
    { id: 13, name: "SSR data explorer url filters", command: "node", args: ["src/ui/server/checks/dataExplorerUrlFilters.check.js"] },
    { id: 14, name: "SSR facts", command: "node", args: ["src/ui/server/checks/facts.check.js"] },
    { id: 15, name: "SSR home", command: "node", args: ["src/ui/server/checks/homeDashboard.check.js"] },

    {
      id: 20,
      name: "server e2e (diagram atlas + decision tree)",
      command: "npm",
      args: [
        "run",
        "test:by-path",
        "tests/server/diagram-atlas.e2e.test.js",
        "tests/ui/server/decisionTreeViewer.connection.e2e.test.js"
      ]
    },
    {
      id: 21,
      name: "puppeteer e2e suite",
      command: "npm",
      args: [
        "run",
        "test:by-path",
        "tests/ui/e2e/art-playground.puppeteer.e2e.test.js",
        "tests/ui/e2e/art-playground-resize.puppeteer.e2e.test.js",
        "tests/ui/e2e/url-filter-toggle.puppeteer.e2e.test.js",
        "tests/ui/e2e/wysiwyg-demo.puppeteer.e2e.test.js"
      ]
    },
    {
      id: 22,
      name: "data explorer server tests",
      command: "npm",
      args: [
        "run",
        "test:by-path",
        "tests/ui/server/dataExplorerServer.test.js",
        "tests/ui/server/dataExplorerServer.production.test.js"
      ]
    }
  ];

  const results = [];
  let hasFailure = false;
  console.log(`Running ${steps.length} steps (cwd=${workspaceRoot})`);

  for (const step of steps) {
    process.stdout.write(`\n[${step.id}] ${step.name}...\n`);
    const r = runStep(step);
    results.push(r);
    if (r.status !== 0) {
      hasFailure = true;
      console.error(`[${step.id}] FAILED (exit=${r.status}, duration=${r.durationMs}ms)`);
    } else {
      console.log(`[${step.id}] OK (${r.durationMs}ms)`);
    }
  }

  const summary = {
    timestamp: new Date().toISOString(),
    workspaceRoot,
    steps: results,
    success: !hasFailure
  };

  const outPath = path.join(__dirname, "post-upgrade-gate-summary.json");
  writeText(outPath, JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${outPath}`);
  process.exitCode = hasFailure ? 1 : 0;
}

main();
