/**
 * DistributedBatchProcessor - Batch processing helper for distributed crawling
 * 
 * Integrates with DomainProcessor to enable batch HEAD/GET operations
 * via the DistributedFetchAdapter for improved throughput when processing
 * place hub candidates.
 */
'use strict';

const { CRAWL_EVENT_TYPES, SEVERITY_LEVELS } = require('../../core/crawler/telemetry');
const { createFetchRow, extractTitle } = require('../../shared/utils/httpUtils');
const { shouldUsePuppeteer, detectPuppeteerNeeded, recordPuppeteerNeeded, recordHttpSuccess, recordPuppeteerSuccess } = require('../../core/crawler/utils/puppeteerDetection');

class DistributedBatchProcessor {
  /**
   * @param {Object} options
   * @param {Object} options.distributedAdapter - DistributedFetchAdapter instance
   * @param {Object} [options.dbHandle] - Optional database handle for persistent learning
   * @param {Object} [options.logger] - Optional logger
   * @param {Function} [options.emitTelemetry] - Optional telemetry emitter
   * @param {number} [options.headTimeoutMs=10000] - HEAD request timeout
   * @param {number} [options.getTimeoutMs=15000] - GET request timeout
   * @param {number} [options.batchSize=50] - Max URLs per batch
   * @param {number} [options.concurrency=10] - Concurrent batch limit
   */
  constructor(options = {}) {
    this.adapter = options.distributedAdapter;
    this.dbHandle = options.dbHandle || null;
    this.logger = options.logger;
    this.emitTelemetry = options.emitTelemetry;
    this.headTimeoutMs = options.headTimeoutMs || 10000;
    this.getTimeoutMs = options.getTimeoutMs || 15000;
    this.batchSize = options.batchSize || 50;
    this.concurrency = options.concurrency || 10;
  }

  /**
   * Batch HEAD check multiple candidate URLs
   * @param {string[]} urls - Array of URLs to HEAD check
   * @param {Object} context - Processing context (include domain for Puppeteer detection)
   * @returns {Promise<Map<string, HeadResult>>} Map of URL -> result
   */
  async batchHeadCheck(urls, context = {}) {
    if (!this.adapter || urls.length === 0) {
      return new Map();
    }

    const results = new Map();
    const batches = this._chunkArray(urls, this.batchSize);
    
    // Check if domain needs Puppeteer (pass db for persistent learning)
    const domain = context.domain || '';
    const puppeteerCheck = shouldUsePuppeteer(domain, this.dbHandle);
    const usePuppeteer = context.usePuppeteer ?? puppeteerCheck.usePuppeteer;
    
    if (usePuppeteer) {
      this._log('info', `[DistributedBatch] Using Puppeteer for ${domain}: ${puppeteerCheck.reason || context.puppeteerReason || 'explicit'}`);
    }
    
    this._log('info', `[DistributedBatch] Starting batch HEAD check: ${urls.length} URLs in ${batches.length} batches`);
    
    const startTime = Date.now();
    let totalSuccess = 0;
    let totalFailed = 0;
    let rateLimited = false;

    for (const batch of batches) {
      if (rateLimited) break;

      const requests = batch.map(url => ({
        url,
        method: 'HEAD',
        timeoutMs: this.headTimeoutMs,
        usePuppeteer  // Pass to worker
      }));

      try {
        const batchResults = await this.adapter.fetchBatch(requests, {
          timeoutMs: this.headTimeoutMs * 2,
          compress: false // HEAD requests don't need compression
        });

        for (const result of batchResults) {
          // Adapter returns statusCode, normalize to status
          const status = result.status ?? result.statusCode;
          
          const headResult = {
            url: result.url,
            status,
            ok: result.ok,
            error: result.error || null,
            headers: result.headers || {},
            responseTime: result.responseTime ?? result.durationMs ?? null,
            shouldProceed: false,
            rateLimitTriggered: false,
            notFound: false
          };

          // Analyze status
          if (status === 429) {
            headResult.rateLimitTriggered = true;
            rateLimited = true;
            totalFailed++;
          } else if (status === 404 || status === 410) {
            headResult.notFound = true;
            totalFailed++;
          } else if (status === 403) {
            // Possible bot protection - check if we should try Puppeteer
            const detection = detectPuppeteerNeeded(domain, status, result.headers || {});
            if (detection.needsPuppeteer) {
              headResult.needsPuppeteer = true;
              headResult.puppeteerReason = detection.reason;
              recordPuppeteerNeeded(domain, detection.reason, { db: this.dbHandle, detection });
              this._log('info', `[DistributedBatch] 403 detected for ${domain}, Puppeteer recommended: ${detection.reason}`);
            }
            totalFailed++;
          } else if (status >= 200 && status < 400) {
            headResult.shouldProceed = true;
            totalSuccess++;
          } else if (status === 405) {
            // HEAD not allowed, try GET anyway
            headResult.shouldProceed = true;
            totalSuccess++;
          } else {
            totalFailed++;
          }

          results.set(result.url, headResult);
        }
      } catch (batchError) {
        this._log('warn', `[DistributedBatch] Batch HEAD error: ${batchError.message}`);
        // Mark all URLs in this batch as needing individual retry
        for (const url of batch) {
          if (!results.has(url)) {
            results.set(url, {
              url,
              status: null,
              ok: false,
              error: batchError.message,
              shouldProceed: true, // Try GET anyway
              rateLimitTriggered: false,
              notFound: false
            });
          }
        }
      }
    }

    const elapsed = Date.now() - startTime;
    this._log('info', `[DistributedBatch] HEAD check complete: ${totalSuccess} ok, ${totalFailed} failed, ${elapsed}ms`);

    this._emitBatchTelemetry(CRAWL_EVENT_TYPES.BATCH_HEAD_CHECK, {
      urlCount: urls.length,
      batchCount: batches.length,
      successCount: totalSuccess,
      failedCount: totalFailed,
      rateLimited,
      elapsedMs: elapsed,
      ...context
    });

    return results;
  }

