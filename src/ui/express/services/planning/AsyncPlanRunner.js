'use strict';

const { PlanBlueprintBuilder } = require('../../../../crawler/planner/PlanBlueprintBuilder');
const { IntelligentPlanRunner } = require('../../../../crawler/IntelligentPlanRunner');
const { PlannerTelemetryBridge } = require('../../../../crawler/planner/PlannerTelemetryBridge');
const { PlannerOrchestrator } = require('../../../../crawler/planner/PlannerOrchestrator');
const { PlannerBootstrap } = require('../../../../crawler/planner/PlannerBootstrap');
const { PatternInference } = require('../../../../crawler/planner/PatternInference');
const { CountryHubPlanner } = require('../../../../crawler/planner/CountryHubPlanner');
const { HubSeeder } = require('../../../../crawler/planner/HubSeeder');
const { TargetedAnalysisRunner } = require('../../../../crawler/planner/TargetedAnalysisRunner');
const { NavigationDiscoveryRunner } = require('../../../../crawler/planner/navigation/NavigationDiscoveryRunner');
const { createPlannerHost } = require('../../../../planner/register');
const { MetaPlanCoordinator } = require('../../../../planner/meta/MetaPlanCoordinator');

const DEFAULT_FETCH_TIMEOUT_MS = 15000;
const DEFAULT_PLAN_TIMEOUT_MS = 120000;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const ALLOWED_OPTION_KEYS = [
  'startUrl',
  'crawlType',
  'concurrency',
  'maxQueue',
  'maxPages',
  'intMaxSeeds',
  'intTargetHosts',
  'plannerVerbosity',
  'refetchIfOlderThan',
  'refetchArticleIfOlderThan',
  'refetchHubIfOlderThan',
  'fastStart',
  'useSitemap',
  'sitemapOnly',
  'slow',
  'preferCache',
  'requestTimeoutMs',
  'pacerJitterMinMs',
  'pacerJitterMaxMs'
];

class AsyncPlanRunner {
  constructor({
    planningSessionManager,
    logger = console,
    emitEvent = null,
    fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
    planTimeoutMs = DEFAULT_PLAN_TIMEOUT_MS,
    cacheTtlMs = DEFAULT_CACHE_TTL_MS,
    usePlannerHost = false,
    dbAdapter = null
  } = {}) {
    if (!planningSessionManager) {
      throw new Error('AsyncPlanRunner requires planningSessionManager');
    }

    this.sessions = planningSessionManager;
    this.logger = logger;
    this.emitEvent = typeof emitEvent === 'function' ? emitEvent : null;
    this.fetchTimeoutMs = Number.isFinite(fetchTimeoutMs) && fetchTimeoutMs > 0
      ? fetchTimeoutMs
      : DEFAULT_FETCH_TIMEOUT_MS;
    this.planTimeoutMs = Number.isFinite(planTimeoutMs) && planTimeoutMs > 0
      ? planTimeoutMs
      : DEFAULT_PLAN_TIMEOUT_MS;
    this.cacheTtlMs = Number.isFinite(cacheTtlMs) && cacheTtlMs > 0
      ? cacheTtlMs
      : DEFAULT_CACHE_TTL_MS;
    this.usePlannerHost = !!usePlannerHost;
    this.dbAdapter = dbAdapter;

    this.activeRuns = new Map();
    this._fetchImplPromise = null;

    this.metaCoordinator = new MetaPlanCoordinator({
      logger: this.logger
    });
  }

