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

  extract(htmlOrCheerio, options = {}) {
    const $ = this._ensureCheerio(htmlOrCheerio);
    const { isCountryHubPage = false, totalPrioritisationMode = false } = options;

    const navigationLinks = Links
      .findNavigationLinks($, (u) => this.normalizeUrl(u), (u) => this.isOnDomain(u))
      .filter((link) => link && link.onDomain);

    let articleLinks = [];
    if (!totalPrioritisationMode || !isCountryHubPage) {
      // Normal behavior: extract article links
      articleLinks = Links.findArticleLinks($, (u) => this.normalizeUrl(u), (u) => this.looksLikeArticle(u), (u) => this.isOnDomain(u));
    } else {
      // Total prioritisation mode on country hub pages: only extract pagination links
      articleLinks = this._extractPaginationLinksOnly($, navigationLinks);
    }

    const allLinks = this._combineWithType(navigationLinks, articleLinks);
    return {
      navigation: navigationLinks,
      articles: articleLinks,
      all: allLinks
    };
  }

  _extractPaginationLinksOnly($, navigationLinks) {
    // In total prioritisation mode on country hub pages, only extract pagination links
    const paginationLinks = [];

    // Look for pagination-specific patterns in navigation links
    for (const link of navigationLinks) {
      if (this._isPaginationLink(link.url)) {
        paginationLinks.push({
          url: link.url,
          anchor: link.anchor,
          rel: link.rel,
          onDomain: link.onDomain,
          type: 'pagination'
        });
      }
    }

    // Also check for common pagination DOM patterns
    $('.pagination a, .pager a, [class*="pagination"] a, [class*="pager"] a').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      const normalized = this.normalizeUrl(href);
      if (!normalized || !this.isOnDomain(normalized)) return;

      // Avoid duplicates
      if (!paginationLinks.some(link => link.url === normalized)) {
        paginationLinks.push({
          url: normalized,
          anchor: $(el).text().trim().slice(0, 200) || null,
          rel: $(el).attr('rel') || null,
          onDomain: 1,
          type: 'pagination'
        });
      }
    });

    return paginationLinks;
  }

  _isPaginationLink(url) {
    if (!url) return false;

    try {
      const urlObj = new URL(url);

      // Check for pagination query parameters
      if (urlObj.searchParams.has('page') ||
          urlObj.searchParams.has('p') ||
          urlObj.searchParams.has('offset') ||
          urlObj.searchParams.has('start')) {
        return true;
      }

      // Check for pagination in path (e.g., /page/2/, /p/2/)
      const path = urlObj.pathname.toLowerCase();
      if (path.includes('/page/') ||
          path.includes('/p/') ||
          path.match(/\/\d+\/?$/) && !path.includes('/20') && !path.includes('/19')) { // Avoid date-like patterns
        return true;
      }

      return false;
    } catch (error) {
      return false;
    }
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
        merged.push({ ...link, type: articleLinks[0]?.type === 'pagination' ? 'pagination' : 'article' });
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
