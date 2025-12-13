"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function parseArgs(argv) {
  const args = { runs: 5, tests: [] };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--runs") {
      args.runs = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === "--test") {
      args.tests.push(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token.startsWith("--")) {
      throw new Error(`Unknown arg: ${token}`);
    }
  }
  if (!Number.isFinite(args.runs) || args.runs <= 0) {
    throw new Error("--runs must be a positive number");
  }
  if (!args.tests.length) {
    args.tests = [
      "tests/ui/e2e/url-filter-toggle.puppeteer.e2e.test.js",
      "tests/server/diagram-atlas.e2e.test.js"
    ];
  }
  return args;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function runCommand(command, commandArgs, options) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
  const logsDir = path.join(__dirname, "logs", "repeat-e2e");
  ensureDir(logsDir);

  const isWindows = process.platform === "win32";

  const startedAt = new Date().toISOString();
  const results = [];

  for (const testPath of args.tests) {
    for (let runIndex = 1; runIndex <= args.runs; runIndex += 1) {
      const label = `${path.basename(testPath)}#${runIndex}`;
      const logBase = path.join(logsDir, label.replace(/[^a-zA-Z0-9_.-]/g, "_"));

      const command = isWindows ? "cmd.exe" : "npm";
      const commandArgs = isWindows
        ? ["/d", "/s", "/c", `npm run test:by-path ${testPath}`]
        : ["run", "test:by-path", testPath];

      // CI mode tends to surface race/flakiness; keep it consistent.
      const env = { ...process.env, CI: "1" };

      const run = await runCommand(command, commandArgs, { cwd: repoRoot, env });
      fs.writeFileSync(`${logBase}.stdout.log`, run.stdout, "utf8");
      fs.writeFileSync(`${logBase}.stderr.log`, run.stderr, "utf8");

      results.push({
        testPath,
        runIndex,
        ok: run.code === 0,
        exitCode: run.code,
        stdoutLog: path.relative(repoRoot, `${logBase}.stdout.log`),
        stderrLog: path.relative(repoRoot, `${logBase}.stderr.log`)
      });

      if (run.code !== 0) {
        // Stop early so failures are easy to diagnose.
        break;
      }
    }
  }

  const summary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    runs: args.runs,
    tests: args.tests,
    results,
    stats: {
      total: results.length,
      passed: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length
    }
  };

  const outPath = path.join(__dirname, "repeat-e2e-summary.json");
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), "utf8");

  console.log("Repeat E2E summary written:", path.relative(repoRoot, outPath));
  console.log("Pass:", summary.stats.passed, "Fail:", summary.stats.failed);

  if (summary.stats.failed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
