const path = require('path');
const tar = require('tar-stream');
const { performance } = require('perf_hooks');
const { is_array } = require('lang-tools');
let NewsDatabase = null;
const { analyzePage } = require('../intelligence/analysis/page-analyzer');
const { buildGazetteerMatchers } = require('../intelligence/analysis/place-extraction');
const { findProjectRoot } = require('../shared/utils/project-root');
const { loadNonGeoTopicSlugs } = require('./nonGeoTopicSlugs');
const { ArticleXPathService } = require('../services/ArticleXPathService');
const { DecompressionWorkerPool } = require('../background/workers/DecompressionWorkerPool');
const SkeletonHash = require('../intelligence/analysis/structure/SkeletonHash');
const { createLayoutSignaturesQueries } = require('../data/db/sqlite/v1/queries/layoutSignatures');

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
  benchmark = null,
  analysisOptions = {},
  timeout = 5000,
  logSpeed = false
} = {}) {
  if (!dbPath) {
    const projectRoot = findProjectRoot(__dirname);
    dbPath = path.join(projectRoot, 'data', 'news.db');
  }

  if (!NewsDatabase) {
    NewsDatabase = require('../data/db');
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
      db: db,
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

    const queries = db.createAnalysePagesCoreQueries();
    const optionalErrors = typeof queries.getOptionalErrors === 'function'
      ? queries.getOptionalErrors()
      : {};
    if (optionalErrors.compressionBucket) {
      emit(
        logger,
        'warn',
        '[analyse-pages] Compression bucket retrieval unavailable',
        verbose ? optionalErrors.compressionBucket : optionalErrors.compressionBucket?.message
      );
    }

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

    let processed = 0;
    let updated = 0;
    let placesInserted = 0;
    let hubsInserted = 0;
    let hubsUpdated = 0;
    let unknownInserted = 0;
    let skipped = 0;
    let layoutSignaturesUpserted = 0;
    let lastLayoutSignatureHash = null;
    const hubAssignments = captureHubSummaries ? [] : null;
    let lastProgressAt = Date.now();
    let currentUrl = null;
    let lastItemTimings = null; // Timing breakdown for last processed item
    let lastAnalysisResult = null;

    // Initialize layout signatures queries if computeSkeletonHash is enabled
    const computeSkeletonHash = analysisOptions?.computeSkeletonHash === true;
    let layoutSignaturesQueries = null;
    if (computeSkeletonHash) {
      try {
        layoutSignaturesQueries = createLayoutSignaturesQueries(db.db);
      } catch (error) {
        emit(logger, 'warn', '[analyse-pages] Failed to initialize layout signatures queries', verbose ? error : error?.message);
      }
    }

    const rows = queries.getPendingAnalyses(analysisVersion, limit);
    const hasCompressionBucketSupport = queries.hasCompressionBucketSupport();
    const getCompressionBucketById = queries.getCompressionBucketById;
    const benchmarkEnabled = Boolean(benchmark && benchmark.enabled);
    const benchmarkRecorder = benchmarkEnabled && typeof benchmark.onResult === 'function'
      ? benchmark.onResult
      : null;

    const totalRows = Array.isArray(rows) ? rows.length : 0;

    const emitProgress = () => {
      if (typeof onProgress !== 'function') return;
      try {
        onProgress({
          processed,
          total: totalRows,
          updated,
          placesInserted,
          hubsInserted,
          hubsUpdated,
          unknownInserted,
          skipped,
          dryRun,
          ts: Date.now(),
          url: currentUrl,
          lastItemTimings,
          lastAnalysisResult,
          // SkeletonHash metrics
          layoutSignaturesUpserted,
          lastLayoutSignatureHash
        });
      } catch (_) {
        // ignore consumer errors
      }
    };

    for (const row of rows) {
      processed += 1;
      const position = processed;
      currentUrl = row?.url || null;
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
        decompressPool,
        bucketCache,
        hasCompressionBucketSupport,
        getCompressionBucketById,
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

      // Compute and store SkeletonHash if enabled and HTML is available
      if (computeSkeletonHash && layoutSignaturesQueries && htmlInfo.html && !htmlInfo.error) {
        try {
          const skeletonResult = SkeletonHash.compute(htmlInfo.html, 2); // Level 2 = structure only
          if (skeletonResult?.hash) {
            lastLayoutSignatureHash = skeletonResult.hash;
            layoutSignaturesQueries.upsert({
              signature_hash: skeletonResult.hash,
              level: 2,
              signature: skeletonResult.signature,
              first_seen_url: row.url
            });
            layoutSignaturesUpserted += 1;
            if (verbose) {
              emit(logger, 'debug', `[analyse-pages] SkeletonHash L2: ${skeletonResult.hash} for ${row.url}`);
            }
          }
        } catch (skeletonError) {
          emit(logger, 'warn', `[analyse-pages] SkeletonHash failed for ${row.url}`, verbose ? skeletonError : skeletonError?.message);
        }
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
      const analysisStartedAt = (benchmarkEnabled || timeout > 0 || logSpeed) ? performance.now() : null;
      let timedOut = false;

      try {
        const analysisPromise = analyzePage({
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
          xpathService,
          analysisOptions
        });

        if (timeout > 0) {
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
              timedOut = true;
              reject(new Error(`Analysis timed out after ${timeout}ms`));
            }, timeout);
          });
          analysisResult = await Promise.race([analysisPromise, timeoutPromise]);
        } else {
          analysisResult = await analysisPromise;
        }

        // Check if it took too long even if it didn't trigger the timer (sync block)
        if (timeout > 0 && !timedOut) {
          const duration = performance.now() - analysisStartedAt;
          if (duration > timeout) {
            timedOut = true;
            throw new Error(`Analysis timed out after ${timeout}ms (sync)`);
          }
        }
      } catch (error) {
        const duration = analysisStartedAt != null ? performance.now() - analysisStartedAt : 0;
        
        if (timedOut) {
          emit(logger, 'warn', `[analyse-pages] Timeout analyzing ${row.url} (${duration.toFixed(0)}ms)`);
          analysisResult = {
            analysis: {
              kind: 'error',
              error: 'Timeout',
              meta: {
                durationMs: duration,
                error: 'Timeout',
                timedOut: true
              }
            },
            places: [],
            hubCandidate: null,
            deepAnalysis: null,
            preparation: null,
            timings: { overallMs: duration }
          };
        } else {
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
      }
      
      if (logSpeed && analysisStartedAt != null) {
        const duration = performance.now() - analysisStartedAt;
        console.log(`[analyse-pages] Analyzed ${row.url} in ${duration.toFixed(0)}ms`);
      }

      if (benchmarkEntry && analysisStartedAt != null) {
        benchmarkEntry.analysisMs = Math.max(0, performance.now() - analysisStartedAt);
        benchmarkEntry.analysisError = null;
      }

      const { analysis, places, hubCandidate, deepAnalysis, preparation } = analysisResult;

      lastAnalysisResult = {
        places,
        hubCandidate,
        deepAnalysis,
        kind: analysis.kind,
        meta: analysis.meta
      };

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

        // Capture timing breakdown for progress callback (reuse prepTimings from above)
        const prepBreakdown = analysisTimings.preparation || {};
        lastItemTimings = {
          overallMs: analysisTimings.overallMs || null,
          preparationMs: analysisTimings.preparationMs || null,
          jsdomMs: prepBreakdown.jsdomMs || null,
          readabilityMs: prepBreakdown.readabilityMs || null,
          xpathExtractionMs: prepBreakdown.xpathExtractionMs || null,
          xpathLearningMs: prepBreakdown.xpathLearningMs || null,
          usedXPath: Boolean(prepBreakdown.xpathExtractionMs && !prepBreakdown.jsdomMs)
        };
      } else {
        lastItemTimings = null;
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
          queries.updateAnalysis({
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
        const evidenceJson = hubCandidate.evidence ? JSON.stringify(hubCandidate.evidence) : null;

        if (hubCandidate.kind === 'unknown') {
          if (Array.isArray(hubCandidate.unknownTerms) && hubCandidate.unknownTerms.length) {
            const canonicalUrl = hubCandidate.canonicalUrl || row.url;
            for (const term of hubCandidate.unknownTerms) {
              if (shouldPersist) {
                try {
                  const saved = queries.saveUnknownTerm({
                    host: hubCandidate.host,
                    url: row.url,
                    canonicalUrl,
                    termSlug: term.slug,
                    termLabel: term.label || null,
                    source: term.source || null,
                    reason: term.reason || null,
                    confidence: term.confidence || null,
                    evidence: evidenceJson
                  });
                  if (saved) {
                    unknownInserted += 1;
                  }
                } catch (error) {
                  emit(logger, 'warn', `[analyse-pages] Failed to persist unknown term for ${row.url}`, verbose ? error : error?.message);
                }
              } else {
                unknownInserted += 1;
              }
            }
          }
        } else if (hubCandidate.kind === 'place') {
          let existingHub = null;
          try {
            existingHub = queries.getPlaceHubByUrl(row.url) || null;
          } catch (_) {
            existingHub = null;
          }

          const isNewHub = !existingHub;
          let hubPersisted = !shouldPersist;

          if (shouldPersist) {
            try {
              queries.savePlaceHub({
                host: hubCandidate.host,
                url: row.url,
                placeSlug: hubCandidate.placeSlug,
                placeKind: hubCandidate.placeKind,
                topicSlug: hubCandidate.topic?.slug ?? null,
                topicLabel: hubCandidate.topic?.label ?? null,
                topicKind: hubCandidate.topic?.kind ?? null,
                title: row.title || null,
                navLinksCount: hubCandidate.navLinksCount,
                articleLinksCount: hubCandidate.articleLinksCount,
                evidenceJson
              });
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
      timings: timingSummary,
      // SkeletonHash metrics
      layoutSignaturesUpserted,
      lastLayoutSignatureHash
    };
  } finally {
    try { await decompressPool.shutdown(); } catch (_) {}
    try { db.close(); } catch (_) {}
  }
}

async function loadHtmlForRow(row, { decompressPool, bucketCache, hasCompressionBucketSupport, getCompressionBucketById, logger, verbose }) {
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
      if (!hasCompressionBucketSupport) {
        return { html: null, error: new Error('Bucket retrieval unavailable'), meta: finalizeMeta({ source: 'bucket' }) };
      }

      const bucketId = row.compression_bucket_id;
      let cacheEntry = bucketCache.get(bucketId);
      let decompressionWorkerMs = 0;
      let cacheHit = true;
      let bucketFetchMs = 0;

      if (!cacheEntry) {
        const dbFetchStart = performance.now();
        const bucketRow = typeof getCompressionBucketById === 'function'
          ? getCompressionBucketById(bucketId)
          : null;
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
