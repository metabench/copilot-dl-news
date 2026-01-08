'use strict';

/**
 * Place Hub API Routes
 * 
 * Thin wrapper around orchestration layer for place hub discovery.
 * Handles: request validation, response formatting, HTTP concerns only.
 * Contains NO business logic - delegates to orchestration layer.
 */

const express = require('express');
const { guessPlaceHubsBatch, checkDomainReadiness } = require('../../orchestration/placeHubGuessing');
const { createPlaceHubDependencies } = require('../../orchestration/dependencies');

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;
  return fallback;
}

function clampInt(value, { min, max, fallback }) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const intVal = Math.trunc(num);
  if (intVal < min) return min;
  if (intVal > max) return max;
  return intVal;
}

/**
 * Create place hub routes router
 * 
 * @param {Object} options - Router options
 * @param {string} options.dbPath - Database path
 * @param {boolean} [options.verbose=false] - Enable verbose logging
 * @returns {express.Router} Express router
 */
function createPlaceHubsRouter(options = {}) {
  const router = express.Router();
  const { dbPath, verbose = false } = options;

  if (!dbPath) {
    throw new Error('Database path is required for place-hubs router');
  }

  /**
   * POST /api/place-hubs/guess
   * Batch hub guessing
   * 
   * Body:
   * {
   *   domains: ["example.com", "example.org"],
   *   options: {
   *     kinds: ["country", "region"],
   *     limit: 10,
   *     patternsPerPlace: 3,
   *     readinessTimeoutSeconds: 10,
   *     enableTopicDiscovery: false,
   *     topics: ["sport", "politics"],
   *     apply: false
   *   }
   * }
   */
  router.post('/guess', async (req, res, next) => {
    try {
      // Validate request body
      const { domains, options: guessOptions = {} } = req.body;
      
      if (!domains || !Array.isArray(domains) || domains.length === 0) {
        return res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'Missing or empty domains array',
          details: {
            provided: typeof domains,
            expected: 'Array of domain strings'
          },
          timestamp: new Date().toISOString()
        });
      }

      // Validate domains are strings
      const invalidDomains = domains.filter((d) => typeof d !== 'string' || d.trim() === '');
      if (invalidDomains.length > 0) {
        return res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'All domains must be non-empty strings',
          details: {
            invalidCount: invalidDomains.length,
            totalCount: domains.length
          },
          timestamp: new Date().toISOString()
        });
      }

      // Extract and validate options
      const {
        kinds = ['country'],
        limit = null,
        patternsPerPlace = 3,
        readinessTimeoutSeconds = 10,
        enableTopicDiscovery = false,
        enableCombinationDiscovery = false,
        topics = [],
        apply = false,
        maxAgeDays = 7,
        refresh404Days = 180,
        retry4xxDays = 7
      } = guessOptions;

      const distributed = parseBoolean(
        guessOptions.distributed,
        parseBoolean(process.env.PLACE_HUB_GUESSING_DISTRIBUTED, true)
      );
      const workerUrl = typeof guessOptions.workerUrl === 'string' && guessOptions.workerUrl.trim()
        ? guessOptions.workerUrl.trim()
        : process.env.PLACE_HUB_GUESSING_WORKER_URL;
      const batchSize = clampInt(
        guessOptions.batchSize ?? process.env.PLACE_HUB_GUESSING_BATCH_SIZE,
        { min: 1, max: 500, fallback: 50 }
      );
      const concurrency = clampInt(
        guessOptions.concurrency ?? process.env.PLACE_HUB_GUESSING_CONCURRENCY,
        { min: 1, max: 100, fallback: 10 }
      );

      // Validate kinds
      const validKinds = ['country', 'region', 'city'];
      const requestedKinds = Array.isArray(kinds) ? kinds : [kinds];
      const invalidKinds = requestedKinds.filter((k) => !validKinds.includes(k));
      
      if (invalidKinds.length > 0) {
        return res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'Invalid place kinds',
          details: {
            invalid: invalidKinds,
            valid: validKinds
          },
          timestamp: new Date().toISOString()
        });
      }

      // Validate enableTopicDiscovery
      if (typeof enableTopicDiscovery !== 'boolean') {
        return res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'enableTopicDiscovery must be a boolean',
          details: {
            provided: typeof enableTopicDiscovery,
            expected: 'boolean'
          },
          timestamp: new Date().toISOString()
        });
      }

      // Validate enableCombinationDiscovery
      if (typeof enableCombinationDiscovery !== 'boolean') {
        return res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'enableCombinationDiscovery must be a boolean',
          details: {
            provided: typeof enableCombinationDiscovery,
            expected: 'boolean'
          },
          timestamp: new Date().toISOString()
        });
      }

      // Validate topics
      if (!Array.isArray(topics)) {
        return res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'topics must be an array',
          details: {
            provided: typeof topics,
            expected: 'Array of strings'
          },
          timestamp: new Date().toISOString()
        });
      }

      const invalidTopics = topics.filter((t) => typeof t !== 'string' || t.trim() === '');
      if (invalidTopics.length > 0) {
        return res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'All topics must be non-empty strings',
          details: {
            invalidCount: invalidTopics.length,
            totalCount: topics.length
          },
          timestamp: new Date().toISOString()
        });
      }

      // Build domain batch
      const domainBatch = domains.map((domain) => ({
        raw: domain,
        domain: domain.toLowerCase(),
        scheme: 'https',
        base: `https://${domain.toLowerCase()}`,
        kinds: requestedKinds,
        kindsOverride: null,
        limit: limit,
        limitOverride: null,
        sources: ['api']
      }));

      // Decide sync vs async processing
      const isAsync = domains.length > 3;
      
      if (isAsync) {
        // TODO: Create background job for large batches
        // For now, return 501 Not Implemented
        return res.status(501).json({
          error: 'NOT_IMPLEMENTED',
          message: 'Async processing for large batches not yet implemented',
          details: {
            domainsCount: domains.length,
            threshold: 3,
            workaround: 'Submit smaller batches (≤3 domains) for synchronous processing'
          },
          timestamp: new Date().toISOString()
        });
      }

      // Prepare dependencies
      const deps = createPlaceHubDependencies({
        dbPath,
        verbose: verbose || guessOptions.verbose,
        distributed,
        workerUrl,
        distributedOptions: {
          batchSize,
          concurrency
        }
      });

      // Prepare orchestration options
      const orchestrationOptions = {
        domainBatch,
        apply,
        kinds: requestedKinds,
        limit,
        patternsPerPlace,
        maxAgeDays,
        refresh404Days,
        retry4xxDays,
        readinessTimeoutSeconds,
        readinessTimeoutMs: readinessTimeoutSeconds > 0 ? readinessTimeoutSeconds * 1000 : null,
        enableTopicDiscovery,
        enableCombinationDiscovery,
        topics,
        verbose: verbose || guessOptions.verbose,
        dbPath
      };

      // Call orchestrator
      const startTime = Date.now();
      const results = await guessPlaceHubsBatch(orchestrationOptions, deps);
      const durationMs = Date.now() - startTime;

      // Transform results to API response format
      const response = {
        version: 1,
        generatedAt: new Date().toISOString(),
        run: {
          startedAt: results.aggregate.startedAt,
          completedAt: results.aggregate.completedAt,
          durationMs: results.aggregate.durationMs
        },
        batch: {
          totalDomains: results.aggregate.batch.totalDomains,
          processedDomains: results.aggregate.batch.processedDomains
        },
        totals: {
          totalPlaces: results.aggregate.totalPlaces,
          totalUrls: results.aggregate.totalUrls,
          fetched: results.aggregate.fetched,
          cached: results.aggregate.cached,
          validationSucceeded: results.aggregate.validationSucceeded,
          validationFailed: results.aggregate.validationFailed,
          insertedHubs: results.aggregate.insertedHubs,
          updatedHubs: results.aggregate.updatedHubs,
          errors: results.aggregate.errors
        },
        diffPreview: {
          insertedCount: results.aggregate.diffPreview.inserted.length,
          updatedCount: results.aggregate.diffPreview.updated.length,
          totalChanges: results.aggregate.diffPreview.inserted.length + results.aggregate.diffPreview.updated.length,
          inserted: results.aggregate.diffPreview.inserted,
          updated: results.aggregate.diffPreview.updated
        },
        candidateMetrics: {
          generated: results.aggregate.totalUrls,
          cachedHits: results.aggregate.cached,
          cachedKnown404: results.aggregate.skipped,
          cachedRecent4xx: results.aggregate.skippedRecent4xx,
          duplicates: results.aggregate.skippedDuplicatePlace,
          stored404: results.aggregate.stored404,
          fetchedOk: results.aggregate.fetched,
          validationPassed: results.aggregate.validationSucceeded,
          validationFailed: results.aggregate.validationFailed,
          rateLimited: results.aggregate.rateLimited,
          persistedInserts: results.aggregate.insertedHubs,
          persistedUpdates: results.aggregate.updatedHubs
        },
        validationSummary: {
          passed: results.aggregate.validationSucceeded,
          failed: results.aggregate.validationFailed,
          failureReasons: results.aggregate.validationFailureReasons || {}
        },
        domainSummaries: results.aggregate.domainSummaries.map((ds) => ({
          domain: ds.domain,
          status: ds.error ? 'error' : 'processed',
          readiness: ds.readiness,
          metrics: {
            totalPlaces: ds.summary.totalPlaces,
            totalUrls: ds.summary.totalUrls,
            fetched: ds.summary.fetched,
            cached: ds.summary.cached,
            validationSucceeded: ds.summary.validationSucceeded,
            validationFailed: ds.summary.validationFailed
          },
          candidateMetrics: {
            generated: ds.summary.totalUrls,
            cachedHits: ds.summary.cached,
            fetchedOk: ds.summary.fetched,
            validationPassed: ds.summary.validationSucceeded,
            validationFailed: ds.summary.validationFailed,
            persistedInserts: ds.summary.insertedHubs,
            persistedUpdates: ds.summary.updatedHubs
          },
          validationSummary: {
            passed: ds.summary.validationSucceeded,
            failed: ds.summary.validationFailed,
            failureReasons: ds.summary.validationFailureReasons || {}
          },
          diffPreview: ds.diffPreview,
          timing: {
            startedAt: ds.summary.startedAt,
            completedAt: ds.summary.completedAt,
            durationMs: ds.summary.durationMs
          }
        }))
      };

      res.status(200).json(response);
      
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/place-hubs/readiness/:domain
   * Check domain readiness
   * 
   * Query params:
   * - timeoutSeconds: Maximum seconds for probes (default: 10)
   */
  router.get('/readiness/:domain', async (req, res, next) => {
    try {
      const { domain } = req.params;
      
      if (!domain || typeof domain !== 'string' || domain.trim() === '') {
        return res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'Domain parameter is required',
          timestamp: new Date().toISOString()
        });
      }

      const timeoutSeconds = parseInt(req.query.timeoutSeconds, 10);
      const timeout = Number.isFinite(timeoutSeconds) ? timeoutSeconds : 10;

      // Prepare dependencies
      const deps = createPlaceHubDependencies({
        dbPath,
        verbose
      });

      // Check readiness
      const readiness = await checkDomainReadiness(domain, { timeoutSeconds: timeout }, deps);

      // Transform to API response format
      const response = {
        status: readiness.status,
        reason: readiness.reason,
        recommendations: readiness.recommendations,
        hasFetchHistory: readiness.hasFetchHistory,
        hasStoredHubs: readiness.hasHistoricalCoverage,
        hasVerifiedMappings: readiness.metrics.verifiedHubMappingCount > 0,
        hasCandidates: readiness.hasCandidates,
        hasVerifiedPatterns: readiness.hasVerifiedPatterns,
        latestDetermination: readiness.latestDetermination,
        metrics: {
          fetchCount: readiness.metrics.fetchCount,
          storedHubCount: readiness.metrics.storedHubCount,
          verifiedHubMappingCount: readiness.metrics.verifiedHubMappingCount,
          candidateCount: readiness.metrics.candidateCount,
          elapsedMs: readiness.metrics.elapsedMs
        }
      };

      res.status(200).json(response);
      
    } catch (error) {
      if (error.code === 'INVALID_INPUT') {
        return res.status(400).json({
          error: 'INVALID_REQUEST',
          message: error.message,
          details: error.details,
          timestamp: new Date().toISOString()
        });
      }
      next(error);
    }
  });

  return router;
}

module.exports = {
  createPlaceHubsRouter
};
