const path = require('path');
const tar = require('tar-stream');
const { performance } = require('perf_hooks');
const { is_array } = require('lang-tools');
let NewsDatabase = null;
const { analyzePage } = require('../analysis/page-analyzer');
const { buildGazetteerMatchers } = require('../analysis/place-extraction');
const { findProjectRoot } = require('../utils/project-root');
const { loadNonGeoTopicSlugs } = require('./nonGeoTopicSlugs');
const { ArticleXPathService } = require('../services/ArticleXPathService');
const { DecompressionWorkerPool } = require('../background/workers/DecompressionWorkerPool');

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
  limit = null,
  verbose = false,
  onProgress = null,
  logger = console,
  dryRun = false,
  collectHubSummary = false,
  hubSummaryLimit = 100,
  includeHubEvidence = false,
  decompressionPoolSize = null,
  benchmark = null
} = {}) {
  if (!dbPath) {
    const projectRoot = findProjectRoot(__dirname);
    dbPath = path.join(projectRoot, 'data', 'news.db');
  }

  if (!NewsDatabase) {
    NewsDatabase = require('../db');
  }

  const db = new NewsDatabase(dbPath);
  const decompressPool = new DecompressionWorkerPool({ poolSize: decompressionPoolSize || undefined });
  const bucketCache = new Map();

  try {
    try {
      await decompressPool.initialize();
    } catch (error) {
      emit(logger, 'warn', '[analyse-pages] Failed to initialize decompression pool', verbose ? error : error?.message);
    }

    try {
      db.db.pragma('temp_store = FILE');
    } catch (_) {
      // best-effort pragma only
    }

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
      SELECT
        ca.id AS analysis_id,
        ca.content_id AS content_id,
        ca.analysis_json AS existing_analysis,
        ca.analysis_version AS existing_version,
        ca.title AS title,
        ca.section AS section,
        ca.word_count AS word_count,
        ca.article_xpath AS article_xpath,
        ca.classification AS classification,
        ca.nav_links_count AS nav_links_count,
        ca.article_links_count AS article_links_count,
        u.url AS url,
        u.host AS host,
        u.canonical_url AS canonical_url,
        hr.id AS http_response_id,
        hr.http_status AS http_status,
        hr.content_type AS content_type,
        hr.fetched_at AS fetched_at,
        cs.storage_type AS storage_type,
        cs.content_blob AS content_blob,
        cs.compression_type_id AS compression_type_id,
        cs.compression_bucket_id AS compression_bucket_id,
        cs.bucket_entry_key AS bucket_entry_key,
        cs.uncompressed_size AS uncompressed_size,
        cs.compressed_size AS compressed_size,
        cs.compression_ratio AS compression_ratio,
        ct.algorithm AS compression_algorithm,
        ct.name AS compression_type_name
      FROM content_analysis ca
      JOIN content_storage cs ON ca.content_id = cs.id
      JOIN http_responses hr ON cs.http_response_id = hr.id
      JOIN urls u ON hr.url_id = u.id
      LEFT JOIN compression_types ct ON cs.compression_type_id = ct.id
      WHERE (
        ca.analysis_json IS NULL
        OR ca.analysis_version IS NULL
        OR ca.analysis_version < ?
      )
      AND (ca.classification IS NULL OR ca.classification IN ('article','nav'))
      ORDER BY hr.fetched_at DESC
      LIMIT ?
    `);

    const timingTotals = Object.create(null);
    const timingCounts = Object.create(null);
    const timingExtras = {
      htmlCacheHits: 0,
      htmlCacheMisses: 0
    };

    const recordTiming = (key, value) => {
      if (!Number.isFinite(value)) return;
      timingTotals[key] = (timingTotals[key] || 0) + value;
      timingCounts[key] = (timingCounts[key] || 0) + 1;
    };

    let selectBucketStmt = null;
    try {
      selectBucketStmt = db.db.prepare(`
        SELECT cb.bucket_blob, cb.index_json, ct.algorithm
          FROM compression_buckets cb
          JOIN compression_types ct ON cb.compression_type_id = ct.id
         WHERE cb.id = ?
      `);
    } catch (error) {
      selectBucketStmt = null;
      emit(logger, 'warn', '[analyse-pages] Compression bucket retrieval unavailable', verbose ? error : error?.message);
    }

    const updateAnalysisStmt = db.db.prepare(`
      UPDATE content_analysis
         SET analysis_json = @analysis_json,
             analysis_version = @analysis_version,
             analyzed_at = datetime('now'),
             word_count = @word_count,
             article_xpath = @article_xpath
       WHERE id = @analysis_id
    `);

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
    let skipped = 0;
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
          skipped,
          dryRun,
          ts: Date.now()
        });
      } catch (_) {
        // ignore consumer errors
      }
    };

    const rows = rowsStmt.all(analysisVersion, limit ?? 9999999);
    const benchmarkEnabled = Boolean(benchmark && benchmark.enabled);
    const benchmarkRecorder = benchmarkEnabled && typeof benchmark.onResult === 'function'
      ? benchmark.onResult
      : null;

    const totalRows = Array.isArray(rows) ? rows.length : 0;

    for (const row of rows) {
      processed += 1;
      const position = processed;
      if (row?.url) {
        const prefix = totalRows > 0
          ? `[analyse-pages] analysing (${position}/${totalRows})`
          : '[analyse-pages] analysing';
        emit(logger, 'info', `${prefix} ${row.url}`);
      }

      let benchmarkEntry = null;
      let benchmarkRecorded = false;
      if (benchmarkEnabled) {
        benchmarkEntry = {
          url: row.url,
          host: row.host,
          contentId: row.content_id
        };
      }

      const loadStartedAt = benchmarkEnabled ? performance.now() : null;
      const htmlInfo = await loadHtmlForRow(row, {
        dbHandle: db.db,
        decompressPool,
        bucketCache,
        selectBucketStmt,
        logger,
        verbose
      });

      if (benchmarkEntry) {
        const reportedDuration = typeof htmlInfo?.meta?.totalDurationMs === 'number'
          ? htmlInfo.meta.totalDurationMs
          : (typeof htmlInfo?.meta?.durationMs === 'number' ? htmlInfo.meta.durationMs : null);
        const fallbackDuration = loadStartedAt != null ? performance.now() - loadStartedAt : null;
        benchmarkEntry.decompressionMs = reportedDuration != null
          ? reportedDuration
          : (fallbackDuration != null ? Math.max(0, fallbackDuration) : null);
        const workerDuration = typeof htmlInfo?.meta?.decompressionWorkerMs === 'number'
          ? htmlInfo.meta.decompressionWorkerMs
          : null;
        if (workerDuration != null) {
          benchmarkEntry.decompressionWorkerMs = workerDuration;
        }
        const extractionDuration = typeof htmlInfo?.meta?.extractionMs === 'number'
          ? htmlInfo.meta.extractionMs
          : null;
        if (extractionDuration != null) {
          benchmarkEntry.extractionMs = extractionDuration;
        }
        benchmarkEntry.decompressionSource = htmlInfo?.meta?.source || null;
        benchmarkEntry.decompressionAlgorithm = htmlInfo?.meta?.algorithm || null;
        if (htmlInfo?.meta?.bucketId != null) {
          benchmarkEntry.bucketId = htmlInfo.meta.bucketId;
        }
      }

      if (htmlInfo.error) {
        skipped += 1;
        emit(logger, 'warn', `[analyse-pages] Failed to load HTML for ${row.url}`, verbose ? htmlInfo.error : htmlInfo.error?.message || htmlInfo.error);
      }

      const articleRow = {
        text: null,
        word_count: toNumber(row.word_count, null),
        article_xpath: row.article_xpath || null
      };

      const fetchRow = {
        classification: row.classification || null,
        nav_links_count: toNumber(row.nav_links_count, null),
        article_links_count: toNumber(row.article_links_count, null),
        word_count: toNumber(row.word_count, null),
        http_status: row.http_status || null
      };

      let analysisResult;
      const analysisStartedAt = benchmarkEnabled ? performance.now() : null;
      try {
        analysisResult = await analyzePage({
          url: row.url,
          title: row.title || null,
          section: row.section || null,
          articleRow,
          fetchRow,
          html: htmlInfo.html,
          gazetteer,
          db: db.db,
          targetVersion: analysisVersion,
          nonGeoTopicSlugs,
          xpathService
        });
      } catch (error) {
        emit(logger, 'warn', `[analyse-pages] Failed to analyse ${row.url}`, verbose ? error : error?.message);
        if (benchmarkEntry) {
          benchmarkEntry.analysisMs = analysisStartedAt != null ? Math.max(0, performance.now() - analysisStartedAt) : null;
          benchmarkEntry.analysisError = error?.message || String(error);
          if (benchmarkRecorder) {
            benchmarkRecorder(benchmarkEntry);
            benchmarkRecorded = true;
          }
        }
        continue;
      }
      if (benchmarkEntry && analysisStartedAt != null) {
        benchmarkEntry.analysisMs = Math.max(0, performance.now() - analysisStartedAt);
        benchmarkEntry.analysisError = null;
      }

      const { analysis, places, hubCandidate, deepAnalysis, preparation } = analysisResult;

      if (deepAnalysis) {
        analysis.meta = analysis.meta || {};
        analysis.meta.deepAnalysis = deepAnalysis;
      }

      if (htmlInfo.meta) {
        analysis.meta = analysis.meta || {};
        analysis.meta.htmlSource = htmlInfo.meta.source;
        if (htmlInfo.meta.algorithm) analysis.meta.compression = htmlInfo.meta.algorithm;
        if (htmlInfo.meta.bucketId) analysis.meta.bucketId = htmlInfo.meta.bucketId;
        if (htmlInfo.meta.totalDurationMs != null) analysis.meta.decompressionMs = htmlInfo.meta.totalDurationMs;
        if (htmlInfo.meta.decompressionWorkerMs != null) {
          analysis.meta.decompressionWorkerMs = htmlInfo.meta.decompressionWorkerMs;
        }
        if (htmlInfo.meta.extractionMs != null) {
          analysis.meta.decompressionExtractionMs = htmlInfo.meta.extractionMs;
        }
      }

      const htmlMeta = htmlInfo?.meta || {};
      const htmlTotalMs = Number.isFinite(htmlMeta.totalDurationMs)
        ? htmlMeta.totalDurationMs
        : (Number.isFinite(htmlMeta.durationMs) ? htmlMeta.durationMs : null);
      recordTiming('html.totalMs', htmlTotalMs);
      recordTiming('html.workerMs', Number.isFinite(htmlMeta.decompressionWorkerMs) ? htmlMeta.decompressionWorkerMs : null);
      recordTiming('html.extractionMs', Number.isFinite(htmlMeta.extractionMs) ? htmlMeta.extractionMs : null);
      recordTiming('html.bucketFetchMs', Number.isFinite(htmlMeta.bucketFetchMs) ? htmlMeta.bucketFetchMs : null);
      if (typeof htmlMeta.cacheHit === 'boolean') {
        if (htmlMeta.cacheHit) timingExtras.htmlCacheHits += 1;
        else timingExtras.htmlCacheMisses += 1;
      }

      const analysisTimings = analysisResult?.timings || null;
      if (analysisTimings) {
        recordTiming('analysis.overallMs', Number.isFinite(analysisTimings.overallMs) ? analysisTimings.overallMs : null);
        recordTiming('analysis.contextMs', Number.isFinite(analysisTimings.contextMs) ? analysisTimings.contextMs : null);
        recordTiming('analysis.preparationMs', Number.isFinite(analysisTimings.preparationMs) ? analysisTimings.preparationMs : null);
        recordTiming('analysis.buildAnalysisMs', Number.isFinite(analysisTimings.buildAnalysisMs) ? analysisTimings.buildAnalysisMs : null);
        recordTiming('analysis.detectHubMs', Number.isFinite(analysisTimings.detectHubMs) ? analysisTimings.detectHubMs : null);
        recordTiming('analysis.deepAnalysisMs', Number.isFinite(analysisTimings.deepAnalysisMs) ? analysisTimings.deepAnalysisMs : null);

        const prepTimings = analysisTimings.preparation || null;
        if (prepTimings) {
          recordTiming('analysis.preparation.totalMs', Number.isFinite(prepTimings.totalMs) ? prepTimings.totalMs : null);
          recordTiming('analysis.preparation.xpathExtractionMs', Number.isFinite(prepTimings.xpathExtractionMs) ? prepTimings.xpathExtractionMs : null);
          recordTiming('analysis.preparation.xpathLearningMs', Number.isFinite(prepTimings.xpathLearningMs) ? prepTimings.xpathLearningMs : null);
          recordTiming('analysis.preparation.readabilityMs', Number.isFinite(prepTimings.readabilityMs) ? prepTimings.readabilityMs : null);
          recordTiming('analysis.preparation.jsdomMs', Number.isFinite(prepTimings.jsdomMs) ? prepTimings.jsdomMs : null);
          recordTiming('analysis.preparation.readabilityAlgoMs', Number.isFinite(prepTimings.readabilityAlgoMs) ? prepTimings.readabilityAlgoMs : null);
          recordTiming('analysis.preparation.wordCountingMs', Number.isFinite(prepTimings.wordCountingMs) ? prepTimings.wordCountingMs : null);
        }

        if (benchmarkEntry) {
          try {
            benchmarkEntry.analysisBreakdown = JSON.parse(JSON.stringify(analysisTimings));
          } catch (_) {
            benchmarkEntry.analysisBreakdown = analysisTimings;
          }
        }
      }

      const wordCountForUpdate = (() => {
        if (analysis.meta?.wordCount != null) return analysis.meta.wordCount;
        if (preparation?.articleRow?.word_count != null) return preparation.articleRow.word_count;
        if (row.word_count != null) return row.word_count;
        return null;
      })();

      const articleXPathForUpdate = (() => {
        if (analysis.meta?.articleXPath) return analysis.meta.articleXPath;
        if (preparation?.articleRow?.article_xpath) return preparation.articleRow.article_xpath;
        if (row.article_xpath) return row.article_xpath;
        return null;
      })();

      if (shouldPersist) {
        const persistStart = performance.now();
        try {
          updateAnalysisStmt.run({
            analysis_json: JSON.stringify(analysis),
            analysis_version: analysisVersion,
            word_count: wordCountForUpdate,
            article_xpath: articleXPathForUpdate,
            analysis_id: row.analysis_id
          });
          updated += 1;
        } catch (error) {
          emit(logger, 'warn', `[analyse-pages] Failed to persist analysis for ${row.url}`, verbose ? error : error?.message);
        } finally {
          recordTiming('db.updateAnalysisMs', performance.now() - persistStart);
        }
      } else {
        updated += 1;
      }

      if (is_array(places)) {
        placesInserted += places.length;
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
        } else if (hubCandidate.kind === 'place') {
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
              const evidenceJson = hubCandidate.evidence ? JSON.stringify(hubCandidate.evidence) : null;
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
                evidenceJson
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
                evidenceJson,
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
      }

      if (Date.now() - lastProgressAt >= 250) {
        emitProgress();
        lastProgressAt = Date.now();
      }

      if (benchmarkEntry && !benchmarkRecorded) {
        if (benchmarkEntry.analysisMs == null && analysisStartedAt != null) {
          benchmarkEntry.analysisMs = Math.max(0, performance.now() - analysisStartedAt);
        }
        if (benchmarkRecorder) {
          benchmarkRecorder(benchmarkEntry);
        }
      }
    }

    if (processed > 0) emitProgress();

    const averages = {};
    for (const key of Object.keys(timingTotals)) {
      const totalValue = timingTotals[key];
      const countValue = timingCounts[key];
      if (!Number.isFinite(totalValue) || !Number.isFinite(countValue) || countValue === 0) continue;
      averages[key] = totalValue / countValue;
    }

    const timingSummary = {
      totals: timingTotals,
      counts: timingCounts,
      averages,
      extras: timingExtras
    };

    return {
      analysed: processed,
      processed,
      updated,
      placesInserted,
      hubsInserted,
      hubsUpdated,
      unknownInserted,
      skipped,
      version: analysisVersion,
      dryRun,
      hubAssignments: hubAssignments || undefined,
      timings: timingSummary
    };
  } finally {
    try { await decompressPool.shutdown(); } catch (_) {}
    try { db.close(); } catch (_) {}
  }
}

async function loadHtmlForRow(row, { dbHandle, decompressPool, bucketCache, selectBucketStmt, logger, verbose }) {
  const overallStart = performance.now();
  const finalizeMeta = (meta) => {
    const totalDurationMs = Math.max(0, performance.now() - overallStart);
    return {
      durationMs: totalDurationMs,
      totalDurationMs,
      decompressionWorkerMs: null,
      extractionMs: null,
      ...(meta || {})
    };
  };
  try {
    if (row.compression_bucket_id && row.bucket_entry_key) {
      if (!selectBucketStmt) {
        return { html: null, error: new Error('Bucket retrieval unavailable'), meta: finalizeMeta({ source: 'bucket' }) };
      }

      const bucketId = row.compression_bucket_id;
      let cacheEntry = bucketCache.get(bucketId);
      let decompressionWorkerMs = 0;
      let cacheHit = true;
      let bucketFetchMs = 0;

      if (!cacheEntry) {
        const dbFetchStart = performance.now();
        const bucketRow = selectBucketStmt.get(bucketId);
        bucketFetchMs = Math.max(0, performance.now() - dbFetchStart);
        if (!bucketRow) {
          return {
            html: null,
            error: new Error(`Bucket ${bucketId} not found`),
            meta: finalizeMeta({ source: 'bucket', bucketId })
          };
        }

        const decompressResult = await decompressPool.decompress(bufferFrom(bucketRow.bucket_blob), bucketRow.algorithm || 'brotli', { bucketId });
        decompressionWorkerMs = Number.isFinite(decompressResult.durationMs) ? Math.max(0, decompressResult.durationMs) : 0;
        const index = safeJsonParse(bucketRow.index_json) || {};
        cacheEntry = {
          tarBuffer: decompressResult.buffer,
          index,
          algorithm: bucketRow.algorithm || null
        };
        bucketCache.set(bucketId, cacheEntry);
        cacheHit = false;
      }

      const entry = cacheEntry.index[row.bucket_entry_key];
      if (!entry) {
        return {
          html: null,
          error: new Error(`Entry ${row.bucket_entry_key} missing in bucket ${bucketId}`),
          meta: finalizeMeta({ source: 'bucket', bucketId })
        };
      }

      const extractionStart = performance.now();
      const contentBuffer = await extractTarEntry(cacheEntry.tarBuffer, entry.filename);
      const extractionMs = Math.max(0, performance.now() - extractionStart);
      return {
        html: contentBuffer.toString('utf8'),
        meta: finalizeMeta({
          source: 'bucket',
          bucketId,
          algorithm: cacheEntry.algorithm,
          cacheHit,
          bucketFetchMs,
          decompressionWorkerMs,
          extractionMs
        })
      };
    }

    const blob = row.content_blob;
    if (!blob) {
      return { html: null, meta: finalizeMeta({ source: 'empty', decompressionWorkerMs: 0, extractionMs: 0 }) };
    }

    const buffer = bufferFrom(blob);
    const algorithm = (row.compression_algorithm || '').toLowerCase();

    if (!algorithm || algorithm === 'none') {
      return {
        html: buffer.toString('utf8'),
        meta: finalizeMeta({
          source: 'inline',
          algorithm: 'none',
          decompressionWorkerMs: 0,
          extractionMs: 0
        })
      };
    }

    const decompressResult = await decompressPool.decompress(buffer, algorithm, { contentId: row.content_id });
    const decompressionWorkerMs = Number.isFinite(decompressResult.durationMs) ? Math.max(0, decompressResult.durationMs) : 0;
    return {
      html: decompressResult.buffer.toString('utf8'),
      meta: finalizeMeta({
        source: 'inline-compressed',
        algorithm,
        decompressionWorkerMs,
        extractionMs: 0
      })
    };
  } catch (error) {
    emit(logger, 'warn', '[analyse-pages] HTML decompression failed', verbose ? error : error?.message);
    return { html: null, error, meta: finalizeMeta({ source: 'failed' }) };
  }
}

function extractTarEntry(tarBuffer, filename) {
  return new Promise((resolve, reject) => {
    const extract = tar.extract();
    let found = false;

    extract.on('entry', (header, stream, next) => {
      if (header.name === filename) {
        found = true;
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => {
          try {
            resolve(Buffer.concat(chunks));
          } finally {
            next();
          }
        });
        stream.on('error', reject);
        stream.resume();
      } else {
        stream.resume();
        next();
      }
    });

    extract.on('finish', () => {
      if (!found) {
        reject(new Error(`Entry file not found in tar: ${filename}`));
      }
    });

    extract.on('error', reject);

    extract.end(tarBuffer);
  });
}

function bufferFrom(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value == null) return Buffer.alloc(0);
  return Buffer.from(value);
}

function safeJsonParse(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

module.exports = {
  analysePages
};
