'use strict';

const { CrawlOperation, cloneOptions } = require('./CrawlOperation');

class CustomCrawlOperation extends CrawlOperation {
  constructor() {
    super({
      name: 'custom',
      summary: 'Run NewsCrawler with custom options',
      defaultOptions: {}
    });
  }

  buildOptions(defaults = {}, overrides = {}) {
    // Custom operations should not apply built-in defaults so overrides win.
    return {
      ...cloneOptions(defaults || {}),
      ...cloneOptions(overrides || {})
    };
  }
}

module.exports = {
  CustomCrawlOperation
};
