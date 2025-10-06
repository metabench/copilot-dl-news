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

const { is_array, tof } = require('lang-tools');

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

    const message = args.map((arg) => (tof(arg) === 'string' ? arg : String(arg))).join(' ');
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
    name: 'desktop-wxga-landscape',
    width: 1366,
    height: 768,
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
const WXGA_VIEW_NAMES = ['desktop-wxga-landscape'];
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

const WXGA_ROUTES = Array.from(new Set([
  ...STUDIO_ROUTES,
  ...TOOLING_ROUTES,
  '/domain',
  '/coverage-dashboard',
  '/priority-config',
  '/queues',
  '/analysis',
  '/gazetteer'
]));

const ALL_ROUTES = Array.from(new Set([
  ...WXGA_ROUTES,
  '/',
  '/errors',
  '/milestones/ssr',
  '/problems/ssr',
  '/analysis',
  '/analysis/ssr',
  '/queues',
  '/queues/ssr',
  '/gazetteer',
  '/gazetteer/places',
  '/coverage-dashboard',
  '/priority-config',
  '/domains',
  '/domain',
  '/urls'
]));

const QUICK_ROUTES = [
  '/',
  '/queues/ssr',
  '/gazetteer/places'
];

const QUICK_VIEW_NAMES = ['ultrawide-landscape'];

const PRESETS = [
  {
    name: 'quick',
    description: 'Quick smoke set (/, /queues/ssr, /gazetteer/places) with focused viewport mix; light + targeted dark.',
    routes: QUICK_ROUTES,
    viewNames: QUICK_VIEW_NAMES,
    applies: { legacyFlag: 'quick', dark: true, darkRoutes: ['/'] }
  },
  {
    name: 'studio',
    description: 'Studio review bundle (/, /queues/ssr, /analysis/ssr, /gazetteer/places, /urls, /domains) with mobile + ultrawide views.',
    routes: STUDIO_ROUTES,
    viewNames: STUDIO_VIEW_NAMES,
    applies: { legacyFlag: 'studio', dark: true, darkRoutes: ['/', '/queues/ssr'] }
  },
  {
    name: 'tooling',
    description: 'Tooling surfaces (queues, analysis, milestones, problems, gazetteer places) on mobile + ultrawide.',
    routes: TOOLING_ROUTES,
    viewNames: TOOLING_VIEW_NAMES,
    applies: { legacyFlag: 'tooling', dark: true }
  },
  {
    name: 'wxga-all',
    description: 'WXGA coverage across studio + tooling routes (light + dark). Equivalent to --wxga.',
    routes: WXGA_ROUTES,
    viewNames: WXGA_VIEW_NAMES,
    applies: { legacyFlag: 'wxga', aliases: ['wxga'], dark: true }
  },
  {
    name: 'all',
    description: 'Full crawler surface sweep (all known routes) using default viewport mix with light + dark.',
    routes: ALL_ROUTES,
    viewNames: [],
    applies: { legacyFlag: 'all', dark: true }
  },
  {
    name: 'wxga-light-gazetteer',
    description: 'Front page, Gazetteer summary + places + GB country view, and Domains at WXGA (light only, 5 shots).',
    routes: ['/', '/gazetteer', '/gazetteer/places', '/gazetteer/country/GB', '/domains'],
    viewNames: WXGA_VIEW_NAMES,
    applies: { dark: false, darkOnly: false }
  }
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
  if (is_array(value)) {
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

function resolvePreset(name) {
  if (!name) return null;
  const lowered = String(name).trim().toLowerCase();
  return (
    PRESETS.find((preset) => {
      if (preset.name.toLowerCase() === lowered) return true;
      const aliases = preset.applies?.aliases || [];
      if (aliases.some((alias) => alias.toLowerCase() === lowered)) return true;
      const legacy = preset.applies?.legacyFlag;
      return legacy && legacy.toLowerCase() === lowered;
    }) || null
  );
}

function formatPresetHelp(preset) {
  const views = preset.viewNames && preset.viewNames.length ? preset.viewNames.join(', ') : 'default mix';
  const routes = preset.routes.length;
  return `  ${preset.name.padEnd(24)} ${preset.description} (routes: ${routes}, views: ${views})`;
}

function printHelp() {
  const usage = `Usage: node src/tools/capture-ui-screenshots.js [options]\n\n`;
  const options = [
    'Options:',
    '  --preset=<name>           Use a named preset (see list below).',
    '  --paths=/path             Extra routes to capture (repeatable or comma-separated).',
    '  --views=name              Limit to specific viewport presets (repeatable).',
    '  --dark                    Capture dark-theme variants as well as light.',
    '  --dark-only               Capture dark theme only (implies --dark).',
    '  --separate-dirs           Save each route in its own directory.',
    '  --threads=<n>             Concurrency for captures (default 10).',
    '  --output=<dir>            Destination root (default screenshots/crawler).',
    '  --label=<name>            Folder label (defaults to timestamp).',
    '  --help                    Show this message.\n'
  ].join('\n');

  const presetLines = PRESETS.map(formatPresetHelp).join('\n');
  console.log(`${usage}${options}Presets:\n${presetLines}\n`);
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
  if (tof(value) === 'boolean') return value;
  const normalised = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalised)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalised)) return false;
  return fallback;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normaliseThreads(value, fallback = 10) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.min(Math.max(Math.floor(numeric), 1), 32);
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
  const port = (address && tof(address) === 'object') ? address.port : Number(env.PORT || 0);
  const resolvedPort = port || (address && tof(address) === 'number' ? address : null);
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

