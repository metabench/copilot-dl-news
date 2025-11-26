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
    createCrawler
  } = {}) {
    if (!createCrawler) {
      throw new Error('CrawlOperation run requires a createCrawler function');
    }
    if (!startUrl || typeof startUrl !== 'string') {
      throw new Error('startUrl is required for crawl operations');
    }

    const normalizedStartUrl = String(startUrl).trim();
    const options = this.buildOptions(defaults, overrides);
    console.log('[DEBUG] CrawlOperation options:', JSON.stringify(options, null, 2));
    const startedAt = Date.now();
    logger.info?.(`[CrawlOperations] ${this.name} starting: ${normalizedStartUrl}`);

    const crawler = createCrawler(normalizedStartUrl, options);
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
