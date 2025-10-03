#!/usr/bin/env node

/*
  capture-ui-screenshots.js
  ---------------------------------
  Launches the Express crawler UI server (unless --url provided),
  opens the crawler dashboard in Puppeteer, and captures screenshots
  across a curated set of viewport sizes ranging from small phones to
  ultra-wide monitors. Images and metadata are stored under
  screenshots/crawler/<timestamp>/ for later review by agents.
*/

const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const { findProjectRoot } = require('../utils/project-root');

function installDuplicateLogFilter({ prefixes = ['[server]', '[sse]'], windowMs = 32 } = {}) {
  const originalLog = console.log.bind(console);
  let lastMessage = null;
  let lastTimestamp = 0;

  console.log = (...args) => {
    if (!args.length) {
      originalLog();
      return;
    }

    const message = args.map((arg) => (typeof arg === 'string' ? arg : String(arg))).join(' ');
    const matchesPrefix = prefixes.some((prefix) => message.startsWith(prefix));

    if (matchesPrefix) {
      const now = Date.now();
      if (message === lastMessage && (now - lastTimestamp) <= windowMs) {
        lastTimestamp = now;
        return;
      }
      lastMessage = message;
      lastTimestamp = now;
    } else {
      lastMessage = null;
      lastTimestamp = 0;
    }

    originalLog(...args);
  };

  return () => {
    console.log = originalLog;
  };
}

const { startServer } = require('../ui/express/server.js');

const DEFAULT_WAIT_MS = 2000;
const DEFAULT_TIMEOUT_MS = 30000;
const VIEWPORT_PRESETS = [
  {
    name: 'mobile-small-portrait',
    width: 360,
    height: 780,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  },
  {
    name: 'mobile-small-landscape',
    width: 780,
    height: 360,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  },
  {
    name: 'mobile-large-portrait',
    width: 414,
    height: 896,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  },
  {
    name: 'mobile-large-landscape',
    width: 896,
    height: 414,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  },
  {
    name: 'tablet-portrait',
    width: 1024,
    height: 1366,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  },
  {
    name: 'tablet-landscape',
    width: 1366,
    height: 1024,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  },
  {
    name: 'laptop-landscape',
    width: 1440,
    height: 900,
    deviceScaleFactor: 1
  },
  {
    name: 'desktop-fullhd-landscape',
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1
  },
  {
    name: 'desktop-large-portrait',
    width: 1440,
    height: 2560,
    deviceScaleFactor: 1
  },
  {
    name: 'desktop-uhd-landscape',
    width: 2560,
    height: 1440,
    deviceScaleFactor: 1
  },
  {
    name: 'ultrawide-landscape',
    width: 3440,
    height: 1440,
    deviceScaleFactor: 1
  }
];

const TOOLING_VIEW_NAMES = ['mobile-large-portrait', 'ultrawide-landscape'];
const TOOLING_ROUTES = [
  '/queues/ssr',
  '/analysis/ssr',
  '/milestones/ssr',
  '/problems/ssr',
  '/gazetteer/places'
];

function getArg(name, fallback = null) {
  const prefix = `--${name}`;
  const raw = process.argv.find((entry) => entry === prefix || entry.startsWith(`${prefix}=`));
  if (!raw) return fallback;
  if (raw === prefix) return true;
  const [, value] = raw.split('=');
  if (value === undefined) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? value : numeric;
}

function getAllArgs(name) {
  const prefix = `--${name}`;
  return process.argv
    .filter((entry) => entry === prefix || entry.startsWith(`${prefix}=`))
    .map((entry) => {
      if (entry === prefix) return true;
      const [, value] = entry.split('=');
      return value === undefined ? true : value;
    });
}

