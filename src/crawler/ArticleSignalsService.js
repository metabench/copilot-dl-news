const { extractSchemaSignals } = require('./schemaSignals');

class ArticleSignalsService {
  constructor({ baseUrl = null, logger = console } = {}) {
    this.baseUrl = baseUrl;
    this.logger = logger || console;
  }

  looksLikeArticle(url) {
    if (!url || typeof url !== 'string') return false;
    const urlStr = url.toLowerCase();

    const skipPatterns = [
      '/search', '/login', '/register', '/subscribe', '/newsletter',
      '/contact', '/about', '/privacy', '/terms', '/cookies',
      '/rss', '/feed', '.xml', '.json', '/api/', '/admin/',
      '/profile', '/account', '/settings', '/user/',
      '/tag/', '/tags/', '/category/', '/categories/',
      '/page/', '/index', '/sitemap', '/archive',
      '.pdf', '.jpg', '.png', '.gif', '.css', '.js'
    ];

    if (skipPatterns.some(pattern => urlStr.includes(pattern))) {
      return false;
    }

    const articlePatterns = [
      '/article', '/story', '/news', '/post',
      '/world', '/politics', '/business', '/sport',
      '/culture', '/opinion', '/lifestyle', '/technology',
      '/commentisfree', '/uk-news', '/us-news'
    ];

    if (articlePatterns.some(pattern => urlStr.includes(pattern))) {
      return true;
    }

    return /\/\d{4}\/\d{2}\/\d{2}\//.test(urlStr);
  }

  computeUrlSignals(rawUrl) {
    if (!rawUrl) return null;
    try {
      const u = new URL(rawUrl, this.baseUrl || undefined);
      const host = u.hostname;
      const path = u.pathname || '/';
      const segments = path.split('/').filter(Boolean);
      const section = segments[0] || null;
      const pathDepth = segments.length;
      const slug = segments[pathDepth - 1] || '';
      const slugLen = slug.length;
      const lower = path.toLowerCase();
      const hasDatePath = /\/\d{4}\/\d{2}\/\d{2}\//.test(lower);
      const hasArticleWords = /(article|story|news|post|opinion|uk-news|us-news|world|politics|business|sport|culture|technology)/.test(lower);
      const queryCount = Array.from(new URLSearchParams(u.search)).length;
      const hostParts = host.split('.');
      const tld = hostParts[hostParts.length - 1] || null;
      return {
        host,
        tld,
        section,
        pathDepth,
        slugLen,
        hasDatePath,
        hasArticleWords,
        queryCount
      };
    } catch (error) {
      this._warn('computeUrlSignals failed', error);
      return null;
    }
  }

  computeContentSignals($, html) {
    if (!$) {
      return {
        linkDensity: null,
        h2: null,
        h3: null,
        a: null,
        p: null,
        schema: null
      };
    }

    let linkDensity = null;
    let h2 = null;
    let h3 = null;
    let aCount = null;
    let pCount = null;
    let schema = null;

    try {
      const bodyText = (($('body').text() || '').replace(/\s+/g, ' ').trim());
      let aTextLen = 0;
      $('a').each((_, el) => {
        const t = $(el).text();
        aTextLen += (t || '').trim().length;
      });
      const len = bodyText.length || 1;
      linkDensity = Math.min(1, Math.max(0, aTextLen / len));
      h2 = $('h2').length;
      h3 = $('h3').length;
      aCount = $('a').length;
      pCount = $('p').length;
      try {
        schema = extractSchemaSignals({ $, html: html || '' });
      } catch (schemaError) {
        this._warn('computeContentSignals schema extraction failed', schemaError);
      }
    } catch (error) {
      this._warn('computeContentSignals failed', error);
    }

    return {
      linkDensity,
      h2,
      h3,
      a: aCount,
      p: pCount,
      schema
    };
  }

  combineSignals(urlSignals, contentSignals, opts = {}) {
    const votes = {
      article: 0,
      nav: 0,
      other: 0
    };
    const consider = [];

    if (urlSignals) {
      if (urlSignals.hasDatePath || urlSignals.hasArticleWords) {
        votes.article++;
        consider.push('url-article');
      }
      if (urlSignals.pathDepth <= 2 && !urlSignals.hasDatePath) {
        votes.nav++;
        consider.push('url-shallow');
      }
    }

    const cs = contentSignals || {};
    if (typeof cs.linkDensity === 'number') {
      if (cs.linkDensity > 0.25 && (cs.a || 0) > 40) {
        votes.nav++;
        consider.push('content-link-dense');
      }
      if (cs.linkDensity < 0.08 && (cs.p || 0) >= 3) {
        votes.article++;
        consider.push('content-text-heavy');
      }
    }

    if (cs.schema) {
      const schemaScore = typeof cs.schema.score === 'number' ? cs.schema.score : 0;
      if (schemaScore >= 6) {
        votes.article += 3;
        consider.push('schema-strong');
      } else if (schemaScore >= 3.5) {
        votes.article += 2;
        consider.push('schema-medium');
      } else if (schemaScore > 0.5) {
        votes.article++;
        consider.push('schema-weak');
      }

      if (cs.schema.ogTypeArticle && schemaScore < 3.5) {
        votes.article++;
        consider.push('og-article');
      }

      if (schemaScore >= 3.5 && votes.nav > 0) {
        votes.nav -= 1;
      }
    }

    if (typeof opts.wordCount === 'number') {
      if (opts.wordCount > 150) {
        votes.article++;
        consider.push('wc>150');
      }
      if (opts.wordCount < 60 && (cs.a || 0) > 20) {
        votes.nav++;
        consider.push('wc<60');
      }
    }

    let hint = 'other';
    let maxVotes = -1;
    for (const key of Object.keys(votes)) {
      if (votes[key] > maxVotes) {
        maxVotes = votes[key];
        hint = key;
      }
    }

    const considered = consider.length || 1;
    const confidence = Math.min(1, Math.max(0, maxVotes / Math.max(2, considered)));

    return {
      hint,
      confidence,
      considered
    };
  }

  updateConfig({ baseUrl = this.baseUrl } = {}) {
    this.baseUrl = baseUrl;
  }

  _warn(message, error) {
    try {
      this.logger?.warn?.(message, error?.message || error);
    } catch (_) {
      // swallow logging errors
    }
  }
}

module.exports = ArticleSignalsService;
