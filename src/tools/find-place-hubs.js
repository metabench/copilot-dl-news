#!/usr/bin/env node

'use strict';

const path = require('path');
const { findProjectRoot } = require('../shared/utils/project-root');
const { ensureDb } = require('../data/db/sqlite/ensureDb');
const { buildGazetteerMatchers, extractPlacesFromUrl } = require('../intelligence/analysis/place-extraction');
const { detectPlaceHub } = require('./placeHubDetector');
const { loadNonGeoTopicSlugs } = require('./nonGeoTopicSlugs');
const HubValidator = require('../geo/hub-validation/HubValidator');
const { COLORS } = require('../shared/utils/CliFormatter');
const { CliArgumentParser } = require('../shared/utils/CliArgumentParser');

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

/**
 * Parse CLI arguments for find-place-hubs
 * @param {string[]} argv - Command line arguments
 * @returns {Object} Parsed options
 */
function parseCliArgs(argv) {
  const parser = new CliArgumentParser('find-place-hubs', 'Fast place hub discovery based on URL heuristics');
  
  parser.add('--db <path>', 'Path to SQLite database (defaults to data/news.db)', null);
  parser.add('--limit <n>', 'Maximum articles to scan (no limit by default, scans all)', null);
  parser.add('--host <domain>', 'Restrict to a single host/domain', null);
  parser.add('--dry-run', 'Do not write to place_hubs (default)', true);
  parser.add('--apply', 'Persist detected hubs to place_hubs table', false);
  parser.add('--list', 'Show detected hubs (default: true)', true);
  parser.add('--no-list', 'Suppress hub list display', false);
  parser.add('--list-limit <n>', 'Limit number of listed hubs/variants (default: unlimited)', null);
  parser.add('--unknown-list-limit <n>', 'Limit number of listed unknown terms (default: 20)', 20);
  parser.add('--min-nav-links <n>', 'Minimum nav_links_count to consider (default: 10)', 10);
  parser.add('--max-path-segments <n>', 'Maximum URL path segments to inspect (default: 5)', 5);
  parser.add('--include-evidence', 'Include JSON evidence payload in listings', false);
  parser.add('--json', 'Emit JSON summary (includes hubs array)', false);
  parser.add('--verbose', 'Print warnings when URL analysis fails', false);

  const args = parser.parse(argv);

  // Handle positional argument as host filter
  if (args.positional && args.positional.length > 0) {
    args.host = args.positional[0];
  }

  // Handle --apply flag (overrides --dry-run)
  if (args.apply) {
    args.dryRun = false;
  }

  // Handle --no-list flag (overrides --list)
  if (args.noList === true) {
    args.list = false;
  }
  delete args.noList;

  // Normalize numeric values
  const parsedLimit = Number.parseInt(args.limit, 10);
  if (args.limit != null && !Number.isNaN(parsedLimit)) {
    args.limit = Math.max(1, Math.min(Math.floor(parsedLimit), 50000));
  } else {
    args.limit = null;
  }

  const parsedListLimit = Number.parseInt(args.listLimit, 10);
  if (args.listLimit != null && Number.isFinite(parsedListLimit) && parsedListLimit >= 0) {
    args.listLimit = Math.floor(parsedListLimit);
  } else {
    args.listLimit = null;
  }

  const parsedUnknownListLimit = Number.parseInt(args.unknownListLimit, 10);
  if (args.unknownListLimit != null && Number.isFinite(parsedUnknownListLimit) && parsedUnknownListLimit >= 0) {
    args.unknownListLimit = Math.floor(parsedUnknownListLimit);
  } else {
    args.unknownListLimit = 20;
  }

  const parsedMinNavLinks = Number.parseInt(args.minNavLinks, 10);
  if (args.minNavLinks != null && !Number.isNaN(parsedMinNavLinks)) {
    args.minNavLinks = Math.max(0, Math.floor(parsedMinNavLinks));
  } else {
    args.minNavLinks = 10;
  }

  const parsedMaxPathSegments = Number.parseInt(args.maxPathSegments, 10);
  if (args.maxPathSegments != null && !Number.isNaN(parsedMaxPathSegments)) {
    args.maxPathSegments = Math.max(1, Math.floor(parsedMaxPathSegments));
  } else {
    args.maxPathSegments = 5;
  }

  return args;
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

function tableHasColumn(db, tableName, columnName) {
  if (!db || !tableName || !columnName) return false;
  const safeTable = String(tableName).replace(/[^A-Za-z0-9_]/g, '');
  if (!safeTable) return false;
  const rows = db.prepare(`PRAGMA table_info(${safeTable})`).all();
  return rows.some((row) => row && row.name === columnName);
}

function findPlaceHubs(options = {}) {
  const projectRoot = findProjectRoot(__dirname);
  const resolvedDbPath = options.db
    ? path.isAbsolute(options.db) ? options.db : path.join(process.cwd(), options.db)
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
        // Check for normalized schema tables instead of articles
        const hasUrlsTable = tableHasColumn(db, 'urls', 'url');
        const hasHttpResponsesTable = tableHasColumn(db, 'http_responses', 'url_id');
        const hasContentStorageTable = tableHasColumn(db, 'content_storage', 'url');
        const hasContentAnalysisTable = tableHasColumn(db, 'content_analysis', 'url');

        if (!hasUrlsTable || !hasHttpResponsesTable) {
          throw new Error('Normalized schema tables (urls, http_responses) not found. Database migration may be incomplete.');
        }

        // Build query using normalized schema
        const limitClause = options.limit ? `LIMIT ${options.limit}` : '';
        const hostWhereClause = options.host ? 'AND LOWER(u.host) = LOWER(?)' : '';

        const selectCandidates = db.prepare(`
          SELECT u.url,
                 ca.title,
                 u.host,
                 hr.http_status,
                 hr.content_type,
                 ca.word_count AS content_word_count,
                 ca.analysis_json AS analysis_data,
                 ca.analyzed_at,
                 hr.fetched_at AS last_fetch_at
            FROM urls u
       LEFT JOIN http_responses hr ON hr.url_id = u.id
       LEFT JOIN content_storage cs ON cs.http_response_id = hr.id
       LEFT JOIN content_analysis ca ON ca.content_id = cs.id AND ca.analysis_version = (SELECT MAX(analysis_version) FROM content_analysis WHERE content_id = cs.id)
           WHERE u.url LIKE 'http%'
             ${hostWhereClause}
          ORDER BY COALESCE(hr.fetched_at, u.created_at) DESC
           ${limitClause}
        `);

        const selectFetchStats = db.prepare(`
          SELECT hr.bytes_downloaded,
                 ca.word_count,
                 ca.nav_links_count,
                 ca.article_links_count,
                 ca.analysis_json
            FROM urls u
       LEFT JOIN http_responses hr ON hr.url_id = u.id
       LEFT JOIN content_storage cs ON cs.http_response_id = hr.id
       LEFT JOIN content_analysis ca ON ca.content_id = cs.id AND ca.analysis_version = (SELECT MAX(analysis_version) FROM content_analysis WHERE content_id = cs.id)
           WHERE u.url = ?
          ORDER BY hr.fetched_at DESC
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

    // Execute query with only host parameter if provided
    const candidateRows = selectCandidates.all(
      ...(options.host ? [options.host] : [])
    );

    const normalizedHostFilter = options.host ? String(options.host).trim().toLowerCase() : null;

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

      const rowHost = row.host;

      if (normalizedHostFilter) {
        const comparableHost = rowHost ? rowHost.toLowerCase() : null;
        if (!comparableHost || comparableHost !== normalizedHostFilter) {
          continue;
        }
      }

      // Extract analysis data from content_analysis
      let analysisData = null;
      if (row.analysis_data) {
        try {
          analysisData = JSON.parse(row.analysis_data);
        } catch (_) {
          // ignore malformed analysis data
        }
      }

      const fetchStats = selectFetchStats.get(row.url) || {};
      const wordCount = row.content_word_count || fetchStats.word_count || null;

      // For now, we'll assume all URLs are potential hubs if they have content
      // This is a simplified approach - the original logic was more complex
      if (!wordCount || wordCount < 100) {
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

      // Extract places from analysis data
      const analysisPlaces = [];
      if (analysisData?.findings?.places && Array.isArray(analysisData.findings.places)) {
        analysisPlaces.push(...analysisData.findings.places);
      }

      const hubCandidate = detectPlaceHub({
        url: row.url,
        title: row.title,
        urlPlaceAnalysis,
        analysisPlaces,
        section: null, // Not available in normalized schema
        fetchClassification: null, // Not available in normalized schema
        latestClassification: null, // Not available in normalized schema
        navLinksCount: null, // Not available in normalized schema
        articleLinksCount: null, // Not available in normalized schema
        wordCount,
        articleWordCount: wordCount, // Use same value
        fetchWordCount: wordCount, // Use same value
        articleAnalysis: analysisData ? JSON.stringify(analysisData) : null,
        fetchAnalysis: analysisData ? JSON.stringify(analysisData) : null,
        gazetteerPlaceNames,
        minNavLinksThreshold: minNavLinks,
        nonGeoTopicSlugs
      });

      if (!hubCandidate) {
        continue;
      }

      const candidateHost = hubCandidate.host || rowHost;
      if (!candidateHost) {
        if (verbose) {
          console.warn('[find-place-hubs] skipping candidate without host', row.url);
        }
        continue;
      }

      if (hubCandidate.kind === 'article-screened') {
        articleScreened += 1;
        if (list) {
          const detection = hubCandidate.articleDetection || {};
          articleRejections.push({
            url: row.url,
            canonical_url: hubCandidate.canonicalUrl || row.url,
            host: candidateHost,
            nav_links_count: null, // Not available
            article_links_count: null, // Not available
            word_count: wordCount,
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
              host: candidateHost,
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
            host: candidateHost,
            title: row.title || null,
            place_slug: hubCandidate.placeSlug,
            place_label: hubCandidate.placeLabel || null,
            place_kind: hubCandidate.placeKind || null,
            topic_slug: hubCandidate.topic?.slug ?? null,
            topic_label: hubCandidate.topic?.label ?? null,
            topic_kind: hubCandidate.topic?.kind ?? null,
            nav_links_count: null, // Not available in normalized schema
            article_links_count: null, // Not available in normalized schema
            word_count: wordCount,
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
            candidateHost,
            canonicalUrl,
            hubCandidate.placeSlug,
            hubCandidate.placeKind,
            hubCandidate.topic?.slug ?? null,
            hubCandidate.topic?.label ?? null,
            hubCandidate.topic?.kind ?? null,
            row.title || null,
            null, // nav_links_count - not available
            null, // article_links_count - not available
            JSON.stringify(hubCandidate.evidence)
          );
          updateHub.run(
            hubCandidate.placeSlug,
            hubCandidate.placeKind,
            hubCandidate.topic?.slug ?? null,
            hubCandidate.topic?.label ?? null,
            hubCandidate.topic?.kind ?? null,
            row.title || null,
            null, // nav_links_count - not available
            null, // article_links_count - not available
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
          host: candidateHost,
          title: row.title || null,
          place_slug: hubCandidate.placeSlug,
          place_label: hubCandidate.placeLabel || null,
          place_kind: hubCandidate.placeKind || null,
          topic_slug: hubCandidate.topic?.slug ?? null,
          topic_label: hubCandidate.topic?.label ?? null,
          topic_kind: hubCandidate.topic?.kind ?? null,
          nav_links_count: null, // Not available in normalized schema
          article_links_count: null, // Not available in normalized schema
          word_count: wordCount,
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

function main() {
  const options = parseCliArgs(process.argv.slice(2));

  // If help was shown by commander, it exits before we get here
  // But just in case, check explicitly
  if (options.help) {
    process.exit(0);
  }

  const { summary, hubs, variants, unknownTerms, articleRejections } = findPlaceHubs(options);

  if (options.json) {
    console.log(JSON.stringify({ summary, hubs, variants, unknownTerms, articleRejections }, null, 2));
    return;
  }

  // Header
  console.log(`\n${COLORS.bold(COLORS.cyan('╔ Place Hub Discovery Results ═══════════════════════════════════════'))}`);
  
  // Summary stats
  console.log(`\n${COLORS.bold(COLORS.accent('Summary'))}`);
  console.log(COLORS.dim('───────'));
  const mode = summary.dryRun ? 'DRY-RUN (preview only)' : 'APPLY (writing to database)';
  console.log(`  ${'Mode'.padEnd(30)} ${summary.dryRun ? COLORS.warning('dry-run') : COLORS.success('apply')}`);
  console.log(`  ${'Processed'.padEnd(30)} ${summary.processed} URLs`);
  console.log(`  ${'Evaluated'.padEnd(30)} ${summary.evaluated}/${summary.processed}`);
  console.log(`  ${'Validated'.padEnd(30)} ${summary.validated} hubs (${summary.inserted} new, ${summary.updated} existing)`);
  console.log(`  ${'Variants'.padEnd(30)} ${summary.variants}`);
  console.log(`  ${'Unknown Terms'.padEnd(30)} ${summary.unknown}`);
  console.log(`  ${'Screened Articles'.padEnd(30)} ${summary.articleRejected}`);
  console.log(`  ${'Skipped'.padEnd(30)} ${summary.processed - summary.matched}`);
  
  if (summary.host) {
    console.log(`  ${'Filter'.padEnd(30)} host: ${summary.host}`);
  }
  if (summary.limit) {
    console.log(`  ${'Limit'.padEnd(30)} ${summary.limit}`);
  }
  console.log(COLORS.muted('Note: Using normalized schema - some legacy fields (nav_links_count, article_links_count) not available'));

  // Hubs list
  if (options.list && hubs.length) {
    console.log(`\n${COLORS.bold(COLORS.accent(`Hub Front Pages (${hubs.length} total)`))}`);
    console.log(COLORS.dim('─'.repeat(`Hub Front Pages (${hubs.length} total)`.length)));
    const listLimit = summary.listLimit > 0 ? Math.min(summary.listLimit, hubs.length) : hubs.length;
    
    const rows = hubs.slice(0, listLimit).map(hub => ({
      'Action': hub.action.toUpperCase(),
      'Place': hub.place_slug,
      'Host': hub.host,
      'Topic': hub.topic_slug || '—',
      'Word Count': hub.word_count || '—',
      'URL': hub.url.substring(0, 50) + (hub.url.length > 50 ? '...' : '')
    }));
    
    for (const row of rows) {
      console.log(`  ${row.Action} ${row.Place} (${row.Host}) - ${row.URL}`);
    }
    
    if (hubs.length > listLimit) {
      console.log(COLORS.muted(`… ${hubs.length - listLimit} additional hub front pages not shown (adjust --list-limit)\n`));
    }
  }

  // Variants list
  if (options.list && variants.length) {
    console.log(`\n${COLORS.bold(COLORS.accent(`Hub Variants (${variants.length} total, non-front pages)`))}`);
    console.log(COLORS.dim('─'.repeat(`Hub Variants (${variants.length} total, non-front pages)`.length)));
    const listLimit = summary.listLimit > 0 ? Math.min(summary.listLimit, variants.length) : variants.length;
    
    const rows = variants.slice(0, listLimit).map(v => ({
      'Place': v.place_slug,
      'Host': v.host,
      'Variant Type': v.variant_kind || '—',
      'Variant Value': v.variant_value || '—',
      'Word Count': v.word_count || '—',
      'URL': v.url.substring(0, 45) + (v.url.length > 45 ? '...' : '')
    }));
    
    for (const row of rows) {
      console.log(`  ${row.Place} (${row.Host}) - ${row['Variant Type']}: ${row['Variant Value']} - ${row.URL}`);
    }
    
    if (variants.length > listLimit) {
      console.log(COLORS.muted(`… ${variants.length - listLimit} additional variants not shown (adjust --list-limit)\n`));
    }
  }

  // Screened articles list
  if (options.list && articleRejections.length) {
    console.log(`\n${COLORS.bold(COLORS.accent(`Screened Article-Like Pages (${articleRejections.length} total)`))}`);
    console.log(COLORS.dim('─'.repeat(`Screened Article-Like Pages (${articleRejections.length} total)`.length)));
    const listLimit = summary.listLimit > 0 ? Math.min(summary.listLimit, articleRejections.length) : articleRejections.length;
    
    const rows = articleRejections.slice(0, listLimit).map(a => ({
      'Host': a.host,
      'Score': typeof a.score === 'number' ? a.score.toFixed(2) : '—',
      'Confidence': typeof a.confidence === 'number' ? a.confidence.toFixed(2) : '—',
      'URL': a.canonical_url.substring(0, 45) + (a.canonical_url.length > 45 ? '...' : '')
    }));
    
    for (const row of rows) {
      console.log(`  ${row.Host} - Score: ${row.Score}, Confidence: ${row.Confidence} - ${row.URL}`);
    }
    
    if (articleRejections.length > listLimit) {
      console.log(COLORS.muted(`… ${articleRejections.length - listLimit} additional article-like pages not shown (adjust --list-limit)\n`));
    }
  }

  // Unknown terms list
  if (options.list && unknownTerms.length) {
    console.log(`\n${COLORS.bold(COLORS.accent(`Unknown Terms (${unknownTerms.length} total)`))}`);
    console.log(COLORS.dim('─'.repeat(`Unknown Terms (${unknownTerms.length} total)`.length)));
    const listLimit = summary.unknownListLimit > 0 ? Math.min(summary.unknownListLimit, unknownTerms.length) : unknownTerms.length;
    
    const rows = unknownTerms.slice(0, listLimit).map(u => ({
      'Term': u.term_slug,
      'Host': u.host,
      'Reason': u.reason || '—',
      'URL': u.canonical_url.substring(0, 40) + (u.canonical_url.length > 40 ? '...' : '')
    }));
    
    for (const row of rows) {
      console.log(`  ${row.Term} (${row.Host}) - ${row.Reason} - ${row.URL}`);
    }
    
    if (unknownTerms.length > listLimit) {
      const hintFlag = summary.unknownListLimit != summary.listLimit ? '--unknown-list-limit' : '--list-limit';
      console.log(COLORS.muted(`… ${unknownTerms.length - listLimit} additional unknown term(s) not shown (adjust ${hintFlag})\n`));
    }
  }

  // Footer
  if (summary.dryRun) {
    const line = '═'.repeat(80);
    console.log(`${COLORS.cyan(line)}\n`);
    console.log('Run with --apply to persist these hubs to the database');
  } else {
    const line = '═'.repeat(80);
    console.log(`${COLORS.cyan(line)}\n`);
    console.log(`Persisted ${summary.inserted + summary.updated} hub records`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.log(`${COLORS.error('[ERROR]')} Fatal error: ${error?.message || error}`);
    if (process.env.DEBUG) {
      console.error(error?.stack || error);
    }
    process.exit(1);
  }
}

module.exports = {
  findPlaceHubs,
  parseCliArgs
};
