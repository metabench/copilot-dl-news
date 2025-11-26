const NewsCrawler = require('./NewsCrawler');

class CrawlerFactory {
  /**
   * Creates a NewsCrawler instance using dependency injection hooks.
   * @param {Object} config - Validated configuration object
   * @returns {NewsCrawler}
   */
  static create(config = {}) {
    if (!config || typeof config.startUrl !== 'string') {
      throw new Error('CrawlerFactory.create requires a startUrl string');
    }

    const constructorOptions = { ...config, _skipWiring: true };
    const crawler = new NewsCrawler(config.startUrl, constructorOptions);

    if (typeof NewsCrawler._wireCrawlerServices === 'function') {
      NewsCrawler._wireCrawlerServices(crawler, { rawOptions: constructorOptions });
    }

    return crawler;
  }
}

module.exports = { CrawlerFactory };
