const { extractSchemaSignals } = require('./schemaSignals');

class ArticleSignalsService {
  constructor({ baseUrl = null, logger = console, decisionConfigSet = null, articleSignalsConfig = null } = {}) {
    this.baseUrl = baseUrl;
    this.logger = logger || console;
    this.articleSignalsConfig = articleSignalsConfig || decisionConfigSet?.articleSignals || null;
    this._compiledDatePathRegex = this._compileDatePathRegex(this.articleSignalsConfig);
  }

  setArticleSignalsConfig(articleSignalsConfig) {
    this.articleSignalsConfig = articleSignalsConfig || null;
    this._compiledDatePathRegex = this._compileDatePathRegex(this.articleSignalsConfig);
  }

  _getDefaultSkipPatterns() {
    return [
      '/search', '/login', '/register', '/subscribe', '/newsletter',
      '/contact', '/about', '/privacy', '/terms', '/cookies',
      '/rss', '/feed', '.xml', '.json', '/api/', '/admin/',
      '/profile', '/account', '/settings', '/user/',
      '/tag/', '/tags/', '/category/', '/categories/',
      '/page/', '/index', '/sitemap', '/archive',
      '.pdf', '.jpg', '.png', '.gif', '.css', '.js'
    ];
  }

  _getDefaultArticlePatterns() {
    return [
      '/article', '/story', '/news', '/post',
      '/world', '/politics', '/business', '/sport',
      '/culture', '/opinion', '/lifestyle', '/technology',
      '/commentisfree', '/uk-news', '/us-news'
    ];
  }

  _getSkipPatterns() {
    const provided = this.articleSignalsConfig?.skipPatterns;
    const patterns = Array.isArray(provided) ? provided : this._getDefaultSkipPatterns();
    return patterns.filter((value) => typeof value === 'string' && value.length);
  }

  _getArticlePatterns() {
    const provided = this.articleSignalsConfig?.articlePatterns;
    const patterns = Array.isArray(provided) ? provided : this._getDefaultArticlePatterns();
    return patterns.filter((value) => typeof value === 'string' && value.length);
  }

  _compileDatePathRegex(config) {
    const raw = config?.datePathRegex;
    if (raw && typeof raw === 'string') {
      try {
        return new RegExp(raw);
      } catch (err) {
        this._warn('Invalid datePathRegex in articleSignalsConfig; using default', err);
      }
    }
    return /\/\d{4}\/\d{2}\/\d{2}\//;
  }

  looksLikeArticle(url) {
    if (!url || typeof url !== 'string') return false;
    const urlStr = url.toLowerCase();

    const skipPatterns = this._getSkipPatterns();
    if (skipPatterns.some(pattern => urlStr.includes(String(pattern).toLowerCase()))) {
      return false;
    }

    const articlePatterns = this._getArticlePatterns();
    if (articlePatterns.some(pattern => urlStr.includes(String(pattern).toLowerCase()))) {
      return true;
    }

    return this._compiledDatePathRegex.test(urlStr);
  }

