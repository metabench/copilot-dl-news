'use strict';

/**
 * urlIntelligence.js — the copilot-side BRIDGE to the sibling
 * `news-crawler-url-intelligence` module (module-ecosystem directive,
 * 2026-07-22). copilot-dl-news is the coordinator; the URL-classification
 * *rules* live in the module. This file is the thin call-through.
 *
 * WHY A BRIDGE (not a require): the module is ESM-only
 * (`"type":"module"`, scoped `@metabench/news-crawler-url-intelligence`), so a
 * CommonJS file cannot `require()` it (ERR_REQUIRE_ESM). We mirror the proven
 * `tools/crawl/lib/graph-feedback-loader.js` pattern for the sibling
 * `news-db-analysis`: dynamic `import()` with two candidates — the installed
 * package specifier first, then a `pathToFileURL` fallback to the sibling
 * repo's built `dist/` for local multi-repo development. The module is NOT
 * (yet) a hard `file:../` dependency in package.json: nothing in copilot's
 * core path consumes it yet (the first delegation is BLOCKED — see
 * docs/plans/2026-07-22-intelligence-extraction.md), so it is reached exactly
 * like news-db-analysis. Promotion to a hard dep is the future additive-consumer
 * cycle's step.
 *
 * THE ASYNC BOUNDARY STAYS AT LOAD. `analyze_url` itself is SYNCHRONOUS and a
 * pure, deterministic function of the URL string (no network/FS/Date/randomness
 * in the classification; only `processing_time_ms` is wall-clock and is not
 * part of the label/confidence). Only the `import()` is async. So a consumer
 * that needs a synchronous predicate (e.g. ncdb selectDueFrontier row scoring,
 * or a `.filter`) resolves the module ONCE via `createUrlClassifier()` at
 * startup and then calls the returned methods synchronously — the hot path
 * never awaits.
 */

const path = require('path');
const { pathToFileURL } = require('url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODULE_NAME = '@metabench/news-crawler-url-intelligence';

/** The module's full URL-only classification taxonomy (see its d.ts). */
const MODULE_LABELS = Object.freeze([
  'article_candidate',
  'listing_page',
  'media_page',
  'navigation_page',
  'api_endpoint',
  'static_asset',
  'unknown',
]);

function defaultImportCandidates() {
  return [
    MODULE_NAME,
    pathToFileURL(path.resolve(REPO_ROOT, '..', 'news-crawler-url-intelligence', 'dist', 'index.js')).href,
  ];
}

/**
 * Dynamically import the ESM url-intelligence module. Tries the installed
 * package first, then the sibling-repo dist build. Throws a LOUD error on total
 * failure (never silently degrades — a missing sibling build must surface, not
 * masquerade as a working-but-wrong classifier).
 *
 * @param {object} [options]
 * @param {(specifier: string) => Promise<object>} [options.importer]
 * @param {string[]} [options.candidates]
 * @returns {Promise<object>} the module namespace ({ analyze_url, ... })
 */
async function importUrlIntelligence(options = {}) {
  const importer = options.importer || ((specifier) => import(specifier));
  const candidates = options.candidates || defaultImportCandidates();
  const failures = [];
  for (const candidate of candidates) {
    try {
      const mod = await importer(candidate);
      if (mod && typeof mod.analyze_url === 'function') return mod;
      failures.push(`${candidate}: loaded but has no analyze_url export`);
    } catch (err) {
      failures.push(`${candidate}: ${err && err.message ? err.message : String(err)}`);
    }
  }
  throw new Error(
    'Unable to import news-crawler-url-intelligence. Build/install '
    + '../news-crawler-url-intelligence first (npm run build in that repo). '
    + failures.join('; ')
  );
}

/**
 * Is a value a usable absolute URL string? The module's `analyze_url` calls
 * `url.trim()` with NO type guard (throws TypeError on non-string) and needs an
 * absolute URL (relative paths classify as 'unknown' silently). Every bridge
 * call must go through this so the frontier predicate stays crash-proof, exactly
 * as `isArticleShapedUrl` is today.
 */
function isUsableAbsoluteUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try { new URL(url); return true; } catch (_) { return false; }
}

/**
 * Full classification for a URL string, via the module. Sync (the passed
 * `mod` is a pre-loaded namespace). Guard-wrapped: bad input returns a synthetic
 * 'unknown' rather than throwing, so callers never crash on a null row.
 *
 * @param {object} mod pre-loaded module namespace (from importUrlIntelligence)
 * @param {string} url absolute URL string
 * @returns {{label:string, confidence:number, reasons:string[]}}
 */
function classifyUrl(mod, url) {
  if (!mod || typeof mod.analyze_url !== 'function') {
    return { label: 'unknown', confidence: 0, reasons: ['module unavailable'] };
  }
  if (!isUsableAbsoluteUrl(url)) {
    return { label: 'unknown', confidence: 0, reasons: ['non-string or non-absolute URL'] };
  }
  // Defend the frontier predicate against ANY throw from the external module —
  // isUsableAbsoluteUrl only proves `new URL(url)` succeeds; analyze_url's own
  // internals (e.g. get_url_classification_signals on an unexpected label) could
  // still throw. A crash-proof predicate never propagates that.
  let r;
  try {
    r = mod.analyze_url(url);
  } catch (err) {
    return { label: 'unknown', confidence: 0, reasons: ['analyze_url threw: ' + (err && err.message ? err.message : String(err))] };
  }
  const results = r && r.results ? r.results : null;
  if (!results) return { label: 'unknown', confidence: 0, reasons: ['module returned no results'] };
  return { label: results.label, confidence: results.confidence, reasons: results.reasons || [] };
}

/**
 * The label→boolean adapter for the (currently BLOCKED) isArticleShapedUrl
 * comparison: only `article_candidate` maps to "article-shaped"; every other
 * label (listing/media/navigation/api/static/unknown) maps to false. Kept as a
 * pure exported function so the differential harness and any future consumer
 * share ONE mapping definition.
 *
 * NOTE (delegation≠repoint): this boolean adapter does NOT make the module
 * equivalent to copilot's `isArticleShapedUrl` — a real ~34% divergence was
 * measured on 1,800 live URLs (see the plan doc). It exists to MEASURE the gap,
 * not to hide it.
 */
function moduleLabelIsArticleShaped(label) {
  return label === 'article_candidate';
}

/**
 * Convenience: pre-load the module ONCE and return synchronous, guard-wrapped
 * methods bound to it. This is the shape a consumer with a sync hot path uses:
 *   const urlIntel = await createUrlClassifier();   // once, at startup
 *   urlIntel.isArticleCandidate(url);               // sync, hot path
 *
 * @param {object} [options] forwarded to importUrlIntelligence (importer/candidates)
 * @returns {Promise<{classifyUrl:(url:string)=>object, isArticleCandidate:(url:string)=>boolean, module:object}>}
 */
async function createUrlClassifier(options = {}) {
  const mod = await importUrlIntelligence(options);
  return {
    module: mod,
    classifyUrl: (url) => classifyUrl(mod, url),
    isArticleCandidate: (url) => moduleLabelIsArticleShaped(classifyUrl(mod, url).label),
  };
}

module.exports = {
  MODULE_NAME,
  MODULE_LABELS,
  importUrlIntelligence,
  createUrlClassifier,
  classifyUrl,
  moduleLabelIsArticleShaped,
  isUsableAbsoluteUrl,
};
