'use strict';

const cheerio = require('cheerio');
const crypto = require('crypto');
const { Readability } = require('@mozilla/readability');
const { extractSchemaSignals } = require('./schemaSignals');
const { createJsdom } = require('../../shared/utils/jsdomUtils');
const { countWords } = require('../../shared/utils/textMetrics');
const zlib = require('zlib');

class ArticleProcessor {
  constructor(options = {}) {
    const {
      linkExtractor,
      normalizeUrl,
      looksLikeArticle,
      computeUrlSignals,
      computeContentSignals,
      combineSignals,
      dbAdapter,
      articleHeaderCache,
      knownArticlesCache,
      events,
      logger
    } = options;

    if (!linkExtractor) {
      throw new Error('ArticleProcessor requires a linkExtractor instance');
    }
    if (typeof normalizeUrl !== 'function') {
      throw new Error('ArticleProcessor requires a normalizeUrl function');
    }
    if (typeof looksLikeArticle !== 'function') {
      throw new Error('ArticleProcessor requires a looksLikeArticle function');
    }
    if (typeof computeUrlSignals !== 'function') {
      throw new Error('ArticleProcessor requires a computeUrlSignals function');
    }
    if (typeof computeContentSignals !== 'function') {
      throw new Error('ArticleProcessor requires a computeContentSignals function');
    }
    if (typeof combineSignals !== 'function') {
      throw new Error('ArticleProcessor requires a combineSignals function');
    }

    this.linkExtractor = linkExtractor;
    this.normalizeUrl = normalizeUrl;
    this.looksLikeArticle = looksLikeArticle;
    this.computeUrlSignals = computeUrlSignals;
    this.computeContentSignals = computeContentSignals;
    this.combineSignals = combineSignals;
  this.dbAdapter = dbAdapter || null;
    this.articleHeaderCache = articleHeaderCache || null;
    this.knownArticlesCache = knownArticlesCache || null;
    this.events = events || null;
    this.logger = logger || console;

    // P2 diagnostic: track content save decisions for periodic reporting
    this._contentSaveStats = { total: 0, saved: 0, skippedNotArticle: 0, skippedNoDb: 0, skippedNoPersist: 0, errors: 0 };
    this._lastContentStatsLog = 0;
    this._contentStatsInterval = 50; // Log after every N pages processed
    this._dbEnabledWarned = false;
  }

