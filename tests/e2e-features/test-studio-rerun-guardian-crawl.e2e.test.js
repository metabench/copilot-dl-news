"use strict";

const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const { getFreePort, sleep, httpGetText, waitForHttpOk, stopChild } = require("../helpers/guardianFixtureCrawl");

function httpJson(method, urlString, { body, timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const payload = body == null ? null : Buffer.from(JSON.stringify(body));

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        timeout: timeoutMs,
        agent: false,
        headers: {
          Connection: "close",
          Accept: "application/json",
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": String(payload.length)
              }
            : null)
        }
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (text += chunk));
        res.on("end", () => {
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            // ignore
          }
          resolve({ status: res.statusCode, json, text });
        });
      }
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });

    if (payload) req.write(payload);
    req.end();
  });
}

function normalizeRunId(run) {
  if (!run || typeof run !== "object") return null;
  return run.runId || run.run_id || null;
}

function normalizeTimestamp(run) {
  if (!run || typeof run !== "object") return null;
  return typeof run.timestamp === "string" ? run.timestamp : null;
}

async function listRuns(baseUrl, limit = 10) {
  const res = await httpJson("GET", `${baseUrl}/api/test-studio/runs?limit=${limit}`);
  if (res.status !== 200 || !res.json || res.json.success !== true) {
    throw new Error(`listRuns: bad response status=${res.status}`);
  }
  return Array.isArray(res.json.runs) ? res.json.runs : [];
}

async function waitForNewRun(baseUrl, { initialRunIds, startedAfterIso, attempts = 20 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    // Respect refreshFromDisk throttling (default minIntervalMs=1500).
    await sleep(1600);

    const runs = await listRuns(baseUrl, 15);
    for (const run of runs) {
      const id = normalizeRunId(run);
      if (!id || initialRunIds.has(id)) continue;

      const ts = normalizeTimestamp(run);
      if (ts && startedAfterIso && ts < startedAfterIso) continue;

      return { id, run };
    }
  }

  throw new Error("Timed out waiting for new Test Studio run");
}

function spawnTestStudioServer({ port }) {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const scriptPath = path.join(repoRoot, "src", "ui", "server", "testStudio", "server.js");

  const child = spawn(process.execPath, [scriptPath, "--port", String(port)], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d) => (stdout += d.toString()));
  child.stderr.on("data", (d) => (stderr += d.toString()));

  return {
    child,
    getLogs: () => ({ stdout, stderr })
  };
}

async function assertRunHasPassingResult(baseUrl, runId, { fileContains } = {}) {
  const res = await httpJson(
    "GET",
    `${baseUrl}/api/test-studio/runs/${encodeURIComponent(runId)}/results?limit=5000`
  );

  if (res.status !== 200 || !res.json || res.json.success !== true) {
    throw new Error(`getResults(${runId}): bad response status=${res.status}`);
  }

  const results = Array.isArray(res.json.results) ? res.json.results : [];

  const matches = fileContains
    ? results.filter((r) => typeof r.file === "string" && r.file.includes(fileContains))
    : results;

  if (!matches.length) {
    throw new Error(`Expected results to include file containing '${fileContains}'`);
  }

  const failed = matches.filter((r) => r.status === "failed");
  if (failed.length) {
    throw new Error(`Expected no failures for '${fileContains}', got ${failed.length}`);
  }
}

describe("Test Studio runs Guardian-like crawl E2E", () => {
  let port;
  let baseUrl;
  let child;
  let getLogs;

  beforeAll(async () => {
    port = await getFreePort();
    baseUrl = `http://127.0.0.1:${port}`;

    const spawned = spawnTestStudioServer({ port });
    child = spawned.child;
    getLogs = spawned.getLogs;

    const ok = await waitForHttpOk(`${baseUrl}/api/test-studio/stats`, { attempts: 40, delayMs: 150 });
    if (!ok) {
      const { stderr } = getLogs();
      throw new Error(
        `Test Studio did not become ready at ${baseUrl} (stderr: ${String(stderr || "").slice(-1200)})`
      );
    }

    // sanity
    const stats = await httpGetText(`${baseUrl}/api/test-studio/stats`);
    if (stats.status !== 200) {
      throw new Error(`GET /api/test-studio/stats: status=${stats.status}`);
    }
  }, 60000);

  afterAll(async () => {
    stopChild(child);
    await sleep(50);
    if (child && !child.killed) {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
    }
  });

  async function triggerRerunAndAssert({ testFile, fileContains }) {
    const startedAfterIso = new Date().toISOString();
    const initialRuns = await listRuns(baseUrl, 20);
    const initialRunIds = new Set(initialRuns.map(normalizeRunId).filter(Boolean));

    const rerunRes = await httpJson("POST", `${baseUrl}/api/test-studio/rerun`, {
      timeoutMs: 180000,
      body: {
        tests: [{ file: testFile }]
      }
    });

    if (rerunRes.status !== 200 || !rerunRes.json || rerunRes.json.success !== true) {
      throw new Error(`rerun: bad response status=${rerunRes.status}`);
    }

    const exitCode = rerunRes.json?.result?.exitCode;
    if (exitCode !== 0) {
      const { stderr: serverStderr } = getLogs ? getLogs() : { stderr: "" };
      const rerunStdout = rerunRes.json?.result?.stdout;
      const rerunStderr = rerunRes.json?.result?.stderr;
      throw new Error(
        `rerun: expected exitCode=0, got ${exitCode}\n` +
          `rerun stdout (tail): ${String(rerunStdout || "").slice(-1200)}\n` +
          `rerun stderr (tail): ${String(rerunStderr || "").slice(-1200)}\n` +
          `server stderr (tail): ${String(serverStderr || "").slice(-1200)}`
      );
    }

    const { id: runId } = await waitForNewRun(baseUrl, { initialRunIds, startedAfterIso });
    await assertRunHasPassingResult(baseUrl, runId, { fileContains });

    return runId;
  }

  test(
    "Test Studio reruns a 5-page crawl test and ingests results",
    async () => {
      const testFile = "tests/e2e-features/guardian-5-page-crawl.e2e.test.js";
      await triggerRerunAndAssert({ testFile, fileContains: "guardian-5-page-crawl.e2e.test.js" });
    },
    180000
  );

  test(
    "Test Studio reruns a 100-page crawl test and ingests results",
    async () => {
      const testFile = "tests/e2e-features/guardian-100-page-crawl.e2e.test.js";
      await triggerRerunAndAssert({ testFile, fileContains: "guardian-100-page-crawl.e2e.test.js" });
    },
    240000
  );

  test(
    "Test Studio reruns a 1000-page crawl test and ingests results",
    async () => {
      const testFile = "tests/e2e-features/guardian-1000-page-crawl.e2e.test.js";
      await triggerRerunAndAssert({ testFile, fileContains: "guardian-1000-page-crawl.e2e.test.js" });
    },
    360000
  );
});
