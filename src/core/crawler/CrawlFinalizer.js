"use strict";

class CrawlFinalizer {
  constructor(crawler) {
    this.crawler = crawler;
  }

  async finalize({ includeCleanup = false } = {}) {
    const crawler = this.crawler;
    const outcomeErr = crawler._determineOutcomeError();
    if (!crawler.exitSummary) {
      crawler._recordExit(outcomeErr ? 'failed' : 'completed', {
        downloads: crawler.stats.pagesDownloaded,
        visited: crawler.stats.pagesVisited,
        errors: crawler.stats.errors
      });
    }
    if (outcomeErr) {
      require('./utils/log').error(`Crawl ended: ${outcomeErr.message}`);
    } else {
      require('./utils/log').success('Crawl completed');
    }
    if (crawler.exitSummary) {
      require('./utils/log').info(`Exit reason: ${crawler._describeExitSummary(crawler.exitSummary)}`);
    }
    const log = require('./utils/log');
    log.stat('Pages visited', crawler.stats.pagesVisited);
    log.stat('Pages downloaded', crawler.stats.pagesDownloaded);
    log.stat('Articles found', crawler.stats.articlesFound);
    log.stat('Articles saved', crawler.stats.articlesSaved);
    crawler.emitProgress(true);
    crawler.milestoneTracker.emitCompletionMilestone({ outcomeErr });

    if (crawler.dbAdapter && crawler.dbAdapter.isEnabled()) {
      const count = crawler.dbAdapter.getArticleCount();
      log.stat('Database articles', count);
      crawler.dbAdapter.close();
    }

    if (includeCleanup) {
      crawler._cleanupEnhancedFeatures();
    }

    if (outcomeErr) {
      if (!outcomeErr.details) outcomeErr.details = {};
      if (!outcomeErr.details.stats) outcomeErr.details.stats = { ...crawler.stats };
      throw outcomeErr;
    }
  }
}

module.exports = CrawlFinalizer;
