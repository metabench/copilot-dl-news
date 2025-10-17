#!/usr/bin/env node

'use strict';

const path = require('path');
const fs = require('fs');
const { findProjectRoot } = require('../utils/project-root');
const { ensureDb } = require('../db/sqlite/ensureDb');
const { SQLiteNewsDatabase } = require('../db/sqlite');
const { CountryHubGapAnalyzer } = require('../services/CountryHubGapAnalyzer');
const { RegionHubGapAnalyzer } = require('../services/RegionHubGapAnalyzer');
const { CityHubGapAnalyzer } = require('../services/CityHubGapAnalyzer');
const { slugify } = require('./slugify');

const fetchImpl = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const DAY_MS = 24 * 60 * 60 * 1000;

function defaultLogger() {
  return {
    info: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console)
  };
}

function toNumber(value, fallback = null) {
  if (value == null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseCsv(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function parseCliArgs(rawArgs) {
  const options = {
    domain: null,
    dbPath: null,
    kinds: ['country'],
    limit: null,
    patternsPerPlace: 3,
    apply: false,
    maxAgeDays: 7,
    refresh404Days: 180,
    retry4xxDays: 7,
    verbose: false,
    help: false,
    scheme: 'https'
  };

  for (let i = 0; i < rawArgs.length; i += 1) {
    const token = rawArgs[i];
    if (!token) continue;

    if (token === '--help' || token === '-h') {
      options.help = true;
      continue;
    }
    if (token === '--apply') {
      options.apply = true;
      continue;
    }
    if (token === '--dry-run') {
      options.apply = false;
      continue;
    }
    if (token === '--verbose') {
      options.verbose = true;
      continue;
    }
    if (token === '--http') {
      options.scheme = 'http';
      continue;
    }

    if (!token.startsWith('-')) {
      options.domain = token;
      continue;
    }

    const eq = token.indexOf('=');
    const key = eq === -1 ? token : token.slice(0, eq);
    let value = eq === -1 ? null : token.slice(eq + 1);
    if (value === null && rawArgs[i + 1] && !rawArgs[i + 1].startsWith('-')) {
      value = rawArgs[i + 1];
      i += 1;
    }

    switch (key) {
      case '--domain':
        options.domain = value;
        break;
      case '--db':
      case '--db-path':
        options.dbPath = value;
        break;
      case '--limit':
        options.limit = toNumber(value, null);
        break;
      case '--patterns-per-place':
        options.patternsPerPlace = Math.max(1, toNumber(value, 3) || 3);
        break;
      case '--kinds':
        options.kinds = parseCsv(value);
        break;
      case '--max-age-days':
        options.maxAgeDays = Math.max(0, toNumber(value, options.maxAgeDays) || options.maxAgeDays);
        break;
      case '--refresh-404-days':
        options.refresh404Days = Math.max(0, toNumber(value, options.refresh404Days) || options.refresh404Days);
        break;
      case '--retry-4xx-days':
        options.retry4xxDays = Math.max(0, toNumber(value, options.retry4xxDays) || options.retry4xxDays);
        break;
      case '--scheme':
        options.scheme = (value || 'https').toLowerCase();
        break;
      default:
        break;
    }
  }

  if (!options.domain && process.env.GPH_DOMAIN) {
    options.domain = process.env.GPH_DOMAIN;
  }

  if (!options.kinds || options.kinds.length === 0) {
    options.kinds = ['country'];
  }

  options.kinds = Array.from(new Set(options.kinds.map((kind) => kind.toLowerCase())));

  return options;
}

function printUsage() {
  const usage = `guess-place-hubs - predict candidate place hubs and verify them\n\n` +
    `Usage: node src/tools/guess-place-hubs.js [options] <domain>\n\n` +
    `Options:\n` +
    `  --domain <domain>           Domain or host to inspect (positional arg supported)\n` +
    `  --db <path>                Path to SQLite database (defaults to data/news.db)\n` +
  `  --kinds <csv>              Place kinds to consider (country, region, city)\n` +
    `  --limit <n>                Limit number of places to evaluate\n` +
    `  --patterns-per-place <n>   Maximum URL patterns to test per place (default 3)\n` +
    `  --max-age-days <n>         Skip re-fetch when success newer than N days (default 7)\n` +
    `  --refresh-404-days <n>     Skip re-fetching known 404s newer than N days (default 180)\n` +
  `  --retry-4xx-days <n>       Skip retrying other 4xx statuses newer than N days (default 7)\n` +
    `  --apply                    Persist confirmed hubs to place_hubs table\n` +
    `  --http                     Use http scheme instead of https\n` +
    `  --scheme <scheme>          Override URL scheme (http or https)\n` +
    `  --verbose                  Enable verbose logging\n` +
    `  --help                     Show this help message\n\n` +
    `Notes:\n` +
    `  • Fetch metadata is always cached so that future runs can skip known results.\n` +
  `  • Use --apply to persist successful hubs to place_hubs (otherwise dry-run for hubs).\n` +
  `  • Region and city heuristics fall back to generic patterns unless DSPL entries exist.\n`;
  console.log(usage);
}

function resolveDbPath(dbPath) {
  if (dbPath) {
    return path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath);
  }
  const root = findProjectRoot(__dirname);
  return path.join(root, 'data', 'news.db');
}

function normalizeDomain(input, scheme = 'https') {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  if (trimmed.includes('://')) {
    const parsed = new URL(trimmed);
    return {
      host: parsed.hostname.toLowerCase(),
      scheme: parsed.protocol.replace(':', ''),
      base: `${parsed.protocol}//${parsed.host}`
    };
  }
  const cleanScheme = scheme === 'http' ? 'http' : 'https';
  return {
    host: trimmed.toLowerCase(),
    scheme: cleanScheme,
    base: `${cleanScheme}://${trimmed.toLowerCase()}`
  };
}

function extractTitle(html) {
  if (!html) return null;
  const match = String(html).match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!match) return null;
  return match[1].trim().replace(/\s+/g, ' ').slice(0, 300);
}

function applyScheme(url, targetScheme) {
  if (!url) return url;
  if (!targetScheme || targetScheme === 'https') return url;
  return url.replace(/^https:\/\//i, `${targetScheme}://`);
}

function computeAgeMs(row, nowUtcMs) {
  if (!row) return Number.POSITIVE_INFINITY;
  const ts = row.fetched_at || row.request_started_at;
  if (!ts) return Number.POSITIVE_INFINITY;
  const time = new Date(ts).getTime();
  if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY;
  return nowUtcMs - time;
}

function buildEvidence(place, patternSource, status, extra = {}) {
  return JSON.stringify({
    source: 'guess-place-hubs',
    patternSource,
    status,
    place,
    ...extra
  });
}

async function fetchUrl(url, fetchFn, { logger, timeoutMs = 15000, method = 'GET' } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    try { controller.abort(); } catch (_) {}
  }, timeoutMs);
  const started = Date.now();
  const requestStartedIso = new Date(started).toISOString();
  const requestMethod = typeof method === 'string' && method.trim()
    ? method.trim().toUpperCase()
    : 'GET';

  try {
    const response = await fetchFn(url, {
      signal: controller.signal,
      method: requestMethod,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GuessPlaceHubs/1.0)',
        'Accept': 'text/html,application/xhtml+xml'
      },
      redirect: 'follow'
    });
    const finished = Date.now();
    clearTimeout(timeout);
    const finalUrl = response.url || url;
    let body = '';
    let bytesDownloaded = 0;
    if (requestMethod !== 'HEAD') {
      try {
        body = await response.text();
        bytesDownloaded = Buffer.byteLength(body, 'utf8');
      } catch (err) {
        logger?.warn?.(`[guess-place-hubs] Failed to read body for ${finalUrl}: ${err.message || err}`);
      }
    }
    const headers = response.headers || { get: () => null };
    const contentType = headers.get ? headers.get('content-type') : null;
    const contentLengthHeader = headers.get ? headers.get('content-length') : null;
    const contentLength = contentLengthHeader != null ? Number(contentLengthHeader) : null;

    return {
      ok: response.ok,
      status: response.status,
      finalUrl,
      body,
      metrics: {
        request_started_at: requestStartedIso,
        fetched_at: new Date(finished).toISOString(),
        bytes_downloaded: bytesDownloaded,
        content_type: contentType || null,
        content_length: Number.isFinite(contentLength) ? contentLength : null,
        total_ms: finished - started,
        download_ms: finished - started
      },
      requestMethod
    };
  } catch (error) {
    clearTimeout(timeout);
    throw Object.assign(new Error(error.message || String(error)), {
      kind: error.name === 'AbortError' ? 'timeout' : 'network',
      cause: error
    });
  }
}