  /**
   * STRICTER, shape-only article test for frontier selection (task #48). Unlike
   * looksLikeArticle (which matches article-WORDS anywhere in the URL and so
   * mis-labels section hubs like `/business/` or `/sport/` as articles), this
   * looks purely at URL STRUCTURE: a real article has a deep path ending in a
   * SUBSTANTIAL terminal slug (a long id/hash, a 6+ digit story id, a `.ece` CMS
   * file, a date path, or a many-word hyphenated slug); a section index is a
   * shallow path or a hub/media container.
   *
   * Hardened cycle 75 (harness-measured + adversarially verified):
   *  - a single trailing slash is STRIPPED, not auto-rejected, so a deep dated/
   *    slugged article that ends in '/' is not dropped;
   *  - `/article(s)/<id>` and `article<digits>.ece` terminals are recognised even
   *    when the id is short/mixed (bbc `/sport/…/articles/c0m2rkwm87po`);
   *  - live-blog `?page=with:block` fragments are rejected (frontier de-dup);
   *  - a two-tier content-type veto keeps TEXT articles only: MEDIA segments
   *    (video/audio/podcast/gallery) veto unconditionally; HUB/index containers
   *    (topic/category/series/section/hub/tag/author/newsletter…) veto UNLESS the
   *    terminal carries a CMS-article signal — so apnews `/hub/<multiword>`,
   *    aljazeera `/category/<multiword>`, guardian `/world/series/<multiword>`,
   *    `/author/<name>_<id>` are all rejected (a bare 4+ hyphen slug does NOT
   *    rescue a hub container), while a real story filed under a hub
   *    (thehindu `/newsletter/<name>/<slug>/article<id>.ece`) is kept.
   *
   * Correctly rejects thehindu `/business/`, apnews `/hub/congress` AND
   * `/hub/us-department-of-education`, bbc `/…/topics/<id>`; keeps apnews
   * `/article/<32hex>`, thehindu `…/article70607271.ece`, guardian
   * `/world/2025/sep/15/…`, bbc `/sport/…/articles/<id>`. Static + pure so it can
   * be injected into ncdb selectDueFrontier without an ncdb→copilot dependency.
   * Never throws; always returns a boolean.
   */
  static isArticleShapedUrl(url) {
    if (!url || typeof url !== 'string') return false;
    let u;
    try { u = new URL(url); } catch (_) { return false; }
    // OVER-selection fix (cycle 75, measured 33 cases): live-blog block-pagination
    // fragments (e.g. Guardian `?page=with:block-<hash>`) are the SAME article
    // re-emitted once per block anchor and flood the frontier with duplicates.
    // Reject the ?page fragments; the base live-blog URL (no such query) is still
    // evaluated normally below and kept as one article.
    if (/[?&]page=with(:|%3A)block/i.test(u.search || '')) return false;
    let p = u.pathname || '/';
    // UNDER-selection fix (cycle 75): strip a SINGLE trailing slash rather than
    // pre-rejecting. The old `endsWith('/') => false` dropped deep dated/slugged
    // articles that merely end in '/' (e.g. nytimes /athletic/<id>/<Y>/<M>/<D>/<slug>/,
    // /wirecutter/reviews/<slug>/) BEFORE their article signals were checked.
    // Section indexes (/business/, /news/national/) stay rejected below: after the
    // strip they are still too shallow or carry no article signal.
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    const segs = p.split('/').filter(Boolean);
    if (segs.length < 1) return false;               // homepage
    // UNDER-selection fix (cycle 167, measured on 120k already-fetched titles): a
    // blanket `segs.length < 2` reject made FLAT-SLUG newsrooms invisible — every
    // businessinsider.com/<slug>-2026-5, nbcnews.com/<slug>, apnews-style depth-1
    // story. Measured: 0 of 2,443 depth-1 rows were admitted, and the loss hit BOTH
    // consumers (frontier `preferArticleShaped` selection AND the
    // /api/v1/crawl/articles listing filter, which dropped them from the product UI).
    // Depth-1 needs a STRONGER slug signal than depth>=2 (which accepts 4 hyphen
    // parts) because a flat path carries no section context to disambiguate: at 6+
    // parts the measured split is 163 real stories vs 3 non-articles, while section
    // landings (/markets, /news, /video, /business) carry 1-3 parts and stay rejected.
    if (segs.length === 1 && segs[0].split('-').filter(Boolean).length < 6) return false;
    const lower = segs.map((s) => s.toLowerCase());
    const last = segs[segs.length - 1];
    const prev = segs[segs.length - 2] || '';
    const hyphenParts = last.split('-').filter(Boolean).length;
    const hasLongId = /[a-f0-9]{12,}|\d{6,}/i.test(last);   // 12+ hex hash or 6+ digit story id (topic ids are ~8 hex)
    const hasDatePath = /\/(19|20)\d{2}\/\d{1,2}\/\d{1,2}\//.test(p);
    // UNDER-selection fix (cycle 75, measured — bbc /sport/.../articles/<id>): a CMS
    // `/article(s)/<id>` segment is an unambiguous article signal even when the id is
    // a short mixed-alnum slug (e.g. `c0m2rkwm87po`, neither 12-hex nor 6-digit).
    const isCmsArticlePath = (prev === 'article' || prev === 'articles') && /^[a-z0-9]{6,}$/i.test(last);
    const isEceArticle = /^article\d{4,}\.ece$/i.test(last);   // thehindu CMS article file
    // A CMS-article terminal signal (distinct from a bare long id, which author/topic
    // ids also carry). Used to exempt a real article that lives under a hub container.
    const cmsArticleSignal = hasDatePath || isCmsArticlePath || isEceArticle;
    // Content-type veto, TWO TIERS (cycle 75; hardened after an adversarial pass
    // found both a false-drop and section-hub over-calls the first single-tier
    // veto caused):
    //  Tier 1 — MEDIA (non-text regardless of terminal): veto if the word appears
    //  as ANY whole path segment. Correctly drops bbc /reel/video, /audio/play,
    //  irishtimes /video/video/<date>/<slug>, thehindu /podcast/…/article<id>.ece.
    const MEDIA_SEGMENTS = new Set([
      'video', 'videos', 'audio', 'podcast', 'podcasts', 'gallery', 'galleries',
    ]);
    if (lower.some((s) => MEDIA_SEGMENTS.has(s))) return false;
    //  Tier 2 — HUB/INDEX containers (topic/category/series/author/tag/newsletter…):
    //  veto ONLY when there is NO CMS-article terminal signal. This drops the index
    //  landings (apnews /hub/<multiword>, aljazeera /category/<multiword>, guardian
    //  /world/series/<multiword>, npr /series/<id>/<multiword>, /author/<name>_<id>)
    //  — where a bare `hyphenParts>=4` or a hub/author id must NOT rescue — while
    //  KEEPING a genuine article filed under a hub (thehindu
    //  /newsletter/<name>/<slug>/article<id>.ece, or any dated story under a topic).
    const HUB_SEGMENTS = new Set([
      'tag', 'tags', 'topic', 'topics', 'author', 'authors', 'profile', 'search',
      'newsletter', 'newsletters', 'category', 'categories', 'hub', 'hubs',
      'series', 'section', 'sections', 'collection', 'collections',
    ]);
    if (lower.some((s) => HUB_SEGMENTS.has(s)) && !cmsArticleSignal) return false;
    return hasDatePath || hasLongId || isCmsArticlePath || isEceArticle || hyphenParts >= 4;
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
    const reasons = [];
    const rejections = [];

    if (urlSignals) {
      if (urlSignals.hasDatePath || urlSignals.hasArticleWords) {
        votes.article++;
        reasons.push('url-article');
      }
      if (urlSignals.pathDepth <= 2 && !urlSignals.hasDatePath) {
        votes.nav++;
        rejections.push('url-shallow');
      }
    }

    const cs = contentSignals || {};
    if (typeof cs.linkDensity === 'number') {
      if (cs.linkDensity > 0.20 && (cs.a || 0) > 40) {
        votes.nav++;
        rejections.push('content-link-dense');
      }
      if (cs.linkDensity < 0.08 && (cs.p || 0) >= 3) {
        votes.article++;
        reasons.push('content-text-heavy');
      }
    }

    if ((cs.a || 0) > 100) {
      votes.nav += 2;
      rejections.push(`high-link-count (>100, was ${cs.a})`);
    }

    if (cs.schema) {
      const schemaScore = typeof cs.schema.score === 'number' ? cs.schema.score : 0;
      if (schemaScore >= 6) {
        votes.article += 3;
        reasons.push('schema-strong');
      } else if (schemaScore >= 3.5) {
        votes.article += 2;
        reasons.push('schema-medium');
      } else if (schemaScore > 0.5) {
        votes.article++;
        reasons.push('schema-weak');
      }

      if (cs.schema.ogTypeArticle && schemaScore < 3.5) {
        votes.article++;
        reasons.push('og-article');
      }

      if (schemaScore >= 3.5 && votes.nav > 0) {
        votes.nav -= 1;
      }
    }

    if (typeof opts.wordCount === 'number') {
      if (opts.wordCount > 150) {
        votes.article++;
        reasons.push(`wc>150 (${opts.wordCount})`);
      }
      if (opts.wordCount < 60 && (cs.a || 0) > 20) {
        votes.nav++;
        rejections.push(`wc<60 (${opts.wordCount})`);
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

    const consideredCount = reasons.length + rejections.length;
    const confidence = Math.min(1, Math.max(0, maxVotes / Math.max(2, consideredCount)));

    return {
      hint,
      confidence,
      reasons,
      rejections,
      votes
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
