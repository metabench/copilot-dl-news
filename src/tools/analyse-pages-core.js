const path = require('path');
const { is_array } = require('lang-tools');
let NewsDatabase = null;
const { analyzePage } = require('../analysis/page-analyzer');
const { buildGazetteerMatchers } = require('../analysis/place-extraction');
const { findProjectRoot } = require('../utils/project-root');
const { loadNonGeoTopicSlugs } = require('./nonGeoTopicSlugs');
const { ArticleXPathService } = require('../services/ArticleXPathService');

function toNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function emit(logger, level, message, details) {
  if (!logger) return;
  const fn = typeof logger[level] === 'function' ? logger[level] : null;
  if (fn) {
    if (details !== undefined) fn.call(logger, message, details);
    else fn.call(logger, message);
  }
}

async function analysePages({
  dbPath,
  analysisVersion = 1,
  limit = 10000,
  verbose = false,
  onProgress = null,
  logger = console,
  dryRun = false,
  collectHubSummary = false,
  hubSummaryLimit = 100,
  includeHubEvidence = false
} = {}) {
  if (!dbPath) {
    const projectRoot = findProjectRoot(__dirname);
    dbPath = path.join(projectRoot, 'data', 'news.db');
  }

  if (!NewsDatabase) {
    NewsDatabase = require('../db');
  }

  const db = new NewsDatabase(dbPath);
  try {
    try {
      db.db.pragma('temp_store = FILE');
    } catch (_) {
      // best-effort pragmas only
    }

    // Initialize XPath service for article extraction
    const xpathService = new ArticleXPathService({
      db: db.db,
      logger
    });

    const nonGeoTopicSlugs = loadNonGeoTopicSlugs(db.db).slugs;

    const shouldPersist = !dryRun;
    const captureHubSummaries = collectHubSummary === true;
    const hubLimit = Number.isFinite(Number(hubSummaryLimit)) && Number(hubSummaryLimit) >= 0
      ? Number(hubSummaryLimit)
      : 0;

    let gazetteer = null;
    try {
      gazetteer = buildGazetteerMatchers(db.db);
    } catch (error) {
      emit(logger, 'warn', '[analyse-pages] Failed to build gazetteer matchers', verbose ? error : error?.message);
      gazetteer = null;
    }

  const rowsStmt = db.db.prepare(`
      SELECT a.url AS url,
             a.title AS title,
             a.section AS section,
             a.text AS text,
             a.word_count AS word_count,
             a.article_xpath AS article_xpath,
             a.analysis AS analysis_json,
             lf.classification AS classification,
             lf.ts AS last_ts
        FROM articles a
   LEFT JOIN latest_fetch lf ON lf.url = a.url
       WHERE (
         a.analysis IS NULL
         OR CAST(json_extract(a.analysis, '$.analysis_version') AS INTEGER) IS NULL
         OR CAST(json_extract(a.analysis, '$.analysis_version') AS INTEGER) < ?
       )
    ORDER BY (last_ts IS NULL) ASC, last_ts DESC
       LIMIT ?
    `);

    const selectArticleHtml = db.db.prepare('SELECT html FROM articles WHERE url = ?');
    const selectLatestFetch = db.db.prepare(`
      SELECT nav_links_count, article_links_count, word_count
        FROM fetches
       WHERE url = ?
   ORDER BY COALESCE(fetched_at, request_started_at) DESC
       LIMIT 1
    `);
    const upsertArticleAnalysis = db.db.prepare('UPDATE articles SET analysis = ? WHERE url = ?');
    // article_places table removed from schema - prepare statement only if table exists
    let insertPlace = null;
    try {
      const tableExists = db.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='article_places'").get();
      if (tableExists) {
        insertPlace = db.db.prepare(`
          INSERT OR IGNORE INTO article_places(
            article_url,
            place,
            place_kind,
            method,
            source,
            offset_start,
            offset_end,
            context,
            first_seen_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `);
      }
    } catch (_) {
      // Table doesn't exist - skip place insertion
    }
    const upsertPlaceHubInsert = db.db.prepare(`
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
    const upsertPlaceHubUpdate = db.db.prepare(`
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
    let upsertUnknownTerm = null;
    try {
      upsertUnknownTerm = db.db.prepare(`
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
    } catch (_) {
      upsertUnknownTerm = null;
    }
    let selectHubByUrl = null;
    try {
      selectHubByUrl = db.db.prepare('SELECT id, place_slug, topic_slug, topic_label FROM place_hubs WHERE url = ?');
    } catch (_) {
      selectHubByUrl = null;
    }

    let processed = 0;
    let updated = 0;
    let placesInserted = 0;
    let hubsInserted = 0;
    let hubsUpdated = 0;
    let unknownInserted = 0;
    const hubAssignments = captureHubSummaries ? [] : null;
    let lastProgressAt = Date.now();

    const emitProgress = () => {
      if (typeof onProgress !== 'function') return;
      try {
        onProgress({
          processed,
          updated,
          placesInserted,
          hubsInserted,
          hubsUpdated,
          unknownInserted,
          dryRun,
          ts: Date.now()
        });
      } catch (_) {
        // ignore consumer errors
      }
    };

    const rows = rowsStmt.all(analysisVersion, limit);
    for (const row of rows) {
      processed += 1;

      const articleRow = {
        text: row.text,
        word_count: row.word_count,
        article_xpath: row.article_xpath
      };

      const latestFetch = selectLatestFetch.get(row.url) || {
        nav_links_count: null,
        article_links_count: null,
        word_count: row.word_count
      };

      const fetchRow = {
        classification: row.classification,
        nav_links_count: latestFetch?.nav_links_count ?? null,
        article_links_count: latestFetch?.article_links_count ?? null,
        word_count: latestFetch?.word_count ?? row.word_count ?? null
      };

      let html = null;
      const needsHtml = (!articleRow.article_xpath || articleRow.word_count == null);
      if (needsHtml) {
        try {
          const htmlRow = selectArticleHtml.get(row.url);
          html = htmlRow ? htmlRow.html : null;
        } catch (error) {
          emit(logger, 'warn', `[analyse-pages] Failed to load HTML for ${row.url}`, verbose ? error : error?.message);
        }
      }

      let analysisResult;
      try {
        analysisResult = await analyzePage({
          url: row.url,
          title: row.title || null,
          section: row.section || null,
          articleRow,
          fetchRow,
          html,
          gazetteer,
          db: db.db,
          targetVersion: analysisVersion,
          nonGeoTopicSlugs: nonGeoTopicSlugs,
          xpathService
        });
      } catch (error) {
        emit(logger, 'warn', `[analyse-pages] Failed to analyse ${row.url}`, verbose ? error : error?.message);
        continue;
      }

      const { analysis, places, hubCandidate, deepAnalysis } = analysisResult;

      if (deepAnalysis) {
        analysis.meta = analysis.meta || {};
        analysis.meta.deepAnalysis = deepAnalysis;
      }

      if (shouldPersist) {
        try {
          upsertArticleAnalysis.run(JSON.stringify(analysis), row.url);
          updated += 1;
        } catch (error) {
          emit(logger, 'warn', `[analyse-pages] Failed to persist analysis for ${row.url}`, verbose ? error : error?.message);
        }
      } else {
        updated += 1;
      }

      if (is_array(places) && insertPlace) {
        for (const place of places) {
          if (shouldPersist) {
            try {
              insertPlace.run(
                row.url,
                place.place,
                place.place_kind || null,
                place.method || null,
                place.source || null,
                place.offset_start ?? null,
                place.offset_end ?? null,
                null
              );
              placesInserted += 1;
            } catch (error) {
              emit(logger, 'warn', `[analyse-pages] Failed to persist place detection for ${row.url}`, verbose ? error : error?.message);
            }
          } else {
            placesInserted += 1;
          }
        }
      }

      if (hubCandidate) {
        if (hubCandidate.kind === 'unknown') {
          if (Array.isArray(hubCandidate.unknownTerms) && hubCandidate.unknownTerms.length) {
            for (const term of hubCandidate.unknownTerms) {
              if (shouldPersist && upsertUnknownTerm) {
                try {
                  upsertUnknownTerm.run(
                    hubCandidate.host,
                    row.url,
                    hubCandidate.canonicalUrl || row.url,
                    term.slug,
                    term.label || null,
                    term.source || null,
                    term.reason || null,
                    term.confidence || null,
                    hubCandidate.evidence ? JSON.stringify(hubCandidate.evidence) : null
                  );
                  unknownInserted += 1;
                } catch (error) {
                  emit(logger, 'warn', `[analyse-pages] Failed to persist unknown term for ${row.url}`, verbose ? error : error?.message);
                }
              } else if (!shouldPersist) {
                unknownInserted += 1;
              }
            }
          }
          continue;
        }

        if (hubCandidate.kind !== 'place') {
          continue;
        }

        let existingHub = null;
        if (selectHubByUrl) {
          try {
            existingHub = selectHubByUrl.get(row.url) || null;
          } catch (_) {
            existingHub = null;
          }
        }
        const isNewHub = !existingHub;

        let hubPersisted = !shouldPersist;
        if (shouldPersist) {
          try {
            upsertPlaceHubInsert.run(
              hubCandidate.host,
              row.url,
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

            upsertPlaceHubUpdate.run(
              hubCandidate.placeSlug,
              hubCandidate.placeKind,
              hubCandidate.topic?.slug ?? null,
              hubCandidate.topic?.label ?? null,
              hubCandidate.topic?.kind ?? null,
              row.title || null,
              hubCandidate.navLinksCount,
              hubCandidate.articleLinksCount,
              JSON.stringify(hubCandidate.evidence),
              row.url
            );
            hubPersisted = true;
          } catch (error) {
            emit(logger, 'warn', `[analyse-pages] Failed to persist place hub for ${row.url}`, verbose ? error : error?.message);
            hubPersisted = false;
          }
        }

        if (hubPersisted) {
          if (isNewHub) hubsInserted += 1;
          else hubsUpdated += 1;
        }

        if (hubAssignments && (hubLimit === 0 || hubAssignments.length < hubLimit)) {
          const entry = {
            host: hubCandidate.host,
            url: row.url,
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
            action: isNewHub ? 'insert' : 'update'
          };
          if (includeHubEvidence && hubCandidate.evidence) {
            entry.evidence = hubCandidate.evidence;
          }
          hubAssignments.push(entry);
        }
      }

        if (Date.now() - lastProgressAt >= 250) {
          emitProgress();
          lastProgressAt = Date.now();
        }
      }

    if (processed > 0) emitProgress();

    return {
      analysed: processed,
      processed,
      updated,
      placesInserted,
      hubsInserted,
      hubsUpdated,
      unknownInserted,
      version: analysisVersion,
      dryRun,
      hubAssignments: hubAssignments || undefined
    };
  } finally {
    try { db.close(); } catch (_) {}
  }
}

module.exports = {
  analysePages
};