async function runWithConcurrency(items, handler, concurrency) {
  if (!is_array(items) || !items.length) return [];
  const limit = Math.max(1, Math.min(concurrency || 1, items.length));
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      if (cursor >= items.length) return;
      const index = cursor++;
      results[index] = await handler(items[index], index);
    }
  }

  const workers = Array.from({ length: limit }, () => worker());
  await Promise.all(workers);
  return results;
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

      const target = new URL(url);
      if (darkMode) {
        target.hash = 'theme_name=dark';
      } else if (target.hash === '#theme_name=dark') {
        target.hash = '';
      }

      await page.goto(target.toString(), {
        waitUntil: ['domcontentloaded', 'networkidle2'],
        timeout: timeoutMs
      });
      
      if (waitMs > 0) {
        await delay(waitMs);
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
    const helpRequested = process.argv.includes('--help') || process.argv.includes('-h');
    const presetName = getArg('preset', null);
    const preset = resolvePreset(presetName);
    if (presetName && !preset) {
      throw new Error(`Unknown preset "${presetName}". Run with --help to see available presets.`);
    }

    const repoRoot = findProjectRoot(__dirname);
    if (helpRequested) {
      printHelp();
      return;
    }
    const outputRoot = getArg('output', path.join(repoRoot, 'screenshots', 'crawler'));
    const runLabel = getArg('label', new Date().toISOString().replace(/[:.]/g, '-'));
    const waitMs = Number(getArg('waitMs', DEFAULT_WAIT_MS));
    const timeoutMs = Number(getArg('timeoutMs', DEFAULT_TIMEOUT_MS));
  const baseUrl = getArg('url', null);
  const routePathArg = getArg('path', '/');
  const pathsArg = toList(getAllArgs('paths'));
  let wxgaMode = toBoolean(getArg('wxga', null), false);
  let allMode = toBoolean(getArg('all', null), false);
    let toolingMode = toBoolean(getArg('tooling', null), false);
    let studioMode = toBoolean(getArg('studio', null), false);
    let quickMode = toBoolean(getArg('quick', null), false);
    const viewsArg = toList(getAllArgs('views'));
    const headless = getArg('headless', 'new');
  let darkOnly = toBoolean(getArg('dark-only', null), false);
  let darkThemePages = darkOnly ? true : toBoolean(getArg('dark', null), false); // Only enabled explicitly, not by default
    let separateDirs = toBoolean(getArg('separate-dirs', null), false); // By default, all screenshots in one directory
  const threadsArg = getArg('threads', 10);
  let threads = normaliseThreads(threadsArg, 10);

    if (preset?.applies?.legacyFlag) {
      switch (preset.applies.legacyFlag) {
        case 'wxga':
          wxgaMode = true;
          break;
        case 'all':
          allMode = true;
          break;
        case 'tooling':
          toolingMode = true;
          break;
        case 'studio':
          studioMode = true;
          break;
        case 'quick':
          quickMode = true;
          break;
        default:
          break;
      }
    }

    if (typeof preset?.applies?.dark === 'boolean') {
      darkThemePages = preset.applies.dark;
      if (!darkThemePages) {
        darkOnly = false;
      }
    }

    if (typeof preset?.applies?.darkOnly === 'boolean') {
      darkOnly = preset.applies.darkOnly;
      if (darkOnly) {
        darkThemePages = true;
      }
    }

    if (typeof preset?.applies?.separateDirs === 'boolean') {
      separateDirs = preset.applies.separateDirs;
    }

    if (typeof preset?.applies?.threads === 'number') {
      threads = normaliseThreads(preset.applies.threads, threads);
    }

    let targetPaths = [];
    if (preset?.routes?.length) {
      targetPaths = [...preset.routes];
    } else if (allMode) {
      targetPaths = [...ALL_ROUTES];
    } else if (wxgaMode) {
      targetPaths = [...WXGA_ROUTES];
    } else if (quickMode) {
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
    if (!desiredViewNames.length && preset?.viewNames?.length) {
      desiredViewNames = [...preset.viewNames];
    } else if (!desiredViewNames.length && wxgaMode) {
      desiredViewNames = [...WXGA_VIEW_NAMES];
    } else if (!desiredViewNames.length && quickMode) {
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
    if (preset) {
      console.log(`  Preset: ${preset.name}`);
    }
  console.log(`  Routes: ${targetPaths.length} (${targetPaths.join(', ')})`);
    console.log(`  Viewports: ${viewports.length} (${viewports.map(v => v.name).join(', ')})`);
    console.log(`  Dark theme: ${darkThemePages ? 'enabled' : 'disabled'}`);
    console.log(`  Separate dirs: ${separateDirs ? 'yes' : 'no (all in one directory)'}`);
  console.log(`  Threads: ${threads}`);
    console.log(`  Output: ${path.relative(repoRoot, runDir)}`);

    serverControl = await launchServerIfNeeded(baseUrl);
    const routeDescriptors = targetPaths.map((routePath, index) => ({ routePath, index }));
    const presetDarkRoutes = is_array(preset?.applies?.darkRoutes)
      ? new Set(preset.applies.darkRoutes.map(normaliseRoutePath))
      : null;

    const pagesResults = await runWithConcurrency(routeDescriptors, async ({ routePath, index }) => {
      const targetUrl = new URL(routePath, serverControl.baseUrl).toString();
      const pageSlug = slugifyPath(routePath);
      const pageDir = separateDirs ? path.join(runDir, pageSlug) : runDir;
      await ensureDir(pageDir);

      console.log(`[capture-ui-screenshots] [${index + 1}/${targetPaths.length}] Capturing ${routePath}...`);

      const allMetadata = [];

      if (!darkOnly) {
        const lightMetadata = await captureScreenshots({
          url: targetUrl,
          viewports,
          outputDir: pageDir,
          waitMs,
          timeoutMs,
          headless,
          darkMode: false,
          routeSlug: separateDirs ? null : pageSlug
        });

        allMetadata.push(...lightMetadata);
      } else {
        console.log(`[capture-ui-screenshots]   → Skipping light capture for ${routePath} (dark-only mode)`);
      }
      if (darkThemePages) {
        const shouldCaptureDark = darkOnly
          ? true
          : (presetDarkRoutes
              ? presetDarkRoutes.has(routePath)
              : (quickMode
                  ? routePath === '/'
                  : (studioMode
                      ? (routePath === '/' || routePath === '/queues/ssr')
                      : true)));

        if (shouldCaptureDark) {
          console.log(`[capture-ui-screenshots]   → Capturing dark theme variant for ${routePath}...`);
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
        } else {
          console.log(`[capture-ui-screenshots]   → Dark theme skipped for ${routePath}`);
        }
      }

      const relativeDir = path.relative(repoRoot, pageDir) || pageDir;
      console.log(`[capture-ui-screenshots]   ✓ ${routePath} → ${relativeDir} (${allMetadata.length} screenshots)`);

      return {
        route: routePath,
        targetUrl,
        outputDir: relativeDir,
        viewports: allMetadata
      };
    }, threads);

    const pages = pagesResults.filter(Boolean);

    const manifestPath = path.join(runDir, 'metadata.json');
    const manifest = {
      generatedAt: new Date().toISOString(),
      waitMs,
      timeoutMs,
      headless,
      baseUrl: serverControl.baseUrl,
  viewFilter: desiredViewNames,
  darkTheme: darkThemePages,
  darkOnly,
  wxgaMode,
  allMode,
  threads,
      pages,
      preset: preset ? preset.name : null
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
