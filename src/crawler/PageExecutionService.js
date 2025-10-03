const cheerio = require('cheerio');

class PageExecutionService {
  constructor({
    maxDepth,
    maxDownloads,
    getStats,
    state,
    fetchPipeline,
    articleProcessor,
    navigationDiscoveryService,
    contentAcquisitionService,
    milestoneTracker,
    adaptiveSeedPlanner,
    enqueueRequest,
    telemetry,
    recordError,
    normalizeUrl,
    looksLikeArticle,
    noteDepthVisit,
    emitProgress,
    getDbAdapter,
    computeContentSignals,
    computeUrlSignals,
    combineSignals
  } = {}) {
    if (!fetchPipeline) {
      throw new Error('PageExecutionService requires a fetch pipeline');
    }
    if (!state) {
      throw new Error('PageExecutionService requires crawler state');
    }
    if (typeof getStats !== 'function') {
      throw new Error('PageExecutionService requires a getStats function');
    }
    if (typeof enqueueRequest !== 'function') {
      throw new Error('PageExecutionService requires an enqueueRequest function');
    }
    if (!navigationDiscoveryService || typeof navigationDiscoveryService.discover !== 'function') {
      throw new Error('PageExecutionService requires a navigationDiscoveryService with a discover method');
    }
    if (!contentAcquisitionService || typeof contentAcquisitionService.acquire !== 'function') {
      throw new Error('PageExecutionService requires a contentAcquisitionService with an acquire method');
    }

    this.maxDepth = typeof maxDepth === 'number' ? maxDepth : Infinity;
    this.maxDownloads = typeof maxDownloads === 'number' ? maxDownloads : undefined;
    this.getStats = getStats;
    this.state = state;
    this.fetchPipeline = fetchPipeline;
    this.articleProcessor = articleProcessor || null;
    this.navigationDiscoveryService = navigationDiscoveryService;
    this.contentAcquisitionService = contentAcquisitionService;
    this.milestoneTracker = milestoneTracker;
    this.adaptiveSeedPlanner = adaptiveSeedPlanner || null;
    this.enqueueRequest = enqueueRequest;
    this.telemetry = telemetry || null;
    this.recordError = typeof recordError === 'function' ? recordError : null;
    this.normalizeUrl = typeof normalizeUrl === 'function' ? normalizeUrl : null;
    this.looksLikeArticle = typeof looksLikeArticle === 'function' ? looksLikeArticle : null;
    this.noteDepthVisit = typeof noteDepthVisit === 'function' ? noteDepthVisit : null;
    this.emitProgress = typeof emitProgress === 'function' ? emitProgress : null;
    this.getDbAdapter = typeof getDbAdapter === 'function' ? getDbAdapter : () => null;
    this.computeContentSignals = typeof computeContentSignals === 'function' ? computeContentSignals : null;
    this.computeUrlSignals = typeof computeUrlSignals === 'function' ? computeUrlSignals : null;
    this.combineSignals = typeof combineSignals === 'function' ? combineSignals : null;
  }

