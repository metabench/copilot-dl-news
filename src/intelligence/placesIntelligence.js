'use strict';

/**
 * placesIntelligence.js — the copilot-side BRIDGE to the sibling
 * `news-crawler-places-intelligence` module (module-ecosystem directive,
 * 2026-07-22). copilot-dl-news is the coordinator; the multilingual
 * place-detection engine (gazetteer index + script-aware normalization +
 * classifier signals) lives in the module. This file is the thin call-through,
 * the third intelligence bridge after [urlIntelligence.js] and
 * [documentIntelligence.js].
 *
 * WHY A BRIDGE (not a require): the module is ESM-only (`"type":"module"`,
 * scoped `@metabench/news-crawler-places-intelligence`), so a CommonJS file
 * cannot `require()` it (ERR_REQUIRE_ESM). We mirror the proven dual-candidate
 * dynamic-`import()`: the installed package specifier first, then a
 * `pathToFileURL` fallback to the sibling repo's built `dist/`. The module is
 * NOT (yet) a hard `file:../` dependency — nothing on copilot's core path
 * consumes it (this cycle SCOUTS + MEASURES the delegation; see
 * docs/plans/2026-07-22-intelligence-extraction.md §7). Promotion to a hard dep
 * is the future additive-consumer step.
 *
 * THE ASYNC BOUNDARY IS AT CONSTRUCTION, NOT PER-CALL. Unlike url/document
 * intelligence (whose classify fns are pure and stateless), this module builds
 * an in-memory gazetteer name-index ONCE from the DB — that build is async and
 * can be large (tier1 ≈ 486k names, tier2 ≈ 680k over copilot's news.db). After
 * `createPlacesEngine()` resolves, `engine.find_in_text(text, {article_lang})`
 * and `engine.find_in_url(url)` are SYNCHRONOUS and pure (no FS/network/Date in
 * the detection; only `processing_time_ms` is wall-clock). So a consumer builds
 * the engine ONCE at startup and calls the returned methods synchronously.
 *
 * THE GAZETTEER ACCESS BOUNDARY. The module contains ZERO SQL — it reads every
 * name through an ncdb `SqliteGazetteerAccess` object duck-typed on
 * `listPlaceNameRowsForIndex(options)`. That access object is obtained from ncdb
 * via `createDbAdapter({type:'sqlite', path, readonly}).gazetteer`. This bridge
 * accepts EITHER a caller-supplied `gazetteerAccess` (production: reuse
 * copilot's already-constructed ncdb adapter) OR a `dbPath` (the bridge opens a
 * readonly ncdb adapter itself — the harness path). It is NEVER a raw
 * better-sqlite3 handle (passing one FAILS inside the module).
 */

