/**
 * HubContentAnalyzer - Content analysis and validation metrics
 *
 * Extracted from HubValidator to handle content analysis logic,
 * metrics building, and hub content evaluation.
 */

const { HubNormalizer } = require('./HubNormalizer');

class HubContentAnalyzer {
  constructor() {
    this.normalizer = new HubNormalizer();
  }

  /**
   * Analyze article content to verify it's a hub page
   * @param {Object} article - Article object with html, title, etc.
   * @param {string} placeName - Expected place name
   * @param {Object} options - Analysis options
   * @returns {Object} - Validation result with metrics
   */
  analyzeHubContent(article, placeName, options = {}) {
    const evaluated = this._evaluateHub(article, placeName, options);
    return evaluated;
  }

  /**
   * Evaluate hub content and build validation result
   * @param {Object} article - Article object
   * @param {string} placeName - Expected place name
   * @param {Object} options - Analysis options
   * @returns {Object} - Validation result
   */
  _evaluateHub(article, placeName, options = {}) {
    if (!article) {
      return {
        isValid: false,
        reason: 'No article content available',
        metrics: { htmlSource: options.htmlSource || 'unknown' }
      };
    }

    const metrics = this._buildValidationMetrics(article, placeName, options);

    let isValid = true;
    let reason = 'Content validates as hub page';

    if (!metrics.titleContainsPlace) {
      isValid = false;
      reason = `Title does not contain place name "${placeName}"`;
    } else if (metrics.linkCount < 20) {
      isValid = false;
      reason = `Too few links (${metrics.linkCount}) - not a hub page`;
    } else if (metrics.urlLooksDated) {
      isValid = false;
      reason = 'URL contains date - appears to be article, not hub';
    }

    return {
      isValid,
      reason,
      metrics
    };
  }

  /**
   * Build validation metrics for hub content
   * @param {Object} article - Article object
   * @param {string} placeName - Expected place name
   * @param {Object} options - Analysis options
   * @returns {Object} - Validation metrics
   */
  _buildValidationMetrics(article, placeName, options = {}) {
    const html = this.normalizer.bufferToString(article.html);
    const title = article.title || '';
    const linkCount = Number.isFinite(article.navLinksCount)
      ? article.navLinksCount
      : this.normalizer.countLinks(html);
    const articleLinks = Number.isFinite(article.articleLinksCount)
      ? article.articleLinksCount
      : null;
    const titleContainsPlace = title.toLowerCase().includes((placeName || '').toLowerCase());
    const urlLooksDated = article.url ? this.normalizer.isDatedArticle(article.url) : false;
    const paginated = article.url ? this.normalizer.isPaginated(article.url) : false;

    return {
      htmlSource: options.htmlSource || article.source || 'unknown',
      linkCount,
      articleLinkCount: articleLinks,
      titleContainsPlace,
      urlLooksDated,
      paginated,
      placeName,
      title,
      wordCount: Number.isFinite(article.wordCount) ? article.wordCount : null
    };
  }
}

module.exports = { HubContentAnalyzer };