function createFetchRow(result, fallbackHost) {
  const metrics = result.metrics || {};
  const host = (() => {
    try {
      return new URL(result.finalUrl).hostname.toLowerCase();
    } catch (_) {
      return fallbackHost;
    }
  })();

  return {
    url: result.finalUrl,
    request_started_at: metrics.request_started_at,
    fetched_at: metrics.fetched_at,
    http_status: result.status,
    content_type: metrics.content_type,
    content_length: metrics.content_length,
    bytes_downloaded: metrics.bytes_downloaded,
    total_ms: metrics.total_ms,
    download_ms: metrics.download_ms,
    host
  };
}

function selectPlaces(analyzerMap, kinds, limit) {
  const selected = [];
  const unsupported = [];
  const remaining = typeof limit === 'number' && limit > 0 ? { value: limit } : { value: null };

  const enqueue = (items, transform) => {
    if (!items?.length) return;
    for (const item of items) {
      if (remaining.value != null && remaining.value <= 0) return;
      selected.push(transform(item));
      if (remaining.value != null) {
        remaining.value -= 1;
      }
    }
  };

  for (const kind of kinds) {
    switch (kind) {
      case 'country': {
        const countries = remaining.value != null
          ? analyzerMap.countryAnalyzer.getTopCountries(remaining.value)
          : analyzerMap.countryAnalyzer.getAllCountries();
        enqueue(countries, (country) => ({
          kind: 'country',
          name: country.name,
          code: country.code,
          importance: country.importance || 0
        }));
        break;
      }
      case 'region': {
        if (!analyzerMap.regionAnalyzer) {
          unsupported.push('region');
          break;
        }
        const regions = analyzerMap.regionAnalyzer.getTopRegions(remaining.value != null ? remaining.value : 50);
        enqueue(regions, (region) => ({
          kind: 'region',
          name: region.name,
          code: region.code,
          countryCode: region.countryCode,
          importance: region.importance || 0
        }));
        break;
      }
      case 'city': {
        if (!analyzerMap.cityAnalyzer) {
          unsupported.push('city');
          break;
        }
        const cities = analyzerMap.cityAnalyzer.getTopCities(remaining.value != null ? remaining.value : 50);
        enqueue(cities, (city) => ({
          kind: 'city',
          name: city.name,
          countryCode: city.countryCode,
          regionName: city.regionName,
          importance: city.importance || 0
        }));
        break;
      }
      default:
        unsupported.push(kind);
        break;
    }
  }

  return { places: selected, unsupported };
}