function toList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => toList(entry));
  }
  if (value === true) return [];
  return String(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function uniqueLowercase(list) {
  const seen = new Set();
  const result = [];
  for (const item of list) {
    const lowered = item.toLowerCase();
    if (seen.has(lowered)) continue;
    seen.add(lowered);
    result.push(lowered);
  }
  return result;
}

function selectViewportsByName(names) {
  if (!names.length) return VIEWPORT_PRESETS;
  const presetsByName = new Map(VIEWPORT_PRESETS.map((preset) => [preset.name.toLowerCase(), preset]));
  const missing = [];
  const selected = [];

  for (const name of uniqueLowercase(names)) {
    const preset = presetsByName.get(name);
    if (!preset) {
      missing.push(name);
      continue;
    }
    selected.push(preset);
  }

  if (!selected.length) {
    throw new Error(`No matching viewports for names: ${names.join(', ')}`);
  }

  if (missing.length) {
    console.warn(`[capture-ui-screenshots] Unknown view names ignored: ${missing.join(', ')}`);
  }

  return selected;
}

function normaliseRoutePath(routePath) {
  if (!routePath) return '/';
  const trimmed = routePath.trim();
  if (!trimmed) return '/';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const url = new URL(trimmed);
    return url.pathname + (url.search || '');
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function slugifyPath(value) {
  const safe = value && value !== '/' ? value : 'root';
  return safe
    .replace(/https?:\/\//gi, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'root';
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  const normalised = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalised)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalised)) return false;
  return fallback;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function launchServerIfNeeded(baseUrl) {
  if (baseUrl) {
    return {
      baseUrl,
      shutdown: async () => {}
    };
  }

  // Ensure we only mutate a copy of the environment for the child app
  const env = {
    ...process.env,
    UI_TEST_QUIET: '1',
    UI_FAST_START: process.env.UI_FAST_START || '1',
    UI_VERBOSE: '0',
    PORT: process.env.PORT || '0'
  };

  const server = startServer({
    env,
    requestTiming: false,
    watchPriorityConfig: false,
    verbose: false
  });
  await new Promise((resolve, reject) => {
    const handleListening = () => {
      server.removeListener('error', handleError);
      resolve();
    };
    const handleError = (err) => {
      if (err && (err.code === 'EADDRINUSE' || err.code === 'EACCES')) {
        // Port will be retried by the server helper; keep waiting.
        return;
      }
      server.removeListener('listening', handleListening);
      reject(err);
    };
    server.once('listening', handleListening);
    server.on('error', handleError);
  });
  const address = server.address();
  const port = (address && typeof address === 'object') ? address.port : Number(env.PORT || 0);
  const resolvedPort = port || (address && typeof address === 'number' ? address : null);
  if (!resolvedPort) {
    throw new Error('Unable to determine port for screenshot server');
  }
  const resolvedUrl = `http://localhost:${resolvedPort}`;

  return {
    baseUrl: resolvedUrl,
    shutdown: async () => {
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function captureScreenshots({
  url,
  viewports,
  outputDir,
  waitMs,
  timeoutMs,
  headless
}) {
  const metadata = [];
  const browser = await puppeteer.launch({
    headless,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  try {
    let index = 0;
    for (const viewport of viewports) {
      index += 1;
      const page = await browser.newPage();
      await page.setViewport({
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: viewport.deviceScaleFactor || 1,
        isMobile: toBoolean(viewport.isMobile, false),
        hasTouch: toBoolean(viewport.hasTouch, false)
      });

      await page.goto(url, {
        waitUntil: ['domcontentloaded', 'networkidle2'],
        timeout: timeoutMs
      });
      if (waitMs > 0) {
          await delay(waitMs);
      }
      const slug = viewport.name.replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
      const filename = `${String(index).padStart(2, '0')}-${slug}.png`;
      const filePath = path.join(outputDir, filename);
      await page.screenshot({ path: filePath, fullPage: true });
      metadata.push({
        name: viewport.name,
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: viewport.deviceScaleFactor || 1,
        isMobile: toBoolean(viewport.isMobile, false),
        hasTouch: toBoolean(viewport.hasTouch, false),
        file: path.relative(findProjectRoot(__dirname), filePath)
      });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return metadata;
}

async function main() {
  const restoreLogFilter = installDuplicateLogFilter();
  const repoRoot = findProjectRoot(__dirname);
  const outputRoot = getArg('output', path.join(repoRoot, 'screenshots', 'crawler'));
  const runLabel = getArg('label', new Date().toISOString().replace(/[:.]/g, '-'));
  const waitMs = Number(getArg('waitMs', DEFAULT_WAIT_MS));
  const timeoutMs = Number(getArg('timeoutMs', DEFAULT_TIMEOUT_MS));
  const baseUrl = getArg('url', null);
  const routePathArg = getArg('path', '/');
  const pathsArg = toList(getAllArgs('paths'));
  const toolingMode = toBoolean(getArg('tooling', null), false);
  const viewsArg = toList(getAllArgs('views'));
  const headless = getArg('headless', 'new');

  let targetPaths = [];
  if (toolingMode) {
    targetPaths = [...TOOLING_ROUTES];
  } else if (pathsArg.length) {
    targetPaths = pathsArg;
  }
  if (!targetPaths.length) {
    targetPaths = [routePathArg];
  }
  targetPaths = targetPaths.map(normaliseRoutePath);

  let desiredViewNames = viewsArg;
  if (!desiredViewNames.length && toolingMode) {
    desiredViewNames = [...TOOLING_VIEW_NAMES];
  }
  const viewports = selectViewportsByName(desiredViewNames);

  const runDir = path.join(outputRoot, runLabel);
  await ensureDir(runDir);

  let serverControl;
  try {
    serverControl = await launchServerIfNeeded(baseUrl);
    const pages = [];

    for (const routePath of targetPaths) {
      const targetUrl = new URL(routePath, serverControl.baseUrl).toString();
      const pageSlug = slugifyPath(routePath);
      const pageDir = path.join(runDir, pageSlug);
      await ensureDir(pageDir);

      const metadata = await captureScreenshots({
        url: targetUrl,
        viewports,
        outputDir: pageDir,
        waitMs,
        timeoutMs,
        headless
      });

      const relativeDir = path.relative(repoRoot, pageDir) || pageDir;
      console.log(`[capture-ui-screenshots] ${routePath} → ${relativeDir} (${metadata.length} views)`);
      for (const entry of metadata) {
        console.log(`   - ${entry.name}: ${entry.file} (${entry.width}x${entry.height})`);
      }

      pages.push({
        route: routePath,
        targetUrl,
        outputDir: relativeDir,
        viewports: metadata
      });
    }

    const manifestPath = path.join(runDir, 'metadata.json');
    const manifest = {
      generatedAt: new Date().toISOString(),
      waitMs,
      timeoutMs,
      headless,
      baseUrl: serverControl.baseUrl,
      viewFilter: desiredViewNames,
      pages
    };

    if (pages.length === 1) {
      manifest.targetUrl = pages[0].targetUrl;
      manifest.viewports = pages[0].viewports;
    }

    await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    console.log(`[capture-ui-screenshots] Saved screenshots run to ${path.relative(repoRoot, runDir)}`);
  } finally {
    if (serverControl) {
      await serverControl.shutdown();
    }
    restoreLogFilter();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[capture-ui-screenshots] Failed:', err?.stack || err?.message || err);
    process.exitCode = 1;
  });
}

module.exports = {
  VIEWPORT_PRESETS,
  captureScreenshots,
  launchServerIfNeeded
};