  /**
   * Batch GET fetch multiple URLs
   * @param {string[]} urls - Array of URLs to GET
   * @param {Object} context - Processing context (include domain for Puppeteer detection)
   * @returns {Promise<Map<string, GetResult>>} Map of URL -> result with body
   */
  async batchGetFetch(urls, context = {}) {
    if (!this.adapter || urls.length === 0) {
      return new Map();
    }

    const results = new Map();
    const batches = this._chunkArray(urls, this.batchSize);
    
    // Check if domain needs Puppeteer (pass db for persistent learning)
    const domain = context.domain || '';
    const puppeteerCheck = shouldUsePuppeteer(domain, this.dbHandle);
    const usePuppeteer = context.usePuppeteer ?? puppeteerCheck.usePuppeteer;
    
    this._log('info', `[DistributedBatch] Starting batch GET fetch: ${urls.length} URLs in ${batches.length} batches${usePuppeteer ? ' (Puppeteer)' : ''}`);
    
    const startTime = Date.now();
    let totalSuccess = 0;
    let totalFailed = 0;
    let totalBytes = 0;
    let rateLimited = false;

    for (const batch of batches) {
      if (rateLimited) break;

      const requests = batch.map(url => ({
        url,
        method: 'GET',
        timeoutMs: this.getTimeoutMs,
        includeBody: true,  // Request body for validation
        usePuppeteer  // Pass to worker
      }));

      try {
        const batchResults = await this.adapter.fetchBatch(requests, {
          timeoutMs: this.getTimeoutMs * 2,
          compress: true, // GET responses benefit from compression
          includeBody: true // Need body for validation
        });

        for (const result of batchResults) {
          // Adapter returns statusCode, normalize to status
          const status = result.status ?? result.statusCode;
          
          const getResult = {
            url: result.url,
            status,
            ok: result.ok,
            body: result.body || '',
            error: result.error || null,
            headers: result.headers || {},
            responseTime: result.responseTime ?? result.durationMs ?? null,
            bytesReceived: result.bytesReceived || (result.body ? Buffer.byteLength(result.body) : 0)
          };

          if (status === 429) {
            rateLimited = true;
            totalFailed++;
          } else if (result.ok) {
            totalSuccess++;
            totalBytes += getResult.bytesReceived;
            // Record success for learning - helps domains "recover" from Puppeteer requirement
            if (this.dbHandle && domain) {
              if (usePuppeteer) {
                recordPuppeteerSuccess(domain, this.dbHandle);
              } else {
                recordHttpSuccess(domain, this.dbHandle);
              }
            }
          } else {
            totalFailed++;
          }

          results.set(result.url, getResult);
        }
      } catch (batchError) {
        this._log('warn', `[DistributedBatch] Batch GET error: ${batchError.message}`);
        for (const url of batch) {
          if (!results.has(url)) {
            results.set(url, {
              url,
              status: null,
              ok: false,
              body: '',
              error: batchError.message,
              bytesReceived: 0
            });
          }
        }
      }
    }

    const elapsed = Date.now() - startTime;
    const throughput = elapsed > 0 ? (totalSuccess / (elapsed / 1000)).toFixed(1) : 0;
    
    this._log('info', `[DistributedBatch] GET fetch complete: ${totalSuccess} ok, ${totalFailed} failed, ${(totalBytes/1024).toFixed(1)}KB, ${throughput} URLs/sec`);

    this._emitBatchTelemetry(CRAWL_EVENT_TYPES.BATCH_GET_FETCH, {
      urlCount: urls.length,
      batchCount: batches.length,
      successCount: totalSuccess,
      failedCount: totalFailed,
      totalBytes,
      rateLimited,
      elapsedMs: elapsed,
      throughputPerSec: parseFloat(throughput),
      ...context
    });

    return results;
  }

