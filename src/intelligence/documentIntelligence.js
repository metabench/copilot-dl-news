'use strict';

/**
 * documentIntelligence.js — the copilot-side BRIDGE to the sibling
 * `@metabench/news-crawler-document-intelligence` module (module-ecosystem
 * directive, 2026-07-22). Mirrors src/intelligence/urlIntelligence.js exactly.
 *
 * WHY A BRIDGE (not a require): the module is ESM-only, so a CommonJS caller in
 * copilot-dl-news cannot `require()` it (ERR_REQUIRE_ESM). We dynamic-`import()`
 * with two candidates — the installed package specifier first, then a
 * `pathToFileURL` fallback to the sibling repo's built `dist/` — resolve ONCE at
 * startup, then call `analyze_document(html, url)` SYNCHRONOUSLY (it is sync +
 * pure + deterministic; only the import is async).
 *
 * STATUS (cycle 80): this module is WIRED but its delegation is BLOCKED — a
 * measure-before-build scout found that repointing copilot's content-signal /
 * classification consumers onto it is a repoint-in-disguise on THREE axes:
 *   (1) INPUT — analyze_document re-parses the HTML with its own cheerio.load
 *       (+2 DOM clones); copilot already parses each page ONCE and shares that
 *       `$`, so delegating on the crawl hot path adds a 2nd/3rd full parse and
 *       reverses task #46. There is no seam to hand the module a pre-parsed `$`.
 *   (2) OUTPUT-SHAPE — copilot's consumers branch on a weighted numeric
 *       `schema.score` (0-8) the module never emits (it gives flat booleans; no
 *       h2/h3/schemaWordCount) → a consumer rewrite, not a swap (ncdb
 *       normalized-shape trap).
 *   (3) TAXONOMY — module {article,hub,unknown}+9 detailed labels vs copilot
 *       {article,hub,nav,other}; nav/other have no module source.
 * AND copilot's contentSignals do not even GATE the article/hub decision
 * (ArticleProcessor.js: `isArticle = looksLikeArticle(url) || wordCount>150`), so
 * the extra parse buys zero decision value on the hot path. The module's real
 * value (paywall/opinion/product/error/login detection) is NEW capability with no
 * copilot content-signal home — adopt it ADDITIVELY on OFFLINE passes
 * (detect-articles / analyse-pages), never the crawl worker hot path, and only
 * behind the differential harness (tools/intelligence/doc-intel-diff.js). See
 * docs/plans/2026-07-22-intelligence-extraction.md.
 */

const path = require('path');
const { pathToFileURL } = require('url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODULE_NAME = '@metabench/news-crawler-document-intelligence';

/** The module's coarse fuser-compatible general-stage labels. */
const GENERAL_LABELS = Object.freeze(['article', 'hub', 'nav', 'unknown']);
/** The module's detailed document taxonomy (9 values). */
const DETAILED_LABELS = Object.freeze([
  'news_article', 'opinion_article', 'blog_post', 'listing_page', 'product_page',
  'organization_page', 'error_page', 'login_page', 'unknown',
]);

function defaultImportCandidates() {
  return [
    MODULE_NAME,
    pathToFileURL(path.resolve(REPO_ROOT, '..', 'news-crawler-document-intelligence', 'dist', 'index.js')).href,
  ];
}

/**
 * Dynamically import the ESM document-intelligence module. Installed package
 * first, then the sibling-repo dist build. Throws LOUD on total failure (never
 * silently degrades — a missing sibling build must surface).
 */
async function importDocumentIntelligence(options = {}) {
  const importer = options.importer || ((specifier) => import(specifier));
  const candidates = options.candidates || defaultImportCandidates();
  const failures = [];
  for (const candidate of candidates) {
    try {
      const mod = await importer(candidate);
      if (mod && typeof mod.analyze_document === 'function') return mod;
      failures.push(`${candidate}: loaded but has no analyze_document export`);
    } catch (err) {
      failures.push(`${candidate}: ${err && err.message ? err.message : String(err)}`);
    }
  }
  throw new Error(
    'Unable to import news-crawler-document-intelligence. Build/install '
    + '../news-crawler-document-intelligence first (npm run build in that repo). '
    + failures.join('; ')
  );
}

/**
 * Classify one HTML document via the module. Sync (the passed `mod` is a
 * pre-loaded namespace). Guard-wrapped: the module assumes a string and
 * `cheerio.load` throws on a non-string, so bad input returns a synthetic
 * 'unknown' rather than throwing (a consumer must never crash on a null page).
 *
 * @param {object} mod pre-loaded module namespace
 * @param {string} html raw HTML string
 * @param {string} [url] optional absolute URL (canonical-host comparison)
 * @returns {{label:string, classification:string, confidence:number, reasons:string[]}}
 */
function classifyDocument(mod, html, url) {
  if (!mod || typeof mod.analyze_document !== 'function') {
    return { label: 'unknown', classification: 'unknown', confidence: 0, reasons: ['module unavailable'] };
  }
  if (typeof html !== 'string' || html.length === 0) {
    return { label: 'unknown', classification: 'unknown', confidence: 0, reasons: ['non-string or empty HTML'] };
  }
  let r;
  try {
    r = mod.analyze_document(html, typeof url === 'string' ? url : undefined);
  } catch (err) {
    return { label: 'unknown', classification: 'unknown', confidence: 0, reasons: ['analyze_document threw: ' + (err && err.message ? err.message : String(err))] };
  }
  const results = r && r.results ? r.results : null;
  if (!results) return { label: 'unknown', classification: 'unknown', confidence: 0, reasons: ['module returned no results'] };
  return {
    label: results.label,
    classification: results.classification,
    confidence: results.confidence,
    reasons: results.reasons || [],
    facts: results.facts,
  };
}

/**
 * Pre-load the module ONCE and return a synchronous, guard-wrapped classifier.
 *   const docIntel = await createDocumentClassifier();  // once, at startup
 *   docIntel.classifyDocument(html, url);                // sync
 */
async function createDocumentClassifier(options = {}) {
  const mod = await importDocumentIntelligence(options);
  return {
    module: mod,
    classifyDocument: (html, url) => classifyDocument(mod, html, url),
  };
}

module.exports = {
  MODULE_NAME,
  GENERAL_LABELS,
  DETAILED_LABELS,
  importDocumentIntelligence,
  createDocumentClassifier,
  classifyDocument,
};