  /**
   * Start a planning preview session asynchronously.
   * @param {Object} params
   * @param {Object} params.options - Crawl options payload (similar to /api/crawl body)
   * @param {string|null} [params.sessionKey] - Optional dedupe key (e.g., domain)
   * @param {Object} [params.metadata] - Extra metadata stored with the session
   * @param {Object|null} [params.tags] - Optional tags to persist with the session
   * @param {Function|null} [params.emitStage] - Optional callback for stage events
   * @param {Function|null} [params.emitStatus] - Optional callback for status transitions
   * @returns {Object} snapshot of created session
   */
  startPreview({
    options = {},
    sessionKey = null,
    metadata = {},
    tags = null,
    emitStage = null,
    emitStatus = null
  } = {}) {
    const normalised = this._normaliseOptions(options);
    const { startUrl, baseUrl, domain, plannerEnabled } = normalised;

    if (!startUrl) {
      throw new Error('AsyncPlanRunner requires options.startUrl');
    }
    if (!plannerEnabled) {
      throw new Error('AsyncPlanRunner requires planner-enabled crawl options');
    }

    const snapshotOptions = this._snapshotOptions(normalised);
    const sessionMeta = {
      domain,
      baseUrl,
      startedAt: new Date().toISOString(),
      ...metadata
    };

    const session = this.sessions.createSession(snapshotOptions, {
      sessionKey: sessionKey || domain,
      metadata: sessionMeta,
      tags
    });

    const runContext = {
      sessionId: session.id,
      options: normalised,
      baseUrl,
      domain,
      emitStage: typeof emitStage === 'function' ? emitStage : null,
      emitStatus: typeof emitStatus === 'function' ? emitStatus : null,
      abortController: new AbortController(),
      cancelled: false,
      timedOut: false
    };

    this._emitStatus(runContext, 'planning', session);

    const runPromise = this._runPreview(runContext)
      .catch((error) => {
        if (runContext.cancelled) {
          return;
        }
        this._handleRunFailure(runContext, error);
      })
      .finally(() => {
        this.activeRuns.delete(runContext.sessionId);
      });

    this.activeRuns.set(runContext.sessionId, {
      ...runContext,
      promise: runPromise
    });

    // Prevent unhandled rejections without suppressing diagnostics
    runPromise.catch((error) => {
      this._log('warn', `[AsyncPlanRunner] Unhandled preview error for session ${runContext.sessionId}`, error?.message || error);
    });

    return session;
  }

  /**
   * Cancel an active planning session if running.
   */
  cancel(sessionId, reason = 'cancelled') {
    const ctx = this.activeRuns.get(sessionId);
    if (ctx) {
      ctx.cancelled = true;
      try {
        ctx.abortController.abort();
      } catch (_) {}
    }
    try {
      const snapshot = this.sessions.cancelSession(sessionId, reason);
      this._emitStatus({ sessionId, emitStatus: ctx?.emitStatus }, 'cancelled', snapshot);
      return true;
    } catch (error) {
      this._log('warn', `[AsyncPlanRunner] Failed to cancel session ${sessionId}`, error?.message || error);
      return false;
    }
  }

  isRunning(sessionId) {
    return this.activeRuns.has(sessionId);
  }

  async _runPreview(runContext) {
    if (this.usePlannerHost) {
      return this._runPreviewWithPlannerHost(runContext);
    } else {
      return this._runPreviewWithIntelligentPlanRunner(runContext);
    }
  }