  async processPage({ url, depth = 0, context = {} }) {
    if (depth > this.maxDepth) return;

    const stats = this.getStats() || {};
    if (this.maxDownloads !== undefined && (stats.pagesDownloaded || 0) >= this.maxDownloads) {
      return {
        status: 'skipped'
      };
    }

    const fetchResult = await this.fetchPipeline.fetch({
      url,
      context: {
        ...context,
        depth,
        referrerUrl: null,
        queueType: context.type
      }
    });

    if (!fetchResult) {
      return {
        status: 'failed',
        retriable: true
      };
    }

    const {
      meta = {},
      source,
      html
    } = fetchResult;
    const fetchMeta = meta.fetchMeta || null;
    const resolvedUrl = meta.url || url;

    let normalizedUrl = null;
    if (this.normalizeUrl) {
      try {
        normalizedUrl = this.normalizeUrl(resolvedUrl);
      } catch (_) {
        normalizedUrl = resolvedUrl;
      }
    } else {
      normalizedUrl = resolvedUrl;
    }

    if (source === 'skipped') {
      return {
        status: meta.status || 'skipped'
      };
    }

    if (source === 'cache') {
      if (normalizedUrl) {
        try {
          this.state.addVisited(normalizedUrl);
          if (this.noteDepthVisit) this.noteDepthVisit(normalizedUrl, depth);
        } catch (_) {}
      }
      try {
        this.state.incrementPagesVisited();
      } catch (_) {}
      if (this.emitProgress) this.emitProgress();
      this._noteSeededHubVisit(normalizedUrl, { depth, fetchSource: 'cache' });

      const looksLikeArticle = this.looksLikeArticle ? this.looksLikeArticle(normalizedUrl || resolvedUrl) : false;
      if (looksLikeArticle) {
        try {
          this.state.incrementArticlesFound();
          if (this.emitProgress) this.emitProgress();
        } catch (_) {}
      }

      const dbAdapter = this.getDbAdapter();
      if (dbAdapter && typeof dbAdapter.isEnabled === 'function' && dbAdapter.isEnabled()) {
        try {
          const cachedHtml = html || '';
          const $c = cheerio.load(cachedHtml);
          const contentSig = this.computeContentSignals ? this.computeContentSignals($c, cachedHtml) : null;
          const urlSig = this.computeUrlSignals ? this.computeUrlSignals(normalizedUrl || resolvedUrl) : null;
          const combined = this.combineSignals ? this.combineSignals(urlSig, contentSig) : null;
          dbAdapter.insertFetch({
            url: normalizedUrl || resolvedUrl,
            request_started_at: null,
            fetched_at: new Date().toISOString(),
            http_status: 200,
            content_type: 'text/html',
            content_length: cachedHtml ? Buffer.byteLength(cachedHtml, 'utf8') : null,
            content_encoding: null,
            bytes_downloaded: 0,
            transfer_kbps: null,
            ttfb_ms: null,
            download_ms: null,
            total_ms: null,
            saved_to_db: 0,
            saved_to_file: 0,
            file_path: null,
            file_size: null,
            classification: looksLikeArticle ? 'article' : 'other',
            nav_links_count: null,
            article_links_count: null,
            word_count: null,
            analysis: JSON.stringify({
              kind: 'cache-hit',
              url: urlSig,
              content: contentSig,
              combined
            })
          });
        } catch (_) {}
      }

      if (this.milestoneTracker) {
        this.milestoneTracker.checkAnalysisMilestones({
          depth,
          isArticle: looksLikeArticle
        });
      }

      return {
        status: 'cache'
      };
    }

    if (source === 'not-modified') {
      if (normalizedUrl) {
        try {
          this.state.addVisited(normalizedUrl);
          if (this.noteDepthVisit) this.noteDepthVisit(normalizedUrl, depth);
        } catch (_) {}
      }
      try {
        this.state.incrementPagesVisited();
      } catch (_) {}
      if (this.emitProgress) this.emitProgress();
      this._noteSeededHubVisit(normalizedUrl, { depth, fetchSource: 'not-modified' });

      const dbAdapter = this.getDbAdapter();
      if (dbAdapter && typeof dbAdapter.isEnabled === 'function' && dbAdapter.isEnabled() && fetchMeta) {
        try {
          const existing = typeof dbAdapter.getArticleRowByUrl === 'function' ? dbAdapter.getArticleRowByUrl(resolvedUrl) : null;
          dbAdapter.insertFetch({
            url: resolvedUrl,
            request_started_at: fetchMeta.requestStartedIso || null,
            fetched_at: fetchMeta.fetchedAtIso || null,
            http_status: fetchMeta.httpStatus ?? 304,
            content_type: fetchMeta.contentType || null,
            content_length: fetchMeta.contentLength ?? null,
            content_encoding: fetchMeta.contentEncoding || null,
            bytes_downloaded: 0,
            transfer_kbps: null,
            ttfb_ms: fetchMeta.ttfbMs ?? null,
            download_ms: fetchMeta.downloadMs ?? null,
            total_ms: fetchMeta.totalMs ?? null,
            saved_to_db: 0,
            saved_to_file: 0,
            file_path: null,
            file_size: null,
            classification: existing ? 'article' : 'other',
            nav_links_count: null,
            article_links_count: null,
            word_count: existing?.word_count ?? null,
            analysis: JSON.stringify({
              status: 'not-modified',
              conditional: true
            })
          });
        } catch (_) {}
      }
      return {
        status: 'not-modified'
      };
    }

    if (source === 'error') {
      try {
        this.state.incrementErrors();
      } catch (_) {}
      const httpStatus = meta?.error?.httpStatus;
      const retriable = typeof httpStatus === 'number' ?
        (httpStatus === 429 || (httpStatus >= 500 && httpStatus < 600)) :
        true;
      return {
        status: 'failed',
        retriable,
        retryAfterMs: meta.retryAfterMs
      };
    }

    if (normalizedUrl) {
      try {
        this.state.addVisited(normalizedUrl);
        if (this.noteDepthVisit) this.noteDepthVisit(normalizedUrl, depth);
      } catch (_) {}
    }

    try {
      this.state.incrementPagesVisited();
      this.state.incrementPagesDownloaded();
      if (fetchMeta?.bytesDownloaded != null) {
        this.state.incrementBytesDownloaded(fetchMeta.bytesDownloaded);
      }
    } catch (_) {}

    if (this.emitProgress) this.emitProgress();
    this._noteSeededHubVisit(normalizedUrl, { depth, fetchSource: source });

    let discovery = null;
    try {
      discovery = this.navigationDiscoveryService?.discover({
        url: resolvedUrl,
        html,
        depth,
        normalizedUrl
      }) || null;
    } catch (error) {
      if (this.recordError) {
        this.recordError({
          url: resolvedUrl,
          kind: 'navigation-discovery',
          message: error?.message || String(error)
        });
      }
      if (this.telemetry) {
        try {
          this.telemetry.problem({
            kind: 'navigation-discovery-failed',
            target: resolvedUrl,
            message: error?.message || 'Navigation discovery failed'
          });
        } catch (_) {}
      }
      discovery = null;
    }

    const dbAdapter = this.getDbAdapter();
    const dbEnabled = dbAdapter && typeof dbAdapter.isEnabled === 'function' && dbAdapter.isEnabled();

    let processorResult = null;
    try {
      processorResult = await this.contentAcquisitionService.acquire({
        url: resolvedUrl,
        html,
        fetchMeta,
        depth,
        normalizedUrl,
        referrerUrl: context.referrerUrl || null,
        discoveredAt: context.discoveredAt || new Date().toISOString(),
        persistArticle: dbEnabled,
        insertFetchRecord: dbEnabled,
        insertLinkRecords: dbEnabled,
        linkSummary: discovery?.linkSummary || null,
        cheerioRoot: discovery?.$ || null
      });
    } catch (error) {
      if (this.recordError) {
        this.recordError({
          url: resolvedUrl,
          kind: 'content-acquisition',
          message: error?.message || String(error)
        });
      }
      if (this.telemetry) {
        try {
          this.telemetry.problem({
            kind: 'content-acquisition-failed',
            target: resolvedUrl,
            message: error?.message || 'Content acquisition failed'
          });
        } catch (_) {}
      }
      return {
        status: 'failed',
        retriable: false
      };
    }

    if (processorResult?.statsDelta) {
      const foundDelta = processorResult.statsDelta.articlesFound || 0;
      const savedDelta = processorResult.statsDelta.articlesSaved || 0;
      try {
        if (foundDelta) this.state.incrementArticlesFound(foundDelta);
        if (savedDelta) this.state.incrementArticlesSaved(savedDelta);
      } catch (_) {}
    }

    const discoveryNavigationLinks = Array.isArray(discovery?.navigationLinks) ? discovery.navigationLinks : null;
    const discoveryArticleLinks = Array.isArray(discovery?.articleLinks) ? discovery.articleLinks : null;
    const discoveryAllLinks = Array.isArray(discovery?.allLinks) ? discovery.allLinks : null;

    let navigationLinks = processorResult?.navigationLinks || [];
    if (discoveryNavigationLinks && discoveryNavigationLinks.length > 0) {
      navigationLinks = discoveryNavigationLinks;
    }

    let articleLinks = processorResult?.articleLinks || [];
    if (discoveryArticleLinks && discoveryArticleLinks.length > 0) {
      articleLinks = discoveryArticleLinks;
    }

    try {
      console.log(`Found ${navigationLinks.length} navigation links and ${articleLinks.length} article links on ${resolvedUrl}`);
    } catch (_) {}

    if (processorResult?.isArticle && processorResult.metadata) {
      try {
        this.adaptiveSeedPlanner?.seedFromArticle({
          url: resolvedUrl,
          metadata: processorResult.metadata,
          depth
        });
      } catch (_) {}
    }

    if (this.milestoneTracker) {
      this.milestoneTracker.checkAnalysisMilestones({
        depth,
        isArticle: !!processorResult?.isArticle
      });
    }

    let allLinks = processorResult?.allLinks || [];
    if (discoveryAllLinks && discoveryAllLinks.length > 0) {
      allLinks = discoveryAllLinks;
    }

    const seen = new Set();
    for (const link of allLinks) {
      if (!link || !link.url) continue;
      if (seen.has(link.url)) continue;
      seen.add(link.url);
      try {
        this.enqueueRequest({
          url: link.url,
          depth: depth + 1,
          type: link.type || 'nav'
        });
      } catch (_) {}
    }

    return {
      status: 'success'
    };
  }

