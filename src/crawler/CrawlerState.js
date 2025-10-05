const { URL } = require('url');
const { tof, is_array } = require('lang-tools');

class CrawlerState {
  constructor() {
    this.visited = new Set();
    this.seededHubUrls = new Set();
    this.seededHubMetadata = new Map();
    this.visitedSeededHubUrls = new Set();
    this.visitedHubMetadata = new Map();
    this.historySeedUrls = new Set();
    this.knownArticlesCache = new Map();
    this.articleHeaderCache = new Map();
    this.urlAnalysisCache = new Map();
    this.urlDecisionCache = new Map();
    this.currentDownloads = new Map();
    this.domainLimits = new Map();

    this.stats = {
      pagesVisited: 0,
      pagesDownloaded: 0,
      articlesFound: 0,
      articlesSaved: 0,
      errors: 0,
      bytesDownloaded: 0,
      depth2PagesProcessed: 0,
      cacheRateLimitedServed: 0,
      cacheRateLimitedDeferred: 0
    };

    this.structure = {
      navPagesVisited: 0,
      articleCandidatesSkipped: 0,
      sectionCounts: new Map(),
      lastUpdatedAt: null
    };

    this.depth2Visited = new Set();
    this.paused = false;
    this.abortRequested = false;

    this.fatalIssues = [];
    this.errorSamples = [];
    this.lastError = null;

    this.connectionResetState = new Map();
    this.connectionResetProblemEmitted = false;

    this.problemCounters = new Map();
    this.problemSamples = new Map();

    this.intelligentPlanSummary = null;
    this._plannerStageSeq = 0;
  }

  // --- Stats helpers ---
  getStats() {
    return this.stats;
  }

  incrementPagesVisited(amount = 1) {
    this.stats.pagesVisited += amount;
  }

  incrementPagesDownloaded(amount = 1) {
    this.stats.pagesDownloaded += amount;
  }

  incrementBytesDownloaded(bytes = 0) {
    if (tof(bytes) === 'number' && Number.isFinite(bytes) && bytes > 0) {
      this.stats.bytesDownloaded += bytes;
    }
  }

  incrementArticlesFound(amount = 1) {
    this.stats.articlesFound += amount;
  }

  incrementArticlesSaved(amount = 1) {
    this.stats.articlesSaved += amount;
  }

  incrementErrors(amount = 1) {
    this.stats.errors += amount;
  }

  incrementCacheRateLimitedServed(amount = 1) {
    this.stats.cacheRateLimitedServed += amount;
  }

  incrementCacheRateLimitedDeferred(amount = 1) {
    this.stats.cacheRateLimitedDeferred += amount;
  }

  incrementStructureNavPages(amount = 1) {
    const delta = Number(amount) || 0;
    if (!delta) return;
    this.structure.navPagesVisited += delta;
    this.structure.lastUpdatedAt = Date.now();
  }

  incrementStructureArticleSkipped(amount = 1) {
    const delta = Number(amount) || 0;
    if (!delta) return;
    this.structure.articleCandidatesSkipped += delta;
    this.structure.lastUpdatedAt = Date.now();
  }

  recordStructureArticleLinks(links) {
    if (!links) return;
    const list = is_array(links) ? links : [links];
    let recorded = false;
    for (const entry of list) {
      if (!entry) continue;
      const rawUrl = tof(entry) === 'string' ? entry : entry.url;
      if (!rawUrl) continue;
      const key = this._deriveStructureSection(rawUrl);
      if (!key) continue;
      const prev = this.structure.sectionCounts.get(key) || 0;
      this.structure.sectionCounts.set(key, prev + 1);
      recorded = true;
    }
    if (recorded) {
      this.structure.lastUpdatedAt = Date.now();
    }
  }

  getStructureSnapshot(limit = 6) {
    if (!this.structure) {
      return null;
    }
    const topSections = Array.from(this.structure.sectionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(0, limit | 0 || 6))
      .map(([section, count]) => ({ section, count }));
    return {
      navPagesVisited: this.structure.navPagesVisited,
      articleCandidatesSkipped: this.structure.articleCandidatesSkipped,
      topSections,
      updatedAt: this.structure.lastUpdatedAt ? new Date(this.structure.lastUpdatedAt).toISOString() : null
    };
  }

  resetStructureStats() {
    this.structure.navPagesVisited = 0;
    this.structure.articleCandidatesSkipped = 0;
    this.structure.sectionCounts.clear();
    this.structure.lastUpdatedAt = null;
  }

