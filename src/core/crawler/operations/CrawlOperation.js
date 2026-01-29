'use strict';

const cloneOptions = (input = {}) => JSON.parse(JSON.stringify(input));

const {
  createTelemetryEvent,
  SEVERITY_LEVELS
} = require('../telemetry/CrawlTelemetrySchema');

function safeUrlForMessage(url, maxLen = 120) {
  if (!url) return '';
  const s = String(url);
  const trimmed = s.replace(/^https?:\/\//i, '');
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, Math.max(0, maxLen - 1)) + '…';
}

function writeTelemetryLine(event) {
  try {
    process.stdout.write(JSON.stringify({ type: 'telemetry', event }) + '\n');
  } catch (_) {
    // Ignore serialization errors
  }
}

function pickFetchMeta(fetchMeta) {
  if (!fetchMeta || typeof fetchMeta !== 'object') return null;
  return {
    httpStatus: fetchMeta.httpStatus ?? null,
    contentType: fetchMeta.contentType ?? null,
    contentLength: fetchMeta.contentLength ?? null,
    redirectChain: fetchMeta.redirectChain ?? null,
    ttfbMs: fetchMeta.ttfbMs ?? null,
    downloadMs: fetchMeta.downloadMs ?? null,
    totalMs: fetchMeta.totalMs ?? null,
    bytesDownloaded: fetchMeta.bytesDownloaded ?? null,
    transferKbps: fetchMeta.transferKbps ?? null,
    conditional: fetchMeta.conditional ?? null
  };
}

class CrawlOperation {
  constructor({ name, summary, defaultOptions = {} } = {}) {
    if (!name) {
      throw new Error('CrawlOperation requires a name');
    }
    this.name = name;
    this.summary = summary || null;
    this.defaultOptions = Object.freeze(cloneOptions(defaultOptions));
  }

  getName() {
    return this.name;
  }

  getSummary() {
    return this.summary;
  }

  getPreset() {
    return {
      summary: this.summary,
      options: cloneOptions(this.defaultOptions)
    };
  }

  buildOptions(defaults = {}, overrides = {}) {
    return {
      ...cloneOptions(defaults),
      ...cloneOptions(this.defaultOptions),
      ...cloneOptions(overrides)
    };
  }