  /**
   * Process candidate URLs in batched mode
   * Returns results ready for DomainProcessor to continue processing
   * 
   * @param {Array<{url: string, source: Object}>} candidates - Candidates with metadata
   * @param {Object} context - Processing context (domain, place info, etc.)
   * @returns {Promise<Object>} Processed batch results
   */
  async processCandidatesBatch(candidates, context = {}) {
    const startTime = Date.now();
    const urls = candidates.map(c => c.url);
    const urlToCandidate = new Map(candidates.map(c => [c.url, c]));

    // Phase 1: Batch HEAD check
    const headResults = await this.batchHeadCheck(urls, {
      phase: 'head',
      domain: context.domain,
      placeKind: context.placeKind
    });

    // Collect URLs that need GET
    const urlsToGet = [];
    const processedResults = [];
    let rateLimited = false;

    for (const [url, headResult] of headResults) {
      const candidate = urlToCandidate.get(url);
      
      if (headResult.rateLimitTriggered) {
        rateLimited = true;
        processedResults.push({
          candidate,
          headResult,
          getResult: null,
          outcome: 'rate-limited',
          shouldRecordAbsent: false
        });
      } else if (headResult.notFound) {
        processedResults.push({
          candidate,
          headResult,
          getResult: null,
          outcome: 'not-found',
          shouldRecordAbsent: true,
          absentStatus: headResult.status
        });
      } else if (headResult.shouldProceed) {
        urlsToGet.push(url);
      } else {
        processedResults.push({
          candidate,
          headResult,
          getResult: null,
          outcome: 'head-failed',
          shouldRecordAbsent: false
        });
      }
    }

    // Phase 2: Batch GET for URLs that passed HEAD
    let getResults = new Map();
    if (!rateLimited && urlsToGet.length > 0) {
      getResults = await this.batchGetFetch(urlsToGet, {
        phase: 'get',
        domain: context.domain,
        placeKind: context.placeKind
      });

      for (const [url, getResult] of getResults) {
        const candidate = urlToCandidate.get(url);
        const headResult = headResults.get(url);

        if (getResult.status === 429) {
          rateLimited = true;
          processedResults.push({
            candidate,
            headResult,
            getResult,
            outcome: 'rate-limited',
            shouldRecordAbsent: false
          });
        } else if (getResult.status === 404 || getResult.status === 410) {
          processedResults.push({
            candidate,
            headResult,
            getResult,
            outcome: 'not-found',
            shouldRecordAbsent: true,
            absentStatus: getResult.status
          });
        } else if (getResult.ok) {
          const title = extractTitle(getResult.body);
          const linkCount = this._countLinks(getResult.body);
          
          processedResults.push({
            candidate,
            headResult,
            getResult,
            outcome: 'fetched',
            shouldRecordAbsent: false,
            validation: {
              pageTitle: title,
              linkCount,
              isValid: linkCount >= 10,
              confidence: linkCount >= 10 ? 0.8 : 0.3
            }
          });
        } else {
          processedResults.push({
            candidate,
            headResult,
            getResult,
            outcome: 'fetch-error',
            shouldRecordAbsent: false
          });
        }
      }
    }

    const elapsed = Date.now() - startTime;
    
    return {
      results: processedResults,
      summary: {
        totalCandidates: candidates.length,
        headChecked: headResults.size,
        getFetched: getResults.size,
        rateLimited,
        elapsedMs: elapsed
      }
    };
  }

  /**
   * Check if distributed processing is available
   */
  isAvailable() {
    return this.adapter && typeof this.adapter.fetchBatch === 'function';
  }

  /**
   * Get adapter health status
   */
  async getHealth() {
    if (!this.adapter) {
      return { healthy: false, reason: 'no-adapter' };
    }
    
    try {
      await this.adapter.checkHealth();
      return { healthy: true };
    } catch (error) {
      return { healthy: false, reason: error.message };
    }
  }

  // --- Private helpers ---

  _chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  _countLinks(html) {
    if (!html) return 0;
    const matches = String(html).match(/<a\b[^>]*>/gi);
    return matches ? matches.length : 0;
  }

  _log(level, message) {
    if (this.logger && typeof this.logger[level] === 'function') {
      this.logger[level](message);
    }
  }

  _emitBatchTelemetry(eventType, data) {
    if (typeof this.emitTelemetry === 'function') {
      this.emitTelemetry(eventType || 'BATCH_OPERATION', data, {
        severity: SEVERITY_LEVELS.INFO,
        message: `Batch ${data.phase || 'operation'}: ${data.successCount || 0} ok / ${data.failedCount || 0} failed`
      });
    }
  }
}

/**
 * Factory function for creating batch processor
 * @param {Object} deps - Dependencies including distributedAdapter, dbHandle
 * @param {Object} options - Batch processor options
 * @returns {DistributedBatchProcessor|null}
 */
function createBatchProcessor(deps, options = {}) {
  if (!deps.distributedAdapter) {
    return null;
  }

  return new DistributedBatchProcessor({
    distributedAdapter: deps.distributedAdapter,
    dbHandle: deps.dbHandle,
    logger: deps.logger,
    emitTelemetry: deps.emitTelemetry,
    ...options
  });
}

module.exports = {
  DistributedBatchProcessor,
  createBatchProcessor
};
