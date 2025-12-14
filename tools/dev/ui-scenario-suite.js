"use strict";

/**
 * UI Scenario Suite Runner
 *
 * Goal: run many Puppeteer scenarios with a single browser instance.
 * This makes UI verification much faster than launching Puppeteer per test.
 *
 * Usage:
 *   node tools/dev/ui-scenario-suite.js --suite=scripts/ui/scenarios/url-filter-toggle.suite.js
 *
 * Options:
 *   --suite=<path>          Required. JS module exporting { startServer?, scenarios }.
 *   --scenario=<csv>        Optional. Filter scenarios by id or name (case-insensitive).
 *   --artifacts-dir=<path>  Optional. Where to write screenshots/html on failure.
 *   --timeout=<ms>          Optional. Default per-scenario timeout (default 15000).
 *   --headful               Optional. Run with a visible browser.
 *   --quiet                 Optional. Reduce happy-path output (ignored with --json).
 *   --print-logs-on-failure Optional. When a scenario fails, dump captured logs/errors/network to console.
 *   --json                  Optional. Emit JSON summary.
 */

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const args = process.argv.slice(2);

function getArg(prefix, fallback = null) {
  const hit = args.find((a) => a.startsWith(prefix + "="));
  if (!hit) return fallback;
  return hit.split("=").slice(1).join("=");
}

function hasFlag(flag) {
  return args.includes(flag) || args.includes("--" + flag);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeSlug(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80) || "scenario";
}

function filterWanted(raw) {
  if (!raw) return null;
  const wanted = new Set(
    String(raw)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.toLowerCase())
  );
  return wanted.size ? wanted : null;
}

function muteConsoleOutput() {
  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    debug: console.debug
  };

  console.log = () => {};
  console.info = () => {};
  console.warn = () => {};
  console.debug = () => {};

  return () => {
    console.log = original.log;
    console.info = original.info;
    console.warn = original.warn;
    console.debug = original.debug;
  };
}

function muteStdoutWrite() {
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => true;
  return () => {
    process.stdout.write = originalWrite;
  };
}

function printCaptureOnFailure(out, { logs, errors, network }) {
  const maxItems = 30;
  const sliceTail = (arr) => (Array.isArray(arr) && arr.length > maxItems ? arr.slice(-maxItems) : arr || []);

  const logsTail = sliceTail(logs);
  const errorsTail = sliceTail(errors);
  const networkTail = sliceTail(network);

  out.log("Captured browser output:");
  out.log(`- logs: ${Array.isArray(logs) ? logs.length : 0} (showing last ${logsTail.length})`);
  for (const entry of logsTail) {
    out.log(`  [console.${entry.type}] ${entry.text}`);
  }

  out.log(`- errors: ${Array.isArray(errors) ? errors.length : 0} (showing last ${errorsTail.length})`);
  for (const entry of errorsTail) {
    out.log(`  [${entry.type}] ${entry.text}`);
  }

  out.log(`- network: ${Array.isArray(network) ? network.length : 0} (showing last ${networkTail.length})`);
  for (const entry of networkTail) {
    if (entry.type === "http") {
      out.log(`  [http ${entry.status}] ${entry.url}`);
    } else {
      out.log(`  [${entry.type}] ${entry.url} — ${entry.errorText || ""}`.trim());
    }
  }
}

