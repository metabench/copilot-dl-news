#!/usr/bin/env node
"use strict";

/**
 * Worker Version Check CLI
 *
 * Queries one or more distributed crawl workers for their API version and capabilities.
 *
 * Why this exists:
 * - We can't assume deployed workers match local code.
 * - Client code (DistributedFetchAdapter) can feature-detect, but CI/ops need a simple guard.
 *
 * Usage:
 *   node tools/dev/worker-version-check.js
 *   node tools/dev/worker-version-check.js --worker http://144.21.42.149:8081
 *   node tools/dev/worker-version-check.js --worker http://host1:8081 --worker http://host2:8081
 *   node tools/dev/worker-version-check.js --require includeBodyBase64 --require gzipResponse
 *   node tools/dev/worker-version-check.js --min-version 2026-01-09.1
 *   node tools/dev/worker-version-check.js --json
 */

const http = require("http");
const https = require("https");

let EXPECTED;
try {
  // Keep the expected version aligned with the canonical worker implementation.
  // Path is relative to tools/dev/.
  // eslint-disable-next-line global-require
  EXPECTED = require("../../labs/distributed-crawl/worker-server");
} catch {
  EXPECTED = { WORKER_API_VERSION: null, WORKER_CAPABILITIES: null };
}

const DEFAULT_WORKER = "http://144.21.42.149:8081";

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    workers: [],
    timeoutMs: 5000,
    json: false,
    help: false,
    minVersion: null,
    requireCaps: [],
    expectedVersion: EXPECTED.WORKER_API_VERSION || null,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--worker" || a === "-w") {
      opts.workers.push(args[++i]);
    } else if (a === "--timeout" || a === "-t") {
      opts.timeoutMs = Number(args[++i]) || opts.timeoutMs;
    } else if (a === "--json" || a === "-j") {
      opts.json = true;
    } else if (a === "--help" || a === "-h") {
      opts.help = true;
    } else if (a === "--min-version") {
      opts.minVersion = args[++i];
    } else if (a === "--require" || a === "-r") {
      opts.requireCaps.push(args[++i]);
    } else if (a === "--expected-version") {
      opts.expectedVersion = args[++i];
    }
  }

  if (opts.workers.length === 0) opts.workers = [DEFAULT_WORKER];
  return opts;
}

function printHelp() {
  console.log(`
Worker Version Check CLI
========================

Queries worker /meta endpoint to report API version and capabilities.

Usage:
  node tools/dev/worker-version-check.js [options]

Options:
  --worker, -w <url>          Worker base URL (repeatable)
  --timeout, -t <ms>          Timeout per request (default: 5000)
  --min-version <ver>         Require worker apiVersion >= ver (format: YYYY-MM-DD.N)
  --expected-version <ver>    Require worker apiVersion == ver (defaults to local worker-server.js)
  --require, -r <cap>         Require capability flag to be true (repeatable)
  --json, -j                  JSON output
  --help, -h                  Show help

Endpoints expected:
  GET /meta → { apiVersion, capabilities, ... }

Deployment note:
  The canonical implementation lives at labs/distributed-crawl/worker-server.js.
`);
}