  _noteSeededHubVisit(normalizedUrl, { depth = null, fetchSource = null } = {}) {
    if (!normalizedUrl) return;
    if (!this.state?.hasSeededHub || !this.state.hasSeededHub(normalizedUrl)) {
      return;
    }
    if (typeof this.state.hasVisitedHub === 'function' && this.state.hasVisitedHub(normalizedUrl)) {
      return;
    }

    const meta = typeof this.state.getSeededHubMeta === 'function'
      ? this.state.getSeededHubMeta(normalizedUrl)
      : null;

    if (typeof this.state.markSeededHubVisited === 'function') {
      this.state.markSeededHubVisited(normalizedUrl, {
        depth,
        fetchSource
      });
    }

    const hubKind = meta?.kind || 'hub';
    const milestoneKind = hubKind === 'country' ? 'country-hub-found' : 'seeded-hub-found';
    const milestoneKey = `${milestoneKind}:${normalizedUrl}`;

    if (this.telemetry?.milestoneOnce) {
      try {
        this.telemetry.milestoneOnce(milestoneKey, {
          kind: milestoneKind,
          message: hubKind === 'country'
            ? 'Country hub fetched successfully'
            : 'Seeded hub fetched successfully',
          details: {
            url: normalizedUrl,
            hubKind,
            reason: meta?.reason || null,
            source: meta?.source || null,
            depth,
            fetchSource
          }
        });
      } catch (_) {}
    }
  }
}

module.exports = {
  PageExecutionService
};