  async run({
    startUrl,
    overrides = {},
    defaults = {},
    logger = console,
    createCrawler,
    onProgress
  } = {}) {
    if (!createCrawler) {
      throw new Error('CrawlOperation run requires a createCrawler function');
    }
    if (!startUrl || typeof startUrl !== 'string') {
      throw new Error('startUrl is required for crawl operations');
    }

    const normalizedStartUrl = String(startUrl).trim();
    const options = this.buildOptions(defaults, overrides);
    const startedAt = Date.now();
    logger.info?.(`[CrawlOperations] ${this.name} starting: ${normalizedStartUrl}`);

    const crawler = createCrawler(normalizedStartUrl, options);

    // Output crawl telemetry events to stdout when telemetryJson option is enabled.
    // Intended for external UIs (e.g. Electron crawl-widget) to forward into their own
    // telemetry streams without needing to import crawler internals.
    if (options.telemetryJson && crawler) {
      const baseEventOptions = {
        jobId: options.jobId || crawler.jobId || null,
        crawlType: options.crawlType || crawler.config?.crawlType || null,
        source: 'crawl-cli'
      };

      const emit = (type, data, extra = {}) => {
        const event = createTelemetryEvent(type, data, {
          ...baseEventOptions,
          ...extra
        });
        writeTelemetryLine(event);
      };

      const pipeline = crawler.fetchPipeline;
      if (pipeline && typeof pipeline.on === 'function') {
        pipeline.on('cache:hit', (data) => {
          const url = data?.url || null;
          const reason = data?.reason || null;
          const ageSeconds = Number.isFinite(data?.ageSeconds) ? data.ageSeconds : null;
          emit('crawl:cache:hit', {
            url,
            reason,
            ageSeconds,
            source: data?.source || null,
            forced: Boolean(data?.forced)
          }, {
            severity: SEVERITY_LEVELS.INFO,
            message: `Cache hit ${safeUrlForMessage(url)}${reason ? ` (${reason})` : ''}`
          });
        });

        pipeline.on('fetch:success', (data) => {
          const url = data?.url || null;
          const status = Number.isFinite(data?.status) ? data.status : null;
          const meta = pickFetchMeta(data?.fetchMeta);
          const bytesKb = meta?.bytesDownloaded != null ? Math.round(meta.bytesDownloaded / 1024) : null;
          const totalMs = meta?.totalMs != null ? Math.round(meta.totalMs) : null;
          emit('crawl:fetch:success', {
            url,
            status,
            fetchMeta: meta
          }, {
            severity: SEVERITY_LEVELS.INFO,
            message: `Fetched ${status ?? 'OK'} ${safeUrlForMessage(url)}${bytesKb != null ? ` (${bytesKb}KB` : ''}${totalMs != null ? `${bytesKb != null ? ', ' : ' ('}${totalMs}ms` : ''}${bytesKb != null || totalMs != null ? ')' : ''}`
          });
        });

        pipeline.on('fetch:retry', (data) => {
          const url = data?.url || null;
          const attempt = Number.isFinite(data?.attempt) ? data.attempt : null;
          const delayMs = Number.isFinite(data?.delayMs) ? data.delayMs : null;
          const strategy = data?.strategy || null;
          emit('crawl:fetch:retry', {
            url,
            attempt,
            delayMs,
            strategy
          }, {
            severity: SEVERITY_LEVELS.WARN,
            message: `Retry ${attempt ?? ''} ${safeUrlForMessage(url)}${delayMs != null ? ` in ${delayMs}ms` : ''}${strategy ? ` (${strategy})` : ''}`.trim()
          });
        });

        pipeline.on('fetch:soft-failure', (data) => {
          const url = data?.url || null;
          const reason = data?.reason || null;
          emit('crawl:fetch:soft-failure', {
            url,
            reason
          }, {
            severity: SEVERITY_LEVELS.WARN,
            message: `Soft failure ${safeUrlForMessage(url)}${reason ? ` (${reason})` : ''}`
          });
        });

        pipeline.on('fetch:error', (data) => {
          const url = data?.url || null;
          const kind = data?.kind || null;
          const status = Number.isFinite(data?.status) ? data.status : null;
          const err = data?.error;
          const errorCode = typeof err?.code === 'string' ? err.code : null;
          const errorMessage = err?.message ? String(err.message) : null;

          const severity = status && status >= 500 ? SEVERITY_LEVELS.ERROR : SEVERITY_LEVELS.WARN;
          const msg = status
            ? `Fetch error HTTP ${status} ${safeUrlForMessage(url)}`
            : `Fetch error ${safeUrlForMessage(url)}${kind ? ` (${kind})` : ''}`;

          emit('crawl:fetch:error', {
            url,
            kind,
            status,
            errorCode,
            errorMessage
          }, {
            severity,
            message: msg,
            tags: status === 429 ? ['rate-limited'] : []
          });
        });
      }
    }

    // Hook into crawler progress events if callback provided
    if (typeof onProgress === 'function' && crawler && typeof crawler.on === 'function') {
      crawler.on('progress', (data) => {
        try {
          onProgress({
            type: 'progress',
            operation: this.name,
            startUrl: normalizedStartUrl,
            timestamp: new Date().toISOString(),
            stats: data.stats || {},
            paused: data.paused || false,
            abortRequested: data.abortRequested || false
          });
        } catch (err) {
          // Ignore callback errors
        }
      });
    }

    // Output progress JSON to stdout when progressJson option is enabled
    // This allows external processes (like Electron widget) to parse progress
    if (options.progressJson && crawler && typeof crawler.on === 'function') {
      crawler.on('progress', (data) => {
        try {
          const stats = data.stats || {};
          const progressLine = JSON.stringify({
            type: 'progress',
            visited: stats.pagesVisited || stats.visited || 0,
            queued: stats.queueSize || stats.queue || stats.queued || 0,
            errors: stats.errorCount || stats.errors || 0,
            articles: stats.articlesSaved || stats.articlesFound || stats.articles || 0,
            downloaded: stats.pagesDownloaded || stats.downloaded || 0
          });
          process.stdout.write(progressLine + '\n');
        } catch (err) {
          // Ignore JSON serialization errors
        }
      });
    }

    const response = {
      operation: this.name,
      startUrl: normalizedStartUrl,
      summary: this.summary,
      options: cloneOptions(options),
      startedAt: new Date(startedAt).toISOString()
    };

    try {
      await crawler.crawl();
      const finishedAt = Date.now();
      response.status = 'ok';
      response.finishedAt = new Date(finishedAt).toISOString();
      response.elapsedMs = finishedAt - startedAt;
      response.stats = cloneOptions(crawler.stats || {});
      logger.info?.(`[CrawlOperations] ${this.name} completed in ${response.elapsedMs}ms`);
    } catch (error) {
      const finishedAt = Date.now();
      response.status = 'error';
      response.finishedAt = new Date(finishedAt).toISOString();
      response.elapsedMs = finishedAt - startedAt;
      response.error = {
        message: error?.message || String(error),
        stack: error?.stack || null
      };
      response.stats = cloneOptions(crawler.stats || {});
      logger.error?.(`[CrawlOperations] ${this.name} failed: ${response.error.message}`);
    } finally {
      await this.disposeCrawler(crawler, logger);
    }

    return response;
  }

  async disposeCrawler(crawler, logger = console) {
    try {
      if (crawler) {
        if (typeof crawler.__crawlTelemetryDisconnect === 'function') {
          try {
            crawler.__crawlTelemetryDisconnect();
          } catch (err) {
            // Ignore disconnect errors
          }
        }

        if (typeof crawler.dispose === 'function') {
          await crawler.dispose();
        } else if (crawler.dbAdapter && typeof crawler.dbAdapter.close === 'function') {
          crawler.dbAdapter.close();
        }
      }
    } catch (error) {
      logger.warn?.(`[CrawlOperations] dispose failed: ${error?.message || error}`);
    }
  }
}

module.exports = {
  CrawlOperation,
  cloneOptions
};