  async process({
    url,
    html,
    fetchMeta = null,
    depth = 0,
    normalizedUrl = null,
    referrerUrl = null,
    discoveredAt = null,
    persistArticle = true,
    insertFetchRecord = true,
    insertLinkRecords = true,
    linkSummary: providedLinkSummary = null,
    $: providedCheerio = null
  }) {
    if (!url) {
      throw new Error('ArticleProcessor.process requires url');
    }
    if (typeof html !== 'string') {
      throw new Error('ArticleProcessor.process requires html string');
    }

    const $ = providedCheerio || cheerio.load(html);
    const linkSummary = providedLinkSummary || this.linkExtractor.extract($);
    const navigationLinks = linkSummary.navigation || [];
    const articleLinks = linkSummary.articles || [];
    const allLinks = linkSummary.all || [];

    const readability = this._runReadability(html, url);
    const urlSignals = this.computeUrlSignals(url);
    const contentSignals = this.computeContentSignals($, html);
    const combinedSignals = this.combineSignals(urlSignals, contentSignals, { wordCount: readability.wordCount ?? undefined });

    const isArticleByUrl = this.looksLikeArticle(url);
    const strongWordCount = typeof readability.wordCount === 'number' && readability.wordCount > 150;
    const isArticle = isArticleByUrl || strongWordCount;
    const isHub = !isArticle && this._isLikelyHub(url, navigationLinks, articleLinks);

    let metadata = null;
    if (isArticle) {
      metadata = this._extractArticleMetadata($, url);
    } else if (isHub) {
      metadata = this._extractHubMetadata($, url, navigationLinks, articleLinks);
    }

    const classification = isArticle
      ? 'article'
      : isHub
        ? 'hub'
        : (navigationLinks.length > 10 ? 'nav' : 'other');

    let articleSaved = false;
    let hubSaved = false;
    // P2 diagnostic: track why content is or isn't saved
    this._contentSaveStats.total++;
    const dbEnabled = this._dbEnabled();

    if (!dbEnabled && !this._dbEnabledWarned) {
      this._dbEnabledWarned = true;
      this._log('warn', '[ArticleProcessor] DB adapter not enabled — no content will be stored. ' +
        `adapter=${this._getDbAdapter() ? 'present' : 'null'}, ` +
        `isEnabled=${typeof this._getDbAdapter()?.isEnabled === 'function' ? this._getDbAdapter().isEnabled() : 'N/A'}`);
    }

    if (persistArticle && isArticle && dbEnabled) {
      articleSaved = await this._persistArticle({
        url,
        html,
        metadata,
        readability,
        fetchMeta,
        referrerUrl,
        discoveredAt,
        depth
      });
      if (articleSaved) {
        this._contentSaveStats.saved++;
      } else {
        this._contentSaveStats.errors++;
      }
    } else if (persistArticle && isHub && dbEnabled) {
      // Hub pages are stored via the same upsertArticle path but with hub metadata
      hubSaved = await this._persistHubPage({
        url,
        html,
        metadata,
        readability,
        fetchMeta,
        referrerUrl,
        discoveredAt,
        depth,
        navigationLinks,
        articleLinks
      });
      if (hubSaved) {
        this._contentSaveStats.saved++;
      } else {
        this._contentSaveStats.errors++;
      }
    } else if (!persistArticle) {
      this._contentSaveStats.skippedNoPersist++;
    } else if (!isArticle && !isHub) {
      this._contentSaveStats.skippedNotArticle++;
    } else if (!dbEnabled) {
      this._contentSaveStats.skippedNoDb++;
    }

    // Periodic content save rate reporting
    if (this._contentSaveStats.total - this._lastContentStatsLog >= this._contentStatsInterval) {
      this._lastContentStatsLog = this._contentSaveStats.total;
      const s = this._contentSaveStats;
      const saveRate = s.total > 0 ? ((s.saved / s.total) * 100).toFixed(1) : '0.0';
      this._log('log', `[ArticleProcessor] Content save stats: ${s.saved}/${s.total} saved (${saveRate}%), ` +
        `notArticle=${s.skippedNotArticle}, noPersist=${s.skippedNoPersist}, noDb=${s.skippedNoDb}, errors=${s.errors}`);
    }

  if (insertFetchRecord && this._dbEnabled()) {
      this._insertFetchRecord({
        url,
        fetchMeta,
        classification,
        navigationLinksCount: navigationLinks.length,
        articleLinksCount: articleLinks.length,
        readability,
        urlSignals,
        contentSignals,
        combinedSignals,
        savedToDb: (articleSaved || hubSaved) ? 1 : 0
      });
    }

  if (insertLinkRecords && this._dbEnabled()) {
      this._insertLinkRecords({
        pageUrl: url,
        links: allLinks,
        depth
      });
    }

    if (articleSaved) {
      this.knownArticlesCache?.set(normalizedUrl || url, true);
    }

    return {
      url,
      normalizedUrl: normalizedUrl || url,
      isArticle,
      isHub,
      metadata,
      readability,
      navigationLinks,
      articleLinks,
      allLinks,
      statsDelta: {
        articlesFound: isArticle ? 1 : 0,
        articlesSaved: articleSaved ? 1 : 0,
        hubsFound: isHub ? 1 : 0,
        hubsSaved: hubSaved ? 1 : 0
      },
      signals: {
        url: urlSignals,
        content: contentSignals,
        combined: combinedSignals
      },
      classification
    };
  }

  _extractArticleMetadata($, url) {
    const title = $('h1').first().text().trim() ||
      $('title').text().trim() ||
      $('[property="og:title"]').attr('content') ||
      'Unknown Title';

    let date = '';
    const dateSelectors = [
      '[datetime]',
      '.date',
      '.published',
      '.timestamp',
      '[property="article:published_time"]',
      '[name="article:published_time"]'
    ];
    for (const selector of dateSelectors) {
      const element = $(selector).first();
      if (element.length) {
        date = element.attr('datetime') || element.attr('content') || element.text().trim();
        if (date) break;
      }
    }

    let section = '';
    try {
      const urlParts = new URL(url).pathname.split('/').filter(Boolean);
      if (urlParts.length > 0) {
        section = urlParts[0];
      }
    } catch (_) { /* ignore URL errors */ }

    const sectionMeta = $('[property="article:section"]').attr('content') ||
      $('[name="section"]').attr('content') ||
      $('.section').first().text().trim();
    if (sectionMeta) {
      section = sectionMeta;
    }

    return { title, date, section, url };
  }