  async _runPreviewWithPlannerHost(runContext) {
    const { sessionId, options, abortController } = runContext;
    const timeoutId = this.planTimeoutMs > 0
      ? setTimeout(() => {
          if (!abortController.signal.aborted) {
            runContext.timedOut = true;
            abortController.abort();
          }
        }, this.planTimeoutMs)
      : null;
    if (timeoutId && typeof timeoutId.unref === 'function') {
      timeoutId.unref();
    }

    const pageCache = new Map();
    const telemetry = this._createTelemetryFacade(runContext);
    const fetchPage = (params) => this._fetchPage({
      ...params,
      runContext,
      pageCache
    });

    const emit = (type, data) => {
      telemetry.plannerStage({ type, ...data });
    };

    const host = createPlannerHost({
      options: {
        domain: runContext.domain,
        baseUrl: runContext.baseUrl,
        startUrl: options.startUrl
      },
      emit,
      fetchPage,
      dbAdapter: this.dbAdapter,
      logger: this.logger,
      budgetMs: Math.min(this.planTimeoutMs || 120000, 120000),
      preview: true
    });

    let result;
    try {
      result = await host.run();
    } catch (error) {
      if (runContext.cancelled) {
        return;
      }
      if (runContext.timedOut) {
        const timeoutError = new Error('Planner preview timed out');
        timeoutError.code = 'planner-preview-timeout';
        throw timeoutError;
      }
      throw error;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }

    if (runContext.cancelled) {
      return;
    }

    // Build blueprint from PlannerHost blackboard
    const blueprint = {
      sessionId,
      domain: runContext.domain,
      createdAt: new Date().toISOString(),
      gofaiResult: {
        blackboard: result.blackboard,
        elapsedMs: result.elapsedMs,
        budgetExceeded: result.budgetExceeded,
        statusReason: result.statusReason
      },
      proposedHubs: result.blackboard.proposedHubs || [],
      seedQueue: result.blackboard.seedQueue || [],
      costEstimates: result.blackboard.costEstimates || null,
      rationale: result.blackboard.rationale || []
    };

    // Run meta-planning pipeline (Validator → Evaluator → Arbitrator)
    // NOTE: MicroProlog is DISABLED - microprologPlan always passed as null
    let metaOutcome = null;
    try {
      metaOutcome = await this.metaCoordinator.process({
        blueprint,
        context: {
          options: {
            domain: runContext.domain,
            baseUrl: runContext.baseUrl,
            startUrl: options.startUrl
          },
          telemetry: {
            elapsedMs: result.elapsedMs,
            budgetExceeded: result.budgetExceeded
          },
          policies: options.metaPolicies || null,
          history: await this._getHistoricalMetrics(runContext.domain)
        },
        microprologPlan: null, // DISABLED: MicroProlog not used until meta-planning determines viability
        alternativePlans: []
      });
    } catch (error) {
      this._log('warn', '[AsyncPlanRunner] MetaPlanCoordinator failed', error?.message || error);
    }

    if (metaOutcome?.sanitizedBlueprint) {
      blueprint.proposedHubs = metaOutcome.sanitizedBlueprint.proposedHubs;
      blueprint.seedQueue = metaOutcome.sanitizedBlueprint.seedQueue;
      blueprint.schedulingConstraints = metaOutcome.sanitizedBlueprint.schedulingConstraints;
      blueprint.rationale = metaOutcome.sanitizedBlueprint.rationale;
    }

    if (metaOutcome) {
      blueprint.meta = {
        validator: {
          valid: metaOutcome.validatorResult?.valid,
          reasons: metaOutcome.validatorResult?.reasons,
          metrics: metaOutcome.validatorResult?.metrics
        },
        scores: {
          microprolog: metaOutcome.microScore,
          alternatives: metaOutcome.alternativeScores
        },
        decision: metaOutcome.decision,
        replay: metaOutcome.replay
      };
    }

    const summary = {
      preparedAt: new Date().toISOString(),
      planner: {
        mode: 'gofai',
        elapsedMs: result.elapsedMs,
        budgetExceeded: result.budgetExceeded
      },
      fetchCount: pageCache.size,
      meta: metaOutcome ? {
        decision: metaOutcome.decision,
        validator: metaOutcome.validatorResult,
        scorecard: metaOutcome.alternativeScores?.[0]?.score || null
      } : null
    };

    const snapshot = this.sessions.completeSession(sessionId, blueprint, summary);
    this._emitStatus(runContext, 'ready', snapshot);
    this._emitPreview(runContext, snapshot);
  }

  async _getHistoricalMetrics(domain) {
    if (!domain) return {};
    try {
      if (typeof this.sessions?.getRecentMetrics === 'function') {
        return await this.sessions.getRecentMetrics(domain);
      }
    } catch (error) {
      this._log('warn', '[AsyncPlanRunner] Failed to fetch historical metrics', error?.message || error);
    }
    return {};
  }