  _deriveStructureSection(url) {
    try {
      const parsed = new URL(url);
      const segments = (parsed.pathname || '/').split('/').filter(Boolean);
      if (!segments.length) return '/';
      return `/${segments[0].toLowerCase()}`;
    } catch (_) {
      return null;
    }
  }

  noteDepthVisit(normalizedUrl, depth) {
    if (depth !== 2 || !normalizedUrl) {
      return;
    }
    if (this.depth2Visited.has(normalizedUrl)) {
      return;
    }
    this.depth2Visited.add(normalizedUrl);
    this.stats.depth2PagesProcessed = (this.stats.depth2PagesProcessed || 0) + 1;
  }

  // --- Cache helpers ---
  getKnownArticlesCache() {
    return this.knownArticlesCache;
  }

  getArticleHeaderCache() {
    return this.articleHeaderCache;
  }

  getUrlAnalysisCache() {
    return this.urlAnalysisCache;
  }

  getUrlDecisionCache() {
    return this.urlDecisionCache;
  }

  // --- Domain limiter helpers ---
  getDomainLimitState(host) {
    if (!host) {
      return null;
    }
    return this.domainLimits.get(host) || null;
  }

  setDomainLimitState(host, state) {
    if (!host || !state) {
      return;
    }
    this.domainLimits.set(host, state);
  }

  getDomainLimitsSnapshot() {
    return this.domainLimits;
  }

  // --- Seeded hubs helpers ---
  getSeededHubSet() {
    return this.seededHubUrls;
  }

  replaceSeededHubs(iterable) {
    this.seededHubUrls = new Set();
    this.seededHubMetadata = new Map();
    this.visitedSeededHubUrls = new Set();
    this.visitedHubMetadata = new Map();

    if (!iterable || tof(iterable[Symbol.iterator]) !== 'function') {
      return;
    }

    for (const entry of iterable) {
      if (!entry) continue;
      if (tof(entry) === 'string') {
        this.seededHubUrls.add(entry);
        if (!this.seededHubMetadata.has(entry)) {
          this.seededHubMetadata.set(entry, {});
        }
        continue;
      }
      if (tof(entry) === 'object') {
        const url = entry.url || entry.normalized || entry.href;
        if (!url) continue;
        this.seededHubUrls.add(url);
        const meta = { ...(entry.meta || entry.metadata || {}) };
        if (entry.reason && meta.reason == null) meta.reason = entry.reason;
        if (entry.kind && meta.kind == null) meta.kind = entry.kind;
        this.seededHubMetadata.set(url, meta);
      }
    }
  }

  // --- Stats replacement helper ---
  replaceStats(nextStats) {
    if (!nextStats || tof(nextStats) !== 'object') {
      return;
    }
    Object.assign(this.stats, nextStats);
  }

  // --- Visit/seed helpers ---
  hasVisited(normalizedUrl) {
    return this.visited.has(normalizedUrl);
  }

  addVisited(normalizedUrl) {
    if (normalizedUrl) {
      this.visited.add(normalizedUrl);
    }
  }

  hasSeededHub(normalizedUrl) {
    return this.seededHubUrls.has(normalizedUrl);
  }

  addSeededHub(normalizedUrl, meta = null) {
    if (!normalizedUrl) return;
    this.seededHubUrls.add(normalizedUrl);
    if (!this.seededHubMetadata.has(normalizedUrl)) {
      this.seededHubMetadata.set(normalizedUrl, {});
    }
    if (meta && tof(meta) === 'object') {
      const existing = this.seededHubMetadata.get(normalizedUrl) || {};
      this.seededHubMetadata.set(normalizedUrl, {
        ...existing,
        ...meta
      });
    }
  }

  getSeededHubCount() {
    return this.seededHubUrls.size;
  }

  getSeededHubSample(limit = 5) {
    return Array.from(this.seededHubUrls).slice(0, limit);
  }

  getSeededHubMeta(normalizedUrl) {
    if (!normalizedUrl) return null;
    return this.seededHubMetadata.get(normalizedUrl) || null;
  }

  markSeededHubVisited(normalizedUrl, info = null) {
    if (!normalizedUrl || !this.seededHubUrls.has(normalizedUrl)) {
      return;
    }
    this.visitedSeededHubUrls.add(normalizedUrl);
    const existing = this.seededHubMetadata.get(normalizedUrl) || {};
    const visitMeta = {
      ...existing,
      visitedAt: existing.visitedAt || new Date().toISOString(),
      ...(info && tof(info) === 'object' ? info : {})
    };
    this.seededHubMetadata.set(normalizedUrl, visitMeta);
    this.visitedHubMetadata.set(normalizedUrl, visitMeta);
  }