  _runReadability(html, url) {
    let htmlSha = null;
    let text = null;
    let wordCount = null;
    let language = null;
    let articleXPath = null;

    try {
      htmlSha = crypto.createHash('sha256').update(html).digest('hex');
    } catch (_) { /* ignore hash errors */ }

    try {
      let dom = null;
      try {
        ({ dom } = createJsdom(html, { url }));
        const document = dom.window.document;
        const reader = new Readability(document);
        const article = reader.parse();

        if (article && article.textContent) {
          text = article.textContent.trim();
          wordCount = countWords(text);
          language = document.documentElement.getAttribute('lang') || null;
          articleXPath = this._findArticleXPath(document, article);
        }
      } finally {
        if (dom) {
          dom.window.close();
        }
      }
    } catch (err) {
      this._log('warn', 'Readability parsing failed:', err && err.message ? err.message : err);
    }

    return { htmlSha, text, wordCount, language, articleXPath };
  }

  _findArticleXPath(document, readabilityArticle) {
    try {
      const text = readabilityArticle?.textContent || '';
      if (!text) return null;
      const targetLen = text.length;
      const normalize = (s) => (s || '').trim();

      const tmp = document.createElement('div');
      tmp.innerHTML = readabilityArticle.content || '';
      const rbParas = Array.from(tmp.querySelectorAll('p'))
        .map((p) => normalize(p.textContent))
        .filter(Boolean);
      const rbTotal = rbParas.length;

      const selectors = [
        'article', '[role="article"]', '[itemprop="articleBody"]',
        'main article', 'main [itemprop="articleBody"]',
        '.article-body', '.content__article-body', '.story-body', '.entry-content', '.post-content', '.rich-text', '.ArticleBody', '.article__body',
        'main', 'section', 'div[class*="article"]', 'div[id*="article"]'
      ];
      const candidates = new Set();
      for (const sel of selectors) {
        for (const el of document.querySelectorAll(sel)) {
          candidates.add(el);
          if (candidates.size > 200) break;
        }
        if (candidates.size > 200) break;
      }
      if (candidates.size === 0) {
        for (const el of document.body.querySelectorAll('p, article, main, section')) {
          candidates.add(el);
        }
      }

      const navClassRe = /(nav|menu|footer|sidebar|comment|promo|related|share|social)/i;
      const scoreOf = (el) => {
        const t = normalize(el.textContent);
        const len = t.length;
        if (len === 0) return Number.POSITIVE_INFINITY;
        const paras = el.querySelectorAll('p').length;
        let linkText = 0;
        for (const a of el.querySelectorAll('a')) {
          linkText += normalize(a.textContent).length;
        }
        const density = len > 0 ? linkText / len : 0;
        let score = Math.abs(len - targetLen);
        score += Math.abs(paras - rbTotal) * 50;
        if (density > 0.3) score += 10000;
        const idcl = `${el.id || ''} ${el.className || ''}`;
        if (navClassRe.test(idcl)) score += 5000;
        let depth = 0;
        for (let n = el; n && n.parentNode; n = n.parentNode) depth++;
        score -= Math.min(depth, 20) * 5;
        return score;
      };

      let best = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const el of candidates) {
        const s = scoreOf(el);
        const len = normalize(el.textContent).length;
        if (len < targetLen * 0.5) continue;
        if (s < bestScore) {
          best = el;
          bestScore = s;
        }
      }
      const node = best || document.body;

      const getXPath = (el) => {
        if (!el || el.nodeType !== 1) return '';
        if (el === document.documentElement) return '/html';
        const segs = [];
        for (let n = el; n && n.nodeType === 1; n = n.parentNode) {
          const name = n.localName;
          if (!name) break;
          if (n.parentNode) {
            const siblings = Array.from(n.parentNode.children).filter((c) => c.localName === name);
            if (siblings.length > 1) {
              segs.unshift(`${name}[${siblings.indexOf(n) + 1}]`);
            } else {
              segs.unshift(name);
            }
          } else {
            segs.unshift(name);
          }
          if (n === document.documentElement) break;
        }
        if (segs[0] !== 'html') segs.unshift('html');
        return '/' + segs.join('/');
      };
      return getXPath(node);
    } catch (_) {
      return null;
    }
  }

  async _persistArticle({ url, html, metadata, readability, fetchMeta, referrerUrl, discoveredAt, depth }) {
    try {
      const adapter = this._getDbAdapter();
      if (!adapter) return false;
      const canonicalUrl = this._extractCanonicalUrl(html);
      const articleAnalysis = this._buildArticleAnalysis({ url, html, readability });
      adapter.upsertArticle({
        url,
        title: metadata.title,
        date: metadata.date || null,
        section: metadata.section || null,
        html,
        crawled_at: new Date().toISOString(),
        canonical_url: canonicalUrl,
        referrer_url: referrerUrl || null,
        discovered_at: discoveredAt || null,
        crawl_depth: depth ?? null,
        fetched_at: fetchMeta?.fetchedAtIso || null,
        request_started_at: fetchMeta?.requestStartedIso || null,
        http_status: fetchMeta?.httpStatus ?? null,
        content_type: fetchMeta?.contentType || null,
        content_length: fetchMeta?.contentLength ?? null,
        etag: fetchMeta?.etag || null,
        last_modified: fetchMeta?.lastModified || null,
        redirect_chain: fetchMeta?.redirectChain || null,
        ttfb_ms: fetchMeta?.ttfbMs ?? null,
        download_ms: fetchMeta?.downloadMs ?? null,
        total_ms: fetchMeta?.totalMs ?? null,
        bytes_downloaded: fetchMeta?.bytesDownloaded ?? null,
        html_sha256: readability.htmlSha,
        text: readability.text,
        word_count: readability.wordCount ?? null,
        language: readability.language || null,
        article_xpath: readability.articleXPath || null,
        analysis: articleAnalysis ? JSON.stringify(articleAnalysis) : null
      });

      const normalizedArticleUrl = (() => {
        try { return this.normalizeUrl(url); } catch (_) { return url; }
      })();
      if (normalizedArticleUrl && this.articleHeaderCache) {
        this.articleHeaderCache.set(normalizedArticleUrl, {
          etag: fetchMeta?.etag || null,
          last_modified: fetchMeta?.lastModified || null,
          fetched_at: fetchMeta?.fetchedAtIso || null
        });
      }
      if (normalizedArticleUrl && this.knownArticlesCache) {
        this.knownArticlesCache.set(normalizedArticleUrl, true);
      }

      const bytes = Buffer.byteLength(html, 'utf8');
      let compressedBytes = 0;
      try {
        compressedBytes = zlib.gzipSync(html).length;
      } catch (_) {}

      if (this.events && typeof this.events.incrementBytesSaved === 'function') {
        this.events.incrementBytesSaved(bytes, compressedBytes);
      }

      this._log('log', `Saved article: ${metadata.title}`);
      if (this.events && typeof this.events.emitProgress === 'function') {
        this.events.emitProgress();
      }
      return true;
    } catch (error) {
      this._log('error', `Failed to save article ${url}: ${error && error.message ? error.message : error}`);
      try {
        const adapter = this._getDbAdapter();
        adapter?.insertError?.({ url, kind: 'save', message: error.message || String(error) });
      } catch (_) { /* ignore */ }
      return false;
    }
  }

  _extractCanonicalUrl(html) {
    try {
      const $ = cheerio.load(html);
      const c = $('link[rel="canonical"]').attr('href');
      if (c) return this.normalizeUrl(c);
    } catch (_) { /* ignore */ }
    return null;
  }

  _buildArticleAnalysis({ url, html, readability }) {
    try {
      const $ = cheerio.load(html || '');
      const urlSig = this.computeUrlSignals(url);
      const contentSig = this.computeContentSignals($, html || '');
      let schemaSignals = null;
      try {
        schemaSignals = extractSchemaSignals({ $, html: html || '' });
      } catch (_) {
        schemaSignals = contentSig?.schema || null;
      }
      const combined = this.combineSignals(urlSig, { ...contentSig, schema: schemaSignals }, { wordCount: readability.wordCount ?? undefined });
      return {
        url: urlSig,
        content: {
          ...contentSig,
          schema: schemaSignals,
          wordCount: readability.wordCount ?? null,
          articleXPath: readability.articleXPath || null
        },
        combined
      };
    } catch (_) {
      return null;
    }
  }

  _insertFetchRecord({ url, fetchMeta, classification, navigationLinksCount, articleLinksCount, readability, urlSignals, contentSignals, combinedSignals, savedToDb }) {
    try {
      const adapter = this._getDbAdapter();
      if (!adapter) return;
      adapter.insertFetch({
        url,
        request_started_at: fetchMeta?.requestStartedIso || null,
        fetched_at: fetchMeta?.fetchedAtIso || null,
        http_status: fetchMeta?.httpStatus ?? null,
        content_type: fetchMeta?.contentType || null,
        content_length: fetchMeta?.contentLength ?? null,
        content_encoding: fetchMeta?.contentEncoding || null,
        bytes_downloaded: fetchMeta?.bytesDownloaded ?? null,
        transfer_kbps: fetchMeta?.transferKbps ?? null,
        ttfb_ms: fetchMeta?.ttfbMs ?? null,
        download_ms: fetchMeta?.downloadMs ?? null,
        total_ms: fetchMeta?.totalMs ?? null,
        saved_to_db: savedToDb,
        saved_to_file: 0,
        file_path: null,
        file_size: null,
        classification,
        nav_links_count: navigationLinksCount,
        article_links_count: articleLinksCount,
        word_count: readability.wordCount ?? null,
        analysis: JSON.stringify({ url: urlSignals, content: { ...contentSignals, wordCount: readability.wordCount ?? null }, combined: combinedSignals })
      });
    } catch (error) {
      this._log('warn', 'Failed to insert fetch record:', error && error.message ? error.message : error);
    }
  }

  _insertLinkRecords({ pageUrl, links, depth }) {
    if (!Array.isArray(links) || !links.length) return;
    try {
      const adapter = this._getDbAdapter();
      if (!adapter) return;
      const nowIso = new Date().toISOString();
      for (const link of links) {
        adapter.insertLink({
          src_url: pageUrl,
          dst_url: link.url,
          anchor: link.anchor,
          rel: Array.isArray(link.rel) ? link.rel.join(' ') : link.rel,
          type: link.type,
          depth: depth + 1,
          on_domain: link.onDomain ? 1 : 0,
          discovered_at: nowIso
        });
      }
    } catch (error) {
      this._log('warn', 'Failed to insert link records:', error && error.message ? error.message : error);
    }
  }

  /**
   * Determine if a page is likely a hub/section page (not an article).
   * Hub pages have many navigation links to articles, section-style URLs,
   * and relatively low word count compared to link count.
   * @param {string} url
   * @param {Array} navigationLinks
   * @param {Array} articleLinks
   * @returns {boolean}
   */
  _isLikelyHub(url, navigationLinks, articleLinks) {
    // Must have a meaningful number of outbound links to qualify
    const totalLinks = (navigationLinks?.length || 0) + (articleLinks?.length || 0);
    if (totalLinks < 5) return false;

    // URL pattern: section pages like /world, /politics, /business, etc.
    try {
      const { pathname } = new URL(url);
      const segments = pathname.split('/').filter(Boolean);

      // Root or single-segment paths are often hubs: /, /world, /politics
      if (segments.length <= 1) return true;

      // Two-segment with common hub patterns: /news/world, /section/politics
      const hubSegments = /^(world|politics|business|technology|science|health|sports|entertainment|opinion|culture|news|uk|us|europe|asia|africa|americas|economy|environment|education|travel|lifestyle|video|live|latest|breaking|analysis|features|money|style|weather|local|national|international|top-stories|home)$/i;
      if (segments.length <= 2 && segments.some(s => hubSegments.test(s))) return true;

      // Pages with many article links (>10) and few words are likely hub pages
      if (articleLinks?.length > 10 && navigationLinks?.length > 5) return true;
    } catch (_) {
      // Invalid URL
    }

    return false;
  }

  /**
   * Extract metadata for a hub page.
   * @param {object} $ - Cheerio instance
   * @param {string} url
   * @param {Array} navigationLinks
   * @param {Array} articleLinks
   * @returns {object}
   */
  _extractHubMetadata($, url, navigationLinks, articleLinks) {
    const title = $('h1').first().text().trim() ||
      $('title').text().trim() ||
      $('[property="og:title"]').attr('content') ||
      'Hub Page';

    let section = '';
    try {
      const { pathname } = new URL(url);
      const segments = pathname.split('/').filter(Boolean);
      section = segments[0] || 'home';
    } catch (_) {
      section = 'unknown';
    }

    return {
      title,
      section,
      date: null,
      pageType: 'hub',
      navigationLinksCount: navigationLinks?.length || 0,
      articleLinksCount: articleLinks?.length || 0
    };
  }

  /**
   * Persist a hub page to the database.
   * Uses the same upsertArticle pathway but with hub-specific metadata.
   * This ensures hub page HTML is stored in content_storage for later analysis.
   * @param {object} params
   * @returns {boolean}
   */
  async _persistHubPage({ url, html, metadata, readability, fetchMeta, referrerUrl, discoveredAt, depth, navigationLinks, articleLinks }) {
    try {
      const adapter = this._getDbAdapter();
      if (!adapter) return false;

      const canonicalUrl = this._extractCanonicalUrl(html);

      // Build a minimal analysis record for the hub
      const hubAnalysis = {
        pageType: 'hub',
        navigationLinksCount: navigationLinks?.length || 0,
        articleLinksCount: articleLinks?.length || 0,
        section: metadata?.section || null,
        wordCount: readability?.wordCount ?? null
      };

      adapter.upsertArticle({
        url,
        title: metadata?.title || 'Hub Page',
        date: null,
        section: metadata?.section || null,
        html,
        crawled_at: new Date().toISOString(),
        canonical_url: canonicalUrl,
        referrer_url: referrerUrl || null,
        discovered_at: discoveredAt || null,
        crawl_depth: depth ?? null,
        fetched_at: fetchMeta?.fetchedAtIso || null,
        request_started_at: fetchMeta?.requestStartedIso || null,
        http_status: fetchMeta?.httpStatus ?? null,
        content_type: fetchMeta?.contentType || null,
        content_length: fetchMeta?.contentLength ?? null,
        etag: fetchMeta?.etag || null,
        last_modified: fetchMeta?.lastModified || null,
        redirect_chain: fetchMeta?.redirectChain || null,
        ttfb_ms: fetchMeta?.ttfbMs ?? null,
        download_ms: fetchMeta?.downloadMs ?? null,
        total_ms: fetchMeta?.totalMs ?? null,
        bytes_downloaded: fetchMeta?.bytesDownloaded ?? null,
        html_sha256: readability?.htmlSha || null,
        text: readability?.text || null,
        word_count: readability?.wordCount ?? null,
        language: readability?.language || null,
        article_xpath: null,
        analysis: JSON.stringify(hubAnalysis)
      });

      const bytes = Buffer.byteLength(html, 'utf8');
      this._log('log', `Saved hub page: ${metadata?.title || url} (${bytes} bytes, ${navigationLinks?.length || 0} nav links, ${articleLinks?.length || 0} article links)`);

      if (this.events && typeof this.events.emitProgress === 'function') {
        this.events.emitProgress();
      }
      return true;
    } catch (error) {
      this._log('error', `Failed to save hub page ${url}: ${error?.message || error}`);
      return false;
    }
  }

  _dbEnabled() {
    const adapter = this._getDbAdapter();
    if (!adapter) return false;
    // If adapter has no isEnabled method, assume enabled (adapter exists = enabled)
    if (typeof adapter.isEnabled !== 'function') return true;
    return adapter.isEnabled();
  }

  _getDbAdapter() {
    return typeof this.dbAdapter === 'function' ? this.dbAdapter() : this.dbAdapter;
  }

  _log(level, ...args) {
    if (!this.logger) return;
    const fn = this.logger[level];
    if (typeof fn === 'function') {
      fn.apply(this.logger, args);
    }
  }
}

module.exports = { ArticleProcessor };