async function guessPlaceHubs(options = {}, deps = {}) {
  const {
    fetchFn = fetchImpl,
    logger = defaultLogger(),
    now = () => new Date()
  } = deps;

  const normalizedDomain = normalizeDomain(options.domain, options.scheme);
  if (!normalizedDomain) {
    throw new Error('A domain or host is required. Pass via positional argument or --domain.');
  }

  const dbPath = resolveDbPath(options.dbPath);
  const dbExists = fs.existsSync(dbPath);
  if (!dbExists) {
    throw new Error(`Database not found at ${dbPath}`);
  }

  const db = ensureDb(dbPath);
  const newsDb = new SQLiteNewsDatabase(db);
  const analyzer = new CountryHubGapAnalyzer({ db, logger });
  const regionAnalyzer = new RegionHubGapAnalyzer({ db, logger });
  const cityAnalyzer = new CityHubGapAnalyzer({ db, logger });

  const selectLatestFetch = db.prepare(`
    SELECT http_status, fetched_at, request_started_at
      FROM fetches
     WHERE url = ?
  ORDER BY COALESCE(fetched_at, request_started_at) DESC
     LIMIT 1
  `);
  const selectHubByUrl = db.prepare('SELECT id, place_slug FROM place_hubs WHERE url = ?');
  const insertHubStmt = db.prepare(`
    INSERT OR IGNORE INTO place_hubs(
      host,
      url,
      place_slug,
      place_kind,
      topic_slug,
      topic_label,
      topic_kind,
      title,
      first_seen_at,
      last_seen_at,
      nav_links_count,
      article_links_count,
      evidence
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?, ?)
  `);
  const updateHubStmt = db.prepare(`
    UPDATE place_hubs
       SET place_slug = COALESCE(?, place_slug),
           place_kind = COALESCE(?, place_kind),
           topic_slug = COALESCE(?, topic_slug),
           topic_label = COALESCE(?, topic_label),
           topic_kind = COALESCE(?, topic_kind),
           title = COALESCE(?, title),
           last_seen_at = datetime('now'),
           nav_links_count = COALESCE(?, nav_links_count),
           article_links_count = COALESCE(?, article_links_count),
           evidence = COALESCE(?, evidence)
     WHERE url = ?
  `);

  const summary = {
    domain: normalizedDomain.host,
    totalPlaces: 0,
    totalUrls: 0,
    fetched: 0,
    cached: 0,
    skipped: 0,
    skippedDuplicatePlace: 0,
    skippedRecent4xx: 0,
    stored404: 0,
    insertedHubs: 0,
    updatedHubs: 0,
    errors: 0,
    rateLimited: 0,
    unsupportedKinds: [],
    decisions: []
  };

  const recordDecision = ({ level = 'info', message, ...rest }) => {
    summary.decisions.push({ level, message, ...rest });
    const loggerFn = logger?.[level];
    if (typeof loggerFn === 'function' && message) {
      loggerFn(`[guess-place-hubs] ${message}`);
    }
  };

  const maxAgeMs = Number.isFinite(options.maxAgeDays) ? options.maxAgeDays * DAY_MS : 7 * DAY_MS;
  const refresh404Ms = Number.isFinite(options.refresh404Days) ? options.refresh404Days * DAY_MS : 180 * DAY_MS;
  const retry4xxMs = Number.isFinite(options.retry4xxDays) ? options.retry4xxDays * DAY_MS : 7 * DAY_MS;
  const patternLimit = Math.max(1, Number(options.patternsPerPlace) || 3);
  const nowMs = now().getTime();

  try {
    const processedPlaceKeys = new Set();
    let rateLimitTriggered = false;

    const { places, unsupported } = selectPlaces({
      countryAnalyzer: analyzer,
      regionAnalyzer,
      cityAnalyzer
    }, options.kinds, options.limit);
    summary.unsupportedKinds = unsupported;
    if (unsupported.length && options.verbose) {
      logger.warn(`[guess-place-hubs] Unsupported place kinds ignored: ${unsupported.join(', ')}`);
    }

    summary.totalPlaces = places.length;
    if (!places.length) {
      return summary;
    }

    for (const place of places) {
      if (rateLimitTriggered) {
        break;
      }
      const slug = slugify(place.name);
      const placeKey = `${place.kind}:${slug}`;
      if (processedPlaceKeys.has(placeKey)) {
        summary.skippedDuplicatePlace += 1;
        if (options.verbose) {
          logger.info(`[guess-place-hubs] Duplicate place skipped ${placeKey}`);
        }
        continue;
      }
      processedPlaceKeys.add(placeKey);

      const patternSource = `${place.kind}-patterns`;
      let predictions = [];

      if (place.kind === 'country') {
        predictions = analyzer.predictCountryHubUrls(normalizedDomain.host, place.name, place.code);
      } else if (place.kind === 'region') {
        predictions = regionAnalyzer.predictRegionHubUrls(normalizedDomain.host, place);
      } else if (place.kind === 'city') {
        predictions = cityAnalyzer.predictCityHubUrls(normalizedDomain.host, place);
      }

      predictions = Array.from(new Set(predictions)).slice(0, patternLimit);
      if (!predictions.length) {
        continue;
      }

      for (const predicted of predictions) {
        if (rateLimitTriggered) {
          break;
        }
        const candidateUrl = applyScheme(predicted, normalizedDomain.scheme);
        summary.totalUrls += 1;

        const latestFetch = selectLatestFetch.get(candidateUrl);
        const ageMs = computeAgeMs(latestFetch, nowMs);
        if (latestFetch && latestFetch.http_status >= 200 && latestFetch.http_status < 300 && ageMs < maxAgeMs) {
          summary.cached += 1;
          if (options.verbose) {
            logger.info(`[guess-place-hubs] Cached OK (${latestFetch.http_status}) ${candidateUrl}`);
          }
          continue;
        }
        if (latestFetch && latestFetch.http_status === 404 && ageMs < refresh404Ms) {
          summary.skipped += 1;
          if (options.verbose) {
            logger.info(`[guess-place-hubs] Known 404 cached ${candidateUrl}`);
          }
          continue;
        }
        if (
          latestFetch &&
          latestFetch.http_status >= 400 &&
          latestFetch.http_status < 500 &&
          latestFetch.http_status !== 404 &&
          ageMs < retry4xxMs
        ) {
          summary.skippedRecent4xx += 1;
          if (options.verbose) {
            logger.info(`[guess-place-hubs] Recent ${latestFetch.http_status} cached ${candidateUrl}`);
          }
          continue;
        }

        try {
          let headResult = null;
          try {
            headResult = await fetchUrl(candidateUrl, fetchFn, {
              logger,
              method: 'HEAD',
              timeoutMs: 10000
            });
            recordDecision({
              stage: 'HEAD',
              status: headResult.status,
              url: candidateUrl,
              outcome: headResult.status >= 200 && headResult.status < 300 ? 'probe-ok' : headResult.status,
              message: `HEAD ${headResult.status} ${candidateUrl}`
            });
          } catch (headError) {
            recordDecision({
              stage: 'HEAD',
              status: null,
              url: candidateUrl,
              outcome: 'head-failed',
              level: 'warn',
              message: `HEAD failed for ${candidateUrl}: ${headError.message || headError}`
            });
          }

          if (headResult) {
            if (headResult.status === 429) {
              summary.rateLimited += 1;
              newsDb.insertFetch(createFetchRow(headResult, normalizedDomain.host));
              rateLimitTriggered = true;
              recordDecision({
                stage: 'HEAD',
                status: 429,
                url: candidateUrl,
                outcome: 'rate-limited',
                level: 'warn',
                message: `HEAD 429 rate limit for ${candidateUrl} (halting)`
              });
              continue;
            }

            if (headResult.status === 404 || headResult.status === 410) {
              summary.stored404 += 1;
              newsDb.insertFetch(createFetchRow(headResult, normalizedDomain.host));
              recordDecision({
                stage: 'HEAD',
                status: headResult.status,
                url: candidateUrl,
                outcome: 'cached-miss',
                message: `HEAD ${headResult.status} ${candidateUrl} -> cached`
              });
              continue;
            }

            if (headResult.status === 405) {
              recordDecision({
                stage: 'HEAD',
                status: 405,
                url: candidateUrl,
                outcome: 'fallback-get',
                message: `HEAD 405 ${candidateUrl} -> retry with GET`
              });
              headResult = null; // Method not allowed, fall back to GET
            } else if (headResult.status >= 400 && headResult.status < 500) {
              recordDecision({
                stage: 'HEAD',
                status: headResult.status,
                url: candidateUrl,
                outcome: 'retry-get',
                message: `HEAD ${headResult.status} ${candidateUrl} -> retry with GET`
              });
            }
          }

          const result = await fetchUrl(candidateUrl, fetchFn, { logger });
          newsDb.insertFetch(createFetchRow(result, normalizedDomain.host));

          if (result.status === 404) {
            summary.stored404 += 1;
            recordDecision({
              stage: 'GET',
              status: 404,
              url: candidateUrl,
              outcome: 'cached-miss',
              message: `GET 404 ${candidateUrl} -> cached`
            });
            continue;
          }

          if (result.status === 429) {
            summary.rateLimited += 1;
            rateLimitTriggered = true;
            recordDecision({
              stage: 'GET',
              status: 429,
              url: candidateUrl,
              outcome: 'rate-limited',
              level: 'warn',
              message: `GET 429 rate limit for ${candidateUrl}`
            });
          }

          if (result.ok) {
            summary.fetched += 1;
            recordDecision({
              stage: 'GET',
              status: result.status,
              url: candidateUrl,
              outcome: 'fetched',
              message: `GET ${result.status} ${candidateUrl} -> fetched`
            });
            if (options.apply) {
              const existing = selectHubByUrl.get(result.finalUrl) || null;
              const title = extractTitle(result.body);
              const evidence = buildEvidence({ name: place.name, code: place.code, slug, kind: place.kind }, patternSource, result.status, { candidatesTested: predictions.length });

              insertHubStmt.run(
                normalizedDomain.host,
                result.finalUrl,
                slug,
                place.kind,
                null,
                null,
                null,
                title,
                null,
                null,
                evidence
              );

              updateHubStmt.run(
                slug,
                place.kind,
                null,
                null,
                null,
                title,
                null,
                null,
                evidence,
                result.finalUrl
              );

              if (!existing) summary.insertedHubs += 1;
              else summary.updatedHubs += 1;
            }
          } else {
            summary.errors += 1;
            recordDecision({
              stage: 'GET',
              status: result.status,
              url: candidateUrl,
              outcome: 'error',
              level: 'warn',
              message: `GET ${result.status} ${candidateUrl} -> error`
            });
          }
        } catch (err) {
          summary.errors += 1;
          recordDecision({
            stage: 'GET',
            status: null,
            url: candidateUrl,
            outcome: 'exception',
            level: 'error',
            message: `GET failed for ${candidateUrl}: ${err.message || err}`
          });
          newsDb.insertError({
            url: candidateUrl,
            kind: err.kind || 'network',
            code: null,
            message: err.message,
            details: err.cause ? { name: err.cause.name, message: err.cause.message } : null
          });
        }
      }
    }

    return summary;
  } finally {
    try { db.close(); } catch (_) {}
  }
}

async function main(argv) {
  const options = parseCliArgs(argv);
  if (options.help) {
    printUsage();
    return;
  }

  if (!options.domain) {
    printUsage();
    throw new Error('Domain or host is required.');
  }

  const summary = await guessPlaceHubs(options, { logger: console });
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  parseCliArgs,
  guessPlaceHubs,
  resolveDbPath,
  normalizeDomain,
  extractTitle
};
