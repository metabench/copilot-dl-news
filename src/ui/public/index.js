document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('[index] Starting DOM initialization');
    console.log('[index] Importing statusIndicators...');
    const { createStatusIndicators } = await import('./index/statusIndicators.js');
    console.log('[index] Importing formatters...');
    const { formatNumber, formatTimestamp, formatRelativeTime } = await import('./index/formatters.js');
    console.log('[index] Importing pipelineView...');
    const { createPipelineView } = await import('./index/pipelineView.js');
    console.log('[index] Importing metricsView...');
    const { createMetricsView } = await import('./index/metricsView.js');
    console.log('[index] Importing sseClient...');
    const { createSseClient } = await import('./index/sseClient.js');
    console.log('[index] Importing sseHandlers...');
    const { createSseHandlers } = await import('./index/sseHandlers.js');
    console.log('[index] Importing crawlControls...');
    const { createCrawlControls } = await import('./index/crawlControls.js');
    console.log('[index] Importing jobsAndResumeManager...');
    const { createJobsAndResumeManager } = await import('./index/jobsAndResumeManager.js');
    console.log('[index] Importing advancedFeaturesPanel...');
    const { createAdvancedFeaturesPanel } = await import('./index/advancedFeaturesPanel.js');
    console.log('[index] Importing analysisHandlers...');
    const { createAnalysisHandlers } = await import('./index/analysisHandlers.js');
    console.log('[index] Importing initialization...');
    const { createInitialization } = await import('./index/initialization.js');
    console.log('[index] Importing app...');
    const { createApp } = await import('./index/app.js');
    console.log('[index] Importing domUtils...');
    const { showElement, hideElement, setElementVisibility } = await import('./index/domUtils.js');
    console.log('[index] Importing browserController...');
    const { createBrowserThemeController } = await import('./theme/browserController.js');
    console.log('[index] Importing backgroundTasksWidget...');
    const { createBackgroundTasksWidget } = await import('./index/backgroundTasksWidget.js');
    console.log('[index] Importing crawlProgressIntegration...');
    const { createCrawlProgressIntegration } = await import('./index/crawlProgressIntegration.js');
    console.log('[index] Importing renderingHelpers...');
    const {
      compactDetails,
      formatFeatureName,
      numericValue,
      describeEntry,
      renderFeatureFlags: renderFeatureFlagsBase,
      renderAnalysisStatus: renderAnalysisStatusBase,
      renderPriorityBonuses: renderPriorityBonusesBase,
      renderPriorityWeights: renderPriorityWeightsBase,
      renderStructureSummary: renderStructureSummaryBase
    } = await import('./index/renderingHelpers.js');
    console.log('[index] All imports completed successfully');

    console.log('[index] Getting DOM elements...');
    const logs = document.getElementById('logs');
    const logsResizer = document.getElementById('logsResizer');
    const logsFontMinus = document.getElementById('logsFontMinus');
    const logsFontPlus = document.getElementById('logsFontPlus');
    const logsFontVal = document.getElementById('logsFontVal');
    const secErrors = document.getElementById('secErrors');
    const secDomains = document.getElementById('secDomains');
    const secLogs = document.getElementById('secLogs');
    const progress = document.getElementById('progress');
    const startupStatusEl = document.getElementById('startupStatus');
    const startupStatusText = document.getElementById('startupStatusText');
    const startupProgressFill = document.getElementById('startupProgressFill');
    const startupStagesList = document.getElementById('startupStagesList');
    if (startupStatusEl) {
      startupStatusEl.dataset.active = '0';
      startupStatusEl.setAttribute('aria-hidden', 'true');
    }
    const mReqps = document.getElementById('m_reqps');
    const mDlps = document.getElementById('m_dlps');
    const mReqpsLabel = document.getElementById('m_reqps_label');
    const mDlpsLabel = document.getElementById('m_dlps_label');
    const mErrpm = document.getElementById('m_errpm');
    const mQsize = document.getElementById('m_qsize');
    const mErrs = document.getElementById('m_errs');
    const mDomRpm = document.getElementById('m_domrpm');
    const mDomLim = document.getElementById('m_domlim');
    const mDomBk = document.getElementById('m_dombk');
    const mDomRl = document.getElementById('m_domrl');
    const pauseBtn = document.getElementById('pauseBtn');
    const resumeBtn = document.getElementById('resumeBtn');
    const analysisBtn = document.getElementById('analysisBtn');
    const analysisLink = document.getElementById('analysisLink');
    const analysisStatus = document.getElementById('analysisStatus');
    const analysisStatusSummary = document.getElementById('analysisStatusSummary');
    const analysisStatusMetrics = document.getElementById('analysisStatusMetrics');
    const domains = document.getElementById('domains');
    const inflightDiv = document.getElementById('inflight');
    const inflightList = document.getElementById('inflightList');
    const qPoly = document.getElementById('q_poly');
    const qTitle = document.getElementById('q_title');
    const reqpsPoly = document.getElementById('reqps_poly');
    const reqpsTitle = document.getElementById('reqps_title');
    const dlpsPoly = document.getElementById('dlps_poly');
    const dlpsTitle = document.getElementById('dlps_title');
    const themeBtn = document.getElementById('themeBtn');
    const etaEl = document.getElementById('eta');
    const cacheGauge = document.getElementById('cacheGauge');
    const cacheInfo = document.getElementById('cacheInfo');
    const badgeDb = document.getElementById('badgeDb');
    const badgeDisk = document.getElementById('badgeDisk');
    const badgeRobots = document.getElementById('badgeRobots');
    const badgeSitemap = document.getElementById('badgeSitemap');
    const badgeConn = document.getElementById('badgeConn');
    const badgeCpu = document.createElement('span');
    const badgeMem = document.createElement('span');
    const badgeWal = document.createElement('span');
    badgeCpu.className = 'muted';
    badgeMem.className = 'muted';
    badgeWal.className = 'muted';
    const crawlTypeBadge = document.getElementById('crawlTypeBadge');
    let currentCrawlType = '';
    const stageBadge = document.getElementById('stageBadge');
    const pausedBadge = document.getElementById('pausedBadge');
    const {
      setStage,
      setPausedBadge,
      hidePausedBadge,
      updateStartupStatus
    } = createStatusIndicators({
      stageBadge,
      pausedBadge,
      startupStatusEl,
      startupStatusText,
      startupProgressFill,
      startupStagesList
    });
    const metricVisited = document.getElementById('metricVisited');
    const metricDownloaded = document.getElementById('metricDownloaded');
    const metricSaved = document.getElementById('metricSaved');
    const metricFound = document.getElementById('metricFound');
    const metricQueue = document.getElementById('metricQueue');
    const metricErrors = document.getElementById('metricErrors');
    const metricCoverage = document.getElementById('metricCoverage');
    const insightsPanel = document.getElementById('insightsPanel');
    const insightsHint = document.getElementById('insightsHint');
    const insightCoverage = document.getElementById('insightCoverage');
    const insightCoverageDetail = document.getElementById('insightCoverageDetail');
    const insightHubs = document.getElementById('insightHubs');
    const insightHubsDetail = document.getElementById('insightHubsDetail');
    const insightProblems = document.getElementById('insightProblems');
    const insightProblemsDetail = document.getElementById('insightProblemsDetail');
    const insightGoals = document.getElementById('insightGoals');
    const insightGoalsDetail = document.getElementById('insightGoalsDetail');
    const insightQueueMix = document.getElementById('insightQueueMix');
    const insightQueueMixDetail = document.getElementById('insightQueueMixDetail');
    const insightAnalysisHighlights = document.getElementById('insightAnalysisHighlights');
    const structurePanel = document.getElementById('structurePanel');
    const structureHint = document.getElementById('structureHint');
    const structureNavPages = document.getElementById('structureNavPages');
    const structureArticlesSkipped = document.getElementById('structureArticlesSkipped');
    const structureTopSections = document.getElementById('structureTopSections');
    const structureUpdated = document.getElementById('structureUpdated');
    if (structurePanel) {
      structurePanel.dataset.active = '0';
    }
    const patternPanel = document.getElementById('patternInsightsPanel');
    const patternHint = document.getElementById('patternInsightsHint');
    const patternTotal = document.getElementById('patternInsightsTotal');
    const patternSections = document.getElementById('patternInsightsSections');
    const patternHints = document.getElementById('patternInsightsHints');
    const patternLastSummary = document.getElementById('patternInsightsLastSummary');
    const patternLastStage = document.getElementById('patternInsightsLastStage');
    const patternLastUpdated = document.getElementById('patternInsightsLastUpdated');
    const patternTopSections = document.getElementById('patternInsightsTopSections');
    const patternTopHints = document.getElementById('patternInsightsTopHints');
    const patternSources = document.getElementById('patternInsightsSources');
    const patternLog = document.getElementById('patternInsightsLog');
    const pipelinePanel = document.getElementById('pipelinePanel');
    const pipelineUpdated = document.getElementById('pipelineUpdated');
    const pipelineDiagram = document.getElementById('pipelineDiagram');
    const pipelineAnalysisLink = document.getElementById('pipelineAnalysisLink');
    const pipelineAnalysisHistorySection = document.getElementById('pipelineAnalysisHistorySection');
    const pipelineAnalysisHistoryClear = document.getElementById('pipelineAnalysisHistoryClear');
    const pipelineAnalysisHistory = document.getElementById('pipelineAnalysisHistory');
    const pipelineCards = {
      analysis: document.querySelector('[data-pipeline-stage="analysis"]'),
      planner: document.querySelector('[data-pipeline-stage="planner"]'),
      execution: document.querySelector('[data-pipeline-stage="execution"]')
    };
    const pipelineEls = {
      analysis: {
        status: document.getElementById('pipelineAnalysisStatus'),
        summary: document.getElementById('pipelineAnalysisSummary'),
        lastRun: document.getElementById('pipelineAnalysisLastRun'),
        signals: document.getElementById('pipelineAnalysisSignals'),
        link: pipelineAnalysisLink
      },
      planner: {
        status: document.getElementById('pipelinePlannerStatus'),
        summary: document.getElementById('pipelinePlannerSummary'),
        stage: document.getElementById('pipelinePlannerStage'),
        goals: document.getElementById('pipelinePlannerGoals')
      },
      execution: {
        status: document.getElementById('pipelineExecutionStatus'),
        summary: document.getElementById('pipelineExecutionSummary'),
        jobs: document.getElementById('pipelineExecutionJobs'),
        queue: document.getElementById('pipelineExecutionQueue'),
        coverage: document.getElementById('pipelineExecutionCoverage')
      }
    };
    const insightHighlightsList = document.getElementById('insightHighlightsList');
    const insightQueueHeatmapContainer = document.getElementById('insightQueueHeatmap');
    const milestonesList = document.getElementById('milestonesList');
    const plannerStagesList = document.getElementById('plannerStagesList');
    const resumeSection = document.getElementById('resumeSection');
    const resumeSummary = document.getElementById('resumeSummary');
    const resumeList = document.getElementById('resumeList');
    const resumeStatus = document.getElementById('resumeStatus');
    const resumeAllBtn = document.getElementById('resumeAllBtn');
    const resumeRefreshBtn = document.getElementById('resumeRefreshBtn');
    const clearQueuesBtn = document.getElementById('clearQueuesBtn');
    const jobsList = document.getElementById('jobsList');

    // ========================================
    // Element Definitions
    // ========================================
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const jobId = document.getElementById('jobId');
    const maxPages = document.getElementById('maxPages');
    const crawlType = document.getElementById('crawlType');
    const depth = document.getElementById('depth');
    const concurrency = document.getElementById('concurrency');
    const useSitemap = document.getElementById('useSitemap');
    const sitemapOnly = document.getElementById('sitemapOnly');
    const slowMode = document.getElementById('slowMode');
    const refetchIfOlderThan = document.getElementById('refetchIfOlderThan');
    const refetchArticleIfOlderThan = document.getElementById('refetchArticleIfOlderThan');
    const refetchHubIfOlderThan = document.getElementById('refetchHubIfOlderThan');
    const requestTimeoutMs = document.getElementById('requestTimeoutMs');
    const pacerJitterMinMs = document.getElementById('pacerJitterMinMs');
    const pacerJitterMaxMs = document.getElementById('pacerJitterMaxMs');
    const startUrl = document.getElementById('startUrl');

    let lastStructureSummary = null;

    const RESUME_REASON_LABELS = {
      'domain-conflict': 'Blocked: another crawl from this domain is already running',
      'missing-source': 'Blocked: queue is missing saved resume data',
      'capacity-exceeded': 'Waiting for a free worker slot',
      'already-running': 'Already running'
    };
    const RESUME_STATE_WEIGHT = {
      selected: 0,
      queued: 1,
      available: 1,
      blocked: 2
    };
    let resumeInventoryState = { loading: false, lastFetch: 0, data: null };
    let resumeActionPending = false;
    let resumeRefreshTimer = null;

    const uiApp = createApp({
      elements: {
        pipeline: {
          panel: pipelinePanel,
          updatedEl: pipelineUpdated,
          cards: pipelineCards,
          elements: pipelineEls,
          analysisHistorySection: pipelineAnalysisHistorySection,
          analysisHistoryList: pipelineAnalysisHistory,
          analysisHistoryClearButton: pipelineAnalysisHistoryClear,
          analysisHighlightsEl: insightAnalysisHighlights,
          diagramContainer: pipelineDiagram
        },
        insights: {
          panel: insightsPanel,
          hint: insightsHint,
          coverage: insightCoverage,
          coverageDetail: insightCoverageDetail,
          hubs: insightHubs,
          hubsDetail: insightHubsDetail,
          problems: insightProblems,
          problemsDetail: insightProblemsDetail,
          goals: insightGoals,
          goalsDetail: insightGoalsDetail,
          queueMix: insightQueueMix,
          queueMixDetail: insightQueueMixDetail,
          highlightsList: insightHighlightsList,
          heatmapContainer: insightQueueHeatmapContainer
        },
        patterns: {
          panel: patternPanel,
          hint: patternHint,
          totalCount: patternTotal,
          uniqueSections: patternSections,
          uniqueHints: patternHints,
          lastSummary: patternLastSummary,
          lastStage: patternLastStage,
          lastUpdated: patternLastUpdated,
          topSectionsList: patternTopSections,
          topHintsList: patternTopHints,
          sourceList: patternSources,
          logContainer: patternLog
        },
    milestones: milestonesList,
    planner: plannerStagesList
      },
      formatters: {
        formatNumber,
        formatRelativeTime
      }
    });

    const {
      controls: { pipeline: pipelineControl },
      actions: appActions
    } = uiApp;

    const {
      getAnalysisState,
      persistAnalysisHistory,
      renderAnalysisHistory,
      buildAnalysisHighlights,
      renderAnalysisHighlights
    } = pipelineControl;
    const advancedFeaturesPanelEl = document.getElementById('advancedFeaturesPanel');
    const advancedFeaturesStatus = document.getElementById('advancedFeaturesStatus');
    const featureFlagsList = document.getElementById('featureFlagsList');
    const priorityBonusesList = document.getElementById('priorityBonusesList');
    const priorityWeightsList = document.getElementById('priorityWeightsList');
    const metrics = createMetricsView({
      elements: {
        reqpsLabel: mReqpsLabel,
        dlpsLabel: mDlpsLabel,
        errpm: mErrpm,
        qsize: mQsize,
        errs: mErrs,
        qPoly,
        qTitle,
        cacheGauge,
        cacheInfo,
        reqpsPoly,
        reqpsTitle,
        dlpsPoly,
        dlpsTitle,
        badgeRobots,
        badgeSitemap,
        domRpm: mDomRpm,
        domLim: mDomLim,
        domBk: mDomBk,
        domRl: mDomRl,
        eta: etaEl
      },
      formatNumber
    });
    const {
      getQueueDisplayValue,
      handleProgress: handleMetricsProgress,
      refreshServerMetrics,
      startServerMetricsPolling,
      startDlpsTicker,
      handleCacheEvent
    } = metrics;
    try {
      badgeCpu.style.marginLeft = '12px';
      badgeMem.style.marginLeft = '12px';
      badgeWal.style.marginLeft = '12px';
      const hs = document.getElementById('healthStrip');
      hs.appendChild(badgeCpu);
      hs.appendChild(badgeMem);
      hs.appendChild(badgeWal);
    } catch(_) {}
    const sseClient = createSseClient({ badgeEl: badgeConn });
    const markSseLive = () => sseClient.markLive();

    // ========================================
    // Background Tasks Widget
    // ========================================
    const backgroundTasksWidget = createBackgroundTasksWidget({
      widgetSection: document.getElementById('backgroundTasksWidget'),
      tasksList: document.getElementById('activeTasksList')
    });
    
    // Initialize the widget to load current tasks
    backgroundTasksWidget.init();
    
    // ========================================
    // Crawl Progress Integration
    // ========================================
    const crawlProgressSection = document.getElementById('crawlProgressSection');
    const crawlProgressContainer = document.getElementById('crawlProgressContainer');
    const crawlTelemetryContainer = document.getElementById('crawlTelemetryContainer');
    
    const crawlProgress = createCrawlProgressIntegration({
      progressContainer: crawlProgressContainer,
      telemetryContainer: crawlTelemetryContainer,
      onProgressUpdate: async (event) => {
        // Show progress section ONLY when there's actual progress data
        if (event.type === 'progress' && event.data) {
          const hasActualProgress = 
            (event.data.visited > 0 || event.data.maxPages > 0) ||
            (event.data.queue > 0) ||
            (event.data.downloaded > 0);
          
          if (hasActualProgress && crawlProgressSection && crawlProgressSection.classList.contains('is-hidden')) {
            crawlProgressSection.classList.remove('is-hidden');
            crawlProgressSection.dataset.active = '1';
          }
        }

        // Show on explicit stage transitions (not just any telemetry)
        if (event.type === 'telemetry' && event.data) {
          const isStageTransition = 
            event.data.type === 'stage_transition' || 
            event.data.type === 'started' ||
            (event.data.stage && event.data.message);
          
          if (isStageTransition && crawlProgressSection && crawlProgressSection.classList.contains('is-hidden')) {
            crawlProgressSection.classList.remove('is-hidden');
            crawlProgressSection.dataset.active = '1';
          }
        }

        // Hide progress section on completion
        if (event.meta && event.meta.completionDetected) {
          if (crawlProgressSection && !crawlProgressSection.classList.contains('is-hidden')) {
            // Wait a moment to show final state, then hide
            setTimeout(() => {
              crawlProgressSection.classList.add('is-hidden');
              crawlProgressSection.dataset.active = '0';
            }, 3000);
          }
          console.log('[UI] Telemetry completion detected – refreshing UI state');

          try {
            if (typeof updateStartupStatus === 'function') {
              updateStartupStatus(null, 'Crawl completed');
            }

            if (typeof appActions?.patchPipeline === 'function') {
              appActions.patchPipeline({
                execution: {
                  status: 'completed',
                  statusLabel: 'Completed',
                  queue: 0
                }
              });
            }

            if (typeof appActions?.renderJobs === 'function') {
              const res = await fetch('/api/jobs');
              if (res.ok) {
                const jobsPayload = await res.json();
                appActions.renderJobs(jobsPayload);
              }
            }

            if (typeof appActions?.refreshServerMetrics === 'function') {
              appActions.refreshServerMetrics();
            }

            if (typeof metrics?.refreshServerMetrics === 'function') {
              metrics.refreshServerMetrics();
            }

            if (typeof updateIntelligentInsights === 'function') {
              try {
                const result = await fetch('/api/insights');
                if (result.ok) {
                  const payload = await result.json();
                  updateIntelligentInsights(payload.details || payload, {
                    source: 'completion-refresh',
                    timestamp: Date.now()
                  });
                }
              } catch (insightsErr) {
                console.error('[UI] Failed to refresh insights after completion:', insightsErr);
              }
            }

            if (typeof appActions?.refreshPendingResume === 'function') {
              appActions.refreshPendingResume();
            }

            if (typeof backgroundTasksWidget?.refresh === 'function') {
              backgroundTasksWidget.refresh();
            }

            if (typeof appActions?.onCrawlComplete === 'function') {
              appActions.onCrawlComplete();
            }
          } catch (refreshErr) {
            console.error('[UI] Error during post-completion refresh', refreshErr);
          }
        }
      }
    });

    // Expose crawl progress globally for crawlControls to use
    window.__crawlProgress = crawlProgress;

    // Rendering helper functions extracted to ./index/renderingHelpers.js
    // Pure functions: compactDetails, formatFeatureName, numericValue, describeEntry
    // Rendering functions (require DOM elements passed): renderFeatureFlags, renderAnalysisStatus,
    // renderPriorityBonuses, renderPriorityWeights, renderStructureSummary

    // ========================================
    // Advanced Features Panel
    // ========================================
    const advancedFeaturesPanel = createAdvancedFeaturesPanel({
      panelEl: advancedFeaturesPanelEl,
      statusEl: advancedFeaturesStatus,
      featureFlagsList,
      priorityBonusesList,
      priorityWeightsList
    });

    // Alias panel methods for backward compatibility
    const setAdvancedCapabilitiesState = advancedFeaturesPanel.setState.bind(advancedFeaturesPanel);
    const loadAdvancedCapabilities = advancedFeaturesPanel.load.bind(advancedFeaturesPanel);
    const renderFeatureFlags = advancedFeaturesPanel.renderFeatureFlags.bind(advancedFeaturesPanel);
    const renderPriorityBonuses = advancedFeaturesPanel.renderPriorityBonuses.bind(advancedFeaturesPanel);
    const renderPriorityWeights = advancedFeaturesPanel.renderPriorityWeights.bind(advancedFeaturesPanel);

    function renderAnalysisStatus(summary, options = {}) {
      renderAnalysisStatusBase(summary, options, {
        statusEl: analysisStatus,
        summaryEl: analysisStatusSummary,
        metricsEl: analysisStatusMetrics
      });
    }

    function refreshCoverageMetric() {
      if (!metricCoverage) return;
      const summary = uiApp.getState().cache?.coverageSummary;
      metricCoverage.textContent = summary && typeof summary.value === 'number'
        ? `${summary.value.toFixed(0)}%`
        : '—';
    }
    
    function renderStructureSummary(structure) {
      lastStructureSummary = renderStructureSummaryBase(structure, {
        panel: structurePanel,
        navPages: structureNavPages,
        articlesSkipped: structureArticlesSkipped,
        topSections: structureTopSections,
        updated: structureUpdated
      }, formatNumber, formatRelativeTime);
    }
    function resetInsights(hint = 'Insights appear once planner telemetry streams in.') {
      appActions.resetInsights(hint);
      appActions.resetPatternInsights();
      refreshCoverageMetric();
    }
    function setCrawlType(type) {
      if (!crawlTypeBadge) return;
      const norm = type ? String(type) : '';
      currentCrawlType = norm;
      appActions.setCrawlType(norm);
      crawlTypeBadge.classList.remove('badge-neutral', 'badge-intelligent', 'badge-basic', 'badge-structure');
      const pretty = norm ? norm.replace(/-/g, ' ') : 'unknown';
      crawlTypeBadge.textContent = `Type: ${pretty}`;
      if (!norm) {
        crawlTypeBadge.classList.add('badge-neutral');
        if (insightsPanel && insightsPanel.dataset.hasData !== '1') hideElement(insightsPanel);
        if (structurePanel) {
          structurePanel.dataset.active = '0';
          hideElement(structurePanel);
        }
        return;
      }
      if (norm === 'intelligent') {
        crawlTypeBadge.classList.add('badge-intelligent');
        if (insightsPanel) {
          if (insightsPanel.dataset.hasData !== '1') showElement(insightsPanel);
          if (insightsHint && insightsPanel.dataset.hasData !== '1') insightsHint.textContent = 'Collecting planner telemetry…';
        }
        if (structurePanel) {
          structurePanel.dataset.active = '0';
          hideElement(structurePanel);
        }
      } else if (norm === 'discover-structure') {
        crawlTypeBadge.classList.add('badge-structure');
        if (insightsPanel) {
          if (insightsPanel.dataset.hasData !== '1') showElement(insightsPanel);
          if (insightsHint && insightsPanel.dataset.hasData !== '1') insightsHint.textContent = 'Discovering site structure (planner only)…';
        }
        if (structurePanel) {
          structurePanel.dataset.active = '1';
          if (structureHint) {
            structureHint.textContent = 'Discovering navigation scaffolding; article bodies are skipped.';
          }
          renderStructureSummary(lastStructureSummary);
        }
      } else {
        crawlTypeBadge.classList.add('badge-basic');
        if (insightsPanel && insightsPanel.dataset.hasData !== '1') hideElement(insightsPanel);
        if (!window.__coverageSummary) refreshCoverageMetric();
        if (structurePanel) {
          structurePanel.dataset.active = '0';
          hideElement(structurePanel);
        }
      }
    }

    // ========================================
    // Analysis & Planner Event Handlers
    // ========================================
    const analysisHandlers = createAnalysisHandlers({
      appActions,
      pipelineControl,
      setCrawlType,
      renderAnalysisLink,
      renderAnalysisStatus,
      refreshCoverageMetric,
      getCurrentCrawlType: () => currentCrawlType,
      analysisStatus
    });

    // Extract handler methods for use in SSE listeners
    const handleMilestone = analysisHandlers.handleMilestone.bind(analysisHandlers);
    const handleAnalysisProgress = analysisHandlers.handleAnalysisProgress.bind(analysisHandlers);
    const handlePlannerStage = analysisHandlers.handlePlannerStage.bind(analysisHandlers);
    const updateIntelligentInsights = analysisHandlers.updateIntelligentInsights.bind(analysisHandlers);

    resetInsights();
    refreshCoverageMetric();
    try {
      if (typeof window !== 'undefined') {
        window.__insightState = window.__insightState || {};
      }
    } catch (_) {}
    if (advancedFeaturesPanelEl) {
      loadAdvancedCapabilities();
      try {
        setInterval(() => loadAdvancedCapabilities({ quiet: true }), 60000);
      } catch (_) {}
    }

    function attachJsonEventListener(eventSource, eventName, handler) {
      if (!eventSource || typeof eventSource.addEventListener !== 'function') {
        return;
      }

      eventSource.addEventListener(eventName, (event) => {
        let payload;
        try {
          payload = JSON.parse(event.data);
        } catch (parseErr) {
          console.error(`[CrawlProgress] ${eventName} JSON parse error:`, parseErr, event.data);
          return;
        }

        try {
          handler(payload);
        } catch (handlerErr) {
          const handlerMessage = handlerErr && handlerErr.message ? handlerErr.message : String(handlerErr);
          console.error(`[CrawlProgress] ${eventName} handler error: ${handlerMessage}`, handlerErr, payload);
        }
      });
    }

    function attachCrawlProgressListeners(eventSource) {
      if (!eventSource) return;

      attachJsonEventListener(eventSource, 'progress', (data) => {
        crawlProgress.handleProgress(data);
      });

      attachJsonEventListener(eventSource, 'telemetry', (data) => {
        crawlProgress.handleTelemetry(data);
      });

      attachJsonEventListener(eventSource, 'milestone', (data) => {
        crawlProgress.handleMilestone(data);
      });

      attachJsonEventListener(eventSource, 'queue', (data) => {
        crawlProgress.handleQueue(data);
      });

      // Handle background task progress (geography crawls, etc.)
      attachJsonEventListener(eventSource, 'task-progress', (task) => {
        if (task && task.progress) {
          // Convert task progress format to crawl progress format
          crawlProgress.handleProgress({
            jobId: task.id,
            current: task.progress.current || 0,
            totalItems: task.progress.total || 0,
            message: task.progress.message
          });
        }
      });

      attachJsonEventListener(eventSource, 'done', (data) => {
        crawlProgress.handleCrawlComplete(data);
      });

      attachJsonEventListener(eventSource, 'error', (data) => {
        crawlProgress.handleCrawlError(data);
      });

      // Planner-stage events (Advanced Planning Suite telemetry)
      attachJsonEventListener(eventSource, 'planner-stage', (data) => {
        handlePlannerStage(data);
      });
    }

    // ========================================
    // SSE Event Stream
    // ========================================
    function openEventStream(enableLogs = true) {
      // Close existing connection if any
      sseClient.close();
      
      // Open new SSE connection with logs parameter  
      const url = `/events?logs=${enableLogs ? '1' : '0'}`;
      const source = sseClient.open({
        url,
        listeners: {}
      });

      try {
        backgroundTasksWidget.connectSSE(source);
      } catch (widgetErr) {
        console.error('[UI] Failed to connect background tasks widget to SSE', widgetErr);
      }

      attachCrawlProgressListeners(source);

      return source;
    }

    // ========================================
    // Initialization
    // ========================================
    console.log('[index] Creating initialization object...');
    const initialization = createInitialization({
      elements: {
        logs, logsResizer, logsFontMinus, logsFontPlus, logsFontVal,
        secErrors, secDomains, secLogs, themeBtn,
        badgeDb, badgeDisk, badgeCpu, badgeMem, badgeWal
      },
      openEventStream
    });

    // Run all initialization
    console.log('[index] Calling initialization.initialize()...');
    const { themeController, scheduleLogFlush } = await initialization.initialize();
    console.log('[index] Initialization complete');

    // ========================================
    // Crawl Controls Initialization
    // ========================================
    console.log('[index] About to call createCrawlControls');
    console.log('[index] startBtn element:', startBtn, 'ID:', startBtn?.id, 'Exists:', !!startBtn);
    console.log('[index] stopBtn element:', stopBtn, 'Exists:', !!stopBtn);
    console.log('[index] pauseBtn element:', pauseBtn, 'Exists:', !!pauseBtn);
    console.log('[index] resumeBtn element:', resumeBtn, 'Exists:', !!resumeBtn);
    console.log('[index] Form elements - startUrl:', startUrl, 'crawlType:', crawlType);
    
    const crawlControlsResult = createCrawlControls({
      elements: {
        startBtn, stopBtn, pauseBtn, resumeBtn, analysisBtn, analysisLink, analysisStatus,
        progress, logs
      },
      formElements: {
        startUrl, crawlType, depth, maxPages, concurrency, useSitemap, sitemapOnly,
        slowMode, refetchIfOlderThan, refetchArticleIfOlderThan, refetchHubIfOlderThan,
        requestTimeoutMs, pacerJitterMinMs, pacerJitterMaxMs
      },
      actions: {
        resetInsights,
        setCrawlType,
        renderAnalysisLink,
        renderAnalysisStatus,
        patchPipeline: appActions.patchPipeline,
        updateStartupStatus
      },
      formatters: {
        formatRelativeTime
      }
    });
    
    console.log('[index] createCrawlControls returned:', crawlControlsResult);
    console.log('[index] Verifying startBtn.onclick is set:', typeof startBtn?.onclick, startBtn?.onclick);

    // ========================================
    // Jobs and Resume Manager Initialization
    // ========================================
    console.log('[index] About to call createJobsAndResumeManager');
    
    const jobsAndResumeManager = createJobsAndResumeManager({
      elements: {
        jobsList,
        logs,
        resumeSection,
        resumeSummary,
        resumeAllBtn,
        resumeRefreshBtn,
        clearQueuesBtn,
        resumeList,
        resumeStatus
      },
      actions: {
        setStage,
        setPausedBadge,
        hidePausedBadge,
        setCrawlType,
        updateStartupStatus
      }
    });
    
    console.log('[index] createJobsAndResumeManager returned:', jobsAndResumeManager);
    
    // Setup resume controls and fetch initial inventory
    if (jobsAndResumeManager && jobsAndResumeManager.setupResumeControls) {
      console.log('[index] Calling setupResumeControls...');
      jobsAndResumeManager.setupResumeControls();
    }

    // ========================================
    // Analysis Link Rendering
    // ========================================
    function renderAnalysisLink(url, runId) {
      if (analysisLink) {
        analysisLink.textContent = '';
        analysisLink.classList.remove('muted');
        if (url) {
          const label = document.createElement('span');
          label.textContent = 'View analysis: ';
          analysisLink.appendChild(label);
          const link = document.createElement('a');
          link.href = url;
          link.textContent = runId ? runId : url;
          link.target = '_blank';
          link.rel = 'noopener';
          analysisLink.appendChild(link);
        } else {
          analysisLink.textContent = 'No analysis runs yet.';
          analysisLink.classList.add('muted');
        }
      }
      if (pipelineAnalysisLink) {
        pipelineAnalysisLink.textContent = '';
        pipelineAnalysisLink.classList.remove('muted');
        if (url) {
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.target = '_blank';
          anchor.rel = 'noopener';
          anchor.textContent = runId || 'View';
          pipelineAnalysisLink.appendChild(anchor);
        } else {
          pipelineAnalysisLink.textContent = '—';
          pipelineAnalysisLink.classList.add('muted');
        }
      }
    }
  } catch (err) {
    console.error('[UI] A critical error occurred during application startup:', err);
    console.error('[UI] Error type:', typeof err);
    console.error('[UI] Error constructor:', err?.constructor?.name);
    if (err && err.message) console.error('[UI] Error message:', err.message);
    if (err && err.stack) console.error('[UI] Error stack:', err.stack);
    if (typeof err === 'object' && err !== null) {
      console.error('[UI] Error keys:', Object.keys(err));
      console.error('[UI] Error JSON:', JSON.stringify(err, null, 2));
    }
  }
});