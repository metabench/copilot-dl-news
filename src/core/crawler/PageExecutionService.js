const cheerio = require('cheerio');
const chalk = require('chalk');
const { isTotalPrioritisationEnabled } = require('../../shared/utils/priorityConfig');
const {
  normalizeOutputVerbosity,
  DEFAULT_OUTPUT_VERBOSITY,
  isSilent
} = require('../../shared/utils/outputVerbosity');

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
    combineSignals,
    countryHubGapService = null,
    jobId = null,
    domain = null,
    structureOnly = false,
    hubOnlyMode = false,
    getCountryHubBehavioralProfile = null,
    outputVerbosity = DEFAULT_OUTPUT_VERBOSITY,
    paginationPredictorService = null,
    placeHubPatternLearningService = null,
    emitPageEvent = null
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
    this.getCountryHubGapService = typeof countryHubGapService === 'function' ? countryHubGapService : () => countryHubGapService;
    this.jobId = jobId || null;
    this.domain = domain || null;
    this.structureOnly = !!structureOnly;
    this.hubOnlyMode = !!hubOnlyMode;
    this.getCountryHubBehavioralProfile = typeof getCountryHubBehavioralProfile === 'function'
      ? getCountryHubBehavioralProfile
      : () => null;
    this.outputVerbosity = normalizeOutputVerbosity(outputVerbosity);
    // Phase 1: Pagination prediction for speculative crawling
    this.paginationPredictorService = paginationPredictorService || null;
    // Place hub pattern learning - predicts place hubs from URL patterns
    this.placeHubPatternLearningService = placeHubPatternLearningService || null;
    // Callback to emit page timing events (for telemetry/DB persistence)
    this.emitPageEvent = typeof emitPageEvent === 'function' ? emitPageEvent : null;
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
      this._emitPageLog({
        url,
        normalizedUrl: null,
        source: null,
        status: 'failed',
        fetchMeta: null,
        cacheInfo: null,
        depth,
        error: 'fetch-pipeline-empty'
      });
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
    const cacheInfo = meta.cacheInfo || null;
    const resolvedUrl = meta.url || url;
    const wantsCacheProcessing = context && context.processCacheResult === true;

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

    if (source === 'cache' && !wantsCacheProcessing) {
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
      await this._noteSeededHubVisit(normalizedUrl, { depth, fetchSource: 'cache' });

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

      this._emitPageLog({
        url: resolvedUrl,
        normalizedUrl,
        source,
        status: 'cache',
        fetchMeta,
        cacheInfo,
        depth
      });
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
      await this._noteSeededHubVisit(normalizedUrl, { depth, fetchSource: 'not-modified' });

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
      this._emitPageLog({
        url: resolvedUrl,
        normalizedUrl,
        source,
        status: 'not-modified',
        fetchMeta,
        cacheInfo,
        depth
      });
      return {
        status: 'not-modified'
      };
    }

    if (source === 'error') {
      const httpStatus = meta?.error?.httpStatus;
      const isNotFound = httpStatus === 404 || httpStatus === 410;
      if (isNotFound) {
        this._emitPageLog({
          url: resolvedUrl,
          normalizedUrl,
          source,
          status: 'skipped',
          fetchMeta,
          cacheInfo,
          depth,
          error: meta.error || meta.reason || null
        });

        return {
          status: 'skipped',
          reason: 'not-found',
          retriable: false
        };
      }
      try {
        this.state.incrementErrors();
      } catch (_) {}
      const retriable = typeof httpStatus === 'number'
        ? (httpStatus === 429 || (httpStatus >= 500 && httpStatus < 600))
        : true;
      this._emitPageLog({
        url: resolvedUrl,
        normalizedUrl,
        source,
        status: 'failed',
        fetchMeta,
        cacheInfo,
        depth,
        error: meta.error || meta.reason || null
      });
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

    const countedDownload = source === 'network';
    try {
      this.state.incrementPagesVisited();
      if (countedDownload) {
        this.state.incrementPagesDownloaded();
        if (fetchMeta?.bytesDownloaded != null) {
          this.state.incrementBytesDownloaded(fetchMeta.bytesDownloaded);
        }
      }
    } catch (_) {}

    if (this.emitProgress) this.emitProgress();
    await this._noteSeededHubVisit(normalizedUrl, { depth, fetchSource: source });

    // Check if this is a country hub page in total prioritisation mode
    const isCountryHubPage = this._isCountryHubPage(resolvedUrl);
    const totalPrioritisationMode = this._isTotalPrioritisationEnabled();

    let discovery = null;
    try {
      discovery = this.navigationDiscoveryService?.discover({
        url: resolvedUrl,
        html,
        depth,
        normalizedUrl,
        isCountryHubPage,
        totalPrioritisationMode
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

  const shouldAcquireContent = !!this.contentAcquisitionService && !this.structureOnly;

    let processorResult = null;
    if (shouldAcquireContent) {
      try {
        processorResult = await this.contentAcquisitionService.acquire({
          url: resolvedUrl,
          html,
          fetchMeta,
          depth,
          normalizedUrl,
          referrerUrl: context.referrerUrl || null,
          discoveredAt: context.discoveredAt || new Date().toISOString(),
          persistArticle: dbEnabled && !this.structureOnly,
          insertFetchRecord: dbEnabled,
          insertLinkRecords: dbEnabled,
          linkSummary: discovery?.linkSummary || null,
          cheerioRoot: discovery?.$ || null
        });

        if (processorResult) {
          const analysisType = this._analyzePageType(resolvedUrl, processorResult);
          console.log(chalk.blue(`ANALYSIS: ${resolvedUrl} -> ${analysisType}`));
        }
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
        this._emitPageLog({
          url: resolvedUrl,
          normalizedUrl,
          source,
          status: 'failed',
          fetchMeta,
          cacheInfo,
          depth,
          error
        });
        return {
          status: 'failed',
          retriable: false
        };
      }
    } else {
      processorResult = {
        isArticle: !!(discovery?.looksLikeArticle),
        metadata: null,
        navigationLinks: Array.isArray(discovery?.navigationLinks) ? discovery.navigationLinks : [],
        articleLinks: Array.isArray(discovery?.articleLinks) ? discovery.articleLinks : [],
        allLinks: Array.isArray(discovery?.allLinks) ? discovery.allLinks : [],
        statsDelta: { articlesFound: 0, articlesSaved: 0 }
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

    if (this.structureOnly) {
      try {
        if (!discovery?.looksLikeArticle) {
          this.state?.incrementStructureNavPages?.();
        }
        if (articleLinks.length > 0) {
          this.state?.recordStructureArticleLinks?.(articleLinks);
        }
      } catch (_) {}
    }

    // Suppress noisy per-page link summaries in favor of concise PAGE logs

    if (!this.structureOnly && processorResult?.isArticle && processorResult.metadata) {
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

    // Phase 1: Record page visit for pagination prediction
    if (this.paginationPredictorService && allLinks.length > 0) {
      try {
        const linkUrls = allLinks
          .filter(l => l && l.url)
          .map(l => l.url);
        this.paginationPredictorService.recordVisit(resolvedUrl, {
          hasContent: !!(processorResult?.isArticle || allLinks.length > 5),
          links: linkUrls
        });
      } catch (_) {}
    }

    if (this.hubOnlyMode && isCountryHubPage && typeof this.state?.recordCountryHubLinks === 'function') {
      const summary = this._collectCountryHubLinkSummary(allLinks);
      if (summary.articleUrls.length > 0 || summary.paginationUrls.length > 0) {
        try {
          this.state.recordCountryHubLinks(normalizedUrl, {
            ...summary,
            sourceUrl: resolvedUrl
          });
        } catch (_) {}
      }
    }

    const seen = new Set();
    for (const link of allLinks) {
      if (!link || !link.url) continue;
      if (seen.has(link.url)) continue;
      seen.add(link.url);

      // In country hub exclusive mode, only process links from country hub pages
      const isCountryHubPage = this._isCountryHubPage(resolvedUrl);
      if (this.hubOnlyMode && !isCountryHubPage) {
        continue; // Skip all links from non-country-hub pages
      }

      if (this.hubOnlyMode && link.type === 'article') {
        continue; // Skip article links even from country hubs
      }

      try {
        let linkMeta = isCountryHubPage ? { sourceHub: resolvedUrl, sourceHubType: 'country' } : null;

        if (this._isTotalPrioritisationEnabled()) {
          const targetIsCountryHub = this._isCountryHubPage(link.url || '');
          if (!targetIsCountryHub) {
            continue;
          }
        }

        // Apply maximum priority bonus for country hub articles in total prioritisation mode
        if (isCountryHubPage && this._isTotalPrioritisationEnabled()) {
          linkMeta = {
            ...linkMeta,
            priorityBonus: 'country-hub-article-total',
            forcePriority: 90  // Maximum priority for articles from country hubs
          };
        }

        // Place hub pattern learning: predict if URL is a place hub
        if (this.placeHubPatternLearningService && link.url) {
          try {
            const prediction = this.placeHubPatternLearningService.predictPlaceHub(link.url, this.domain);
            if (prediction && prediction.isPlaceHub && prediction.confidence >= 0.4) {
              linkMeta = {
                ...linkMeta,
                predictedPlaceHub: true,
                placeHubConfidence: prediction.confidence,
                placeHubKind: prediction.placeKind || null,
                placeHubReason: prediction.reason
              };
              // Boost priority for predicted place hubs
              if (!linkMeta.forcePriority || linkMeta.forcePriority < 70) {
                linkMeta.forcePriority = 70 + Math.floor(prediction.confidence * 20);
              }
            }
          } catch (_) {
            // Silently ignore prediction errors
          }
        }

        this.enqueueRequest({
          url: link.url,
          depth: depth + 1,
          type: link.type || 'nav',
          meta: linkMeta
        });
      } catch (_) {}
    }

    this._updateCountryHubProgress();

    this._emitPageLog({
      url: resolvedUrl,
      normalizedUrl,
      source,
      status: 'success',
      fetchMeta,
      cacheInfo,
      depth
    });

    return {
      status: 'success'
    };
  }

  _collectCountryHubLinkSummary(allLinks) {
    const summary = {
      articleUrls: [],
      paginationUrls: []
    };
    if (!Array.isArray(allLinks)) {
      return summary;
    }
    for (const link of allLinks) {
      if (!link || !link.url) continue;
      if (link.type === 'article') {
        summary.articleUrls.push(link.url);
      } else if (link.type === 'pagination') {
        summary.paginationUrls.push(link.url);
      }
    }
    return summary;
  }

  _updateCountryHubProgress() {
    if (typeof this.state?.getCountryHubProgress !== 'function') {
      return;
    }
    let profile = null;
    try {
      profile = this.getCountryHubBehavioralProfile?.();
    } catch (_) {
      profile = null;
    }
    if (!profile || typeof profile.updateProgress !== 'function') {
      return;
    }
    let progress = null;
    try {
      progress = this.state.getCountryHubProgress();
    } catch (_) {
      progress = null;
    }
    if (!progress) {
      return;
    }
    const totalCountries = typeof profile.state?.totalCountries === 'number'
      ? profile.state.totalCountries
      : 0;
    const overallProgress = totalCountries > 0
      ? Math.min(progress.discovered / totalCountries, 1)
      : 0;
    try {
      profile.updateProgress({
        countryHubsDiscovered: progress.discovered,
        countryHubsValidated: progress.validated,
        countryArticlesIndexed: progress.articleUrls,
        overallProgress
      });
    } catch (_) {}
  }

  /**
   * Check if a URL represents a country hub page
   * @private
   */
  _isCountryHubPage(url) {
    if (!url) return false;

    // Check if this URL is in our seeded hubs as a country hub
    if (this.state?.hasSeededHub && this.state.hasSeededHub(url)) {
      const meta = this.state.getSeededHubMeta?.(url);
      return meta?.kind === 'country';
    }

    // Fallback: check URL patterns for common country hub patterns
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname.toLowerCase();

      // Common country hub URL patterns
      return path.match(/^\/world\/[^\/]+$/) ||
             path.match(/^\/news\/world\/[^\/]+$/) ||
             path.match(/^\/international\/[^\/]+$/);
    } catch (error) {
      return false;
    }
  }

  _isTotalPrioritisationEnabled() {
    return isTotalPrioritisationEnabled();
  }

  async _noteSeededHubVisit(normalizedUrl, { depth = null, fetchSource = null } = {}) {
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

    // Country hub gap detection integration
    if (hubKind === 'country') {
      const countryHubGapService = this.getCountryHubGapService?.();
      if (countryHubGapService) {
        try {
          // Learn pattern from this country hub
          const countryName = meta?.name || countryHubGapService._extractCountryNameFromUrl(normalizedUrl);
          if (countryName) {
            await countryHubGapService.learnCountryHubPattern(normalizedUrl, countryName, 'hub-visited');
          }

          // Check if all country hubs are now complete
          const isComplete = countryHubGapService.checkCountryHubCompletion(this.jobId, this.domain);
          
          if (!isComplete) {
            // Generate gap predictions for remaining missing hubs
            const analysis = countryHubGapService.analyzeCountryHubGaps(this.jobId);
            if (analysis.missing > 0 && analysis.missing < 20) {
              // Only generate predictions if we have a manageable number of missing hubs
              await countryHubGapService.generateGapPredictions(analysis, this.jobId, this.domain);
            }
          }
        } catch (error) {
          // Non-critical - don't fail the crawl if gap detection fails
          console.warn('[PageExecutionService] Country hub gap detection failed:', error);
        }
      }
      this._updateCountryHubProgress();
    }

    // Place hub pattern learning: record validation feedback
    this._recordPlaceHubValidation(normalizedUrl, { hubKind, meta });
  }

  /**
   * Record validation feedback for place hub pattern learning
   * Called when a page is confirmed as a hub (seeded or country)
   * @private
   */
  _recordPlaceHubValidation(normalizedUrl, { hubKind = null, meta = null } = {}) {
    if (!this.placeHubPatternLearningService || !normalizedUrl) {
      return;
    }
    try {
      // Record that this URL is confirmed as a place hub
      const isPlaceKind = hubKind === 'country' || hubKind === 'place' || hubKind === 'region';
      this.placeHubPatternLearningService.recordValidation(normalizedUrl, this.domain, isPlaceKind);
    } catch (_) {
      // Silently ignore validation errors
    }
  }

  _emitPageLog({
    url,
    normalizedUrl,
    source,
    status,
    fetchMeta,
    cacheInfo,
    depth,
    error
  }) {
    try {
      const payload = {
        url: normalizedUrl || url || null,
        source: source || null,
        status: status || null,
        depth: depth ?? null,
        downloadMs: Number.isFinite(fetchMeta?.downloadMs) ? Math.round(fetchMeta.downloadMs) : null,
        totalMs: Number.isFinite(fetchMeta?.totalMs) ? Math.round(fetchMeta.totalMs) : null,
        httpStatus: fetchMeta?.httpStatus ?? null,
        bytesDownloaded: Number.isFinite(fetchMeta?.bytesDownloaded) ? fetchMeta.bytesDownloaded : null,
        cacheAgeSeconds: Number.isFinite(cacheInfo?.ageSeconds) ? cacheInfo.ageSeconds : null,
        cacheReason: cacheInfo?.reason || null,
        cacheSource: cacheInfo?.source || null
      };
      if (error) {
        payload.error = typeof error === 'string' ? error : (error.message || error.kind || null);
      }
      this._logPerVerbosity(payload);
      
      // Emit page event for telemetry/DB persistence (url:visited compatible shape)
      if (this.emitPageEvent) {
        try {
          const pageEvent = {
            url: payload.url,
            httpStatus: payload.httpStatus,
            contentLength: payload.bytesDownloaded,
            durationMs: payload.totalMs ?? payload.downloadMs,
            cached: payload.source === 'cache',
            depth: payload.depth,
            status: payload.status,
            cacheReason: payload.cacheReason
          };
          this.emitPageEvent(pageEvent);
        } catch (_) {}
      }
    } catch (_) {}
  }

  _logPerVerbosity(payload) {
    const stats = typeof this.getStats === 'function' ? this.getStats() : null;
    const verbosity = this.outputVerbosity || DEFAULT_OUTPUT_VERBOSITY;
    // Silent mode: no console output at all
    if (verbosity === 'silent') {
      return;
    }
    if (verbosity === 'extra-terse') {
      const line = this._formatExtraTerse(payload, stats);
      console.log(line);
      return;
    }
    if (verbosity === 'terse') {
      console.log(this._formatTerse(payload));
      return;
    }
    console.log('PAGE ' + JSON.stringify(payload));
  }

  _formatTerse(payload) {
    const url = payload.url || payload.normalizedUrl || 'unknown-url';
    const status = payload.status || 'unknown';
    const downloadMs = Number.isFinite(payload.downloadMs)
      ? `${payload.downloadMs}ms`
      : (Number.isFinite(payload.totalMs) ? `${payload.totalMs}ms` : 'n/a');
    const httpStatus = payload.httpStatus || payload.cacheInfo?.httpStatus || 'n/a';
    return `PAGE ${url} status=${status} http=${httpStatus} download=${downloadMs}`;
  }

  _formatExtraTerse(payload, stats) {
    const url = payload.url || payload.normalizedUrl || 'unknown-url';
    const parts = [url];
    if (payload.status && payload.status !== 'success') {
      parts.push(payload.status === 'failed' ? 'FAIL' : payload.status.toUpperCase());
    }
    const downloadMs = Number.isFinite(payload.downloadMs)
      ? `${payload.downloadMs}ms`
      : (Number.isFinite(payload.totalMs) ? `${payload.totalMs}ms` : null);
    if (downloadMs) {
      parts.push(downloadMs);
    }
    const downloaded = this._safeDownloadedCount(stats);
    if (downloaded != null) {
      const limit = Number.isFinite(this.maxDownloads) ? this.maxDownloads : null;
      const counter = limit ? `${downloaded}/${limit}` : `${downloaded}`;
      parts.push(counter);
    }
    return parts.join(' ');
  }

  _safeDownloadedCount(stats) {
    if (!stats || typeof stats !== 'object') {
      return null;
    }
    const value = stats.pagesDownloaded;
    return Number.isFinite(value) ? value : null;
  }

  _analyzePageType(url, processorResult) {
    let path = '';
    let segments = [];
    try {
      const u = new URL(url);
      path = u.pathname;
      segments = path.split('/').filter(Boolean);
    } catch (e) {
      return 'Unknown';
    }

    // Heuristic: If it has a date (numeric or text month), it's likely an Article.
    // Matches /YYYY/MM/DD/ or /YYYY/MMM/DD/
    const hasDate = /\/\d{4}\/\w{3,}\/\d{1,2}\//.test(path) || /\/\d{4}\/\d{2}\/\d{2}\//.test(path);

    if (hasDate) {
      return 'Article';
    }

    // If no date, check for Hub structure
    if (segments.length === 0) return 'Homepage';

    if (segments.length === 1) {
      // e.g. /politics, /sport
      return 'Section Hub';
    }

    if (segments.length === 2) {
      // e.g. /sport/football
      return 'Sub-section Hub';
    }

    if (processorResult.isArticle) {
      return 'Article';
    }

    if (this._isCountryHubPage(url)) {
      return 'Country Hub';
    }

    if (segments.length >= 3) {
      return 'Deep Hub';
    }

    return 'Nav Page';
  }
}

module.exports = {
  PageExecutionService
};
