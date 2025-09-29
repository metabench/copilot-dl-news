'use strict';

const cheerio = require('cheerio');
const Links = require('./links');

class LinkExtractor {
  constructor(options = {}) {
    const { normalizeUrl, isOnDomain, looksLikeArticle } = options;
    if (typeof normalizeUrl !== 'function') {
      throw new Error('LinkExtractor requires a normalizeUrl function');
    }
    if (typeof isOnDomain !== 'function') {
      throw new Error('LinkExtractor requires an isOnDomain function');
    }
    if (typeof looksLikeArticle !== 'function') {
      throw new Error('LinkExtractor requires a looksLikeArticle function');
    }
    this.normalizeUrl = normalizeUrl;
    this.isOnDomain = isOnDomain;
    this.looksLikeArticle = looksLikeArticle;
  }

  extract(htmlOrCheerio) {
    const $ = this._ensureCheerio(htmlOrCheerio);
    const navigationLinks = Links
      .findNavigationLinks($, (u) => this.normalizeUrl(u), (u) => this.isOnDomain(u))
      .filter((link) => link && link.onDomain);
    const articleLinks = Links.findArticleLinks($, (u) => this.normalizeUrl(u), (u) => this.looksLikeArticle(u), (u) => this.isOnDomain(u));
    const allLinks = this._combineWithType(navigationLinks, articleLinks);
    return {
      navigation: navigationLinks,
      articles: articleLinks,
      all: allLinks
    };
  }

  _combineWithType(navigationLinks, articleLinks) {
    const merged = [];
    if (Array.isArray(navigationLinks)) {
      for (const link of navigationLinks) {
        merged.push({ ...link, type: 'nav' });
      }
    }
    if (Array.isArray(articleLinks)) {
      for (const link of articleLinks) {
        merged.push({ ...link, type: 'article' });
      }
    }
    return merged;
  }

  _ensureCheerio(htmlOrCheerio) {
    if (typeof htmlOrCheerio === 'string') {
      return cheerio.load(htmlOrCheerio);
    }
    if (htmlOrCheerio && typeof htmlOrCheerio === 'function' && htmlOrCheerio.root) {
      // Looks like a cheerio instance already
      return htmlOrCheerio;
    }
    throw new Error('LinkExtractor.extract expects HTML string or cheerio instance');
  }
}

module.exports = { LinkExtractor };
