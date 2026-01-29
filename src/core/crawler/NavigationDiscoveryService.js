'use strict';

const cheerio = require('cheerio');

class NavigationDiscoveryService {
  constructor({
    linkExtractor,
    normalizeUrl,
    looksLikeArticle,
    logger
  } = {}) {
    if (!linkExtractor || typeof linkExtractor.extract !== 'function') {
      throw new Error('NavigationDiscoveryService requires a linkExtractor with an extract method');
    }
    if (typeof normalizeUrl !== 'function') {
      throw new Error('NavigationDiscoveryService requires a normalizeUrl function');
    }
    if (typeof looksLikeArticle !== 'function') {
      throw new Error('NavigationDiscoveryService requires a looksLikeArticle function');
    }

    this.linkExtractor = linkExtractor;
    this.normalizeUrl = normalizeUrl;
    this.looksLikeArticle = looksLikeArticle;
    this.logger = logger || console;
  }

  discover({
    url,
    html,
    depth = 0,
    normalizedUrl = null,
    isCountryHubPage = false,
    totalPrioritisationMode = false
  } = {}) {
    if (!url) {
      throw new Error('NavigationDiscoveryService.discover requires a url');
    }
    if (typeof html !== 'string') {
      throw new Error('NavigationDiscoveryService.discover requires html as a string');
    }

    const $ = cheerio.load(html);
    const linkSummary = this.linkExtractor.extract($, { isCountryHubPage, totalPrioritisationMode }) || {};
    const navigationLinks = Array.isArray(linkSummary.navigation) ? linkSummary.navigation : [];
    const articleLinks = Array.isArray(linkSummary.articles) ? linkSummary.articles : [];
    const allLinks = Array.isArray(linkSummary.all) ? linkSummary.all : [];

    const canonicalUrl = normalizedUrl || this._normalizeSafe(url);
    const looksLikeArticle = this.looksLikeArticle(canonicalUrl || url);

    let classification = 'other';
    if (looksLikeArticle) {
      classification = 'article';
    } else if (navigationLinks.length >= 10) {
      classification = 'nav';
    }

    return {
      url,
      normalizedUrl: canonicalUrl || url,
      depth,
      classification,
      looksLikeArticle,
      navigationLinks,
      articleLinks,
      allLinks,
      linkSummary,
      $
    };
  }

  _normalizeSafe(rawUrl) {
    try {
      return this.normalizeUrl(rawUrl);
    } catch (error) {
      try {
        this.logger?.warn?.('NavigationDiscoveryService.normalize failed', {
          error: error?.message || String(error),
          url: rawUrl
        });
      } catch (_) {}
      return rawUrl;
    }
  }
}

module.exports = {
  NavigationDiscoveryService
};