  async _runPreviewWithIntelligentPlanRunner(runContext) {
    const { sessionId, options, abortController } = runContext;
    const timeoutId = this.planTimeoutMs > 0
      ? setTimeout(() => {
          if (!abortController.signal.aborted) {
            runContext.timedOut = true;
            abortController.abort();
          }
        }, this.planTimeoutMs)
      : null;
    if (timeoutId && typeof timeoutId.unref === 'function') {
      timeoutId.unref();
    }

    const pageCache = new Map();
    const seededHubs = new Set();
    const historySeeds = new Set();
    const queueRecords = [];

    const telemetry = this._createTelemetryFacade(runContext);
    const fetchPage = (params) => this._fetchPage({
      ...params,
      runContext,
      pageCache
    });
    const getCachedArticle = async (url) => {
      const key = this._cacheKey(url, runContext.baseUrl);
      const entry = key ? pageCache.get(key) : null;
      if (!entry) return null;
      return {
        html: entry.html,
        crawledAt: entry.crawledAt,
        source: entry.source
      };
    };

    const state = {
      addSeededHub: (url, meta) => {
        if (url) seededHubs.add(url);
        return meta;
      },
      hasSeededHub: (url) => seededHubs.has(url),
      hasVisited: () => false,
      addHistorySeed: (url) => {
        if (url) historySeeds.add(url);
      },
      hasHistorySeed: (url) => historySeeds.has(url)
    };

    const plannerKnowledgeService = {
      async getCountryHubCandidates() {
        return [];
      }
    };

    const normalizeUrl = (value) => this._normalizeUrl(value, runContext.baseUrl);
    const enqueueRequest = (request) => {
      queueRecords.push({
        url: request?.url || null,
        depth: request?.depth ?? null,
        type: request?.type || null
      });
      return true;
    };

    const plannerBuilder = new PlanBlueprintBuilder({
      sessionId,
      domain: runContext.domain
    });

    const runner = new IntelligentPlanRunner({
      telemetry,
      domain: runContext.domain,
      baseUrl: runContext.baseUrl,
      startUrl: options.startUrl,
      plannerEnabled: options.plannerEnabled,
      plannerVerbosity: options.plannerVerbosity,
      intTargetHosts: options.intTargetHosts,
      fetchPage,
      getCachedArticle,
      dbAdapter: null,
      plannerKnowledgeService,
      enqueueRequest,
      normalizeUrl,
      state,
      intMaxSeeds: options.intMaxSeeds,
      logger: this.logger,
      PlannerTelemetryBridge,
      PlannerOrchestrator,
      PlannerBootstrap,
      PatternInference,
      CountryHubPlanner,
      HubSeeder,
      TargetedAnalysisRunner,
      NavigationDiscoveryRunner,
      enableTargetedAnalysis: options.enableTargetedAnalysis,
      planPreview: true,
      planBlueprintBuilder: plannerBuilder
    });

    let result;
    try {
      result = await runner.run();
    } catch (error) {
      if (runContext.cancelled) {
        return;
      }
      if (runContext.timedOut) {
        const timeoutError = new Error('Planner preview timed out');
        timeoutError.code = 'planner-preview-timeout';
        throw timeoutError;
      }
      throw error;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }

    if (runContext.cancelled) {
      return;
    }

    const blueprint = result?.planBlueprint || plannerBuilder.build({
      plannerSummary: result?.plannerSummary,
      intelligentSummary: result?.intelligentSummary
    });

    const summary = {
      preparedAt: new Date().toISOString(),
      planner: result?.plannerSummary || null,
      intelligent: result?.intelligentSummary || null,
      fetchCount: pageCache.size,
      seedQueue: queueRecords.slice(0, 20)
    };

    const snapshot = this.sessions.completeSession(sessionId, blueprint, summary);
    this._emitStatus(runContext, 'ready', snapshot);
    this._emitPreview(runContext, snapshot);
  }

