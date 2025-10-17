#!/usr/bin/env node

'use strict';

const path = require('path');
const { findProjectRoot } = require('../utils/project-root');
const { ensureDb } = require('../db/sqlite/ensureDb');
const { buildGazetteerMatchers, extractPlacesFromUrl } = require('../analysis/place-extraction');
const { detectPlaceHub } = require('./placeHubDetector');
const { loadNonGeoTopicSlugs } = require('./nonGeoTopicSlugs');
const HubValidator = require('../hub-validation/HubValidator');

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseCliArgs(rawArgs) {
  const options = {
    dbPath: null,
    limit: null,  // null = no limit, process all articles
    host: null,
    dryRun: true,
  list: true,
  listLimit: null,
  unknownListLimit: 20,
    includeEvidence: false,
    json: false,
    minNavLinks: 10,
    maxPathSegments: 5,
    verbose: false
  };

  for (let i = 0; i < rawArgs.length; i++) {
    const raw = rawArgs[i];
    if (!raw) continue;

    if (raw === '--help' || raw === '-h') {
      options.help = true;
      continue;
    }
    if (raw === '--apply' || raw === '--no-dry-run') {
      options.dryRun = false;
      continue;
    }
    if (raw === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (raw === '--no-list') {
      options.list = false;
      continue;
    }
    if (raw === '--list') {
      options.list = true;
      continue;
    }
    if (raw === '--include-evidence') {
      options.includeEvidence = true;
      continue;
    }
    if (raw === '--json') {
      options.json = true;
      continue;
    }
    if (raw === '--verbose') {
      options.verbose = true;
      continue;
    }

    if (!raw.startsWith('--')) {
      // positional arg -> host filter for convenience
      options.host = raw;
      continue;
    }

    const sep = raw.indexOf('=');
    let key = sep === -1 ? raw : raw.slice(0, sep);
    let value = sep === -1 ? null : raw.slice(sep + 1);

    // If no value and next arg doesn't start with --, use it as the value
    if (value === null && i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('-')) {
      value = rawArgs[i + 1];
      i += 1;
    }

    switch (key) {
      case '--db':
      case '--db-path':
        options.dbPath = value || null;
        break;
      case '--host':
        options.host = value || null;
        break;
      case '--limit':
        options.limit = Number(value);
        break;
      case '--list-limit':
        options.listLimit = Number(value);
        break;
      case '--unknown-list-limit':
        options.unknownListLimit = Number(value);
        break;
      case '--min-nav-links':
        options.minNavLinks = Number(value);
        break;
      case '--max-path-segments':
        options.maxPathSegments = Number(value);
        break;
      case '--dry-run':
        options.dryRun = toBoolean(value, true);
        break;
      case '--list':
        options.list = toBoolean(value, true);
        break;
      case '--include-evidence':
        options.includeEvidence = toBoolean(value, false);
        break;
      case '--json':
        options.json = toBoolean(value, false);
        break;
      default:
        // ignore unknown flags for flexibility
        break;
    }
  }

  if (options.limit == null || Number.isNaN(Number(options.limit))) {
    options.limit = null;  // null means no limit, process all
  } else {
    options.limit = Math.max(1, Math.min(Math.floor(options.limit), 50000));
  }

  if (options.listLimit != null) {
    const parsedListLimit = Number(options.listLimit);
    if (Number.isFinite(parsedListLimit) && parsedListLimit >= 0) {
      options.listLimit = Math.floor(parsedListLimit);
    } else {
      options.listLimit = null;
    }
  }

  if (options.unknownListLimit != null) {
    const parsedUnknownLimit = Number(options.unknownListLimit);
    if (Number.isFinite(parsedUnknownLimit) && parsedUnknownLimit >= 0) {
      options.unknownListLimit = Math.floor(parsedUnknownLimit);
    } else {
      options.unknownListLimit = 20;
    }
  } else {
    options.unknownListLimit = 20;
  }

  if (options.minNavLinks == null || Number.isNaN(Number(options.minNavLinks))) {
    options.minNavLinks = 10;
  }
  options.minNavLinks = Math.max(0, Math.floor(options.minNavLinks));

  if (options.maxPathSegments == null || Number.isNaN(Number(options.maxPathSegments))) {
    options.maxPathSegments = 5;
  }
  options.maxPathSegments = Math.max(1, Math.floor(options.maxPathSegments));

  return options;
}

function collectGazetteerPlaceNames(matchers) {
  const names = new Set();
  if (!matchers || !matchers.placeIndex) return names;
  for (const record of matchers.placeIndex.values()) {
    if (!record) continue;
    if (record.name) names.add(record.name);
    if (record.names && record.names.forEach) {
      record.names.forEach((name) => names.add(name));
    }
    if (Array.isArray(record.synonyms)) {
      for (const synonym of record.synonyms) {
        if (synonym) names.add(synonym);
      }
    }
  }
  return names;
}

function shouldSkipByPath(url, maxPathSegments) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    return true;
  }
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (!segments.length) return true;
  if (segments.length > maxPathSegments) return true;

  const last = segments[segments.length - 1];
  if (!last || last.length <= 1) return true;
  if (/\d{2,}/.test(last)) return true; // skip dated/article URLs
  if (/[\.?#]/.test(last)) return true;
  if (last === 'index' || last === 'all') return true;

  return false;
}

function parseAnalysisPlaces(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const places = parsed?.findings?.places;
    if (Array.isArray(places)) return places;
  } catch (_) {
    // ignore malformed analysis blobs
  }
  return [];
}