async function attachCapture(page) {
  const logs = [];
  const errors = [];
  const network = [];

  const onConsole = (msg) => {
    logs.push({ type: msg.type(), text: msg.text() });
  };
  const onPageError = (err) => {
    errors.push({ type: "page-error", text: err && err.message ? err.message : String(err) });
  };
  const onRequestFailed = (request) => {
    const failure = request.failure();
    network.push({
      type: "requestfailed",
      url: request.url(),
      errorText: failure ? failure.errorText : "unknown"
    });
  };
  const onResponse = (response) => {
    if (!response.ok() && response.status() !== 304) {
      network.push({ type: "http", url: response.url(), status: response.status() });
    }
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("requestfailed", onRequestFailed);
  page.on("response", onResponse);

  return {
    logs,
    errors,
    network,
    detach() {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
      page.off("requestfailed", onRequestFailed);
      page.off("response", onResponse);
    }
  };
}

async function writeArtifact(artifactsDir, scenarioKey, kind, content) {
  const fileName = `${scenarioKey}.${kind}`;
  const outPath = path.join(artifactsDir, fileName);
  await fs.promises.writeFile(outPath, content);
  return outPath;
}

async function run() {
  const suitePathRaw = getArg("--suite");
  if (!suitePathRaw) {
    console.error("Missing --suite=<path>");
    process.exit(2);
  }

  const artifactsDir = getArg("--artifacts-dir", path.join(process.cwd(), "tmp", "ui-scenario-suite"));
  const timeoutMs = Number.parseInt(getArg("--timeout", "15000"), 10);
  const headful = hasFlag("--headful");
  const quiet = hasFlag("--quiet");
  const printLogsOnFailure = hasFlag("--print-logs-on-failure");
  const jsonOutput = hasFlag("--json");
  const wanted = filterWanted(getArg("--scenario"));

  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  const restoreConsole = quiet && !jsonOutput ? muteConsoleOutput() : null;
  const restoreStdout = quiet && !jsonOutput ? muteStdoutWrite() : null;

  const out = quiet && !jsonOutput
    ? {
        log: (message) => originalStdoutWrite(String(message) + "\n"),
        error: (message) => originalStderrWrite(String(message) + "\n")
      }
    : {
        log: console.log.bind(console),
        error: console.error.bind(console)
      };

  const suitePath = path.isAbsolute(suitePathRaw)
    ? suitePathRaw
    : path.join(process.cwd(), suitePathRaw);

  // eslint-disable-next-line global-require, import/no-dynamic-require
  const suite = require(suitePath);
  if (!suite || !Array.isArray(suite.scenarios)) {
    throw new Error(`Suite must export { scenarios: [...] }: ${suitePathRaw}`);
  }

  ensureDir(artifactsDir);

  const scenarios = suite.scenarios
    .map((s, i) => ({ index: i + 1, ...s }))
    .filter((s) => {
      if (!wanted) return true;
      const id = s.id ? String(s.id).toLowerCase() : null;
      const name = s.name ? String(s.name).toLowerCase() : null;
      return (id && wanted.has(id)) || (name && wanted.has(name));
    });

  if (!scenarios.length) {
    console.error("No scenarios selected.");
    process.exit(2);
  }

  if (!jsonOutput && !quiet) {
    out.log(`Suite: ${suitePathRaw}`);
    out.log(`Scenarios: ${scenarios.length}`);
    out.log(`Artifacts: ${artifactsDir}`);
  }

  const browser = await puppeteer.launch({
    headless: headful ? false : "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  let serverHandle = null;
  const results = [];

  try {
    if (typeof suite.startServer === "function") {
      if (!jsonOutput && !quiet) out.log("Starting suite server...");
      serverHandle = await suite.startServer({ artifactsDir });
      if (!jsonOutput && !quiet) out.log(`Server ready: ${serverHandle && serverHandle.baseUrl ? serverHandle.baseUrl : "(no baseUrl)"}`);
    }

    const baseUrl = serverHandle && serverHandle.baseUrl ? serverHandle.baseUrl : suite.baseUrl;
    if (!baseUrl) {
      throw new Error("Suite must provide baseUrl or startServer() that returns { baseUrl }.");
    }

    for (const scenario of scenarios) {
      const scenarioKey = `${String(scenario.id || scenario.index).padStart(3, "0")}-${safeSlug(scenario.name || scenario.id || scenario.index)}`;
      const startedAt = Date.now();

      if (!jsonOutput && !quiet) {
        out.log(`\nRunning ${scenario.id || scenario.index} ${scenario.name || "(unnamed)"}...`);
      }

      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });
      page.setDefaultTimeout(timeoutMs);

      const capture = await attachCapture(page);

      let passed = false;
      let failure = null;

      try {
        const url = scenario.url
          ? String(scenario.url).startsWith("http")
            ? String(scenario.url)
            : `${baseUrl}${scenario.url.startsWith("/") ? "" : "/"}${scenario.url}`
          : baseUrl;

        const waitUntil = scenario.waitUntil || "load";
        await page.goto(url, { waitUntil, timeout: 30000 });

        if (scenario.waitForSelector) {
          await page.waitForSelector(scenario.waitForSelector, { timeout: timeoutMs });
        }
        if (typeof scenario.before === "function") {
          await scenario.before({ page, baseUrl, artifactsDir });
        }
        if (typeof scenario.run === "function") {
          await scenario.run({ page, baseUrl, artifactsDir });
        }
        if (typeof scenario.assert === "function") {
          await scenario.assert({ page, baseUrl, artifactsDir, logs: capture.logs, errors: capture.errors, network: capture.network });
        }

        passed = true;
      } catch (err) {
        failure = err;

        // Artifacts: screenshot + HTML snapshot.
        try {
          await page.screenshot({ path: path.join(artifactsDir, `${scenarioKey}.png`), fullPage: true });
        } catch (_) {}

        try {
          const html = await page.content();
          await writeArtifact(artifactsDir, scenarioKey, "html", html);
        } catch (_) {}

        try {
          await writeArtifact(artifactsDir, scenarioKey, "logs.json", JSON.stringify({ logs: capture.logs, errors: capture.errors, network: capture.network }, null, 2));
        } catch (_) {}

        if (!jsonOutput && printLogsOnFailure) {
          out.log(`\n❌ Failure details for ${scenario.id || scenario.index} ${scenario.name || "(unnamed)"}`);
          printCaptureOnFailure(out, { logs: capture.logs, errors: capture.errors, network: capture.network });
          out.log(`Artifacts saved under: ${artifactsDir}`);
        }
      } finally {
        capture.detach();
        await page.close().catch(() => {});
      }

      const durationMs = Date.now() - startedAt;
      results.push({
        id: scenario.id || scenario.index,
        name: scenario.name || "(unnamed)",
        passed,
        durationMs,
        error: failure ? String(failure && failure.message ? failure.message : failure) : null
      });

      if (!jsonOutput && !quiet) {
        const status = passed ? "✅" : "❌";
        const detail = passed ? "" : ` — ${results[results.length - 1].error}`;
        out.log(`${status} ${scenario.id || scenario.index} ${scenario.name || "(unnamed)"} (${durationMs}ms)${detail}`);
      }
    }
  } finally {
    if (serverHandle && typeof serverHandle.shutdown === "function") {
      await serverHandle.shutdown().catch(() => {});
    }
    await browser.close().catch(() => {});
    if (restoreStdout) restoreStdout();
    if (restoreConsole) restoreConsole();
  }

  const failed = results.filter((r) => !r.passed);
  const summary = {
    suite: suitePathRaw,
    timestamp: new Date().toISOString(),
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    artifactsDir,
    results
  };

  if (jsonOutput) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    if (failed.length) {
      out.log(`\nFailures: ${failed.length}/${results.length} (artifacts: ${artifactsDir})`);
      process.exitCode = 1;
    } else {
      out.log(`\nAll scenarios passed (${results.length}).`);
    }
  }

  if (failed.length) process.exitCode = 1;
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
