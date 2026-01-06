"use strict";

const http = require("http");
const net = require("net");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { spawn } = require("child_process");

const repoRoot = path.resolve(__dirname, "..", "..");

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpGetText(urlString, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);

    const startedAt = Date.now();

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: "GET",
        timeout: timeoutMs,
        agent: false,
        headers: { Connection: "close" }
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
        res.on("end", () => {
          const endedAt = Date.now();
          const buffer = Buffer.concat(chunks);
          resolve({
            status: res.statusCode,
            body: buffer.toString("utf8"),
            bytes: buffer.length,
            durationMs: endedAt - startedAt
          });
        });
      }
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });

    req.end();
  });
}

function bytesToHuman(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function ensureDir(dirPath) {
  if (!dirPath) return;
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeFileNameForUrl(urlString) {
  try {
    const u = new URL(urlString);
    const m = /^\/page\/(\d+)$/.exec(u.pathname);
    if (m) return `page-${m[1]}.html`;
  } catch {
    // ignore
  }
  return `url-${crypto.createHash("sha1").update(String(urlString)).digest("hex").slice(0, 12)}.html`;
}

function getTelemetryOptionsFromEnv() {
  const enabled = String(process.env.GUARDIAN_CRAWL_TELEMETRY || "") === "1";
  if (!enabled) return null;

  const saveBodies = String(process.env.GUARDIAN_CRAWL_SAVE_BODIES || "") === "1";
  const logEach = String(process.env.GUARDIAN_CRAWL_LOG_EACH || "") === "1";
  const outputDirRaw = String(process.env.GUARDIAN_CRAWL_OUTPUT_DIR || "testlogs/guardian-downloads");
  const outputDir = path.resolve(repoRoot, outputDirRaw);

  return {
    enabled,
    saveBodies,
    logEach,
    outputDir
  };
}

function extractPageLinks(html, baseUrl) {
  if (typeof html !== "string" || !html) return [];

  const links = [];
  const re = /href="([^"]+)"/g;
  let match;

  while ((match = re.exec(html))) {
    const href = match[1];
    if (!href) continue;

    try {
      const resolved = new URL(href, baseUrl);
      if (!resolved.pathname.startsWith("/page/")) continue;
      links.push(resolved.toString());
    } catch {
      // ignore
    }
  }

  return links;
}

async function crawlPages({ startUrl, maxPages, concurrency, telemetry }) {
  const crawlStartedAt = Date.now();
  const visited = new Set();
  const queue = [startUrl];

  const telemetryEnabled = telemetry && telemetry.enabled;
  const telemetryEntries = telemetryEnabled ? [] : null;
  const telemetrySaveBodies = telemetryEnabled && telemetry.saveBodies;
  const telemetryLogEach = telemetryEnabled && telemetry.logEach;
  const telemetryDir = telemetryEnabled ? telemetry.outputDir : null;

  let savedBytesTotal = 0;
  let downloadedBytesTotal = 0;

  if (telemetryEnabled) {
    ensureDir(telemetryDir);
  }

  while (queue.length && visited.size < maxPages) {
    const batch = [];

    while (queue.length && batch.length < concurrency && visited.size + batch.length < maxPages) {
      const url = queue.shift();
      if (!url) break;
      if (visited.has(url)) continue;
      visited.add(url);

      batch.push(
        (async () => {
          const res = await httpGetText(url);
          if (res.status !== 200) {
            throw new Error(`GET ${url}: status=${res.status}`);
          }

          if (telemetryEnabled) {
            downloadedBytesTotal += Number(res.bytes) || 0;
            const entry = {
              url,
              status: res.status,
              durationMs: res.durationMs,
              bytes: res.bytes
            };

            if (telemetrySaveBodies) {
              const fileName = safeFileNameForUrl(url);
              const filePath = path.join(telemetryDir, fileName);
              const buf = Buffer.from(String(res.body || ""), "utf8");
              fs.writeFileSync(filePath, buf);
              entry.savedPath = filePath;
              entry.savedBytes = buf.length;
              savedBytesTotal += buf.length;
            }

            telemetryEntries.push(entry);

            if (telemetryLogEach) {
              // One line per page for verification.
              console.log(
                `[download] ${url} status=${res.status} ms=${res.durationMs} bytes=${res.bytes}`
              );
            }
          }

          const links = extractPageLinks(res.body, url);
          for (const link of links) {
            if (!visited.has(link)) queue.push(link);
          }
        })()
      );
    }

    await Promise.all(batch);
  }

  const crawlEndedAt = Date.now();
  const totalDurationMs = crawlEndedAt - crawlStartedAt;

  let telemetrySummary = null;
  if (telemetryEnabled) {
    const avgBytesPerSecond = totalDurationMs > 0 ? downloadedBytesTotal / (totalDurationMs / 1000) : 0;
    telemetrySummary = {
      startedAt: new Date(crawlStartedAt).toISOString(),
      endedAt: new Date(crawlEndedAt).toISOString(),
      totalDurationMs,
      visitedCount: visited.size,
      downloadedBytesTotal,
      downloadedBytesHuman: bytesToHuman(downloadedBytesTotal),
      avgBytesPerSecond,
      avgBytesPerSecondHuman: bytesToHuman(avgBytesPerSecond),
      savedBytesTotal: telemetrySaveBodies ? savedBytesTotal : 0,
      savedBytesHuman: telemetrySaveBodies ? bytesToHuman(savedBytesTotal) : "",
      outputDir: telemetryDir,
      saveBodies: Boolean(telemetrySaveBodies),
      entryCount: telemetryEntries.length
    };

    const outPath = path.join(telemetryDir, "download-summary.json");
    fs.writeFileSync(
      outPath,
      JSON.stringify({ summary: telemetrySummary, downloads: telemetryEntries }, null, 2),
      "utf8"
    );

    console.log(
      `[telemetry] visited=${visited.size} totalMs=${totalDurationMs} downloaded=${bytesToHuman(
        downloadedBytesTotal
      )} avgSpeed=${bytesToHuman(avgBytesPerSecond)}/s` +
        (telemetrySaveBodies ? ` saved=${bytesToHuman(savedBytesTotal)}` : "")
    );
    console.log(`[telemetry] details: ${outPath}`);
  }

  return { visitedCount: visited.size, telemetry: telemetrySummary };
}

function spawnGuardianFixture({ port, pages }) {
  const scriptPath = path.join(repoRoot, "tests", "fixtures", "servers", "guardianLikeSiteServer.js");

  const child = spawn(
    process.execPath,
    [scriptPath, "--host", "127.0.0.1", "--port", String(port), "--pages", String(pages)],
    {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d) => (stdout += d.toString()));
  child.stderr.on("data", (d) => (stderr += d.toString()));

  return {
    child,
    getLogs: () => ({ stdout, stderr })
  };
}

async function waitForHttpOk(url, { attempts = 30, delayMs = 100 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const probe = await httpGetText(url);
      if (probe.status === 200) return true;
    } catch {
      // ignore
    }
    await sleep(delayMs);
  }
  return false;
}

function stopChild(child) {
  if (!child) return;
  try {
    child.kill("SIGTERM");
  } catch {
    // ignore
  }
}

module.exports = {
  getFreePort,
  sleep,
  httpGetText,
  crawlPages,
  spawnGuardianFixture,
  waitForHttpOk,
  stopChild,
  getTelemetryOptionsFromEnv
};