function normalizeBaseUrl(url) {
  if (!url) return null;
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function parseWorkerVersion(ver) {
  // Format: YYYY-MM-DD.N (N is an integer revision)
  if (typeof ver !== "string") return null;
  const [datePart, revPart] = ver.split(".");
  if (!datePart || !revPart) return null;
  const dateMatch = /^\d{4}-\d{2}-\d{2}$/.test(datePart);
  if (!dateMatch) return null;
  const rev = Number(revPart);
  if (!Number.isFinite(rev)) return null;
  return { datePart, rev };
}

function cmpWorkerVersion(a, b) {
  const pa = parseWorkerVersion(a);
  const pb = parseWorkerVersion(b);
  if (!pa || !pb) return null;
  if (pa.datePart < pb.datePart) return -1;
  if (pa.datePart > pb.datePart) return 1;
  if (pa.rev < pb.rev) return -1;
  if (pa.rev > pb.rev) return 1;
  return 0;
}

function httpGetJson(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;

    const req = lib.request(
      u,
      {
        method: "GET",
        timeout: timeoutMs,
        headers: {
          accept: "application/json",
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const text = buf.toString("utf8");
          try {
            const json = JSON.parse(text);
            resolve({ status: res.statusCode, headers: res.headers, json });
          } catch (e) {
            reject(new Error(`Non-JSON response (status ${res.statusCode})`));
          }
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", reject);
    req.end();
  });
}

async function inspectWorker(baseUrl, opts) {
  const normalized = normalizeBaseUrl(baseUrl);
  const metaUrl = `${normalized}/meta`;
  const startedAt = Date.now();

  try {
    const resp = await httpGetJson(metaUrl, opts.timeoutMs);
    const apiVersion = resp?.json?.apiVersion || null;
    const capabilities = resp?.json?.capabilities || {};

    const requiredCaps = (opts.requireCaps || []).filter(Boolean);
    const missingCaps = requiredCaps.filter((c) => capabilities?.[c] !== true);

    let versionOk = true;
    const checks = [];

    if (opts.minVersion) {
      const cmp = cmpWorkerVersion(apiVersion, opts.minVersion);
      const ok = cmp !== null && cmp >= 0;
      checks.push({ kind: "minVersion", want: opts.minVersion, got: apiVersion, ok });
      versionOk = versionOk && ok;
    }

    if (opts.expectedVersion) {
      const ok = apiVersion === opts.expectedVersion;
      checks.push({ kind: "expectedVersion", want: opts.expectedVersion, got: apiVersion, ok });
      versionOk = versionOk && ok;
    }

    const capsOk = missingCaps.length === 0;
    checks.push({ kind: "capabilities", missingCaps, ok: capsOk });

    const ok = versionOk && capsOk;

    return {
      workerUrl: normalized,
      ok,
      apiVersion,
      capabilities,
      meta: resp.json,
      elapsedMs: Date.now() - startedAt,
      checks,
    };
  } catch (e) {
    return {
      workerUrl: normalized,
      ok: false,
      apiVersion: null,
      capabilities: null,
      error: e.message,
      elapsedMs: Date.now() - startedAt,
      checks: [{ kind: "meta", ok: false, error: e.message }],
    };
  }
}

async function main() {
  const opts = parseArgs();
  if (opts.help) {
    printHelp();
    return;
  }

  const results = [];
  for (const w of opts.workers) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await inspectWorker(w, opts));
  }

  const summary = {
    expectedVersion: opts.expectedVersion,
    minVersion: opts.minVersion,
    requiredCaps: opts.requireCaps,
    ok: results.every((r) => r.ok),
    workersOk: results.filter((r) => r.ok).length,
    workersTotal: results.length,
  };

  if (opts.json) {
    console.log(JSON.stringify({ summary, results }, null, 2));
  } else {
    console.log("Worker version check\n====================\n");
    console.log(`Expected version: ${opts.expectedVersion || "(none)"}`);
    console.log(`Min version:      ${opts.minVersion || "(none)"}`);
    console.log(`Require caps:     ${(opts.requireCaps && opts.requireCaps.length ? opts.requireCaps.join(", ") : "(none)")}`);
    console.log();

    for (const r of results) {
      const status = r.ok ? "OK" : "FAIL";
      console.log(`${status}  ${r.workerUrl}`);
      if (r.apiVersion) console.log(`  apiVersion: ${r.apiVersion}`);
      if (r.error) console.log(`  error: ${r.error}`);
      if (r.capabilities) {
        const caps = Object.keys(r.capabilities).sort();
        console.log(`  caps: ${caps.map((c) => `${c}=${r.capabilities[c] ? "1" : "0"}`).join(" ")}`);
      }
      if (Array.isArray(r.checks)) {
        for (const c of r.checks) {
          if (c.kind === "capabilities" && !c.ok) {
            console.log(`  missing caps: ${c.missingCaps.join(", ")}`);
          }
          if ((c.kind === "expectedVersion" || c.kind === "minVersion") && !c.ok) {
            console.log(`  version check failed: ${c.kind} want=${c.want} got=${c.got}`);
          }
        }
      }
      console.log();
    }

    console.log(`Summary: ${summary.workersOk}/${summary.workersTotal} OK`);
  }

  if (!summary.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