  _createTelemetryFacade(runContext) {
    const emitStage = (event) => {
      if (!event || typeof event !== 'object') return;
      const payload = {
        ...event,
        sessionId: runContext.sessionId,
        phase: 'preview'
      };
      try {
        this.sessions.appendStageEvent(runContext.sessionId, payload);
      } catch (error) {
        this._log('warn', `[AsyncPlanRunner] Failed to append stage event`, error?.message || error);
      }
      if (runContext.emitStage) {
        try {
          runContext.emitStage(payload);
        } catch (_) {}
      }
      if (this.emitEvent) {
        try {
          this.emitEvent('planner-stage', payload);
        } catch (_) {}
      }
    };

    const emitProblem = (kind, payload) => {
      const event = {
        type: kind,
        payload,
        sessionId: runContext.sessionId,
        phase: 'preview'
      };
      try {
        this.sessions.appendStageEvent(runContext.sessionId, event);
      } catch (_) {}
      if (runContext.emitStage) {
        try {
          runContext.emitStage(event);
        } catch (_) {}
      }
      if (this.emitEvent) {
        try {
          this.emitEvent('planner-' + kind, event);
        } catch (_) {}
      }
    };

    return {
      plannerStage: emitStage,
      milestone: (payload) => emitProblem('milestone', payload),
      milestoneOnce: (_key, payload) => emitProblem('milestone', payload),
      problem: (payload) => emitProblem('problem', payload)
    };
  }

  async _fetchPage({ url, runContext, pageCache }) {
    if (!url) {
      return {
        source: 'error',
        html: null,
        meta: {
          error: {
            message: 'missing-url'
          }
        }
      };
    }

    const key = this._cacheKey(url, runContext.baseUrl);
    const cached = key ? pageCache.get(key) : null;
    if (cached && (Date.now() - cached.fetchedAt) <= this.cacheTtlMs) {
      return {
        source: 'cache',
        html: cached.html,
        meta: cached.meta
      };
    }

    const networkResult = await this._doNetworkFetch(url, runContext.abortController.signal);
    if (networkResult.ok) {
      const entry = {
        html: networkResult.html,
        crawledAt: new Date().toISOString(),
        source: 'network',
        meta: {
          status: networkResult.status,
          contentType: networkResult.contentType
        },
        fetchedAt: Date.now()
      };
      if (key) {
        pageCache.set(key, entry);
      }
      return {
        source: 'network',
        html: entry.html,
        meta: entry.meta
      };
    }

    if (cached) {
      return {
        source: 'cache',
        html: cached.html,
        meta: cached.meta
      };
    }

    return {
      source: networkResult.aborted ? 'aborted' : 'error',
      html: null,
      meta: {
        error: {
          message: networkResult.errorMessage,
          code: networkResult.errorCode
        }
      }
    };
  }

