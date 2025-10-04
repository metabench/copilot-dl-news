'use strict';

const cheerio = require('cheerio');

function safeUrlJoin(baseUrl, href) {
  if (!href) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch (_) {
    return null;
  }
}

function uniqueUrls(urls) {
  const seen = new Set();
  const result = [];
  for (const url of urls) {
    if (!url || typeof url !== 'string') continue;
    const trimmed = url.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function pickLabel(el) {
  const label = el.attr('aria-label') || el.attr('title');
  const text = el.text();
  const combined = `${label || ''} ${text || ''}`;
  return combined.replace(/\s+/g, ' ').trim();
}

function classifyLink({ href, label, depth }) {
  const lower = href.toLowerCase();
  if (lower.includes('/about') || lower.includes('/contact')) {
    return 'meta';
  }
  if (lower.includes('/opinion')) {
    return 'opinion';
  }
  if (lower.includes('/video') || lower.includes('/live')) {
    return 'live';
  }
  if (depth === 0) {
    return 'primary';
  }
  if (depth === 1) {
    return 'secondary';
  }
  const labelWords = label.split(' ');
  if (labelWords.length <= 3) {
    return 'category';
  }
  return 'other';
}

class NavigationDiscoveryRunner {
  constructor({
    fetchPage,
    getCachedArticle,
    baseUrl,
    normalizeUrl,
    logger = console,
    maxPages = 3,
    maxLinksPerPage = 40
  } = {}) {
    if (typeof fetchPage !== 'function') {
      throw new Error('NavigationDiscoveryRunner requires fetchPage function');
    }
    this.fetchPage = fetchPage;
    this.getCachedArticle = getCachedArticle;
    this.baseUrl = baseUrl;
  this.normalizeUrl = typeof normalizeUrl === 'function' ? normalizeUrl : null;
    this.logger = logger;
    this.maxPages = Math.max(1, Math.min(5, maxPages || 3));
    this.maxLinksPerPage = Math.max(10, Math.min(200, maxLinksPerPage || 40));
  }

  async run({
    seeds = [],
    startUrl
  } = {}) {
    const pages = uniqueUrls([startUrl, ...seeds]).slice(0, this.maxPages);
    const analysedPages = [];

    for (const page of pages) {
      const html = await this._loadHtml(page);
      if (!html) continue;
      try {
        analysedPages.push(this._analysePage(page, html));
      } catch (err) {
        this._log('warn', '[navigation-discovery] analyse failed', page, err?.message || err);
      }
    }

    const merged = this._mergeResults(analysedPages);
    const summary = this._summarise(merged);

    return {
      analysedPages,
      merged,
      summary
    };
  }

  async _loadHtml(url) {
    try {
      const result = await this.fetchPage({
        url,
        context: {
          depth: 1,
          allowRevisit: true,
          referrerUrl: null,
          intent: 'navigation-discovery'
        }
      });
      if (result?.html) {
        return result.html;
      }
      if (result?.source === 'not-modified' && this.getCachedArticle) {
        const cached = await this.getCachedArticle(url);
        if (cached?.html) {
          return cached.html;
        }
      }
    } catch (err) {
      this._log('warn', '[navigation-discovery] fetch failed', url, err?.message || err);
    }
    if (this.getCachedArticle) {
      try {
        const cached = await this.getCachedArticle(url);
        if (cached?.html) {
          return cached.html;
        }
      } catch (err) {
        this._log('warn', '[navigation-discovery] cache lookup failed', url, err?.message || err);
      }
    }
    return null;
  }

  _analysePage(url, html) {
    const $ = cheerio.load(html);
    const navRoots = [
      $('nav').first(),
      $('[role="navigation"]').first(),
      $('header').first()
    ].filter((el) => el && el.length);
    const links = [];

    navRoots.forEach((root) => {
      root.find('a[href]').each((_, node) => {
        if (links.length >= this.maxLinksPerPage) return false;
        const el = $(node);
        const href = el.attr('href');
        const absolute = safeUrlJoin(this.baseUrl || url, href);
        const label = pickLabel(el) || el.text();
        if (!absolute || !label) return;
        const depth = el.parents().length;
        links.push({
          url: absolute,
          label,
          depth,
          classification: classifyLink({ href: absolute, label, depth })
        });
      });
    });

    return {
      url,
      linkCount: links.length,
      links
    };
  }

  _mergeResults(pages) {
    const map = new Map();
    const samples = [];
    for (const page of pages) {
      samples.push({
        url: page.url,
        linkCount: page.linkCount,
        examples: page.links.slice(0, 5)
      });
      for (const link of page.links) {
        let normalized = link.url;
        if (this.normalizeUrl) {
          try {
            normalized = this.normalizeUrl(link.url);
          } catch (_) {
            normalized = link.url;
          }
        }
        if (!normalized) continue;
        const existing = map.get(normalized) || {
          url: normalized,
          labels: new Set(),
          types: new Set(),
          depth: link.depth,
          occurrences: 0
        };
        existing.labels.add(link.label);
        existing.types.add(link.classification);
        existing.depth = Math.min(existing.depth, link.depth);
        existing.occurrences += 1;
        map.set(normalized, existing);
      }
    }
    const links = Array.from(map.values()).map((entry) => ({
      url: entry.url,
      labels: Array.from(entry.labels).slice(0, 3),
      types: Array.from(entry.types),
      depth: entry.depth,
      occurrences: entry.occurrences
    })).sort((a, b) => b.occurrences - a.occurrences || a.depth - b.depth);

    return {
      links,
      samples
    };
  }

  _summarise({ links, samples }) {
    const totalLinks = links.length;
    const primary = links.filter((entry) => entry.types.includes('primary')).length;
    const secondary = links.filter((entry) => entry.types.includes('secondary')).length;
    const categories = links.filter((entry) => entry.types.includes('category')).length;
    const meta = links.filter((entry) => entry.types.includes('meta')).length;

    const topLinks = links.slice(0, 10).map((entry) => ({
      url: entry.url,
      labels: entry.labels,
      type: entry.types[0] || 'other',
      occurrences: entry.occurrences
    }));

    return {
      totalLinks,
      primary,
      secondary,
      categories,
      meta,
      samples,
      topLinks
    };
  }

  _log(level, ...args) {
    if (!this.logger) return;
    const fn = this.logger[level];
    if (typeof fn === 'function') {
      try {
        fn.apply(this.logger, args);
      } catch (_) {}
    }
  }
}

module.exports = {
  NavigationDiscoveryRunner
};