function normalizeClassification(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;
  if (['nav', 'navigation', 'hub'].includes(normalized)) return 'nav';
  return normalized;
}

function findPlaceHubs(options = {}) {
  const projectRoot = findProjectRoot(__dirname);
  const resolvedDbPath = options.dbPath
    ? path.isAbsolute(options.dbPath) ? options.dbPath : path.join(process.cwd(), options.dbPath)
    : path.join(projectRoot, 'data', 'news.db');

  const dryRun = options.dryRun !== false ? true : false;
  const list = options.list !== false;
  const listLimit = Number.isFinite(options.listLimit) && options.listLimit >= 0
    ? options.listLimit
    : null;
  const unknownListLimit = Number.isFinite(options.unknownListLimit) && options.unknownListLimit >= 0
    ? options.unknownListLimit
    : 20;
  const includeEvidence = Boolean(options.includeEvidence);
  const minNavLinks = options.minNavLinks ?? 10;
  const maxPathSegments = options.maxPathSegments ?? 5;
  const verbose = Boolean(options.verbose);

  const db = ensureDb(resolvedDbPath);

  const validator = new HubValidator(db);
  validator.initialize();

  try {
    const gazetteerMatchers = buildGazetteerMatchers(db);
    const gazetteerPlaceNames = collectGazetteerPlaceNames(gazetteerMatchers);
    const nonGeoTopicSlugData = loadNonGeoTopicSlugs(db);
    const nonGeoTopicSlugs = nonGeoTopicSlugData.slugs;

    // Build query with optional LIMIT clause (null = no limit)
    const limitClause = options.limit ? `LIMIT ${options.limit}` : '';
    const selectCandidates = db.prepare(`
      SELECT a.url,
        a.title,
        a.section,
        a.host,
        a.analysis,
        a.word_count AS article_word_count,
             lf.classification,
             lf.word_count AS fetch_word_count,
             lf.ts AS last_fetch_at,
             a.crawled_at
        FROM articles a
   LEFT JOIN latest_fetch lf ON lf.url = a.url
       WHERE a.url LIKE 'http%'
         ${options.host ? 'AND LOWER(a.host) = LOWER(?)' : ''}
    ORDER BY COALESCE(lf.ts, a.crawled_at) DESC
       ${limitClause}
    `);

    const selectFetchStats = db.prepare(`
      SELECT nav_links_count, article_links_count, word_count, analysis
        FROM fetches
       WHERE url = ?
    ORDER BY COALESCE(fetched_at, request_started_at) DESC
       LIMIT 1
    `);

    const selectHubByUrl = db.prepare('SELECT id, place_slug FROM place_hubs WHERE url = ?');
    const insertHub = db.prepare(`
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
    const updateHub = db.prepare(`
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
    const upsertUnknownTerm = db.prepare(`
      INSERT INTO place_hub_unknown_terms(
        host,
        url,
        canonical_url,
        term_slug,
        term_label,
        source,
        reason,
        confidence,
        evidence,
        occurrences,
        first_seen_at,
        last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
      ON CONFLICT(host, canonical_url, term_slug) DO UPDATE SET
        term_label = COALESCE(excluded.term_label, term_label),
        source = COALESCE(excluded.source, source),
        reason = COALESCE(excluded.reason, reason),
        confidence = COALESCE(excluded.confidence, confidence),
        evidence = COALESCE(excluded.evidence, evidence),
        occurrences = occurrences + 1,
        last_seen_at = datetime('now')
    `);

    // Execute query with only host parameter if provided (LIMIT is now part of query string)
    const candidateRows = selectCandidates.all(
      ...(options.host ? [options.host] : [])
    );

    if (options.verbose) {
      console.error(`[find-place-hubs] query params: host=${options.host || 'none'}, limit=${options.limit}, rows=${candidateRows.length}`);
    }

    let processed = 0;
    let evaluated = 0;
    let matched = 0;
    let validated = 0;
    let rejected = 0;
  let articleScreened = 0;
    let inserted = 0;
    let updated = 0;
    let variants = 0;
    let unknown = 0;

    const hubs = [];
    const variantHubs = [];
  const unknownTerms = [];
  const articleRejections = [];

    for (const row of candidateRows) {
      processed += 1;

      if (!row?.url) continue;
      if (shouldSkipByPath(row.url, maxPathSegments)) continue;

      const classification = normalizeClassification(row.classification);
      const fetchStats = selectFetchStats.get(row.url) || {};
      const navLinksCount = Number(fetchStats.nav_links_count ?? null);
      const articleLinksCount = Number(fetchStats.article_links_count ?? null);
      const fetchWordCount = (() => {
        const direct = Number(fetchStats.word_count);
        if (Number.isFinite(direct)) return direct;
        const fallback = Number(row.fetch_word_count);
        return Number.isFinite(fallback) ? fallback : null;
      })();
      const articleWordCount = (() => {
        const direct = Number(row.article_word_count);
        return Number.isFinite(direct) ? direct : null;
      })();
      const wordCount = fetchWordCount ?? articleWordCount;
      const fetchAnalysis = fetchStats.analysis || null;

      if (!classification && (navLinksCount == null || navLinksCount < minNavLinks)) {
        continue;
      }
      if (classification !== 'nav' && navLinksCount != null && navLinksCount < minNavLinks) {
        continue;
      }

      evaluated += 1;

      let urlPlaceAnalysis;
      try {
        urlPlaceAnalysis = extractPlacesFromUrl(row.url, gazetteerMatchers, { includeTopics: true });
      } catch (error) {
        if (verbose) {
          console.warn('[find-place-hubs] failed to analyze url', row.url, error?.message || error);
        }
        continue;
      }

      const chain = Array.isArray(urlPlaceAnalysis?.bestChain?.places) && urlPlaceAnalysis.bestChain.places.length
        ? urlPlaceAnalysis.bestChain.places
        : (Array.isArray(urlPlaceAnalysis?.matches) ? urlPlaceAnalysis.matches : []);
      if (!chain.length) {
        continue;
      }

      const analysisPlaces = parseAnalysisPlaces(row.analysis);

      const hubCandidate = detectPlaceHub({
        url: row.url,
        title: row.title,
        urlPlaceAnalysis,
        analysisPlaces,
        section: row.section,
        fetchClassification: classification,
        latestClassification: row.classification,
        navLinksCount,
        articleLinksCount,
        wordCount,
        articleWordCount,
        fetchWordCount,
        articleAnalysis: row.analysis,
        fetchAnalysis,
        gazetteerPlaceNames,
        minNavLinksThreshold: minNavLinks,
        nonGeoTopicSlugs
      });

      if (!hubCandidate) {
        continue;
      }

      if (hubCandidate.kind === 'article-screened') {
        articleScreened += 1;
        if (list) {
          const detection = hubCandidate.articleDetection || {};
          articleRejections.push({
            url: row.url,
            canonical_url: hubCandidate.canonicalUrl || row.url,
            host: hubCandidate.host,
            nav_links_count: hubCandidate.navLinksCount,
            article_links_count: hubCandidate.articleLinksCount,
            word_count: hubCandidate.wordCount,
            score: typeof detection.score === 'number' ? detection.score : null,
            confidence: typeof detection.confidence === 'number' ? detection.confidence : null,
            reasons: detection.reasons || [],
            rejections: detection.rejections || []
          });
        }
        continue;
      }

      if (hubCandidate.kind === 'unknown') {
        if (Array.isArray(hubCandidate.unknownTerms) && hubCandidate.unknownTerms.length) {
          for (const term of hubCandidate.unknownTerms) {
            const entry = {
              host: hubCandidate.host,
              url: row.url,
              canonical_url: hubCandidate.canonicalUrl || row.url,
              term_slug: term.slug,
              term_label: term.label || null,
              source: term.source || null,
              reason: term.reason || null,
              confidence: term.confidence || null,
              evidence: hubCandidate.evidence ? JSON.stringify(hubCandidate.evidence) : null
            };

            unknownTerms.push(entry);

            if (!dryRun) {
              try {
                upsertUnknownTerm.run(
                  entry.host,
                  entry.url,
                  entry.canonical_url,
                  entry.term_slug,
                  entry.term_label,
                  entry.source,
                  entry.reason,
                  entry.confidence,
                  entry.evidence
                );
              } catch (error) {
                if (verbose) {
                  console.warn('[find-place-hubs] failed to upsert unknown term', entry.term_slug, error?.message || error);
                }
              }
            }
          }
          unknown += hubCandidate.unknownTerms.length;
        }
        continue;
      }

      if (!hubCandidate.placeSlug) {
        continue;
      }

      matched += 1;

      const canonicalUrl = hubCandidate.canonicalUrl || row.url;
      const validation = validator.validatePlaceHub(row.title || '', canonicalUrl);
      if (!validation?.isValid) {
        rejected += 1;
        continue;
      }

      if (!hubCandidate.isFrontPage) {
        variants += 1;
        if (list) {
          const entry = {
            url: row.url,
            canonical_url: canonicalUrl,
            host: hubCandidate.host,
            title: row.title || null,
            place_slug: hubCandidate.placeSlug,
            place_label: hubCandidate.placeLabel || null,
            place_kind: hubCandidate.placeKind || null,
            topic_slug: hubCandidate.topic?.slug ?? null,
            topic_label: hubCandidate.topic?.label ?? null,
            topic_kind: hubCandidate.topic?.kind ?? null,
            nav_links_count: hubCandidate.navLinksCount,
            article_links_count: hubCandidate.articleLinksCount,
            word_count: hubCandidate.wordCount,
            action: 'variant',
            variant_kind: hubCandidate.variantKind || null,
            variant_value: hubCandidate.variantValue || null
          };
          if (includeEvidence) {
            entry.evidence = hubCandidate.evidence || null;
          }
          entry.validation_reason = validation.reason || null;
          variantHubs.push(entry);
        }
        continue;
      }

      validated += 1;

      const existing = selectHubByUrl.get(canonicalUrl) || null;
      const isNew = !existing;

      if (!dryRun) {
        try {
          insertHub.run(
            hubCandidate.host,
            canonicalUrl,
            hubCandidate.placeSlug,
            hubCandidate.placeKind,
            hubCandidate.topic?.slug ?? null,
            hubCandidate.topic?.label ?? null,
            hubCandidate.topic?.kind ?? null,
            row.title || null,
            hubCandidate.navLinksCount,
            hubCandidate.articleLinksCount,
            JSON.stringify(hubCandidate.evidence)
          );
          updateHub.run(
            hubCandidate.placeSlug,
            hubCandidate.placeKind,
            hubCandidate.topic?.slug ?? null,
            hubCandidate.topic?.label ?? null,
            hubCandidate.topic?.kind ?? null,
            row.title || null,
            hubCandidate.navLinksCount,
            hubCandidate.articleLinksCount,
            JSON.stringify(hubCandidate.evidence),
            canonicalUrl
          );
        } catch (error) {
          if (verbose) {
            console.warn('[find-place-hubs] failed to persist hub', row.url, error?.message || error);
          }
          continue;
        }
      }

      if (isNew) inserted += 1;
      else updated += 1;

      if (list) {
        const entry = {
          url: row.url,
          host: hubCandidate.host,
          title: row.title || null,
          place_slug: hubCandidate.placeSlug,
          place_label: hubCandidate.placeLabel || null,
          place_kind: hubCandidate.placeKind || null,
          topic_slug: hubCandidate.topic?.slug ?? null,
          topic_label: hubCandidate.topic?.label ?? null,
          topic_kind: hubCandidate.topic?.kind ?? null,
          nav_links_count: hubCandidate.navLinksCount,
          article_links_count: hubCandidate.articleLinksCount,
          word_count: hubCandidate.wordCount,
          action: isNew ? 'insert' : 'update',
          canonical_url: canonicalUrl,
          is_front_page: true
        };
        if (includeEvidence) {
          entry.evidence = hubCandidate.evidence || null;
        }
        entry.validation_reason = validation.reason || null;
        hubs.push(entry);
      }
    }

    const summary = {
      dbPath: resolvedDbPath,
      processed,
      evaluated,
      matched,
      validated,
      rejected,
      articleRejected: articleScreened,
      inserted,
      updated,
      variants,
      unknown,
      skipped: processed - matched,
      dryRun,
      limit: options.limit,
      host: options.host || null,
      minNavLinks,
      maxPathSegments,
      listLimit,
      unknownListLimit
    };

    return { summary, hubs, variants: variantHubs, unknownTerms, articleRejections };
  } finally {
    try {
      db.close();
    } catch (_) {
      // ignore close failures
    }
  }
}

function printHelp() {
  console.log(`
find-place-hubs.js — Fast place hub discovery based on URL heuristics

Usage:
  node src/tools/find-place-hubs.js [options]

Options:
  --db=PATH               Path to SQLite database (defaults to data/news.db)
  --limit=N               Maximum articles to scan (no limit by default, scans all)
  --host=example.com      Restrict to a single host/domain
  --dry-run               Do not write to place_hubs (default)
  --apply                 Persist detected hubs to place_hubs table
  --list                  Show detected hubs (default: true)
  --no-list               Suppress hub list display
  --list-limit=N          Limit number of listed hubs/variants (default: unlimited, 0 = unlimited)
  --unknown-list-limit=N  Limit number of listed unknown terms (default: 20, 0 = unlimited)
  --min-nav-links=N       Minimum nav_links_count to consider (default: 10)
  --max-path-segments=N   Maximum URL path segments to inspect (default: 5)
  --include-evidence      Include JSON evidence payload in listings
  --json                  Emit JSON summary (includes hubs array)
  --verbose               Print warnings when URL analysis fails
  --help                  Show this message

You can also pass a bare hostname (e.g. "theguardian.com") as a positional argument.
`);
}

function main() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const { summary, hubs, variants, unknownTerms, articleRejections } = findPlaceHubs(options);

  if (options.json) {
    console.log(JSON.stringify({ summary, hubs, variants, unknownTerms, articleRejections }, null, 2));
    return;
  }

  const dryLabel = summary.dryRun ? 'DRY-RUN' : 'APPLY';
  const unknownPart = summary.unknown ? `, unknown terms ${summary.unknown}` : '';
  const articlePart = summary.articleRejected ? `, screened ${summary.articleRejected} article-like pages` : '';
  console.log(`[find-place-hubs] ${dryLabel} processed ${summary.processed} articles, evaluated ${summary.evaluated}, validated ${summary.validated} hubs (${summary.inserted} new, ${summary.updated} existing), variants ${summary.variants}${unknownPart}${articlePart}.`);

  const listLimit = Number.isFinite(summary.listLimit) && summary.listLimit >= 0 ? summary.listLimit : 0;
  const unknownListLimit = Number.isFinite(summary.unknownListLimit) && summary.unknownListLimit >= 0 ? summary.unknownListLimit : 0;

  if (options.list && hubs.length) {
    const limit = listLimit > 0 ? Math.min(listLimit, hubs.length) : hubs.length;
    console.log(`\nTop ${limit}${hubs.length > limit ? ` of ${hubs.length}` : ''} hub front pages:`);
    for (let i = 0; i < limit; i += 1) {
      const hub = hubs[i];
      const topicPart = hub.topic_slug ? ` · ${hub.topic_slug}` : '';
      const reason = hub.validation_reason ? ` (${hub.validation_reason})` : '';
      console.log(` - [${hub.action}] ${hub.place_slug}@${hub.host}${topicPart} → ${hub.url}${reason}`);
    }
    if (hubs.length > limit) {
      console.log(`… ${hubs.length - limit} additional hub front pages not shown (adjust --list-limit).`);
    }
  }

  if (options.list && variants.length) {
    const limit = listLimit > 0 ? Math.min(listLimit, variants.length) : variants.length;
    console.log(`\nTop ${limit}${variants.length > limit ? ` of ${variants.length}` : ''} hub variants (non-front pages):`);
    for (let i = 0; i < limit; i += 1) {
      const variant = variants[i];
      const topicPart = variant.topic_slug ? ` · ${variant.topic_slug}` : '';
      const variantInfo = variant.variant_kind ? ` [${variant.variant_kind}${variant.variant_value != null ? `=${variant.variant_value}` : ''}]` : '';
      const reason = variant.validation_reason ? ` (${variant.validation_reason})` : '';
      console.log(` - [variant] ${variant.place_slug}@${variant.host}${topicPart}${variantInfo} → ${variant.url}${reason}`);
    }
    if (variants.length > limit) {
      console.log(`… ${variants.length - limit} additional variants not shown (adjust --list-limit).`);
    }
  }

  if (options.list && articleRejections.length) {
    const limit = listLimit > 0 ? Math.min(listLimit, articleRejections.length) : articleRejections.length;
    console.log(`\nArticle-like pages screened (${limit}${articleRejections.length > limit ? ` of ${articleRejections.length}` : ''}):`);
    for (let i = 0; i < limit; i += 1) {
      const entry = articleRejections[i];
      const confidencePart = typeof entry.confidence === 'number' ? ` confidence=${entry.confidence.toFixed(2)}` : '';
      const scorePart = typeof entry.score === 'number' ? ` score=${entry.score}` : '';
      console.log(` - [article] ${entry.host} → ${entry.canonical_url}${scorePart}${confidencePart}`);
    }
    if (articleRejections.length > limit) {
      console.log(`… ${articleRejections.length - limit} additional article-like pages not shown (adjust --list-limit).`);
    }
  }

  if (options.list && unknownTerms.length) {
    const limit = unknownListLimit > 0 ? Math.min(unknownListLimit, unknownTerms.length) : unknownTerms.length;
    console.log(`\nUnknown terms encountered (${limit}${unknownTerms.length > limit ? ` of ${unknownTerms.length}` : ''}):`);
    for (let i = 0; i < limit; i += 1) {
      const entry = unknownTerms[i];
      const reason = entry.reason ? ` (${entry.reason})` : '';
      console.log(` - [unknown] ${entry.term_slug}@${entry.host} → ${entry.canonical_url || entry.url}${reason}`);
    }
    if (unknownTerms.length > limit) {
      const hintFlag = options.unknownListLimit != null ? '--unknown-list-limit' : '--list-limit';
      console.log(`… ${unknownTerms.length - limit} additional unknown term(s) not shown (adjust ${hintFlag}).`);
    }
  }

  if (summary.dryRun) {
    console.log('\nRun again with --apply to persist these hubs.');
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('[find-place-hubs] fatal error:', error?.stack || error?.message || error);
    process.exit(1);
  }
}

module.exports = {
  findPlaceHubs,
  parseCliArgs
};