  async _doNetworkFetch(url, signal) {
    try {
      const fetchImpl = await this._getFetchImpl();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.fetchTimeoutMs);
      if (typeof timeout.unref === 'function') {
        timeout.unref();
      }
      const combinedSignal = this._combineSignals(signal, controller.signal);
      const response = await fetchImpl(url, {
        redirect: 'follow',
        signal: combinedSignal,
        headers: {
          'user-agent': 'CopilotPlannerPreview/1.0 (+https://github.com/github/copilot)' ,
          'accept': 'text/html,application/xhtml+xml'
        }
      });
      clearTimeout(timeout);
      const contentType = response.headers.get('content-type') || null;
      const html = await response.text();
      return {
        ok: true,
        html,
        status: response.status,
        contentType
      };
    } catch (error) {
      const isAbort = error?.name === 'AbortError';
      return {
        ok: false,
        aborted: isAbort,
        errorMessage: isAbort ? 'aborted' : (error?.message || String(error)),
        errorCode: error?.code || (isAbort ? 'aborted' : 'fetch-error')
      };
    }
  }

  _combineSignals(signalA, signalB) {
    if (!signalA) return signalB;
    if (!signalB) return signalA;
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signalA.aborted || signalB.aborted) {
      controller.abort();
      return controller.signal;
    }
    signalA.addEventListener('abort', abort, { once: true });
    signalB.addEventListener('abort', abort, { once: true });
    return controller.signal;
  }

  async _getFetchImpl() {
    if (!this._fetchImplPromise) {
      this._fetchImplPromise = import('node-fetch').then((mod) => mod.default || mod);
    }
    return this._fetchImplPromise;
  }

  _emitStatus(runContext, status, snapshot) {
    const payload = {
      sessionId: runContext.sessionId || (snapshot && snapshot.id) || null,
      status,
      session: snapshot || null
    };
    if (runContext.emitStatus) {
      try {
        runContext.emitStatus(payload);
      } catch (_) {}
    }
    if (this.emitEvent) {
      try {
        this.emitEvent('plan-status', payload);
      } catch (_) {}
    }
  }

  _emitPreview(runContext, snapshot) {
    if (!snapshot) return;
    const payload = {
      sessionId: snapshot.id || runContext.sessionId || null,
      status: snapshot.status || null,
      blueprint: snapshot.blueprint || null,
      summary: snapshot.summary || null,
      phase: 'preview'
    };
    if (this.emitEvent) {
      try {
        this.emitEvent('plan-preview', payload);
      } catch (_) {}
    }
  }

  _handleRunFailure(runContext, error) {
    const failure = {
      message: error?.message || 'Planner preview failed',
      code: error?.code || 'planner-preview-failed'
    };
    const snapshot = this.sessions.failSession(runContext.sessionId, failure);
    this._emitStatus(runContext, 'failed', snapshot);
  }

  _snapshotOptions(options) {
    const out = {};
    for (const key of ALLOWED_OPTION_KEYS) {
      if (options[key] !== undefined) {
        out[key] = options[key];
      }
    }
    return out;
  }

  _normaliseOptions(options) {
    const out = { ...options };
    const rawStartUrl = out.startUrl || out.url || null;
    if (!rawStartUrl) {
      return {
        ...out,
        startUrl: null,
        baseUrl: null,
        domain: null,
        plannerEnabled: false,
        intMaxSeeds: Number.isFinite(out.intMaxSeeds) ? out.intMaxSeeds : 50,
        plannerVerbosity: Number.isFinite(out.plannerVerbosity) ? out.plannerVerbosity : 0,
        enableTargetedAnalysis: out.enableTargetedAnalysis !== false
      };
    }

    let parsed;
    try {
      parsed = new URL(rawStartUrl);
    } catch (error) {
      throw new Error(`Invalid startUrl for planner preview: ${error?.message || rawStartUrl}`);
    }

    const crawlType = (out.crawlType || '').toString().toLowerCase();
    const plannerEnabled = crawlType.startsWith('intelligent') || crawlType === 'discover-structure' || !crawlType;

    return {
      ...out,
      startUrl: parsed.toString(),
      baseUrl: parsed.origin,
      domain: parsed.hostname,
      crawlType,
      plannerEnabled,
      intMaxSeeds: Number.isFinite(out.intMaxSeeds) ? out.intMaxSeeds : 50,
      plannerVerbosity: Number.isFinite(out.plannerVerbosity) ? out.plannerVerbosity : 0,
      intTargetHosts: Array.isArray(out.intTargetHosts) ? out.intTargetHosts : null,
      enableTargetedAnalysis: out.enableTargetedAnalysis !== false
    };
  }

  _normalizeUrl(value, baseUrl) {
    if (!value) return null;
    try {
      const url = new URL(value, baseUrl);
      url.hash = '';
      return url.toString();
    } catch (_) {
      return null;
    }
  }

  _cacheKey(url, baseUrl) {
    try {
      const parsed = new URL(url, baseUrl);
      parsed.hash = '';
      return parsed.toString();
    } catch (_) {
      return null;
    }
  }

  _log(level, message, ...args) {
    const logger = this.logger;
    try {
      if (level === 'warn' && typeof logger?.warn === 'function') {
        logger.warn(message, ...args);
      } else if (level === 'error' && typeof logger?.error === 'function') {
        logger.error(message, ...args);
      } else if (typeof logger?.log === 'function') {
        logger.log(message, ...args);
      }
    } catch (_) {}
  }
}

module.exports = {
  AsyncPlanRunner
};
