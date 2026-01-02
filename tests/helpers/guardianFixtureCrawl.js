"use strict";

const http = require("http");
const net = require("net");
const path = require("path");
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
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body }));
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

function extractPageLinks(html, baseUrl) {
  if (typeof html !== "string" || !html) return [];

  const links = [];
  const re = /href="([^"]+)"/g;
  let match;

  while ((match = re.exec(html))) {
    const href = match[1];
    if (!href) continue;
    if (!href.startsWith("/page/")) continue;

    try {
      const resolved = new URL(href, baseUrl).toString();
      links.push(resolved);
    } catch {
      // ignore
    }
  }

  return links;
}

async function crawlPages({ startUrl, maxPages, concurrency }) {
  const visited = new Set();
  const queue = [startUrl];

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
          const links = extractPageLinks(res.body, url);
          for (const link of links) {
            if (!visited.has(link)) queue.push(link);
          }
        })()
      );
    }

    await Promise.all(batch);
  }

  return { visitedCount: visited.size };
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
  stopChild
};
