"use strict";

const http = require("http");
const path = require("path");
const { createRequire } = require("module");

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = "AssertionError";
    throw err;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const rootDir = path.resolve(__dirname, "..", "..");
  const rootRequire = createRequire(path.join(rootDir, "package.json"));
  const express = rootRequire("express");

  const { TelemetryIntegration } = require(path.join(rootDir, "src", "crawler", "telemetry"));

  const app = express();
  const integration = new TelemetryIntegration({
    allowOrigin: "*",
    historyLimit: 50,
    heartbeatInterval: 5_000
  });

  integration.mountSSE(app, "/api/crawl-events");

  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const port = server.address().port;
  const sseUrlPath = "/api/crawl-events";

  let gotProgress = false;
  let buffer = "";

  const req = http.request(
    {
      method: "GET",
      host: "127.0.0.1",
      port,
      path: sseUrlPath,
      headers: {
        Accept: "text/event-stream"
      }
    },
    (res) => {
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        buffer += chunk;
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const dataLine = part
            .split("\n")
            .map((line) => line.trim())
            .find((line) => line.startsWith("data: "));
          if (!dataLine) continue;

          try {
            const payload = JSON.parse(dataLine.slice(6));
            if (payload?.type === "crawl:telemetry" && payload.data?.type === "crawl:progress") {
              const progress = payload.data?.data;
              assert(progress && typeof progress === "object", "Expected progress payload data");
              assert(progress.visited === 1, "Expected visited to be 1");
              assert(progress.queued === 2, "Expected queued to be 2");
              gotProgress = true;
            }
          } catch {
            // Ignore malformed chunks (e.g. partial JSON)
          }
        }
      });
    }
  );

  req.on("error", (err) => {
    throw err;
  });

  req.end();

  // Give the client a moment to connect.
  await wait(50);

  integration.bridge.emitProgress(
    {
      visited: 1,
      queued: 2,
      errors: 0,
      total: null,
      percentComplete: null,
      currentAction: "crawling"
    },
    {
      jobId: "check-job",
      crawlType: "basic"
    }
  );

  const deadline = Date.now() + 2_000;
  while (!gotProgress && Date.now() < deadline) {
    await wait(25);
  }

  req.destroy();
  integration.destroy();
  await new Promise((resolve) => server.close(resolve));

  assert(gotProgress, "Expected to receive crawl:progress over SSE");
  console.log("[telemetrySse.check] OK");
}

main().catch((err) => {
  console.error("[telemetrySse.check] FAILED:", err);
  process.exitCode = 1;
});
