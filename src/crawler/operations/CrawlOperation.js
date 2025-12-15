'use strict';

const cloneOptions = (input = {}) => JSON.parse(JSON.stringify(input));

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
