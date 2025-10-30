#!/usr/bin/env node

'use strict';

const path = require('path');
const fs = require('fs');
const { findProjectRoot } = require('../utils/project-root');
const { ensureDb } = require('../db/sqlite/ensureDb');
const { createSQLiteDatabase } = require('../db/sqlite');
const { createPlaceHubCandidatesStore } = require('../db/placeHubCandidatesStore');
const { createGuessPlaceHubsQueries } = require('../db/sqlite/v1/queries/guessPlaceHubsQueries');
const { CountryHubGapAnalyzer } = require('../services/CountryHubGapAnalyzer');
const { RegionHubGapAnalyzer } = require('../services/RegionHubGapAnalyzer');
const { CityHubGapAnalyzer } = require('../services/CityHubGapAnalyzer');
const HubValidator = require('../hub-validation/HubValidator');
const { slugify } = require('./slugify');
const { CliFormatter } = require('../utils/CliFormatter');
const { CliArgumentParser } = require('../utils/CliArgumentParser');
const { createFetchRecorder } = require('../utils/fetch/fetchRecorder');

const fetchImpl = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const DAY_MS = 24 * 60 * 60 * 1000;

function defaultLogger() {
  return {
    info: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console)
  };
}

function parseCsv(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function parseCliArgs(argv) {
  const parser = new CliArgumentParser('guess-place-hubs', 'Predict candidate place hubs and verify them');

  parser.add('--domain <domain>', 'Domain or host to inspect (positional arg supported)', null);
  parser.add('--db <path>', 'Path to SQLite database (defaults to data/news.db)', null);
  parser.add('--db-path <path>', 'Alias for --db', null);
  parser.add('--kinds <csv>', 'Place kinds to consider (country, region, city)', 'country');
  parser.add('--limit <n>', 'Limit number of places to evaluate', null, 'number');
  parser.add('--patterns-per-place <n>', 'Maximum URL patterns to test per place (default 3)', 3, 'number');
  parser.add('--max-age-days <n>', 'Skip re-fetch when success newer than N days (default 7)', 7, 'number');
  parser.add('--refresh-404-days <n>', 'Skip re-fetching known 404s newer than N days (default 180)', 180, 'number');
  parser.add('--retry-4xx-days <n>', 'Skip retrying other 4xx statuses newer than N days (default 7)', 7, 'number');
  parser.add('--apply', 'Persist confirmed hubs to place_hubs table', false, 'boolean');
  parser.add('--dry-run', 'Do not persist hubs (default behaviour)', false, 'boolean');
  parser.add('--verbose', 'Enable verbose logging', false, 'boolean');
  parser.add('--http', 'Use http scheme instead of https', false, 'boolean');
  parser.add('--scheme <scheme>', 'Override URL scheme (http or https)', 'https');
  parser.add('--json', 'Emit JSON summary output', false, 'boolean');

  const parsedArgs = parser.parse(Array.isArray(argv) ? argv : process.argv);

  const positionalDomain = parsedArgs.positional && parsedArgs.positional.length > 0
    ? parsedArgs.positional[0]
    : null;

  const domain = parsedArgs.domain || positionalDomain || process.env.GPH_DOMAIN || null;

  const schemeInput = parsedArgs.http ? 'http' : (parsedArgs.scheme ? String(parsedArgs.scheme).toLowerCase() : 'https');
  const scheme = ['http', 'https'].includes(schemeInput) ? schemeInput : 'https';

  const kindsInput = parsedArgs.kinds != null ? parsedArgs.kinds : 'country';
  const kinds = parseCsv(kindsInput);
  if (!kinds.length) kinds.push('country');
  const uniqueKinds = Array.from(new Set(kinds.map((kind) => kind.toLowerCase())));

  const limit = Number.isFinite(parsedArgs.limit) ? parsedArgs.limit : null;
  const patternsPerPlace = Number.isFinite(parsedArgs.patternsPerPlace)
    ? Math.max(1, parsedArgs.patternsPerPlace)
    : 3;
  const maxAgeDays = Number.isFinite(parsedArgs.maxAgeDays)
    ? Math.max(0, parsedArgs.maxAgeDays)
    : 7;
  const refresh404Days = Number.isFinite(parsedArgs.refresh404Days)
    ? Math.max(0, parsedArgs.refresh404Days)
    : 180;
  const retry4xxDays = Number.isFinite(parsedArgs.retry4xxDays)
    ? Math.max(0, parsedArgs.retry4xxDays)
    : 7;

  let apply = parsedArgs.apply === true;
  if (parsedArgs.dryRun === true) {
    apply = false;
  }

  const dbPath = parsedArgs.dbPath || parsedArgs.db || null;

  return {
    domain,
    dbPath,
    kinds: uniqueKinds,
    limit,
    patternsPerPlace,
    apply,
    maxAgeDays,
    refresh404Days,
    retry4xxDays,
    verbose: Boolean(parsedArgs.verbose),
    scheme,
    json: Boolean(parsedArgs.json),
    dryRun: !apply
  };
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

function extractPredictionSignals(predictionSource) {
  if (!predictionSource) return null;
  if (typeof predictionSource !== 'object') {
    return { value: String(predictionSource) };
  }
  const allowedKeys = ['pattern', 'score', 'confidence', 'strategy', 'exampleUrl', 'weight'];
  const extracted = {};
  for (const key of allowedKeys) {
    if (predictionSource[key] != null) {
      extracted[key] = predictionSource[key];
    }
  }
  if (Object.keys(extracted).length === 0) {
    return { raw: predictionSource }; // fallback if structure unexpected
  }
  return extracted;
}

function composeCandidateSignals({ predictionSource, patternSource, place, attemptId, validationMetrics = null }) {
  const signals = {
    patternSource: patternSource || null,
    attempt: attemptId ? { id: attemptId } : null
  };
  if (place) {
    signals.place = {
      kind: place.kind || null,
      name: place.name || null,
      code: place.code || place.countryCode || null
    };
  }
  const predictionSignals = extractPredictionSignals(predictionSource);
  if (predictionSignals) {
    signals.prediction = predictionSignals;
  }
  if (validationMetrics) {
    signals.validation = validationMetrics;
  }
  return signals;
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
  const newsDb = createSQLiteDatabase(dbPath);
  const analyzer = new CountryHubGapAnalyzer({ db, logger });
  const regionAnalyzer = new RegionHubGapAnalyzer({ db, logger });
  const cityAnalyzer = new CityHubGapAnalyzer({ db, logger });
  const hubValidator = new HubValidator(db);
  const queries = createGuessPlaceHubsQueries(db);
  let candidatesStore = null;

  try {
    candidatesStore = createPlaceHubCandidatesStore(db);
  } catch (error) {
    if (options.verbose) {
      logger?.warn?.(`[guess-place-hubs] Candidate store unavailable: ${error?.message || error}`);
    }
  }

  const fetchRecorder = createFetchRecorder({
    newsDb,
    legacyDb: db,
    logger,
    source: 'guess-place-hubs'
  });

  if (typeof hubValidator.initialize === 'function') {
    try {
      hubValidator.initialize();
    } catch (_) {
      /* ignore validator initialization errors */
    }
  }


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

  let attemptCounter = 0;

  const recordFetch = (fetchRow, meta = {}) => {
    if (!fetchRow) return null;
    const tags = {
      stage: meta.stage || 'GET',
      attemptId: meta.attemptId || null,
      cacheHit: Boolean(meta.cacheHit)
    };
    if (fetchRecorder && typeof fetchRecorder.record === 'function') {
      return fetchRecorder.record(fetchRow, tags);
    }

    // Fallback path if fetchRecorder unavailable (legacy behaviour)
    try {
      newsDb.insertFetch(fetchRow);
    } catch (_) {
      /* ignore normalized insert errors */
    }
    try {
      queries.insertLegacyFetch(fetchRow);
    } catch (legacyError) {
      if (options.verbose) {
        const message = legacyError?.message || String(legacyError);
        logger?.warn?.(`[guess-place-hubs] Failed to record legacy fetch for ${fetchRow.url}: ${message}`);
      }
    }
    return null;
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

      const normalizedPredictions = [];
      const seenCandidates = new Set();

      for (const candidate of Array.isArray(predictions) ? predictions : []) {
        const baseUrl = typeof candidate === 'string' ? candidate : candidate?.url;
        if (typeof baseUrl !== 'string' || baseUrl.trim() === '') continue;
        const candidateUrl = applyScheme(baseUrl, normalizedDomain.scheme);
        if (typeof candidateUrl !== 'string' || candidateUrl.trim() === '') continue;
        const key = candidateUrl.toLowerCase();
        if (seenCandidates.has(key)) continue;
        seenCandidates.add(key);
        normalizedPredictions.push({
          url: candidateUrl,
          rawUrl: baseUrl,
          source: candidate
        });
      }

      if (!normalizedPredictions.length) {
        continue;
      }

      for (const { url: candidateUrl, source: predictionSource } of normalizedPredictions.slice(0, patternLimit)) {
        if (rateLimitTriggered) {
          break;
        }
        summary.totalUrls += 1;

        const attemptId = `${placeKey}:${++attemptCounter}`;
        const attemptStartedAt = new Date().toISOString();
        const placeSignalsInfo = {
          kind: place.kind,
          name: place.name,
          code: place.code || place.countryCode || null
        };
        const analyzerName = typeof predictionSource === 'object' && predictionSource
          ? (predictionSource.analyzer || predictionSource.source || place.kind)
          : place.kind;
        const strategyValue = typeof predictionSource === 'object' && predictionSource
          ? (predictionSource.strategy || patternSource)
          : patternSource;
        const scoreValue = typeof predictionSource === 'object' ? predictionSource.score : null;
        const confidenceValue = typeof predictionSource === 'object' ? predictionSource.confidence : null;
        const patternValue = typeof predictionSource === 'object' ? predictionSource.pattern : null;
        const candidateSignals = composeCandidateSignals({
          predictionSource,
          patternSource,
          place: placeSignalsInfo,
          attemptId
        });

        if (candidatesStore && typeof candidatesStore.saveCandidate === 'function') {
          try {
            candidatesStore.saveCandidate({
              domain: normalizedDomain.host,
              candidateUrl,
              normalizedUrl: candidateUrl,
              placeKind: place.kind,
              placeName: place.name,
              placeCode: placeSignalsInfo.code,
              analyzer: analyzerName,
              strategy: strategyValue,
              score: scoreValue,
              confidence: confidenceValue,
              pattern: patternValue,
              signals: candidateSignals,
              attemptId,
              attemptStartedAt,
              status: 'pending',
              validationStatus: null,
              source: 'guess-place-hubs',
              lastSeenAt: attemptStartedAt
            });
          } catch (storeError) {
            if (options.verbose) {
              logger?.warn?.(`[guess-place-hubs] Failed to save candidate ${candidateUrl}: ${storeError?.message || storeError}`);
            }
          }
        }

        const latestFetch = queries.getLatestFetch(candidateUrl);
        const ageMs = computeAgeMs(latestFetch, nowMs);
        if (latestFetch && latestFetch.http_status >= 200 && latestFetch.http_status < 300 && ageMs < maxAgeMs) {
          summary.cached += 1;
          if (options.verbose) {
            logger.info(`[guess-place-hubs] Cached OK (${latestFetch.http_status}) ${candidateUrl}`);
          }
          candidatesStore?.markStatus?.({
            domain: normalizedDomain.host,
            candidateUrl,
            status: 'cached-ok',
            validationStatus: 'cache-hit',
            lastSeenAt: attemptStartedAt
          });
          continue;
        }
        if (latestFetch && latestFetch.http_status === 404 && ageMs < refresh404Ms) {
          summary.skipped += 1;
          if (options.verbose) {
            logger.info(`[guess-place-hubs] Known 404 cached ${candidateUrl}`);
          }
          candidatesStore?.markStatus?.({
            domain: normalizedDomain.host,
            candidateUrl,
            status: 'cached-404',
            validationStatus: 'cache-404',
            lastSeenAt: attemptStartedAt
          });
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
          candidatesStore?.markStatus?.({
            domain: normalizedDomain.host,
            candidateUrl,
            status: 'cached-4xx',
            validationStatus: 'cache-4xx',
            lastSeenAt: attemptStartedAt
          });
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
              rateLimitTriggered = true;
              candidatesStore?.markStatus?.({
                domain: normalizedDomain.host,
                candidateUrl,
                status: 'rate-limited',
                validationStatus: 'http-429',
                lastSeenAt: attemptStartedAt
              });
              recordFetch(createFetchRow(headResult, normalizedDomain.host), { stage: 'HEAD', attemptId });
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
              candidatesStore?.markStatus?.({
                domain: normalizedDomain.host,
                candidateUrl,
                status: 'fetched-404',
                validationStatus: `head-${headResult.status}`,
                lastSeenAt: attemptStartedAt
              });
              recordFetch(createFetchRow(headResult, normalizedDomain.host), { stage: 'HEAD', attemptId });
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
          const fetchRow = createFetchRow(result, normalizedDomain.host);
          const httpResponseId = recordFetch(fetchRow, { stage: 'GET', attemptId });

          if (result.status === 404) {
            summary.stored404 += 1;
            candidatesStore?.markStatus?.({
              domain: normalizedDomain.host,
              candidateUrl,
              status: 'fetched-404',
              validationStatus: 'http-404',
              lastSeenAt: attemptStartedAt
            });
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
            candidatesStore?.markStatus?.({
              domain: normalizedDomain.host,
              candidateUrl,
              status: 'rate-limited',
              validationStatus: 'http-429',
              lastSeenAt: attemptStartedAt
            });
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

            const title = extractTitle(result.body);
            let validation;
            const validationInput = {
              url: result.finalUrl,
              title,
              html: result.body
            };
            if (result.body && typeof hubValidator.analyzeHubContent === 'function') {
              validation = hubValidator.analyzeHubContent(validationInput, place.name, { htmlSource: 'network-fetch' });
            } else {
              validation = await hubValidator.validateHubContent(result.finalUrl, place.name, {
                html: result.body,
                title,
                htmlSource: 'network-fetch'
              });
            }
            if (!validation || typeof validation !== 'object') {
              validation = { isValid: false, reason: 'Validation unavailable', metrics: null };
            }

            const validationMetrics = {
              ...(validation.metrics || {}),
              httpStatus: result.status,
              httpResponseId
            };

            if (!validation.isValid) {
              summary.errors += 1;
              recordDecision({
                stage: 'VALIDATION',
                status: null,
                url: candidateUrl,
                outcome: 'invalid-content',
                level: 'warn',
                message: `Content validation failed for ${candidateUrl}: ${validation.reason}`
              });

              const invalidTimestamp = new Date().toISOString();
              candidatesStore?.saveCandidate?.({
                domain: normalizedDomain.host,
                candidateUrl,
                normalizedUrl: result.finalUrl,
                placeKind: place.kind,
                placeName: place.name,
                placeCode: placeSignalsInfo.code,
                analyzer: analyzerName,
                strategy: strategyValue,
                score: scoreValue,
                confidence: confidenceValue,
                pattern: patternValue,
                signals: composeCandidateSignals({
                  predictionSource,
                  patternSource,
                  place: placeSignalsInfo,
                  attemptId,
                  validationMetrics
                }),
                attemptId,
                attemptStartedAt,
                status: 'validated',
                validationStatus: 'invalid',
                source: 'guess-place-hubs',
                lastSeenAt: invalidTimestamp
              });

              continue;
            }

            recordDecision({
              stage: 'VALIDATION',
              status: null,
              url: candidateUrl,
              outcome: 'valid-hub',
              message: `Content validation passed for ${candidateUrl}: ${validation.reason}`
            });

            const candidateStatus = options.apply ? 'persisted' : 'validated';
            const validationTimestamp = new Date().toISOString();
            candidatesStore?.saveCandidate?.({
              domain: normalizedDomain.host,
              candidateUrl,
              normalizedUrl: result.finalUrl,
              placeKind: place.kind,
              placeName: place.name,
              placeCode: placeSignalsInfo.code,
              analyzer: analyzerName,
              strategy: strategyValue,
              score: scoreValue,
              confidence: confidenceValue,
              pattern: patternValue,
              signals: composeCandidateSignals({
                predictionSource,
                patternSource,
                place: placeSignalsInfo,
                attemptId,
                validationMetrics
              }),
              attemptId,
              attemptStartedAt,
              status: candidateStatus,
              validationStatus: 'valid',
              source: 'guess-place-hubs',
              lastSeenAt: validationTimestamp
            });

            if (options.apply) {
              const existing = queries.getHubByUrl(result.finalUrl) || null;
              const evidence = buildEvidence(
                { name: place.name, code: place.code, slug, kind: place.kind },
                patternSource,
                result.status,
                {
                  candidatesTested: normalizedPredictions.length,
                  strategy: strategyValue,
                  confidence: confidenceValue,
                  pattern: patternValue,
                  validationMetrics
                }
              );

              queries.insertHub({
                host: normalizedDomain.host,
                url: result.finalUrl,
                placeSlug: slug,
                placeKind: place.kind,
                title,
                navLinksCount: validationMetrics?.linkCount ?? null,
                articleLinksCount: validationMetrics?.articleLinkCount ?? null,
                evidence
              });

              queries.updateHub({
                url: result.finalUrl,
                placeSlug: slug,
                placeKind: place.kind,
                title,
                navLinksCount: validationMetrics?.linkCount ?? null,
                articleLinksCount: validationMetrics?.articleLinkCount ?? null,
                evidence
              });

              if (!existing) summary.insertedHubs += 1;
              else summary.updatedHubs += 1;
            }
          } else {
            summary.errors += 1;
            const outcome = result.status === 429 ? 'rate-limited' : 'error';
            recordDecision({
              stage: 'GET',
              status: result.status,
              url: candidateUrl,
              outcome,
              level: 'warn',
              message: `GET ${result.status} ${candidateUrl} -> ${outcome}`
            });
            if (result.status !== 429) {
              candidatesStore?.markStatus?.({
                domain: normalizedDomain.host,
                candidateUrl,
                status: 'fetch-error',
                validationStatus: `http-${result.status}`,
                lastSeenAt: attemptStartedAt
              });
            }
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
          candidatesStore?.markStatus?.({
            domain: normalizedDomain.host,
            candidateUrl,
            status: 'exception',
            validationStatus: err?.kind || 'exception',
            lastSeenAt: new Date().toISOString()
          });
          const errorDetails = err?.cause
            ? { name: err.cause.name, message: err.cause.message, attemptId }
            : { attemptId };
          newsDb.insertError({
            url: candidateUrl,
            kind: err.kind || 'network',
            code: null,
            message: err.message,
            details: errorDetails
          });
        }
      }
    }

    return summary;
  } finally {
    try { queries.dispose(); } catch (_) {}
    try { db.close(); } catch (_) {}
    try { newsDb.close?.(); } catch (_) {}
  }
}

function formatDays(days) {
  if (!Number.isFinite(days)) return 'not set';
  if (days === 0) return '0 days (always refresh)';
  if (days === 1) return '1 day';
  return `${days} days`;
}

function truncate(text, maxLength = 100) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function formatStatus(fmt, value) {
  if (value == null || value === '') return '';
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (numeric >= 200 && numeric < 300) return fmt.COLORS.success(String(value));
    if (numeric >= 300 && numeric < 400) return fmt.COLORS.info(String(value));
    if (numeric >= 400 && numeric < 500) return fmt.COLORS.warning(String(value));
    if (numeric >= 500) return fmt.COLORS.error(String(value));
  }
  return String(value);
}

function formatOutcome(fmt, value) {
  if (!value) return '';
  const normalized = String(value);
  if (['valid-hub', 'fetched', 'probe-ok'].includes(normalized)) {
    return fmt.COLORS.success(normalized);
  }
  if (['cached-miss', 'retry-get', 'fallback-get', 'head-failed'].includes(normalized)) {
    return fmt.COLORS.warning(normalized);
  }
  if (normalized.includes('error') || normalized.includes('exception') || normalized.includes('rate')) {
    return fmt.COLORS.error(normalized);
  }
  return normalized;
}

function renderSummary(summary, options, logBuffer = []) {
  const fmt = new CliFormatter();
  const domainDisplay = summary.domain || options.domain || '(unknown)';
  const schemeDisplay = (options.scheme || 'https').toUpperCase();
  const kindsDisplay = Array.isArray(options.kinds) && options.kinds.length
    ? options.kinds.join(', ')
    : 'country';
  const patternsPerPlace = Number.isFinite(options.patternsPerPlace)
    ? options.patternsPerPlace
    : 3;
  const limitLabel = Number.isFinite(options.limit) ? options.limit : null;

  fmt.header('Guess Place Hubs');

  fmt.section('Target Configuration');
  fmt.stat('Domain', domainDisplay);
  fmt.stat('Scheme', schemeDisplay);
  fmt.stat('Kinds requested', kindsDisplay);
  fmt.stat('Patterns per place', patternsPerPlace, 'number');
  if (limitLabel != null) {
    fmt.stat('Place limit', limitLabel, 'number');
  } else {
    fmt.stat('Place limit', 'unbounded');
  }
  fmt.stat('Mode', options.apply ? 'Apply (persist hubs)' : 'Dry run (no database writes)');
  fmt.stat('Max success cache window', formatDays(options.maxAgeDays));
  fmt.stat('Known 404 cache window', formatDays(options.refresh404Days));
  fmt.stat('Other 4xx retry window', formatDays(options.retry4xxDays));

  fmt.section('Results');
  fmt.stat('Places evaluated', summary.totalPlaces, 'number');
  fmt.stat('URL candidates generated', summary.totalUrls, 'number');
  fmt.stat('Fetched (HTTP OK)', summary.fetched, 'number');
  fmt.stat('Cached successes reused', summary.cached, 'number');
  fmt.stat('Duplicates skipped', summary.skippedDuplicatePlace, 'number');
  fmt.stat('Recent 4xx skipped', summary.skippedRecent4xx, 'number');
  fmt.stat('Stored 404 responses', summary.stored404, 'number');
  fmt.stat('Inserted hubs', summary.insertedHubs, 'number');
  fmt.stat('Updated hubs', summary.updatedHubs, 'number');
  fmt.stat('Errors', summary.errors, 'number');
  fmt.stat('Rate limit responses', summary.rateLimited, 'number');

  if (summary.insertedHubs > 0 || summary.updatedHubs > 0) {
    fmt.success(`Persisted ${summary.insertedHubs} new hub(s) and ${summary.updatedHubs} update(s).`);
  } else if (!options.apply) {
    fmt.info('Dry run: pass --apply to write confirmed hubs to place_hubs.');
  }

  if (summary.errors > 0) {
    fmt.error(`${summary.errors} request(s) failed. Inspect recent decisions for details.`);
  }

  if (summary.rateLimited > 0) {
    fmt.warn(`${summary.rateLimited} rate limit response(s) encountered — processing halted early.`);
  }

  if (Array.isArray(summary.unsupportedKinds) && summary.unsupportedKinds.length) {
    fmt.list('Unsupported place kinds ignored', summary.unsupportedKinds);
  }

  const decisions = Array.isArray(summary.decisions) ? summary.decisions : [];
  const recentDecisions = decisions.slice(-12);
  fmt.section('Recent decisions');
  if (recentDecisions.length) {
    fmt.table(
      recentDecisions.map((decision) => ({
        stage: decision.stage || '',
        status: decision.status == null ? '' : String(decision.status),
        outcome: decision.outcome || '',
        message: truncate(decision.message || '', 100)
      })),
      {
        columns: ['stage', 'status', 'outcome', 'message'],
        format: {
          status: (value) => formatStatus(fmt, value),
          outcome: (value) => formatOutcome(fmt, value)
        }
      }
    );
    const remaining = decisions.length - recentDecisions.length;
    if (remaining > 0) {
      fmt.info(`${remaining} additional decision entry(ies) truncated. Use --json for the full log.`);
    }
  } else {
    fmt.info('No new HTTP requests were required; cached data satisfied all predictions.');
  }

  if (options.verbose && logBuffer.length) {
    fmt.section('Verbose log');
    for (const entry of logBuffer) {
      const cleaned = entry.message.replace(/^\[guess-place-hubs\]\s*/, '');
      if (entry.level === 'warn') {
        fmt.warn(cleaned);
      } else if (entry.level === 'error') {
        fmt.error(cleaned);
      } else {
        fmt.info(cleaned);
      }
    }
  }

  fmt.footer();
}

async function main(argv) {
  const options = parseCliArgs(argv);

  if (!options.domain) {
    console.error('Domain or host is required. Provide a positional argument or --domain.');
    process.exitCode = 1;
    return;
  }

  const logBuffer = [];
  const logger = {
    info(message) {
      if (options.verbose) {
        logBuffer.push({ level: 'info', message });
      }
    },
    warn(message) {
      if (options.verbose) {
        logBuffer.push({ level: 'warn', message });
      }
    },
    error(message) {
      logBuffer.push({ level: 'error', message });
    }
  };

  const summary = await guessPlaceHubs(options, { logger });

  if (options.json) {
    for (const entry of logBuffer) {
      if (entry.level === 'error' || (options.verbose && (entry.level === 'warn' || entry.level === 'info'))) {
        console.error(entry.message);
      }
    }
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  renderSummary(summary, options, logBuffer);
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
