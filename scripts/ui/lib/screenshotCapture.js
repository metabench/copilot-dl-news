"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");
const puppeteer = require("puppeteer");

const DEFAULT_VIEWPORT = Object.freeze({ key: "desktop", width: 1440, height: 1000 });
const DEFAULT_MOBILE_VIEWPORT = Object.freeze({ key: "mobile", width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

function parseCaptureArgs(argv, defaults = {}) {
  const args = {
    outputDir: defaults.outputDir,
    baseUrl: defaults.baseUrl,
    dbPath: defaults.dbPath,
    saveScreenshots: defaults.saveScreenshots !== false,
    saveDomSnapshots: defaults.saveDomSnapshots === true,
    headful: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = () => argv[++i];
    if (token === "--output" || token === "-o") args.outputDir = next();
    if (token === "--db") args.dbPath = next();
    if (token === "--base-url") args.baseUrl = next();
    if (token === "--no-screenshots") args.saveScreenshots = false;
    if (token === "--save-screenshots") args.saveScreenshots = true;
    if (token === "--save-dom" || token === "--save-dom-snapshots") args.saveDomSnapshots = true;
    if (token === "--no-dom" || token === "--no-dom-snapshots") args.saveDomSnapshots = false;
    if (token === "--headful") args.headful = true;
  }

  return args;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sanitizeCaptureKey(value) {
  return String(value || "capture")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "capture";
}

function normalizeViewport(viewport, index) {
  const fallback = index === 0 ? DEFAULT_VIEWPORT : { key: `viewport-${index + 1}`, width: 1280, height: 900 };
  const width = Number(viewport && viewport.width) || fallback.width;
  const height = Number(viewport && viewport.height) || fallback.height;
  return {
    key: sanitizeCaptureKey((viewport && viewport.key) || fallback.key),
    width,
    height,
    deviceScaleFactor: Number(viewport && viewport.deviceScaleFactor) || 1,
    isMobile: Boolean(viewport && viewport.isMobile),
    hasTouch: Boolean(viewport && viewport.hasTouch),
    isLandscape: Boolean(viewport && viewport.isLandscape)
  };
}

function normalizeViewports(options = {}) {
  const configured = Array.isArray(options.viewports) && options.viewports.length
    ? options.viewports
    : [options.viewport || DEFAULT_VIEWPORT];
  return configured.map(normalizeViewport);
}

function toPuppeteerViewport(viewport) {
  return {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.deviceScaleFactor,
    isMobile: viewport.isMobile,
    hasTouch: viewport.hasTouch,
    isLandscape: viewport.isLandscape
  };
}

function makeCaptureKey(route, viewport, hasMultipleViewports) {
  const routeKey = sanitizeCaptureKey(route.key);
  return hasMultipleViewports ? `${routeKey}-${viewport.key}` : routeKey;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => {
        if (error) return reject(error);
        resolve(address.port);
      });
    });
    server.on("error", reject);
  });
}

function waitForHttp(url, timeoutMs, child, output) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (error) => {
      if (done) return;
      done = true;
      error ? reject(error) : resolve();
    };

    child?.once("exit", (code, signal) => {
      finish(new Error([
        `server exited before responding (code=${code}, signal=${signal || "none"})`,
        output.stdout ? `stdout:\n${output.stdout.slice(0, 1200)}` : "",
        output.stderr ? `stderr:\n${output.stderr.slice(0, 1200)}` : ""
      ].filter(Boolean).join("\n")));
    });

    const tick = () => {
      if (done) return;
      if (Date.now() > deadline) return finish(new Error(`timeout waiting for ${url}`));
      const req = http.get(url, { timeout: 1000, headers: { Connection: "close" }, agent: false }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) return finish();
        setTimeout(tick, 250);
      });
      req.on("timeout", () => req.destroy(new Error("timeout")));
      req.on("error", () => setTimeout(tick, 250));
    };

    tick();
  });
}

