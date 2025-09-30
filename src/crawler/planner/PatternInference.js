'use strict';

const cheerio = require('cheerio');

class PatternInference {
  constructor({
    fetchPage,
    getCachedArticle,
    telemetry,
    baseUrl,
    domain,
    logger = console
  } = {}) {
    this.fetchPage = typeof fetchPage === 'function' ? fetchPage : null;
    this.getCachedArticle = typeof getCachedArticle === 'function' ? getCachedArticle : null;
    this.telemetry = telemetry || null;
    this.baseUrl = baseUrl;
    this.domain = domain;
    this.logger = logger;
  }

  async run({ startUrl }) {
    const fetchMeta = {
      source: 'network',
      notModified: false
    };
    let homepageHtml = null;

    if (!this.fetchPage) {
      return {
        learned: this._inferSitePatternsFromHomepage(homepageHtml),
        fetchMeta
      };
    }

    try {
      const result = await this.fetchPage({
        url: startUrl,
        context: {
          depth: 0,
          allowRevisit: true,
          referrerUrl: null
        }
      });
      if (result) {
        if (result.source === 'cache') {
          homepageHtml = result.html || null;
          fetchMeta.source = 'cache';
        } else if (result.source === 'not-modified') {
          fetchMeta.notModified = true;
          const cached = this.getCachedArticle ? await this.getCachedArticle(startUrl) : null;
          homepageHtml = cached?.html || null;
          fetchMeta.source = cached?.html ? 'cache' : 'stale';
        } else if (result.source === 'network') {
          homepageHtml = result.html;
          fetchMeta.source = 'network';
        } else if (result.source === 'error') {
          fetchMeta.error = result.meta?.error?.message || result.meta?.error?.kind || 'fetch-error';
        }
      }
    } catch (error) {
      fetchMeta.error = error?.message || String(error);
    }

    const learned = this._inferSitePatternsFromHomepage(homepageHtml);
    if (learned && (this._hasItems(learned.sections) || this._hasItems(learned.articleHints))) {
      this._emitPatternsLearnedMilestone(learned);
    }

    return {
      learned,
      fetchMeta
    };
  }

  _hasItems(value) {
    return Array.isArray(value) && value.length > 0;
  }

  _emitPatternsLearnedMilestone(learned) {
    if (!this.telemetry || typeof this.telemetry.milestone !== 'function') {
      return;
    }
    this.telemetry.milestone({
      kind: 'patterns-learned',
      message: 'Homepage patterns inferred',
      details: learned
    });
  }

  _inferSitePatternsFromHomepage(html) {
    if (!html) {
      return {
        sections: [],
        articleHints: []
      };
    }
    const $ = cheerio.load(html);
    const counts = new Map();
    const skip = new Set(['about', 'contact', 'privacy', 'terms', 'cookies', 'help', 'advertising', 'sitemap', 'account', 'login', 'signup', 'subscribe', 'newsletter', 'careers']);

    const add = (seg) => {
      const s = (seg || '').trim().toLowerCase();
      if (!s || skip.has(s)) return;
      counts.set(s, (counts.get(s) || 0) + 1);
    };

    $('a[href]').each((_, el) => {
      try {
        const href = $(el).attr('href');
        const u = new URL(href, this.baseUrl);
        if (u.hostname !== this.domain) return;
        const seg = (u.pathname || '/').split('/').filter(Boolean)[0] || null;
        if (!seg) return;
        add(seg);
      } catch (_) {
        // ignore parsing errors
      }
    });

    const sections = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([k]) => k);

    const articleHints = [];
    try {
      const sample = new Set();
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        try {
          const u = new URL(href, this.baseUrl);
          if (u.hostname !== this.domain) return;
          const p = u.pathname || '/';
          if (/\/\d{4}\/\d{2}\/\d{2}\//.test(p)) sample.add('date-path');
          if (/(?:^|\/)article[s]?\b|\bnews\b|\bstory\b|\bopinion\b/i.test(p)) sample.add('keywords');
        } catch (_) {
          // ignore parsing errors
        }
      });
      articleHints.push(...Array.from(sample));
    } catch (_) {
      // ignore parsing errors
    }

    return {
      sections,
      articleHints
    };
  }
}

module.exports = {
  PatternInference
};