const path = require('path');
const { pathToFileURL } = require('url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODULE_NAME = '@metabench/news-crawler-places-intelligence';

/**
 * The module's place-detection verdict taxonomy (classifier/classifier.ts).
 * NOTE (delegation≠repoint, per [[cross-taxonomy-delegation-is-a-repoint]]):
 * this is a DIFFERENT shape from copilot's two existing place tables —
 * `article_places` is keyed on a place NAME string, `article_place_relations`
 * on a places.id FK with a `relation_type`/`matching_rule_level`. The module
 * emits `{place_id, verdict, classification_score, signals[]}`. Adopting it is a
 * behavior change to be MEASURED (the harness), never a silent repoint.
 */
const MODULE_VERDICTS = Object.freeze(['place', 'not_place', 'uncertain']);

/** Tier presets the module applies at index-build (name_index_builder.ts). */
const TIERS = Object.freeze(['tier1', 'tier2', 'all']);

/**
 * Default function-word stop set for the place post-filter (cycle 84). The
 * cycle-83 gate measured that the module's tier1 false positives are DOMINATED
 * by ordinary function words whose surface form equals a 2-letter ISO code / a
 * tiny gazetteer place (It→IT-Italy, and→AND-Andorra, to→TO-Tonga, in→IN-India,
 * is→IS-Iceland, he→HE, on→ON-Ontario, by, for, be…). These are pure
 * function-word homographs, never the intended sense in news prose, so a
 * surface-form stop set is the precision lever the module lacks by default.
 * Includes the most common non-Latin function words observed (Arabic من "from").
 * Matched against the LOWERCASED surface form (Place_Match.matched_name).
 */
const DEFAULT_STOP_WORDS = Object.freeze(new Set([
  // English articles / conjunctions / prepositions
  'a', 'an', 'the', 'and', 'or', 'but', 'nor', 'if', 'of', 'to', 'in', 'on', 'at',
  'by', 'for', 'from', 'with', 'as', 'into', 'onto', 'off', 'up', 'out', 'over',
  // English pronouns
  'i', 'me', 'my', 'we', 'us', 'our', 'you', 'your', 'he', 'him', 'his', 'she',
  'her', 'it', 'its', 'they', 'them', 'their', 'this', 'that', 'these', 'those', 'who',
  // English auxiliaries / common verbs / adverbs that are also place homographs
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am', 'will', 'would', 'may',
  'might', 'can', 'could', 'should', 'must', 'do', 'does', 'did', 'has', 'have', 'had',
  'come', 'go', 'most', 'more', 'all', 'any', 'some', 'no', 'not', 'so', 'than',
  'then', 'now', 'here', 'there', 'when', 'where', 'how', 'why', 'what',
  // Spanish / Portuguese / Italian function words (es is the #2 article language;
  // "El"→place was a measured cycle-84 FP)
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'y', 'o',
  'en', 'con', 'por', 'para', 'que', 'se', 'su', 'sus', 'lo', 'le', 'les', 'como',
  'da', 'do', 'dos', 'das', 'um', 'uma', 'e', 'ou', 'com', 'por', 'para', 'que',
  'il', 'lo', 'gli', 'una', 'di', 'del', 'della', 'che', 'con', 'per', 'non',
  // French / German / Dutch high-frequency function words
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'et', 'ou', 'que', 'qui', 'dans',
  'pour', 'avec', 'sur', 'ne', 'pas', 'ce', 'der', 'die', 'das', 'und', 'ein',
  'eine', 'den', 'dem', 'ist', 'im', 'zu', 'von', 'mit', 'auf', 'het', 'een', 'van',
  // Non-Latin function words seen as FPs in the cycle-83 smoke test
  'من', 'في', 'على', 'عن', 'إلى',
]));

/** Confidence floor for the post-filter: real places measured >=0.85; FP tail <=0.80. */
const DEFAULT_MIN_CONFIDENCE = 0.75;

/**
 * Precision post-filter for raw module matches (cycle 84, measured-not-guessed).
 * Drops a match if EITHER (a) its lowercased surface form is a known function
 * word (the dominant FP class), OR (b) its confidence is below the floor (the
 * lower-confidence common-noun tail: Police 0.70, as→Aš 0.55, come→Côme 0.55).
 * Real places clear both (>=0.85 confidence, proper-noun surface). PURE +
 * exported so the harness can A/B raw-vs-filtered and tests can lock it.
 *
 * @param {Array} results Place_Match[] from the module
 * @param {object} [opts] { stopWords?:Set|Array, minConfidence?:number }
 * @returns {Array} filtered Place_Match[]
 */
function filterPlaceMatches(results, opts = {}) {
  if (!Array.isArray(results)) return [];
  const stop = opts.stopWords instanceof Set ? opts.stopWords
    : Array.isArray(opts.stopWords) ? new Set(opts.stopWords.map((w) => String(w).toLowerCase()))
    : DEFAULT_STOP_WORDS;
  const minConf = typeof opts.minConfidence === 'number' ? opts.minConfidence : DEFAULT_MIN_CONFIDENCE;
  return results.filter((m) => {
    if (!m) return false;
    const surface = String(m.matched_name || '').trim().toLowerCase();
    if (stop.has(surface)) return false;
    if (typeof m.confidence === 'number' && m.confidence < minConf) return false;
    return true;
  });
}

function defaultImportCandidates() {
  return [
    MODULE_NAME,
    pathToFileURL(path.resolve(REPO_ROOT, '..', 'news-crawler-places-intelligence', 'dist', 'index.js')).href,
  ];
}

/**
 * Dynamically import the ESM places-intelligence module. Tries the installed
 * package first, then the sibling-repo dist build. Throws LOUD on total failure
 * (never silently degrades — a missing sibling build must surface, not
 * masquerade as a working-but-empty detector).
 *
 * @param {object} [options]
 * @param {(specifier:string)=>Promise<object>} [options.importer]
 * @param {string[]} [options.candidates]
 * @returns {Promise<object>} the module namespace ({ create_places_engine, ... })
 */
async function importPlacesIntelligence(options = {}) {
  const importer = options.importer || ((specifier) => import(specifier));
  const candidates = options.candidates || defaultImportCandidates();
  const failures = [];
  for (const candidate of candidates) {
    try {
      const mod = await importer(candidate);
      if (mod && typeof mod.create_places_engine === 'function') return mod;
      failures.push(`${candidate}: loaded but has no create_places_engine export`);
    } catch (err) {
      failures.push(`${candidate}: ${err && err.message ? err.message : String(err)}`);
    }
  }
  throw new Error(
    'Unable to import news-crawler-places-intelligence. Build/install '
    + '../news-crawler-places-intelligence first (npm run build in that repo). '
    + failures.join('; ')
  );
}

/**
 * Obtain an ncdb gazetteer access object over a sqlite DB path. This is the
 * `db.gazetteer` the module needs. Opens a READONLY ncdb adapter (the module
 * only reads place_names/places). Async because some ncdb adapter factories are.
 *
 * @param {string} dbPath absolute path to news.db
 * @param {object} [deps] injectable for tests ({ createDbAdapter })
 * @returns {Promise<object>} the gazetteer access object (adapter.gazetteer)
 */
async function gazetteerAccessFromDbPath(dbPath, deps = {}) {
  const createDbAdapter = deps.createDbAdapter
    || require('news-crawler-db').createDbAdapter;
  if (typeof createDbAdapter !== 'function') {
    throw new Error('news-crawler-db.createDbAdapter unavailable — cannot build gazetteer access');
  }
  const adapter = await Promise.resolve(createDbAdapter({ type: 'sqlite', path: dbPath, readonly: true }));
  if (!adapter || !adapter.gazetteer) {
    throw new Error('ncdb adapter has no .gazetteer access object');
  }
  return adapter.gazetteer;
}

/**
 * Run place detection over a text, via a pre-built engine. Sync + guard-wrapped:
 * bad input or ANY throw from the module returns a synthetic empty result rather
 * than propagating, so a consumer (e.g. an offline analysis pass over article
 * body_text) never crashes on a null/oddly-encoded row.
 *
 * @param {object} engine a Places_Engine (from createPlacesEngine)
 * @param {string} text article text (title + body)
 * @param {object} [options] { article_lang, include_uncertain, max_matches, ... }
 * @returns {{module:string, results:Array, confidence:number, processing_time_ms:number}}
 */
function findPlacesInText(engine, text, options = {}) {
  const empty = { module: 'places', results: [], confidence: 0, processing_time_ms: 0 };
  if (!engine || typeof engine.find_in_text !== 'function') return { ...empty, error: 'engine unavailable' };
  if (typeof text !== 'string' || text.length === 0) return { ...empty, error: 'non-string or empty text' };
  try {
    const r = engine.find_in_text(text, options);
    if (!r || !Array.isArray(r.results)) return { ...empty, error: 'engine returned no results array' };
    // Opt-in precision post-filter: pass options.filter = true (defaults) or an
    // object {stopWords, minConfidence}. Off by default so the harness can A/B.
    if (options && options.filter) {
      const fopts = options.filter === true ? {} : options.filter;
      const filtered = filterPlaceMatches(r.results, fopts);
      return { ...r, results: filtered, raw_count: r.results.length };
    }
    return r;
  } catch (err) {
    return { ...empty, error: 'find_in_text threw: ' + (err && err.message ? err.message : String(err)) };
  }
}

/**
 * Run place detection over a URL, via a pre-built engine. Sync + guard-wrapped.
 *
 * @param {object} engine a Places_Engine
 * @param {string} url absolute URL string
 * @returns {{module:string, results:object, confidence:number, processing_time_ms:number}}
 */
function findPlacesInUrl(engine, url) {
  const empty = { module: 'places', results: { best_chain: [], all_matches: [], topic_segments: [] }, confidence: 0, processing_time_ms: 0 };
  if (!engine || typeof engine.find_in_url !== 'function') return { ...empty, error: 'engine unavailable' };
  if (typeof url !== 'string' || url.length === 0) return { ...empty, error: 'non-string or empty url' };
  try {
    const r = engine.find_in_url(url);
    if (!r || !r.results) return { ...empty, error: 'engine returned no results' };
    return r;
  } catch (err) {
    return { ...empty, error: 'find_in_url threw: ' + (err && err.message ? err.message : String(err)) };
  }
}

/**
 * Build the places engine ONCE and return sync, guard-wrapped call-throughs.
 * This is the shape a consumer with a sync hot path uses:
 *   const places = await createPlacesEngine({ dbPath: 'data/news.db', tier: 'tier2' });
 *   places.findInText(articleText, { article_lang: 'en' });   // sync, hot path
 *
 * @param {object} [options]
 * @param {object} [options.gazetteerAccess] a pre-built ncdb gazetteer access (production: reuse copilot's adapter)
 * @param {string} [options.dbPath] path to news.db (the bridge opens a readonly ncdb adapter itself)
 * @param {string} [options.tier='tier2'] index tier preset
 * @param {object} [options.engineOptions] extra Engine_Options merged in (min_population, place_kinds, ...)
 * @param {(s:string)=>Promise<object>} [options.importer] test seam
 * @param {string[]} [options.candidates] test seam
 * @param {object} [options.deps] test seam for gazetteerAccessFromDbPath ({ createDbAdapter })
 * @returns {Promise<{engine:object, findInText:Function, findInUrl:Function, stats:Function, module:object}>}
 */
async function createPlacesEngine(options = {}) {
  const mod = await importPlacesIntelligence(options);
  const tier = TIERS.includes(options.tier) ? options.tier : 'tier2';
  let access = options.gazetteerAccess;
  if (!access) {
    if (!options.dbPath) throw new Error('createPlacesEngine needs either gazetteerAccess or dbPath');
    access = await gazetteerAccessFromDbPath(options.dbPath, options.deps || {});
  }
  const engineOptions = Object.assign({ tier }, options.engineOptions || {});
  const engine = await mod.create_places_engine(access, engineOptions);
  // A stored filter config is applied by the bound findInText by default (the
  // enrichment path wants clean output); pass filter:false per-call to get raw.
  const storedFilter = options.filter;
  return {
    module: mod,
    engine,
    findInText: (text, opts = {}) => {
      const merged = (opts.filter === undefined && storedFilter !== undefined)
        ? { ...opts, filter: storedFilter } : opts;
      return findPlacesInText(engine, text, merged);
    },
    findInUrl: (url) => findPlacesInUrl(engine, url),
    stats: () => (typeof engine.stats === 'function' ? engine.stats() : null),
  };
}

module.exports = {
  MODULE_NAME,
  MODULE_VERDICTS,
  TIERS,
  DEFAULT_STOP_WORDS,
  DEFAULT_MIN_CONFIDENCE,
  importPlacesIntelligence,
  gazetteerAccessFromDbPath,
  createPlacesEngine,
  findPlacesInText,
  findPlacesInUrl,
  filterPlaceMatches,
};
