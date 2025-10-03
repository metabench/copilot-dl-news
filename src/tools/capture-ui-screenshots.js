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
const sharp = require('sharp');
const { findProjectRoot } = require('../utils/project-root');

const MAX_SCREENSHOT_DIMENSION = 3200;

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
const STUDIO_VIEW_NAMES = ['mobile-large-portrait', 'ultrawide-landscape'];
const TOOLING_ROUTES = [
  '/queues/ssr',
  '/analysis/ssr',
  '/milestones/ssr',
  '/problems/ssr',
  '/gazetteer/places'
];
const STUDIO_ROUTES = [
  '/',
  '/queues/ssr',
  '/analysis/ssr',
  '/gazetteer/places',
  '/urls',
  '/domains'
];

const QUICK_ROUTES = [
  '/',
  '/queues/ssr',
  '/gazetteer/places'
];

const QUICK_VIEW_NAMES = ['ultrawide-landscape'];

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
    server,
    shutdown: async () => {
      return new Promise((resolve) => {
        // Force close all connections
        server.closeAllConnections?.();
        server.close(() => {
          resolve();
        });
        // Fallback timeout to ensure we don't hang
        setTimeout(() => resolve(), 1000);
      });
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
  headless,
  darkMode = false,
  routeSlug = null
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
      
      // Enable dark mode if requested
      if (darkMode) {
        await page.evaluate(() => {
          document.documentElement.classList.add('dark');
          // Also trigger theme button if it exists
          const themeBtn = document.getElementById('themeBtn');
          if (themeBtn && !document.documentElement.classList.contains('dark')) {
            themeBtn.click();
          }
        });
        await delay(300); // Allow theme to settle
      }
      
      const slug = viewport.name.replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
      const themeSuffix = darkMode ? '-dark' : '';
      const routePrefix = routeSlug ? `${routeSlug}-` : '';
      const filename = `${routePrefix}${String(index).padStart(2, '0')}-${slug}${themeSuffix}.png`;
      const filePath = path.join(outputDir, filename);
      const screenshotBuffer = await page.screenshot({ fullPage: true });
      const originalMeta = await sharp(screenshotBuffer).metadata();
      let finalBuffer = screenshotBuffer;
      let finalMeta = {
        width: originalMeta.width || viewport.width,
        height: originalMeta.height || viewport.height
      };

      if (
        (finalMeta.width && finalMeta.width > MAX_SCREENSHOT_DIMENSION) ||
        (finalMeta.height && finalMeta.height > MAX_SCREENSHOT_DIMENSION)
      ) {
        finalBuffer = await sharp(screenshotBuffer)
          .resize({
            width: MAX_SCREENSHOT_DIMENSION,
            height: MAX_SCREENSHOT_DIMENSION,
            fit: 'inside',
            withoutEnlargement: true
          })
          .png()
          .toBuffer();

        const resizedMeta = await sharp(finalBuffer).metadata();
        if (resizedMeta.width && resizedMeta.height) {
          finalMeta = {
            width: resizedMeta.width,
            height: resizedMeta.height
          };
        }

        console.warn(
          `[capture-ui-screenshots] Resized ${filename} from ${originalMeta.width || 'unknown'}x${originalMeta.height || 'unknown'} to ${finalMeta.width || 'unknown'}x${finalMeta.height || 'unknown'}`
        );
      }

      await fs.promises.writeFile(filePath, finalBuffer);
      metadata.push({
        name: viewport.name,
        width: finalMeta.width,
        height: finalMeta.height,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        deviceScaleFactor: viewport.deviceScaleFactor || 1,
        isMobile: toBoolean(viewport.isMobile, false),
        hasTouch: toBoolean(viewport.hasTouch, false),
        darkMode,
        file: path.relative(findProjectRoot(__dirname), filePath)
      });
      await page.close();
    }
  } catch (error) {
    console.error('[capture-ui-screenshots] Error during capture:', error);
    throw error;
  } finally {
    await browser.close();
  }
  return metadata;
}