async function startNodeServer(options = {}) {
  if (options.baseUrl) {
    return { baseUrl: String(options.baseUrl).replace(/\/$/, ""), stop: async () => {} };
  }

  const port = options.port || await getFreePort();
  const output = { stdout: "", stderr: "" };
  const cwd = options.cwd || process.cwd();
  const serverPath = path.resolve(cwd, options.serverPath);
  const args = [serverPath, options.portArg || "--port", String(port)];
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...(options.env || {}) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  child.stdout?.on("data", (chunk) => { output.stdout += chunk.toString(); });
  child.stderr?.on("data", (chunk) => { output.stderr += chunk.toString(); });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHttp(`${baseUrl}${options.waitPath || "/"}`, options.timeoutMs || 20000, child, output);

  return {
    baseUrl,
    stop: async () => {
      try { child.kill("SIGTERM"); } catch (_) {}
      await new Promise((resolve) => setTimeout(resolve, 300));
      try { child.kill("SIGKILL"); } catch (_) {}
    }
  };
}

function collectBrowserEvents(page) {
  const events = [];
  page.on("console", (message) => {
    events.push({ type: "console", level: message.type(), text: message.text().slice(0, 500) });
  });
  page.on("pageerror", (error) => {
    events.push({ type: "pageerror", text: (error && error.message ? error.message : String(error)).slice(0, 500) });
  });
  page.on("requestfailed", (request) => {
    events.push({ type: "requestfailed", url: request.url(), failure: request.failure() });
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      events.push({ type: "response", status: response.status(), url: response.url() });
    }
  });
  return events;
}