  hasVisitedHub(normalizedUrl) {
    if (!normalizedUrl) return false;
    return this.visitedSeededHubUrls.has(normalizedUrl);
  }

  getVisitedHubCount() {
    return this.visitedSeededHubUrls.size;
  }

  getVisitedHubSample(limit = 5) {
    return Array.from(this.visitedSeededHubUrls).slice(0, limit);
  }

  getHubVisitStats() {
    const summary = {
      seeded: this.getSeededHubCount(),
      visited: this.getVisitedHubCount(),
      perKind: {}
    };
    for (const url of this.seededHubUrls) {
      const meta = this.seededHubMetadata.get(url) || {};
      const kind = meta.kind || 'unknown';
      if (!summary.perKind[kind]) {
        summary.perKind[kind] = {
          seeded: 0,
          visited: 0
        };
      }
      summary.perKind[kind].seeded += 1;
      if (this.visitedSeededHubUrls.has(url)) {
        summary.perKind[kind].visited += 1;
      }
    }
    summary.seededSample = this.getSeededHubSample();
    summary.visitedSample = this.getVisitedHubSample();
    return summary;
  }

  hasHistorySeed(normalizedUrl) {
    return this.historySeedUrls.has(normalizedUrl);
  }

  addHistorySeed(normalizedUrl) {
    if (normalizedUrl) {
      this.historySeedUrls.add(normalizedUrl);
    }
  }

  // --- Pause/abort helpers ---
  setPaused(value) {
    this.paused = !!value;
  }

  isPaused() {
    return this.paused;
  }

  requestAbort() {
    this.abortRequested = true;
    this.paused = false;
  }

  isAbortRequested() {
    return this.abortRequested;
  }

  // --- Error tracking ---
  addFatalIssue(issue) {
    if (issue) {
      this.fatalIssues.push(issue);
    }
  }

  getFatalIssues() {
    return this.fatalIssues;
  }

  replaceFatalIssues(list) {
    if (!is_array(list)) {
      this.fatalIssues = [];
      return;
    }
    this.fatalIssues = list.slice();
  }

  setLastError(error) {
    this.lastError = error;
  }

  getLastError() {
    return this.lastError;
  }

  addErrorSample(sample) {
    if (!sample || tof(sample) !== 'object') {
      return;
    }
    if (this.errorSamples.length >= 5) {
      return;
    }
    this.errorSamples.push(sample);
  }

  getErrorSamples() {
    return this.errorSamples;
  }

  replaceErrorSamples(list) {
    if (!is_array(list)) {
      this.errorSamples = [];
      return;
    }
    this.errorSamples = list.slice(0, 5);
  }

  // --- Connection reset tracking ---
  getConnectionResetState(host) {
    return this.connectionResetState.get(host) || null;
  }

  setConnectionResetState(host, state) {
    if (!host) {
      return;
    }
    this.connectionResetState.set(host, state);
  }

  hasEmittedConnectionResetProblem() {
    return this.connectionResetProblemEmitted;
  }

  markConnectionResetProblemEmitted() {
    this.connectionResetProblemEmitted = true;
  }

  // --- Problem summary fallback ---
  getProblemCounters() {
    return this.problemCounters;
  }

  getProblemSamples() {
    return this.problemSamples;
  }

  setProblemCounter(kind, entry) {
    if (kind) {
      this.problemCounters.set(kind, entry);
    }
  }

  replaceProblemCounters(iterable) {
    if (!iterable || tof(iterable[Symbol.iterator]) !== 'function') {
      this.problemCounters = new Map();
      return;
    }
    this.problemCounters = new Map(iterable);
  }

  replaceProblemSamples(iterable) {
    if (!iterable || tof(iterable[Symbol.iterator]) !== 'function') {
      this.problemSamples = new Map();
      return;
    }
    this.problemSamples = new Map(iterable);
  }

  setProblemSample(kind, sample) {
    if (kind) {
      this.problemSamples.set(kind, sample);
    }
  }

  // --- Intelligent plan summary ---
  setIntelligentPlanSummary(summary) {
    this.intelligentPlanSummary = summary;
  }

  getIntelligentPlanSummary() {
    return this.intelligentPlanSummary;
  }

  // --- Planner stage sequence ---
  nextPlannerStageSequence() {
    this._plannerStageSeq += 1;
    return this._plannerStageSeq;
  }
}

module.exports = {
  CrawlerState
};