async function main() {
  const restoreLogFilter = installDuplicateLogFilter();
  let serverControl = null;
  
  try {
    const repoRoot = findProjectRoot(__dirname);
    const outputRoot = getArg('output', path.join(repoRoot, 'screenshots', 'crawler'));
    const runLabel = getArg('label', new Date().toISOString().replace(/[:.]/g, '-'));
    const waitMs = Number(getArg('waitMs', DEFAULT_WAIT_MS));
    const timeoutMs = Number(getArg('timeoutMs', DEFAULT_TIMEOUT_MS));
    const baseUrl = getArg('url', null);
    const routePathArg = getArg('path', '/');
    const pathsArg = toList(getAllArgs('paths'));
    const toolingMode = toBoolean(getArg('tooling', null), false);
    const studioMode = toBoolean(getArg('studio', null), false);
    const quickMode = toBoolean(getArg('quick', null), false);
    const viewsArg = toList(getAllArgs('views'));
    const headless = getArg('headless', 'new');
    const darkThemePages = toBoolean(getArg('dark', null), false); // Only enabled explicitly, not by default
    const separateDirs = toBoolean(getArg('separate-dirs', null), false); // By default, all screenshots in one directory

    let targetPaths = [];
    if (quickMode) {
      targetPaths = [...QUICK_ROUTES];
    } else if (studioMode) {
      targetPaths = [...STUDIO_ROUTES];
    } else if (toolingMode) {
      targetPaths = [...TOOLING_ROUTES];
    } else if (pathsArg.length) {
      targetPaths = pathsArg;
    }
    if (!targetPaths.length) {
      targetPaths = [routePathArg];
    }
    targetPaths = targetPaths.map(normaliseRoutePath);

    let desiredViewNames = viewsArg;
    if (!desiredViewNames.length && quickMode) {
      desiredViewNames = [...QUICK_VIEW_NAMES];
    } else if (!desiredViewNames.length && studioMode) {
      desiredViewNames = [...STUDIO_VIEW_NAMES];
    } else if (!desiredViewNames.length && toolingMode) {
      desiredViewNames = [...TOOLING_VIEW_NAMES];
    }
    
    const viewports = selectViewportsByName(desiredViewNames);
    const runDir = path.join(outputRoot, runLabel);
    await ensureDir(runDir);

    console.log(`[capture-ui-screenshots] Starting capture run`);
    console.log(`  Routes: ${targetPaths.length} (${targetPaths.join(', ')})`);
    console.log(`  Viewports: ${viewports.length} (${viewports.map(v => v.name).join(', ')})`);
    console.log(`  Dark theme: ${darkThemePages ? 'enabled' : 'disabled'}`);
    console.log(`  Separate dirs: ${separateDirs ? 'yes' : 'no (all in one directory)'}`);
    console.log(`  Output: ${path.relative(repoRoot, runDir)}`);

    serverControl = await launchServerIfNeeded(baseUrl);
    const pages = [];

    for (let routeIndex = 0; routeIndex < targetPaths.length; routeIndex++) {
      const routePath = targetPaths[routeIndex];
      const targetUrl = new URL(routePath, serverControl.baseUrl).toString();
      const pageSlug = slugifyPath(routePath);
      
      // Use separate directories per page only if --separate-dirs is specified
      const pageDir = separateDirs ? path.join(runDir, pageSlug) : runDir;
      await ensureDir(pageDir);

      console.log(`[capture-ui-screenshots] [${routeIndex + 1}/${targetPaths.length}] Capturing ${routePath}...`);

      // Capture light mode
      const lightMetadata = await captureScreenshots({
        url: targetUrl,
        viewports,
        outputDir: pageDir,
        waitMs,
        timeoutMs,
        headless,
        darkMode: false,
        routeSlug: separateDirs ? null : pageSlug // Add route slug to filename if all in one dir
      });

      const allMetadata = [...lightMetadata];

      // Capture dark mode for selected pages (only index and one tooling page in studio mode)
      if (darkThemePages) {
        const shouldCaptureDark = quickMode ? (routePath === '/') : (studioMode ? (routePath === '/' || routePath === '/queues/ssr') : true);
        
        if (shouldCaptureDark) {
          console.log(`[capture-ui-screenshots]   → Capturing dark theme variant...`);
          const darkMetadata = await captureScreenshots({
            url: targetUrl,
            viewports,
            outputDir: pageDir,
            waitMs,
            timeoutMs,
            headless,
            darkMode: true,
            routeSlug: separateDirs ? null : pageSlug
          });
          allMetadata.push(...darkMetadata);
        }
      }

      const relativeDir = path.relative(repoRoot, pageDir) || pageDir;
      console.log(`[capture-ui-screenshots]   ✓ ${routePath} → ${relativeDir} (${allMetadata.length} screenshots)`);

      pages.push({
        route: routePath,
        targetUrl,
        outputDir: relativeDir,
        viewports: allMetadata
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
      darkTheme: darkThemePages,
      pages
    };

    if (pages.length === 1) {
      manifest.targetUrl = pages[0].targetUrl;
      manifest.viewports = pages[0].viewports;
    }

    await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    console.log(`[capture-ui-screenshots] ✓ Complete! Saved ${pages.length} pages to ${path.relative(repoRoot, runDir)}`);
    
  } catch (err) {
    console.error('[capture-ui-screenshots] Failed:', err?.stack || err?.message || err);
    throw err;
  } finally {
    if (serverControl) {
      try {
        await serverControl.shutdown();
        console.log('[capture-ui-screenshots] Server shut down cleanly');
      } catch (shutdownErr) {
        console.error('[capture-ui-screenshots] Error during shutdown:', shutdownErr);
      }
    }
    restoreLogFilter();
  }
}

if (require.main === module) {
  // Set a hard timeout to prevent hanging
  const hardTimeout = setTimeout(() => {
    console.error('[capture-ui-screenshots] Hard timeout reached, forcing exit...');
    process.exit(1);
  }, 180000); // 3 minutes max
  
  hardTimeout.unref(); // Allow process to exit naturally if complete
  
  main()
    .then(() => {
      clearTimeout(hardTimeout);
      console.log('[capture-ui-screenshots] Process complete, exiting...');
      // Give a moment for cleanup, then force exit
      setTimeout(() => {
        process.exit(0);
      }, 500);
    })
    .catch((err) => {
      clearTimeout(hardTimeout);
      console.error('[capture-ui-screenshots] Fatal error:', err?.stack || err?.message || err);
      setTimeout(() => {
        process.exit(1);
      }, 500);
    });
}

module.exports = {
  VIEWPORT_PRESETS,
  captureScreenshots,
  launchServerIfNeeded
};