async function waitForFrameText(page, needles, timeoutMs = 15000) {
  if (!Array.isArray(needles) || needles.length === 0) return;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      try {
        const text = await frame.evaluate(() => document.body.innerText || "");
        if (needles.every((needle) => text.includes(needle))) return;
      } catch (_) {}
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function maybeCaptureScreenshot(page, options = {}) {
  if (options.enabled === false) {
    return { screenshotPath: null, screenshotBytes: 0, skipped: true };
  }

  const outputPath = options.outputPath;
  if (!outputPath) {
    throw new Error("maybeCaptureScreenshot requires outputPath when enabled");
  }

  ensureDir(path.dirname(outputPath));
  if (options.clipSelector) {
    const target = await page.$(options.clipSelector);
    if (target) {
      await target.screenshot({ path: outputPath });
    } else {
      await page.screenshot({ path: outputPath, fullPage: Boolean(options.fullPage) });
    }
  } else {
    await page.screenshot({ path: outputPath, fullPage: Boolean(options.fullPage) });
  }

  const stats = fs.statSync(outputPath);
  return { screenshotPath: outputPath, screenshotBytes: stats.size, skipped: false };
}

async function maybeCaptureDomSnapshot(page, options = {}) {
  if (options.enabled !== true) {
    return { domSnapshotPath: null, domSnapshotBytes: 0, skipped: true };
  }

  const outputPath = options.outputPath;
  if (!outputPath) {
    throw new Error("maybeCaptureDomSnapshot requires outputPath when enabled");
  }

  ensureDir(path.dirname(outputPath));
  const html = await page.content();
  fs.writeFileSync(outputPath, html, "utf8");
  const stats = fs.statSync(outputPath);
  return { domSnapshotPath: outputPath, domSnapshotBytes: stats.size, skipped: false };
}

async function defaultRouteMetrics(page, route) {
  return page.evaluate((routeInfo) => {
    const container = routeInfo.appId ? document.querySelector(`#app-${routeInfo.appId}`) : null;
    const activeNav = document.querySelector(".nav-item--active .nav-item__label");
    const text = document.body.innerText || "";
    return {
      title: document.title,
      activeNav: activeNav ? activeNav.textContent.trim() : null,
      loaded: container ? container.dataset.loaded === "true" : true,
      textLength: text.length,
      emptyStates: (text.match(/No downloads found|No active crawl|No screenshots|Loading\.\.\./gi) || []).length,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      viewport: { width: window.innerWidth, height: window.innerHeight }
    };
  }, { appId: route.appId || null });
}

async function captureRouteSet(options = {}) {
  const routes = Array.isArray(options.routes) ? options.routes : [];
  if (!routes.length) throw new Error("captureRouteSet requires at least one route");

  const outputDir = path.resolve(options.outputDir || path.join("screenshots", "ui-capture"));
  ensureDir(outputDir);

  const viewports = normalizeViewports(options);
  const hasMultipleViewports = viewports.length > 1;

  const server = options.server || await startNodeServer(options.serverOptions || {});
  const browser = await puppeteer.launch({
    headless: options.headful ? false : "new",
    defaultViewport: toPuppeteerViewport(viewports[0])
  });
  const report = {
    ok: false,
    baseUrl: server.baseUrl,
    outputDir,
    saveScreenshots: options.saveScreenshots !== false,
    saveDomSnapshots: options.saveDomSnapshots === true,
    viewports,
    capturedAt: new Date().toISOString(),
    routes: []
  };

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(options.timeoutMs || 20000);
    const browserEvents = collectBrowserEvents(page);

    for (const viewport of viewports) {
      await page.setViewport(toPuppeteerViewport(viewport));

      for (const route of routes) {
        const captureKey = makeCaptureKey(route, viewport, hasMultipleViewports);
        const routeContext = { ...route, captureKey, viewportKey: viewport.key, viewport };
        const url = route.url || `${server.baseUrl}${route.path}`;
        await page.goto(url, { waitUntil: route.waitUntil || "networkidle2" });
        if (route.appId) {
          await page.waitForFunction((appId) => {
            const el = document.querySelector(`#app-${appId}`);
            return el && el.dataset.loaded === "true";
          }, {}, route.appId);
        }
        if (route.waitSelector) await page.waitForSelector(route.waitSelector, { timeout: route.waitTimeoutMs || 15000 }).catch(() => {});
        if (route.readySelector) await page.waitForSelector(route.readySelector, { timeout: route.readyTimeoutMs || 15000 }).catch(() => {});
        await waitForFrameText(page, route.waitForFrameText, route.frameTextTimeoutMs || 15000);
        await new Promise((resolve) => setTimeout(resolve, route.settleMs ?? options.settleMs ?? 500));

        const screenshotPath = path.join(outputDir, `${captureKey}.png`);
        const domSnapshotPath = path.join(outputDir, `${captureKey}.html`);
        const screenshot = await maybeCaptureScreenshot(page, {
          enabled: options.saveScreenshots !== false,
          outputPath: screenshotPath,
          fullPage: route.fullPage,
          clipSelector: route.clipSelector
        });
        const domSnapshot = await maybeCaptureDomSnapshot(page, {
          enabled: options.saveDomSnapshots === true,
          outputPath: domSnapshotPath
        });
        const baseMetrics = await defaultRouteMetrics(page, routeContext);
        const customMetrics = typeof route.inspect === "function" ? await route.inspect(page, routeContext) : {};
        report.routes.push({
          key: captureKey,
          routeKey: route.key,
          viewportKey: viewport.key,
          url,
          screenshotPath: screenshot.screenshotPath,
          screenshotBytes: screenshot.screenshotBytes,
          screenshotSkipped: screenshot.skipped,
          domSnapshotPath: domSnapshot.domSnapshotPath,
          domSnapshotBytes: domSnapshot.domSnapshotBytes,
          domSnapshotSkipped: domSnapshot.skipped,
          metrics: { ...baseMetrics, ...customMetrics }
        });
      }
    }

    report.browserEvents = browserEvents;
    const seriousBrowserEvents = browserEvents.filter((event) => event.type !== "console");
    report.ok = report.routes.every((entry) => (
      (entry.screenshotSkipped || entry.screenshotBytes > (options.minScreenshotBytes || 1000))
      && entry.metrics.loaded
      && entry.metrics.horizontalOverflow === false
      && (entry.metrics.iframeLoadingMentions || 0) === 0
    )) && seriousBrowserEvents.length === 0;

    const analysisPath = path.join(outputDir, options.analysisFile || "analysis.json");
    fs.writeFileSync(analysisPath, JSON.stringify(report, null, 2), "utf8");
    report.analysisPath = analysisPath;
    return report;
  } finally {
    await browser.close().catch(() => {});
    if (!options.server) await server.stop().catch(() => {});
  }
}

module.exports = {
  DEFAULT_MOBILE_VIEWPORT,
  DEFAULT_VIEWPORT,
  captureRouteSet,
  collectBrowserEvents,
  ensureDir,
  getFreePort,
  maybeCaptureScreenshot,
  maybeCaptureDomSnapshot,
  normalizeViewports,
  parseCaptureArgs,
  startNodeServer,
  waitForFrameText,
  waitForHttp
};